"use client"

import { BulkActionBar } from "@/components/gallery/bulk-action-bar"
import { SettingsPanel } from "@/components/gallery/settings-panel"
import { FolderDescriptionDialog, ItemContextMenu, NewFolderDialog, RenameDialog } from "@/components/gallery/ui-components"
import { CaptureController, ModelViewer, SpotLightInScene } from "@/components/gallery/viewer-components"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useIsMobile } from "@/hooks/use-mobile"
import { lightingPresets } from "@/lib/lighting-presets"
import { cn } from "@/lib/utils"
import type { Folder, GalleryItem, Light, Model, ViewSettings } from "@/types"
import { Bounds, GizmoHelper, GizmoViewport, OrbitControls, OrthographicCamera, PerspectiveCamera, useGLTF } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { upload } from "@vercel/blob/client"
import { ChevronDown, ChevronLeft, Dice5, Download, Globe, Info, ListFilter, Lock, Palette, Plus, Search, Upload, XIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import type React from "react"
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"

useGLTF.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/")
const fetcher = (url: string) => fetch(url).then((res) => res.json())

type Pill = "all" | "models" | "public" | "drafts"

export default function GalleryPage() {
  const { mutate } = useSWRConfig()
  const router = useRouter()
  const searchParams = useSearchParams()
  const modelId = searchParams.get("modelId")
  const currentFolderId = searchParams.get("folderId") || null
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: null as string | null, name: "Assets" }])
  const [searchQuery, setSearchQuery] = useState("")
  const [sortOption, setSortOption] = useState("created_at-desc")
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [pill, setPill] = useState<Pill>("public")
  const lastSelectedItem = useRef<string | null>(null)

  const [filterVisibility, setFilterVisibility] = useState<"all" | "public" | "private">("all")
  const [filterFolderIds, setFilterFolderIds] = useState<Set<string>>(new Set())
  const [filterDate, setFilterDate] = useState<"any" | "24h" | "7d" | "30d" | "365d">("any")
  const [filterHasThumb, setFilterHasThumb] = useState<"any" | "yes" | "no">("any")

  const [sortBy, sortOrder] = sortOption.split("-")
  const galleryUrl = `/api/gallery?folderId=${currentFolderId || ""}&sortBy=${sortBy}&sortOrder=${sortOrder}`
  const { data: gallery, error, isLoading } = useSWR<{ folders: Folder[]; models: Model[]; currentFolder: Folder | null }>(galleryUrl, fetcher)
  const { data: allFolders } = useSWR<Folder[]>("/api/folders/all", fetcher)
  const { data: selectedModel, mutate: mutateSelectedModel } = useSWR<Model>(modelId ? `/api/models/${modelId}` : null, fetcher)
  const { data: breadcrumbData } = useSWR<{ id: string; name: string }[]>(currentFolderId ? `/api/folders/${currentFolderId}/breadcrumbs` : null, fetcher)

  const isMobile = useIsMobile()
  const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("white")
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(!isMobile)
  const [lightsEnabled, setLightsEnabled] = useState(true)
  const [environmentEnabled, setEnvironmentEnabled] = useState(false)
  const [bloomEnabled, setBloomEnabled] = useState(false)
  const [bgType, setBgType] = useState<"color" | "gradient" | "image">("color")
  const [bgColor1, setBgColor1] = useState("#000000")
  const [bgColor2, setBgColor2] = useState("#1a1a1a")
  const [bgImage, setBgImage] = useState<string | null>(null)
  const [lights, setLights] = useState<Light[]>([])
  const [selectedLightId, setSelectedLightId] = useState<number | null>(null)
  const [fov, setFov] = useState(50)
  const [isOrthographic, setIsOrthographic] = useState(false)
  const [cameraPosition, setCameraPosition] = useState<[number, number, number]>([5, 5, 5])
  const [cameraTarget, setCameraTarget] = useState<[number, number, number]>([0, 0, 0])
  const [matOverrideEnabled, setMatOverrideEnabled] = useState(false)
  const [matBaseColor, setMatBaseColor] = useState<string>("#e5e5e5")
  const [matMetalness, setMatMetalness] = useState<number>(1)
  const [matRoughness, setMatRoughness] = useState<number>(1)
  const [matClearcoat, setMatClearcoat] = useState<number>(0)
  const [matClearcoatRough, setMatClearcoatRough] = useState<number>(0.6)
  const [matIOR, setMatIOR] = useState<number>(1.5)
  const [matTransmission, setMatTransmission] = useState<number>(0)
  const [matUseAlbedo, setMatUseAlbedo] = useState<boolean>(true)
  const [isOrbitControlsEnabled, setIsOrbitControlsEnabled] = useState(true)
  const modelRef = useRef<THREE.Group>(null)
  const captureControllerRef = useRef<{ capture: () => Promise<File | null> }>(null)
  const orbitControlsRef = useRef<OrbitControlsImpl>(null)
  const [boundsKey, setBoundsKey] = useState(0)
  const [isLightDragging, setIsLightDragging] = useState(false)
  const [groundEnabled, setGroundEnabled] = useState(false)
  const [groundY, setGroundY] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [allModelsCombined, setAllModelsCombined] = useState<Model[] | null>(null)
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false)
  const [renameItem, setRenameItem] = useState<Model | null>(null)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)

  useEffect(() => {
    const head = document.head

    // Meta tags for PWA/iOS homescreen experience
    const metaTags = [
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#000000" }
    ]

    metaTags.forEach(tagInfo => {
      let meta = head.querySelector(`meta[name="${tagInfo.name}"]`)
      if (!meta) {
        meta = document.createElement("meta");
        (meta as HTMLMetaElement).name = tagInfo.name
        head.appendChild(meta)
      }
      (meta as HTMLMetaElement).content = tagInfo.content
    })

    // Link tags for manifest and icons
    const linkTags = [
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }
    ]

    linkTags.forEach(tagInfo => {
      let link = head.querySelector(`link[rel="${tagInfo.rel}"]`)
      if (!link) {
        link = document.createElement("link");
        (link as HTMLLinkElement).rel = tagInfo.rel
        head.appendChild(link)
      }
      (link as HTMLLinkElement).href = tagInfo.href
    })
  }, [])

  useEffect(() => {
    setBreadcrumbs(currentFolderId === null ? [{ id: null, name: "Assets" }] : [{ id: null, name: "Assets" }, ...(breadcrumbData || [])])
  }, [currentFolderId, breadcrumbData])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const ids = [null, ...((allFolders ?? []).map((f) => f.id))]
      const results = await Promise.all(
        ids.map((fid) =>
          fetch(`/api/gallery?folderId=${fid ?? ""}&sortBy=created_at&sortOrder=desc`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      )
      const models: Model[] = results.flatMap((r) => (r && Array.isArray(r.models) ? (r.models as Model[]) : []))
      const uniq = new Map<string, Model>()
      models.forEach((m) => uniq.set(m.id, m))
      if (!cancelled) setAllModelsCombined(Array.from(uniq.values()))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [allFolders, refreshKey])

  const gridModels: (Model & { type: "model" })[] = useMemo(() => {
    const list = (allModelsCombined ?? gallery?.models ?? []) as Model[]
    return list.map((m) => ({ ...m, type: "model" as const }))
  }, [allModelsCombined, gallery?.models])

  const folderById = useMemo(() => {
    const map = new Map<string, Folder>()
      ; (allFolders ?? []).forEach((f) => map.set(f.id, f))
    return map
  }, [allFolders])

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const cutoff = (() => {
      const now = Date.now()
      if (filterDate === "24h") return now - 24 * 3600 * 1000
      if (filterDate === "7d") return now - 7 * 24 * 3600 * 1000
      if (filterDate === "30d") return now - 30 * 24 * 3600 * 1000
      if (filterDate === "365d") return now - 365 * 24 * 3600 * 1000
      return null
    })()
    const matchesFolderChain = (folderId: string | null | undefined) => {
      if (!q) return false
      let cur = folderId ? folderById.get(folderId) : null
      while (cur) {
        if ((cur.name || "").toLowerCase().includes(q) || (cur.description || "").toLowerCase().includes(q)) return true
        cur = cur.parent_id ? folderById.get(cur.parent_id as any) : null
      }
      return false
    }
    const base = gridModels.filter((m) => {
      if (pill === "public" && !m.is_public) return false
      if (pill === "drafts" && m.is_public) return false
      if (filterVisibility === "public" && !m.is_public) return false
      if (filterVisibility === "private" && m.is_public) return false
      if (filterFolderIds.size > 0 && !filterFolderIds.has(m.folder_id || "")) return false
      if (filterHasThumb === "yes" && (!m.thumbnail_url || m.thumbnail_url.includes("/placeholder.svg"))) return false
      if (filterHasThumb === "no" && m.thumbnail_url && !m.thumbnail_url.includes("/placeholder.svg")) return false
      if (cutoff) {
        const ts = new Date((m as any).updated_at || m.created_at).getTime()
        if (Number.isFinite(ts) && ts < cutoff) return false
      }
      if (!q) return true
      const nameHit = m.name.toLowerCase().includes(q)
      const folderHit = matchesFolderChain(m.folder_id)
      return nameHit || folderHit
    })
    const sorted = [...base].sort((a, b) => {
      if (sortBy === "name") return sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      if (sortBy === "updated_at") {
        const ra = new Date((a as any).updated_at || a.created_at).getTime()
        const rb = new Date((b as any).updated_at || b.created_at).getTime()
        return sortOrder === "asc" ? ra - rb : rb - ra
      }
      if (sortBy === "visibility") {
        const va = a.is_public ? 1 : 0, vb = b.is_public ? 1 : 0
        return sortOrder === "asc" ? va - vb : vb - va
      }
      if (sortBy === "created_at") {
        const ra = new Date(a.created_at as any).getTime(), rb = new Date(b.created_at as any).getTime()
        return sortOrder === "asc" ? ra - rb : rb - ra
      }
      return 0
    })
    return sorted
  }, [gridModels, pill, searchQuery, folderById, filterFolderIds, filterVisibility, filterHasThumb, filterDate, sortBy, sortOrder])

  const defaultLights: Light[] = useMemo(() => {
    const preset = lightingPresets.find((p) => p.name === "3-Point")?.lights ?? []
    return preset.map((l, i) => ({ ...l, id: Date.now() + i, visible: true }))
  }, [])

  const resetViewSettings = useCallback((s: ViewSettings | null | undefined) => {
    setLights((s?.lights ?? defaultLights).map((l, i) => ({ ...l, id: Date.now() + i, visible: true })))
    setLightsEnabled(s?.lightsEnabled ?? true)
    setEnvironmentEnabled(s?.environmentEnabled ?? false)
    setBloomEnabled(s?.bloomEnabled ?? false)
    setBgType(s?.bgType ?? "color")
    setBgColor1(s?.bgColor1 ?? "#000000")
    setBgColor2(s?.bgColor2 ?? "#1a1a1a")
    setBgImage(s?.bgImage ?? null)
    setMaterialMode(s?.materialMode ?? "white")
    setFov(s?.fov ?? 50)
    setIsOrthographic(s?.orthographic ?? false)
    setMatOverrideEnabled(!!s?.materialOverride?.enabled)
    setMatBaseColor(s?.materialOverride?.color ?? "#e5e5e5")
    setMatMetalness(s?.materialOverride?.metalness ?? 1)
    setMatRoughness(s?.materialOverride?.roughness ?? 1)
    setMatClearcoat(s?.materialOverride?.clearcoat ?? 0)
    setMatClearcoatRough(s?.materialOverride?.clearcoatRoughness ?? 0.6)
    setMatIOR(s?.materialOverride?.ior ?? 1.5)
    setMatTransmission(s?.materialOverride?.transmission ?? 0)
    setMatUseAlbedo(s?.materialOverride?.useAlbedo ?? true)
    setSelectedLightId(null)
  }, [defaultLights])

  useEffect(() => {
    if (!selectedModel) return
    resetViewSettings(selectedModel.view_settings)
    setCameraPosition(selectedModel.view_settings?.cameraPosition || [5, 5, 5])
    setCameraTarget(selectedModel.view_settings?.cameraTarget || [0, 0, 0])
  }, [selectedModel, resetViewSettings])

  useEffect(() => {
    if (modelRef.current && selectedModel) {
      setGroundY(-0.001)
      if (!selectedModel.view_settings?.cameraPosition) {
        const box = new THREE.Box3().setFromObject(modelRef.current)
        const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const newPos: [number, number, number] = [center.x + maxDim, center.y + maxDim, center.z + maxDim]
        const newTgt: [number, number, number] = [center.x, center.y, center.z]
        setCameraPosition(newPos)
        setCameraTarget(newTgt)
      }
      setBoundsKey((k) => k + 1)
    }
  }, [selectedModel])

  const updateQuery = (params: Record<string, string | null>) => {
    const q = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([k, v]) => (v === null ? q.delete(k) : q.set(k, v)))
    router.push(`?${q.toString()}`)
  }

  const { mutate: mutateModel } = useSWRConfig()
  const handleModelUpdate = useCallback(async (id: string, updates: Partial<Omit<Model, "id" | "created_at">>) => {
    await fetch(`/api/models/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) })
    mutateSelectedModel()
    mutate(galleryUrl)
    mutateModel(`/api/models/${id}`)
    setRefreshKey((k) => k + 1)
  }, [mutateSelectedModel, mutate, mutateModel, galleryUrl])

  const handleThumbnailUpload = useCallback(async (file: File) => {
    if (!selectedModel) return
    const fromName = file.name?.split(".").pop()?.toLowerCase(), fromType = (file.type || "").split("/")[1]
    const ext = (fromName || fromType || "png").replace(/[^a-z0-9]/gi, "")
    const pathname = `thumbnails/${selectedModel.id}-${Date.now()}.${ext || "png"}`
    try {
      const newBlob = await upload(pathname, file, { access: "public", handleUploadUrl: "/api/upload" })
      await handleModelUpdate(selectedModel.id, { thumbnail_url: `${newBlob.url}?v=${Date.now()}` })
    } catch {
      await handleModelUpdate(selectedModel.id, { thumbnail_url: URL.createObjectURL(file) })
    }
  }, [selectedModel, handleModelUpdate])

  const handleCaptureThumbnail = useCallback(async () => {
    if (captureControllerRef.current) {
      const file = await captureControllerRef.current.capture()
      if (file) await handleThumbnailUpload(file)
    }
  }, [handleThumbnailUpload])

  useEffect(() => {
    if (selectedModel && selectedModel.thumbnail_url.includes("/placeholder.svg")) {
      const t = setTimeout(() => captureControllerRef.current && handleCaptureThumbnail(), 1200)
      return () => clearTimeout(t)
    }
  }, [selectedModel, handleCaptureThumbnail])

  const handleModelClick = (m: Model) => updateQuery({ modelId: m.id })
  const handleCloseViewer = () => updateQuery({ modelId: null })

  const handleItemClick = (e: React.MouseEvent, item: Model & { type: "model" }) => {
    e.stopPropagation()
    const next = new Set(selectedItems)
    if (e.shiftKey && lastSelectedItem.current && !isMobile) {
      const li = filteredItems.findIndex((i) => i.id === lastSelectedItem.current)
      const ci = filteredItems.findIndex((i) => i.id === item.id)
      const [s, t] = [li, ci].sort((a, b) => a - b)
      for (let i = s; i <= t; i++) next.add(filteredItems[i].id)
    } else if (e.metaKey || e.ctrlKey) next.has(item.id) ? next.delete(item.id) : next.add(item.id)
    else {
      next.clear()
      next.add(item.id)
    }
    setSelectedItems(next)
    lastSelectedItem.current = item.id
  }

  const handleUploadAction = async (files: FileList | null) => {
    if (!files?.length) return
    await Promise.all(
      Array.from(files).map(async (file) => {
        if (!file.name.endsWith(".glb")) return
        try {
          const blob = await upload(file.name.replace(/\s+/g, "_"), file, { access: "public", handleUploadUrl: "/api/upload" })
          await fetch("/api/models", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
              name: file.name.replace(/\.glb$/, ""), model_url: blob.url,
              thumbnail_url: `/placeholder.svg?width=400&height=400&query=${encodeURIComponent(file.name.replace(/\.glb$/, ""))}`,
              folder_id: currentFolderId
            })
          })
        } catch { }
      })
    )
    mutate(galleryUrl)
    setRefreshKey((k) => k + 1)
  }

  const handleRename = async (newName: string) => {
    if (!renameItem) return
    const url = `/api/models/${renameItem.id}`
    await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) })
    mutate(galleryUrl)
    mutate(`/api/models/${renameItem.id}`)
    setRenameItem(null)
    setRefreshKey((k) => k + 1)
  }

  const bulkAct = async (ids: string[], fn: (id: string) => Promise<void>) => {
    await Promise.all(ids.map(fn))
    mutate(galleryUrl)
    setRefreshKey((k) => k + 1)
  }

  const handleBulkDelete = async () => {
    await bulkAct(Array.from(selectedItems), (id) => fetch(`/api/models/${id}`, { method: "DELETE" }).then(() => { }))
    if (Array.from(selectedItems).includes(modelId || "")) handleCloseViewer()
    setSelectedItems(new Set())
  }

  const handleBulkMove = async (_targetFolderId: string | null) => { }

  const handleBulkSetPublic = async (isPublic: boolean) => {
    await bulkAct(Array.from(selectedItems), (id) => fetch(`/api/models/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_public: isPublic }) }).then(() => { }))
    if (Array.from(selectedItems).includes(modelId || "")) mutateSelectedModel()
    setSelectedItems(new Set())
  }

  const handleSaveViewSettings = useCallback(async () => {
    if (!selectedModel) return
    const settings: ViewSettings = {
      lights: lights.map(({ id, visible, ...rest }) => rest), lightsEnabled, environmentEnabled, bloomEnabled, ssaoEnabled: false,
      bgType, bgColor1, bgColor2, bgImage, fov, orthographic: isOrthographic, cameraPosition, cameraTarget, materialMode,
      materialOverride: {
        enabled: matOverrideEnabled, color: matBaseColor, metalness: matMetalness, roughness: matRoughness,
        clearcoat: matClearcoat, clearcoatRoughness: matClearcoatRough, ior: matIOR, transmission: matTransmission, useAlbedo: matUseAlbedo
      }
    }
    await handleModelUpdate(selectedModel.id, { view_settings: settings })
  }, [selectedModel, lights, lightsEnabled, environmentEnabled, bloomEnabled, bgType, bgColor1, bgColor2, bgImage, fov, isOrthographic, cameraPosition, cameraTarget, materialMode, matOverrideEnabled, matBaseColor, matMetalness, matRoughness, matClearcoat, matClearcoatRough, matIOR, matTransmission, matUseAlbedo, handleModelUpdate])

  const handleDeleteViewSettings = async () => {
    if (!selectedModel) return
    await handleModelUpdate(selectedModel.id, { view_settings: null })
    resetViewSettings(null)
  }

  const handleDeleteThumbnail = async () => {
    if (!selectedModel) return
    const placeholder = `/placeholder.svg?width=400&height=400&query=${encodeURIComponent(selectedModel.name)}`
    await handleModelUpdate(selectedModel.id, { thumbnail_url: placeholder })
  }

  const randomizeAllPartial = () => ({ intensity: 10 + Math.random() * 40, kelvin: 1500 + Math.random() * 10500, angle: 10 + Math.random() * 80, penumbra: Math.random() })
  const handleLightChange = (id: number, v: Partial<Omit<Light, "id">>) => setLights((ls) => ls.map((l) => (l.id === id ? { ...l, ...v } : l)))
  const addLight = () => {
    if (lights.length >= 5) return
    const nl: Light = { id: Date.now(), visible: true, position: [-2, 3, 2], targetPosition: [0, 0, 0], intensity: 3, kelvin: 5500, decay: 1, angle: 45, penumbra: 0.5 }
    setLights((ls) => [...ls, nl])
    setSelectedLightId(nl.id)
  }
  const removeLight = (id: number) => {
    if (lights.length <= 1) return
    setLights((ls) => ls.filter((l) => l.id !== id))
    if (selectedLightId === id) setSelectedLightId(lights.find((l) => l.id !== id)?.id ?? null)
  }
  const toggleLightVisibility = (id: number) => setLights((ls) => ls.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)))
  const cloneLight = (id: number) => {
    if (lights.length >= 5) return
    const src = lights.find((l) => l.id === id)
    if (!src) return
    const nl = { ...src, id: Date.now(), position: [src.position[0] + 1, src.position[1], src.position[2]] as [number, number, number] }
    setLights((ls) => [...ls, nl])
    setSelectedLightId(nl.id)
  }
  const focusLightOnModel = (id: number) => {
    if (!modelRef.current) return
    const box = new THREE.Box3().setFromObject(modelRef.current), c = new THREE.Vector3()
    box.getCenter(c)
    handleLightChange(id, { targetPosition: [c.x, c.y, c.z] })
  }
  const applyPreset = (name: string) => {
    const p = lightingPresets.find((p) => p.name === name)
    if (!p) return
    setLights(p.lights.map((l, i) => ({ ...l, id: Date.now() + i, visible: true })))
    setSelectedLightId(null)
  }

  const onKey = useCallback((e: KeyboardEvent) => {
    if (!modelId || document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return
    const k = e.key.toLowerCase()
    if (k === "1") setMaterialMode("white")
    if (k === "2") setMaterialMode("pbr")
    if (k === "3") setMaterialMode("normal")
    if (k === "f") { e.preventDefault(); setBoundsKey((key) => key + 1) }
    if (k === "o") { e.preventDefault(); setIsOrthographic((prev) => !prev); setBoundsKey((key) => key + 1) }
    if (k === "e") { e.preventDefault(); setEnvironmentEnabled(true); setBgType("color"); setBgColor1("#ffffff") }
    if (k === "t") { e.preventDefault(); (async () => { await handleSaveViewSettings(); await handleCaptureThumbnail() })() }
    if (k === "r") { e.preventDefault(); selectedLightId === null ? setLights((ls) => ls.map((l) => ({ ...l, ...randomizeAllPartial() }))) : handleLightChange(selectedLightId, randomizeAllPartial()) }
    if (k === "arrowright" || k === "arrowleft") {
      const ms = gridModels
      if (!ms.length) return
      const i = ms.findIndex((m) => m.id === modelId)
      if (i === -1) return
      const ni = k === "arrowright" ? (i + 1) % ms.length : (i - 1 + ms.length) % ms.length
      updateQuery({ modelId: ms[ni].id })
    }
  }, [gridModels, modelId, selectedLightId, handleSaveViewSettings, handleCaptureThumbnail])

  useEffect(() => {
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onKey])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.shiftKey && selectedLightId !== null) {
      e.stopPropagation()
      setIsLightDragging(true)
      setIsOrbitControlsEnabled(false)
        ; (e.target as HTMLElement).style.cursor = "grabbing"
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isLightDragging || selectedLightId === null) return
    e.stopPropagation()
    const light = lights.find((l) => l.id === selectedLightId)
    if (!light || !orbitControlsRef.current) return
    const targetPos = new THREE.Vector3().fromArray(light.targetPosition), vec = new THREE.Vector3().fromArray(light.position).sub(targetPos)
    const cam = orbitControlsRef.current.object, up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), rt = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
    vec.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(up, -e.movementX * 0.005)).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(rt, -e.movementY * 0.005))
    const pos = vec.add(targetPos)
    handleLightChange(selectedLightId, { position: pos.toArray() as [number, number, number] })
  }
  const onPointerUp = () => {
    if (!isLightDragging) return
    setIsLightDragging(false)
    setIsOrbitControlsEnabled(true)
    document.body.style.cursor = "auto"
  }

  const bgStyle: React.CSSProperties = useMemo(() => {
    if (!environmentEnabled) return { backgroundColor: "#000000" }
    if (bgType === "gradient") return { background: `linear-gradient(to bottom, ${bgColor1}, ${bgColor2})` }
    if (bgType === "image" && bgImage) return { backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }
    return { backgroundColor: bgColor1 }
  }, [environmentEnabled, bgType, bgColor1, bgColor2, bgImage])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (filterVisibility !== "all") n++
    if (filterFolderIds.size > 0) n++
    if (filterDate !== "any") n++
    if (filterHasThumb !== "any") n++
    return n
  }, [filterVisibility, filterFolderIds, filterDate, filterHasThumb])

  const handleFeelingLucky = () => {
    if (filteredItems.length === 0) return
    const randomModel = filteredItems[Math.floor(Math.random() * filteredItems.length)]
    if (randomModel) updateQuery({ modelId: randomModel.id })
  }

  if (modelId) {
    if (!selectedModel) return <div className="fixed inset-0 bg-black" />
    return (
      <div className="fixed inset-0" style={bgStyle}>
        <Canvas shadows dpr={[1, 1.5]} gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
          onCreated={({ gl }) => {
            gl.setClearAlpha(0); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1; gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap
              ; (gl as any).physicallyCorrectLights = true
          }}
          onPointerMissed={(e) => e.button === 0 && setSelectedLightId(null)}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
          frameloop={isLightDragging ? "always" : "demand"}
        >
          {isOrthographic ? <OrthographicCamera makeDefault position={cameraPosition} zoom={50} /> : <PerspectiveCamera makeDefault fov={fov} position={cameraPosition} />}
          <Suspense fallback={null}>
            {groundEnabled && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} receiveShadow>
                <planeGeometry args={[200, 200]} />
                <shadowMaterial transparent opacity={0.25} />
              </mesh>
            )}
            {lightsEnabled && lights.map((l) => <SpotLightInScene key={l.id} light={l} />)}
            <Bounds fit clip damping={6} margin={1.2} key={`${selectedModel.id}-${boundsKey}`}>
              <ModelViewer ref={modelRef} modelUrl={selectedModel.model_url} materialMode={materialMode}
                materialOverride={{
                  enabled: matOverrideEnabled, color: matBaseColor, metalness: matMetalness, roughness: matRoughness, clearcoat: matClearcoat,
                  clearcoatRoughness: matClearcoatRough, ior: matIOR, transmission: matTransmission, useAlbedo: matUseAlbedo
                }} />
            </Bounds>
            {bloomEnabled && <EffectComposer disableNormalPass><Bloom mipmapBlur intensity={0.5} luminanceThreshold={1} /></EffectComposer>}
            <CaptureController ref={captureControllerRef} modelRef={modelRef} />
          </Suspense>
          <OrbitControls ref={orbitControlsRef} enabled={isOrbitControlsEnabled} target={cameraTarget}
            onChange={(e) => {
              if (e?.target) { setCameraPosition(e.target.object.position.toArray()); setCameraTarget(e.target.target.toArray()) }
            }} />
          <GizmoHelper alignment="bottom-right" margin={[80, 80]} key={isOrthographic ? "ortho" : "persp"}>
            <GizmoViewport axisColors={["#9d4b4b", "#2f7f4f", "#3b5b9d"]} labelColor="white" />
          </GizmoHelper>
          <ambientLight intensity={0.1} />
        </Canvas>
        <div className="absolute top-4 left-4 z-10">
          <Button variant="ghost" size="icon" onClick={handleCloseViewer} className="text-white bg-black/50 backdrop-blur-sm hover:bg-white/20 rounded-full h-10 w-10"><ChevronLeft className="h-6 w-6" /></Button>
        </div>
        {isSettingsPanelOpen && isMobile && <div className="fixed inset-0 bg-black/60 z-20" onClick={() => setIsSettingsPanelOpen(false)} />}
        <div className={cn("bg-black/50 backdrop-blur-sm border border-white/20 text-white flex flex-col z-30",
          "absolute top-4 right-4 w-[360px] rounded-lg max-h-[calc(100vh-2rem)]",
          isMobile && "fixed top-auto bottom-0 left-0 right-0 w-full max-h-[80svh] rounded-t-2xl rounded-b-none border-b-0 transform transition-transform duration-300 ease-in-out",
          isMobile && (isSettingsPanelOpen ? "translate-y-0" : "translate-y-full"))}>
          <div className="flex items-center justify-between p-4 flex-shrink-0">
            <div className="flex items-center gap-2"><span className="text-sm">Ground</span><Switch checked={groundEnabled} onCheckedChange={setGroundEnabled} /></div>
            <button onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)} className="p-1 -m-1">
              {isMobile ? <XIcon className="h-5 w-5" /> : <ChevronDown className={`h-5 w-5 transition-transform ${isSettingsPanelOpen ? "rotate-180" : ""}`} />}
            </button>
          </div>
          <SettingsPanel model={selectedModel} onUpdate={handleModelUpdate} onDelete={() => { setSelectedItems(new Set([selectedModel.id])); handleBulkDelete() }}
            onThumbnailUpload={handleThumbnailUpload} onCaptureThumbnail={handleCaptureThumbnail} onDeleteThumbnail={handleDeleteThumbnail}
            lights={lights} onLightChange={handleLightChange} addLight={addLight} removeLight={removeLight} cloneLight={cloneLight}
            toggleLightVisibility={toggleLightVisibility} selectedLightId={selectedLightId} onSelectLight={setSelectedLightId} onFocusLight={focusLightOnModel}
            lightsEnabled={lightsEnabled} onLightsEnabledChange={setLightsEnabled} environmentEnabled={environmentEnabled} onEnvironmentEnabledChange={setEnvironmentEnabled}
            bloomEnabled={bloomEnabled} onBloomEnabledChange={setBloomEnabled} bgType={bgType} onBgTypeChange={setBgType} bgColor1={bgColor1}
            onBgColor1Change={setBgColor1} bgColor2={bgColor2} onBgColor2Change={setBgColor2} bgImage={bgImage} onBgImageChange={setBgImage}
            materialMode={materialMode} onMaterialModeChange={setMaterialMode} fov={fov} onFovChange={setFov} isOrthographic={isOrthographic}
            onIsOrthographicChange={setIsOrthographic} matOverrideEnabled={matOverrideEnabled} onMatOverrideEnabledChange={setMatOverrideEnabled}
            matBaseColor={matBaseColor} onMatBaseColorChange={setMatBaseColor} matMetalness={matMetalness} onMatMetalnessChange={setMatMetalness}
            matRoughness={matRoughness} onMatRoughnessChange={setMatRoughness} matClearcoat={matClearcoat} onMatClearcoatChange={setMatClearcoat}
            matClearcoatRoughness={matClearcoatRough} onMatClearcoatRoughnessChange={setMatClearcoatRough} matIOR={matIOR} onMatIORChange={setMatIOR}
            matTransmission={matTransmission} onMatTransmissionChange={setMatTransmission} matUseAlbedo={matUseAlbedo} onMatUseAlbedoChange={setMatUseAlbedo}
            onSaveView={handleSaveViewSettings} onDeleteView={handleDeleteViewSettings} onResetView={() => resetViewSettings(selectedModel.view_settings)}
            onApplyPreset={(n) => applyPreset(n)} presets={lightingPresets.map((p) => p.name)} />
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm p-2 rounded-full flex items-center gap-1 z-10">
          <Button variant={materialMode === "white" ? "secondary" : "ghost"} size="icon" onClick={() => setMaterialMode("white")} className="text-white rounded-full h-11 w-11"><div className="w-6 h-6 rounded-full bg-white" /></Button>
          <Button variant={materialMode === "pbr" ? "secondary" : "ghost"} size="icon" onClick={() => setMaterialMode("pbr")} className="text-white rounded-full h-11 w-11"><Palette /></Button>
          <Button variant={materialMode === "normal" ? "secondary" : "ghost"} size="icon" onClick={() => setMaterialMode("normal")} className="text-white rounded-full h-11 w-11"><div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500" /></Button>
          <Button variant="ghost" size="icon" onClick={() => {
            const a = document.createElement("a"); a.href = selectedModel.model_url; a.download = `${selectedModel.name}.glb`
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
          }} className="text-white rounded-full h-11 w-11"><Download /></Button>
        </div>
        {!isMobile && (
          <Button variant="ghost" size="icon" onClick={() => setIsSettingsPanelOpen(true)}
            className={cn("absolute top-4 right-4 z-10 text-white bg-black/50 backdrop-blur-sm hover:bg-white/20 rounded-full h-10 w-10", isSettingsPanelOpen && "opacity-0 pointer-events-none")}
          ><ChevronDown /></Button>)}
      </div>
    )
  }

  return (
    <div className="h-[100svh] bg-black text-white relative flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-y-2 px-4 md:px-8 py-4">
        <div className="text-sm text-white/70 truncate">
          {breadcrumbs.map((c, i) => (
            <Fragment key={c.id ?? "root"}>
              <span className={i === breadcrumbs.length - 1 ? "text-white font-medium" : "text-white/60"}>{c.name}</span>
              {i < breadcrumbs.length - 1 && <span className="mx-1.5 text-white/30">/</span>}
            </Fragment>
          ))}
          {gallery?.currentFolder && (
            <Button variant="ghost" size="icon" className="h-6 w-6 ml-2" onClick={() => setEditingFolder(gallery.currentFolder)}><Info className="h-4 w-4" /></Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-9 w-9 border-white/20 bg-transparent"><ListFilter className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sortOption} onValueChange={setSortOption}>
                <DropdownMenuRadioItem value="created_at-desc">Newest</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="created_at-asc">Oldest</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="updated_at-desc">Recently updated</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name-asc">Name (A–Z)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name-desc">Name (Z–A)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="visibility-desc">Visibility</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="secondary" size="icon" className="h-9 w-9 rounded-full" onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}><Plus className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className={cn("px-4 md:px-8", filteredItems.length === 0 && !searchQuery ? "pt-12 md:pt-24" : "pt-4 md:pt-6")}>
        <div className={cn("mx-auto", filteredItems.length === 0 && !searchQuery ? "max-w-2xl" : "max-w-4xl")}>
          <div className={cn("relative", filteredItems.length === 0 && !searchQuery ? "" : "mb-4")}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/50" />
            <Input type="search" placeholder="Search models..." className="pl-12 pr-12 h-12 rounded-full bg-white/10 border-white/20 text-base text-white placeholder:text-white/60" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 text-white/60 hover:text-white" onClick={handleFeelingLucky} title="I'm Feeling Lucky"><Dice5 className="h-5 w-5" /></Button>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              {(["all", "models", "public", "drafts"] as Pill[]).map((k) => (
                <button key={k} className={cn("px-3.5 py-1.5 rounded-full text-sm font-medium", pill === k ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20")} onClick={() => setPill(k)}>
                  {k === "all" ? "All" : k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" className="h-9 px-4 border-white/20 bg-transparent flex items-center gap-2 text-sm"><ListFilter className="h-4 w-4" />Filters{activeFilterCount > 0 && <span className="ml-2 rounded-full bg-white text-black text-xs font-bold px-2 py-0.5">{activeFilterCount}</span>}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Visibility</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={filterVisibility} onValueChange={(v: any) => setFilterVisibility(v)}>
                  <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="public">Public</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="private">Private</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Folder</DropdownMenuLabel>
                <div className="max-h-60 overflow-y-auto px-1">
                  {(allFolders ?? []).map((f) => (
                    <DropdownMenuCheckboxItem key={f.id} checked={filterFolderIds.has(f.id)} onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(filterFolderIds); (checked) ? newSet.add(f.id) : newSet.delete(f.id); setFilterFolderIds(newSet)
                      }}>{f.name}</DropdownMenuCheckboxItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Date</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={filterDate} onValueChange={(v: any) => setFilterDate(v)}>
                  <DropdownMenuRadioItem value="any">Any time</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="24h">Last 24 hours</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="7d">Last 7 days</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="30d">Last 30 days</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="365d">Last year</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Thumbnails</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={filterHasThumb} onValueChange={(v: any) => setFilterHasThumb(v)}>
                  <DropdownMenuRadioItem value="any">Any</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="yes">Has thumbnail</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="no">Missing thumbnail</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={false} onCheckedChange={() => { setFilterVisibility("all"); setFilterFolderIds(new Set()); setFilterDate("any"); setFilterHasThumb("any") }}>Clear filters</DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <main className="relative flex-1 overflow-y-auto px-4 md:px-8 pb-24" onClick={() => setSelectedItems(new Set())} onDrop={(e) => { e.preventDefault(); handleUploadAction(e.dataTransfer.files) }} onDragOver={(e) => e.preventDefault()}>
        <input type="file" className="hidden" multiple accept=".glb" onChange={(e) => handleUploadAction(e.target.files)} />
        {isLoading && <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-6">{Array.from({ length: 18 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg bg-white/10" />)}</div>}
        {error && <div className="text-center text-destructive mt-12">Failed to load gallery.</div>}
        {!isLoading && filteredItems.length === 0 && searchQuery && <div className="text-center text-white/60 mt-10">No results.</div>}
        {!isLoading && filteredItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-6">
            {filteredItems.map((item) => (
              <ItemContextMenu key={item.id} item={item as unknown as GalleryItem} onRename={() => setRenameItem(item)}
                onDelete={() => { setSelectedItems(new Set([item.id])); handleBulkDelete() }} onMove={handleBulkMove}
                onSetPublic={(p) => { setSelectedItems(new Set([item.id])); handleBulkSetPublic(p) }} allFolders={allFolders}>
                <div onClick={(e) => handleItemClick(e, item)} onDoubleClick={() => handleModelClick(item)} onPointerEnter={() => useGLTF.preload(item.model_url)}
                  className={cn("group relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all duration-200 bg-white/5", selectedItems.has(item.id) && "ring-2 ring-white ring-offset-2 ring-offset-black")}>
                  <img src={item.thumbnail_url || "/placeholder.svg"} alt={item.name} className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = `/placeholder.svg?width=400&height=400&query=error` }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3"><p className="text-sm font-semibold truncate text-white">{item.name}</p></div>
                  <div className={cn("absolute top-2 left-2 transition-opacity", selectedItems.has(item.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100")}><Checkbox checked={selectedItems.has(item.id)} onCheckedChange={(c) => { const next = new Set(selectedItems); c ? next.add(item.id) : next.delete(item.id); setSelectedItems(next) }} className="h-5 w-5 bg-black/50 border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-black" /></div>
                  <div className="absolute bottom-2 left-2">{item.is_public ? <Globe className="h-4 w-4 text-white/70" /> : <Lock className="h-4 w-4 text-white/70" />}</div>
                </div>
              </ItemContextMenu>
            ))}
            <div onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()} className="group relative aspect-square rounded-lg border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-white/60 hover:bg-white/5 hover:border-white/40 transition-colors cursor-pointer">
              <Upload className="w-1/3 h-1/3 transition-transform group-hover:scale-110" /><p className="text-sm font-semibold mt-2">Upload Models</p>
            </div>
          </div>
        )}
      </main>
      {selectedItems.size > 0 && (
        <BulkActionBar selectedCount={selectedItems.size} onClear={() => setSelectedItems(new Set())} onDelete={handleBulkDelete} onMove={handleBulkMove} onSetPublic={handleBulkSetPublic}
          onDownload={() => {
            const models = Array.from(selectedItems).map((id) => gridModels.find((i) => i.id === id)).filter((i): i is Model & { type: "model" } => !!i)
            models.forEach((m) => { const a = document.createElement("a"); a.href = m.model_url; a.download = `${m.name}.glb`; document.body.appendChild(a); a.click(); document.body.removeChild(a) })
          }}
          allItems={gridModels as unknown as GalleryItem[]} selectedIds={selectedItems} allFolders={allFolders} currentFolderId={currentFolderId} />
      )}
      <NewFolderDialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen} onCreate={async (name) => {
        await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parent_id: currentFolderId }) })
        mutate(galleryUrl); setRefreshKey((k) => k + 1)
      }} />
      {renameItem && <RenameDialog item={renameItem} onOpenChange={() => setRenameItem(null)} onRename={handleRename} />}
      {editingFolder && <FolderDescriptionDialog folder={editingFolder} open={!!editingFolder} onOpenChange={() => setEditingFolder(null)} onSave={(d) => { fetch(`/api/folders/${editingFolder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: d }) }).then(() => mutate(galleryUrl)) }} />}
    </div>
  )
}