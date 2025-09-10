// === /workspaces/space.iverfinne.no/components/gallery-page.tsx ===
"use client"

import { BulkActionBar } from "@/components/gallery/bulk-action-bar"
import { SettingsPanel } from "@/components/gallery/settings-panel"
import { FolderDescriptionDialog, ItemContextMenu, NewFolderDialog, RenameDialog } from "@/components/gallery/ui-components"
import { CaptureController, ModelViewer, SpotLightInScene } from "@/components/gallery/viewer-components"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sidebar, SidebarContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { lightingPresets } from "@/lib/lighting-presets"
import { cn } from "@/lib/utils"
import type { Folder, GalleryContents, GalleryItem, Light, Model, ViewSettings } from "@/types"
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { upload } from "@vercel/blob/client"
import { ChevronDown, ChevronLeft, ChevronRight, Download, FolderIcon, FolderPlus, Globe, Grid, Info, ListFilter, Lock, Palette, Search, Upload } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import type React from "react"
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"

useGLTF.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/")
const fetcher = (url: string) => fetch(url).then((res) => res.json())

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
  const lastSelectedItem = useRef<string | null>(null)

  const [sortBy, sortOrder] = sortOption.split("-")
  const galleryUrl = `/api/gallery?folderId=${currentFolderId || ""}&sortBy=${sortBy}&sortOrder=${sortOrder}`
  const { data: gallery, error, isLoading } = useSWR<GalleryContents>(galleryUrl, fetcher)
  const { data: allFolders } = useSWR<Folder[]>("/api/folders/all", fetcher)
  const { data: selectedModel, mutate: mutateSelectedModel } = useSWR<Model>(modelId ? `/api/models/${modelId}` : null, fetcher)
  const { data: breadcrumbData } = useSWR<{ id: string; name: string }[]>(currentFolderId ? `/api/folders/${currentFolderId}/breadcrumbs` : null, fetcher)

  useEffect(() => {
    setBreadcrumbs(currentFolderId === null ? [{ id: null, name: "Assets" }] : [{ id: null, name: "Assets" }, ...(breadcrumbData || [])])
  }, [currentFolderId, breadcrumbData])

  const galleryItems: GalleryItem[] = useMemo(
    () => [
      ...(gallery?.folders.map((f) => ({ ...f, type: "folder" as const })) ?? []),
      ...(gallery?.models.map((m) => ({ ...m, type: "model" as const })) ?? []),
    ],
    [gallery],
  )

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return galleryItems.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(q)
      if (searchQuery && item.type === "model") {
        const folderDescriptionMatch = gallery?.currentFolder?.description?.toLowerCase().includes(q)
        return nameMatch || folderDescriptionMatch
      }
      return nameMatch
    })
  }, [galleryItems, searchQuery, gallery?.currentFolder?.description])

  const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("white")
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(true)
  const [lightsEnabled, setLightsEnabled] = useState(true)
  const [environmentEnabled, setEnvironmentEnabled] = useState(false)
  const [bloomEnabled, setBloomEnabled] = useState(false)
  const [bgType, setBgType] = useState<"color" | "gradient" | "image">("color")
  const [bgColor1, setBgColor1] = useState("#000000")
  const [bgColor2, setBgColor2] = useState("#1a1a1a")
  const [bgImage, setBgImage] = useState<string | null>(null)
  const [lights, setLights] = useState<Light[]>([])
  const [selectedLightId, setSelectedLightId] = useState<number | null>(null)

  const [isOrbitControlsEnabled, setIsOrbitControlsEnabled] = useState(true)
  const modelRef = useRef<THREE.Group>(null)
  const captureControllerRef = useRef<{ capture: () => Promise<File | null> }>(null)
  const orbitControlsRef = useRef<OrbitControlsImpl>(null)
  const [boundsKey, setBoundsKey] = useState(0)
  const [isLightDragging, setIsLightDragging] = useState(false)

  const defaultLights: Light[] = useMemo(() => {
    const preset = lightingPresets.find((p) => p.name === "3-Point")?.lights ?? []
    return preset.map((l, i) => ({ ...l, id: Date.now() + i, visible: true }))
  }, [])

  const resetViewSettings = useCallback(
    (s: ViewSettings | null | undefined) => {
      setLights((s?.lights ?? defaultLights).map((l, i) => ({ ...l, id: Date.now() + i, visible: true })))
      setLightsEnabled(s?.lightsEnabled ?? true)
      setEnvironmentEnabled(s?.environmentEnabled ?? false)
      setBloomEnabled(s?.bloomEnabled ?? false)
      setBgType(s?.bgType ?? "color")
      setBgColor1(s?.bgColor1 ?? "#000000")
      setBgColor2(s?.bgColor2 ?? "#1a1a1a")
      setBgImage(s?.bgImage ?? null)
      setMaterialMode(s?.materialMode ?? "white")
      setSelectedLightId(null)
    },
    [defaultLights],
  )

  useEffect(() => {
    if (!selectedModel) return
    resetViewSettings(selectedModel.view_settings)
    if (orbitControlsRef.current && selectedModel.view_settings?.cameraPosition) {
      orbitControlsRef.current.object.position.set(...selectedModel.view_settings.cameraPosition)
      orbitControlsRef.current.target.set(...(selectedModel.view_settings.cameraTarget ?? [0, 0, 0]))
      orbitControlsRef.current.update()
    }
  }, [selectedModel, resetViewSettings])

  const updateQuery = (params: Record<string, string | null>) => {
    const q = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([k, v]) => (v === null ? q.delete(k) : q.set(k, v)))
    router.push(`?${q.toString()}`)
  }

  const { mutate: mutateModel } = useSWRConfig()
  const handleModelUpdate = useCallback(
    async (id: string, updates: Partial<Omit<Model, "id" | "created_at">>) => {
      await fetch(`/api/models/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) })
      mutateSelectedModel()
      mutate(galleryUrl)
      mutateModel(`/api/models/${id}`)
    },
    [mutateSelectedModel, mutate, mutateModel, galleryUrl],
  )

  const handleThumbnailUpload = useCallback(
    async (file: File) => {
      if (!selectedModel) return
      const fromName = file.name?.split(".").pop()?.toLowerCase()
      const fromType = (file.type || "").split("/")[1]
      const ext = (fromName || fromType || "png").replace(/[^a-z0-9]/gi, "")
      const pathname = `thumbnails/${selectedModel.id}-${Date.now()}.${ext || "png"}`
      try {
        const blobRes = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
        })
        // Some versions expose `url`, others `downloadUrl`
        const url = (blobRes as any).url || (blobRes as any).downloadUrl
        await handleModelUpdate(selectedModel.id, { thumbnail_url: `${url}?v=${Date.now()}` })
      } catch (err) {
        // Fallback: at least show a local preview if upload route fails
        const fallbackUrl = URL.createObjectURL(file)
        await handleModelUpdate(selectedModel.id, { thumbnail_url: fallbackUrl })
      }
    },
    [selectedModel, handleModelUpdate],
  )

  const handleCaptureThumbnail = useCallback(async () => {
    if (!captureControllerRef.current) return
    const file = await captureControllerRef.current.capture()
    if (file) await handleThumbnailUpload(file)
  }, [handleThumbnailUpload])

  useEffect(() => {
    if (!selectedModel) return
    if (selectedModel.thumbnail_url.includes("/placeholder.svg")) {
      const t = setTimeout(() => captureControllerRef.current && handleCaptureThumbnail(), 1200)
      return () => clearTimeout(t)
    }
  }, [selectedModel, handleCaptureThumbnail])

  const handleNavigateToFolder = (folderId: string) => {
    updateQuery({ folderId, modelId: null })
    setSelectedItems(new Set())
  }
  const handleBreadcrumbClick = (folderId: string | null) => {
    updateQuery({ folderId, modelId: null })
    setSelectedItems(new Set())
  }
  const handleModelClick = (m: Model) => updateQuery({ modelId: m.id })
  const handleCloseViewer = () => updateQuery({ modelId: null })

  const handleItemClick = (e: React.MouseEvent, item: GalleryItem) => {
    e.stopPropagation()
    const next = new Set(selectedItems)
    if (e.shiftKey && lastSelectedItem.current) {
      const li = filteredItems.findIndex((i) => i.id === lastSelectedItem.current)
      const ci = filteredItems.findIndex((i) => i.id === item.id)
      const [s, t] = [li, ci].sort((a, b) => a - b)
      for (let i = s; i <= t; i++) next.add(filteredItems[i].id)
    } else if (e.metaKey || e.ctrlKey) next.has(item.id) ? next.delete(item.id) : next.add(item.id)
    else {
      next.size === 1 && next.has(item.id) ? next.clear() : next.clear()
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
          const url = (blob as any).url || (blob as any).downloadUrl
          await fetch("/api/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.name.replace(/\.glb$/, ""),
              model_url: url,
              thumbnail_url: `/placeholder.svg?width=400&height=400&query=${encodeURIComponent(file.name.replace(/\.glb$/, ""))}`,
              folder_id: currentFolderId,
            }),
          })
        } catch {
          /* noop */
        }
      }),
    )
    mutate(galleryUrl)
  }

  const handleRename = async (newName: string) => {
    const item = renameItem
    if (!item) return
    const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`
    await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) })
    mutate(galleryUrl)
    if (item.type === "model") mutate(`/api/models/${item.id}`)
    setRenameItem(null)
  }

  const bulkAct = async (ids: string[], fn: (id: string, type: "folder" | "model") => Promise<void>) => {
    await Promise.all(
      ids.map(async (id) => {
        const it = galleryItems.find((i) => i.id === id)
        if (!it) return
        await fn(id, it.type)
      }),
    )
    mutate(galleryUrl)
  }

  const handleBulkDelete = async () => {
    await bulkAct(Array.from(selectedItems), (id, type) => fetch(type === "folder" ? `/api/folders/${id}` : `/api/models/${id}`, { method: "DELETE" }).then(() => { }))
    if (Array.from(selectedItems).includes(modelId || "")) handleCloseViewer()
    setSelectedItems(new Set())
  }

  const handleBulkMove = async (targetFolderId: string | null) => {
    await bulkAct(
      Array.from(selectedItems),
      (id, type) =>
        fetch(type === "folder" ? `/api/folders/${id}` : `/api/models/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(type === "folder" ? { parent_id: targetFolderId } : { folder_id: targetFolderId }),
        }).then(() => { }),
    )
    if (Array.from(selectedItems).includes(modelId || "") && targetFolderId !== currentFolderId) handleCloseViewer()
    setSelectedItems(new Set())
  }

  const handleBulkSetPublic = async (isPublic: boolean) => {
    await bulkAct(
      Array.from(selectedItems),
      (id, type) =>
        fetch(type === "folder" ? `/api/folders/${id}` : `/api/models/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_public: isPublic }),
        }).then(() => { }),
    )
    if (Array.from(selectedItems).includes(modelId || "")) mutateSelectedModel()
    setSelectedItems(new Set())
  }

  const handleSaveViewSettings = async () => {
    if (!selectedModel || !orbitControlsRef.current) return
    const settings: ViewSettings = {
      lights: lights.map(({ id, visible, ...rest }) => rest),
      lightsEnabled,
      environmentEnabled,
      bloomEnabled,
      ssaoEnabled: false,
      bgType,
      bgColor1,
      bgColor2,
      bgImage,
      cameraPosition: orbitControlsRef.current.object.position.toArray() as [number, number, number],
      cameraTarget: orbitControlsRef.current.target.toArray() as [number, number, number],
      materialMode,
    }
    await handleModelUpdate(selectedModel.id, { view_settings: settings })
  }

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

  const randomizeAllPartial = () => ({ intensity: 5 + Math.random() * 20, kelvin: 2500 + Math.random() * 7500, angle: 20 + Math.random() * 40, penumbra: Math.random() * 0.8 })
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
    const box = new THREE.Box3().setFromObject(modelRef.current),
      c = new THREE.Vector3()
    box.getCenter(c)
    handleLightChange(id, { targetPosition: [c.x, c.y, c.z] })
  }
  const applyPreset = (name: string) => {
    const p = lightingPresets.find((p) => p.name === name)
    if (!p) return
    setLights(p.lights.map((l, i) => ({ ...l, id: Date.now() + i, visible: true })))
    setSelectedLightId(null)
  }

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!modelId || document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return
      const k = e.key.toLowerCase()
      if (k === "1") setMaterialMode("white")
      if (k === "2") setMaterialMode("pbr")
      if (k === "3") setMaterialMode("normal")
      if (k === "r") {
        e.preventDefault()
        selectedLightId === null ? setLights((ls) => ls.map((l) => ({ ...l, ...randomizeAllPartial() }))) : handleLightChange(selectedLightId, randomizeAllPartial())
      }
      if (k === "arrowright" || k === "arrowleft") {
        const ms = gallery?.models ?? []
        if (!ms.length) return
        const i = ms.findIndex((m) => m.id === modelId)
        if (i === -1) return
        const ni = k === "arrowright" ? (i + 1) % ms.length : (i - 1 + ms.length) % ms.length
        updateQuery({ modelId: ms[ni].id })
      }
    },
    [gallery?.models, modelId, selectedLightId],
  )
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
    const targetPos = new THREE.Vector3().fromArray(light.targetPosition)
    const vec = new THREE.Vector3().fromArray(light.position).sub(targetPos)
    const cam = orbitControlsRef.current.object
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
    const rt = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
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

  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false)
  const [renameItem, setRenameItem] = useState<GalleryItem | null>(null)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)

  // --- Removed unify scale feature completely ---

  if (modelId) {
    if (!selectedModel) return <div className="w-full h-screen" />
    return (
      <div className="w-full h-screen relative" style={bgStyle}>
        <Canvas
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
          onCreated={({ gl }) => {
            gl.setClearAlpha(0) // transparent canvas so custom background shows
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1
            gl.shadowMap.enabled = true
            gl.shadowMap.type = THREE.PCFSoftShadowMap
            // @ts-ignore
            gl.physicallyCorrectLights = true
          }}
          onPointerMissed={(e) => e.button === 0 && setSelectedLightId(null)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          frameloop={isLightDragging ? "always" : "demand"}
        >
          <Suspense fallback={null}>
            {lightsEnabled && lights.map((l) => <SpotLightInScene key={l.id} light={l} />)}
            <Bounds fit clip damping={6} margin={1.2} key={`${selectedModel.id}-${boundsKey}`}>
              <ModelViewer ref={modelRef} modelUrl={selectedModel.model_url} materialMode={materialMode} />
            </Bounds>
            {bloomEnabled && (
              <EffectComposer disableNormalPass>
                <Bloom mipmapBlur intensity={0.5} luminanceThreshold={1} />
              </EffectComposer>
            )}
            <CaptureController ref={captureControllerRef} modelRef={modelRef} />
          </Suspense>
          <OrbitControls ref={orbitControlsRef} enabled={isOrbitControlsEnabled} makeDefault />
          <ambientLight intensity={0.1} />
        </Canvas>

        <div className="absolute top-4 left-4 z-10">
          <Button variant="ghost" size="icon" onClick={handleCloseViewer} className="text-white bg-black/50 backdrop-blur-sm hover:bg-white/20 rounded-full">
            <ChevronLeft className="h-6 w-6" />
          </Button>
        </div>

        <div className="absolute top-4 right-4 w-[360px] bg-black/50 backdrop-blur-sm border border-white/20 rounded-lg text-white z-10 flex flex-col max-h-[calc(100vh-2rem)]">
          <div className="flex items-center justify-end p-4">
            <button onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)} className="p-1 -m-1">
              <ChevronDown className={`h-5 w-5 transition-transform ${isSettingsPanelOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          {isSettingsPanelOpen && (
            <SettingsPanel
              model={selectedModel}
              onUpdate={handleModelUpdate}
              onDelete={() => {
                setSelectedItems(new Set([selectedModel.id]))
                handleBulkDelete()
              }}
              onThumbnailUpload={handleThumbnailUpload}
              onCaptureThumbnail={handleCaptureThumbnail}
              onDeleteThumbnail={handleDeleteThumbnail}
              lights={lights}
              onLightChange={handleLightChange}
              addLight={addLight}
              removeLight={removeLight}
              cloneLight={cloneLight}
              toggleLightVisibility={toggleLightVisibility}
              selectedLightId={selectedLightId}
              onSelectLight={setSelectedLightId}
              onFocusLight={focusLightOnModel}
              lightsEnabled={lightsEnabled}
              onLightsEnabledChange={setLightsEnabled}
              environmentEnabled={environmentEnabled}
              onEnvironmentEnabledChange={setEnvironmentEnabled}
              bloomEnabled={bloomEnabled}
              onBloomEnabledChange={setBloomEnabled}
              bgType={bgType}
              onBgTypeChange={setBgType}
              bgColor1={bgColor1}
              onBgColor1Change={setBgColor1}
              bgColor2={bgColor2}
              onBgColor2Change={setBgColor2}
              bgImage={bgImage}
              onBgImageChange={setBgImage}
              onSaveView={handleSaveViewSettings}
              onDeleteView={handleDeleteViewSettings}
              onResetView={() => resetViewSettings(selectedModel.view_settings)}
              onApplyPreset={(n) => applyPreset(n)}
              presets={lightingPresets.map((p) => p.name)}
            />
          )}
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm p-2 rounded-full flex items-center gap-1">
          <Button variant={materialMode === "white" ? "secondary" : "ghost"} size="icon" onClick={() => setMaterialMode("white")} className="text-white rounded-full">
            <div className="w-6 h-6 rounded-full bg-white" />
          </Button>
          <Button variant={materialMode === "pbr" ? "secondary" : "ghost"} size="icon" onClick={() => setMaterialMode("pbr")} className="text-white rounded-full">
            <Palette />
          </Button>
          <Button variant={materialMode === "normal" ? "secondary" : "ghost"} size="icon" onClick={() => setMaterialMode("normal")} className="text-white rounded-full">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const a = document.createElement("a")
              a.href = selectedModel.model_url
              a.download = `${selectedModel.name}.glb`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
            }}
            className="text-white rounded-full"
          >
            <Download />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground h-full flex flex-col">
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon" variant="floating">
          <SidebarHeader>
            <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
              <SidebarTrigger />
              <h1 className="font-semibold text-lg group-data-[collapsible=icon]:hidden">My Models</h1>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()} tooltip="Upload Models">
                  <Upload />
                  <span>Upload</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => handleBreadcrumbClick(null)} isActive={currentFolderId === null} tooltip="Assets">
                  <Grid />
                  <span>Assets</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setIsNewFolderDialogOpen(true)} tooltip="New Folder">
                  <FolderPlus />
                  <span>New Folder</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <header className="flex items-center justify-between p-4 border-b gap-4">
            <div className="flex items-center text-sm">
              {breadcrumbs.map((crumb, index) => (
                <Fragment key={crumb.id || "root"}>
                  <button onClick={() => handleBreadcrumbClick(crumb.id)} className="hover:underline disabled:text-foreground disabled:no-underline" disabled={index === breadcrumbs.length - 1}>
                    {crumb.name}
                  </button>
                  {index === breadcrumbs.length - 1 && gallery?.currentFolder && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => setEditingFolder(gallery.currentFolder)}>
                      <Info className="h-4 w-4" />
                    </Button>
                  )}
                  {index < breadcrumbs.length - 1 && <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />}
                </Fragment>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="search" placeholder="Search..." className="pl-8 w-48 md:w-64" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0 bg-transparent">
                    <ListFilter className="h-4 w-4" />
                    <span className="sr-only">Sort</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={sortOption} onValueChange={setSortOption}>
                    <DropdownMenuRadioItem value="created_at-desc">Most Recent</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name-asc">Name (A-Z)</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name-desc">Name (Z-A)</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main
            className="relative flex-1 p-4 md:p-8 overflow-y-auto"
            onClick={() => setSelectedItems(new Set())}
            onDrop={(e) => {
              e.preventDefault()
              handleUploadAction(e.dataTransfer.files)
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <input type="file" className="hidden" multiple accept=".glb" onChange={(e) => handleUploadAction(e.target.files)} />
            {isLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 18 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            )}
            {error && <div className="text-center text-destructive">Failed to load gallery.</div>}
            {!isLoading && filteredItems.length === 0 && (
              <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-full pt-20">
                <FolderIcon size={64} className="mb-4" />
                <h2 className="text-2xl font-semibold">This folder is empty</h2>
                <p className="mt-2">Drag & drop .glb files here or use the upload button.</p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredItems.map((item) => (
                <ItemContextMenu
                  key={item.id}
                  item={item}
                  onRename={() => setRenameItem(item)}
                  onDelete={() => {
                    setSelectedItems(new Set([item.id]))
                    handleBulkDelete()
                  }}
                  onMove={(dst) => {
                    setSelectedItems(new Set([item.id]))
                    handleBulkMove(dst)
                  }}
                  onSetPublic={(p) => {
                    setSelectedItems(new Set([item.id]))
                    handleBulkSetPublic(p)
                  }}
                  allFolders={allFolders}
                >
                  <div
                    onClick={(e) => handleItemClick(e, item)}
                    onDoubleClick={() => (item.type === "folder" ? handleNavigateToFolder(item.id) : handleModelClick(item))}
                    className={cn(
                      "group relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all duration-200",
                      selectedItems.has(item.id) && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                  >
                    {item.type === "folder" ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-muted hover:bg-secondary transition-colors">
                        <FolderIcon className="w-1/3 h-1/3 text-foreground/50" />
                        <p className="text-sm font-semibold truncate mt-2 text-center w-full px-2">{item.name}</p>
                      </div>
                    ) : (
                      <>
                        <img
                          src={item.thumbnail_url || "/placeholder.svg"}
                          alt={item.name}
                          className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110 bg-muted"
                          onError={(e) => {
                            ; (e.target as HTMLImageElement).src = `/placeholder.svg?width=400&height=400&query=error`
                          }}
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-2">
                          <p className="text-sm font-semibold truncate text-white">{item.name}</p>
                        </div>
                      </>
                    )}
                    <div className={cn("absolute top-2 left-2 transition-opacity", selectedItems.has(item.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        onCheckedChange={(c) => {
                          const next = new Set(selectedItems)
                          c ? next.add(item.id) : next.delete(item.id)
                          setSelectedItems(next)
                        }}
                        className="bg-background/50 border-white/50 data-[state=checked]:bg-primary"
                      />
                    </div>
                    <div className="absolute bottom-2 left-2">{item.is_public ? <Globe className="h-4 w-4 text-white/70" /> : <Lock className="h-4 w-4 text-white/70" />}</div>
                  </div>
                </ItemContextMenu>
              ))}
              {!isLoading && !searchQuery && (
                <div
                  onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
                  className="group relative aspect-square rounded-lg border-2 border-dashed border-muted-foreground/50 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted hover:border-primary hover:text-primary transition-colors cursor-pointer"
                >
                  <Upload className="w-1/3 h-1/3 transition-transform group-hover:scale-110" />
                  <p className="text-sm font-semibold mt-2">Upload Models</p>
                </div>
              )}
            </div>
          </main>

          {selectedItems.size > 0 && (
            <BulkActionBar
              selectedCount={selectedItems.size}
              onClear={() => setSelectedItems(new Set())}
              onDelete={handleBulkDelete}
              onMove={handleBulkMove}
              onSetPublic={handleBulkSetPublic}
              onDownload={() => {
                const models = Array.from(selectedItems)
                  .map((id) => galleryItems.find((i) => i.id === id))
                  .filter((i): i is Model & { type: "model" } => !!i && i.type === "model")
                models.forEach((m) => {
                  const a = document.createElement("a")
                  a.href = m.model_url
                  a.download = `${m.name}.glb`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                })
              }}
              allItems={galleryItems}
              selectedIds={selectedItems}
              allFolders={allFolders}
              currentFolderId={currentFolderId}
            />
          )}
        </SidebarInset>
      </SidebarProvider>

      <NewFolderDialog
        open={isNewFolderDialogOpen}
        onOpenChange={setIsNewFolderDialogOpen}
        onCreate={async (name) => {
          await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, parent_id: currentFolderId }) })
          mutate(galleryUrl)
        }}
      />
      {renameItem && <RenameDialog item={renameItem} onOpenChange={() => setRenameItem(null)} onRename={handleRename} />}
      {editingFolder && (
        <FolderDescriptionDialog
          folder={editingFolder}
          open={!!editingFolder}
          onOpenChange={() => setEditingFolder(null)}
          onSave={(d) => {
            fetch(`/api/folders/${editingFolder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: d }) }).then(() => mutate(galleryUrl))
          }}
        />
      )}
    </div>
  )
}
