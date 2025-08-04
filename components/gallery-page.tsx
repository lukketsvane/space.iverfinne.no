"use client"
import { Checkbox } from "@/components/ui/checkbox"

import type React from "react"

import {
  useState,
  useRef,
  useEffect,
  Suspense,
  useCallback,
  Fragment,
  forwardRef,
  useMemo,
  useImperativeHandle,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useGLTF, OrbitControls, Html, useProgress, SpotLight, useHelper, Plane, Bounds } from "@react-three/drei"
import { EffectComposer, Bloom } from "@react-three/postprocessing"
import {
  Upload,
  FolderIcon,
  ChevronLeft,
  Palette,
  FolderPlus,
  ChevronRight,
  Download,
  Grid,
  Search,
  ChevronDown,
  ListFilter,
  LoaderIcon,
  Info,
  Globe,
  Lock,
} from "lucide-react"
import { upload } from "@vercel/blob/client"
import useSWR, { useSWRConfig } from "swr"
import { toast } from "sonner"
import * as THREE from "three"
import dynamic from "next/dynamic"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { kelvinToRgb, cn } from "@/lib/utils"
import { lightingPresets } from "@/lib/lighting-presets"
import type { Model, Folder, Light, ViewSettings, GalleryContents, GalleryItem } from "@/types"
import { SettingsPanel } from "@/components/settings-panel"
import { ItemContextMenu } from "@/components/item-context-menu"
import { BulkActionBar } from "@/components/bulk-action-bar"
import { NewFolderDialog } from "@/components/new-folder-dialog"
import { RenameDialog } from "@/components/rename-dialog"
import { FolderDescriptionDialog } from "@/components/folder-description-dialog"

const Toaster = dynamic(() => import("sonner").then((mod) => mod.Toaster), { ssr: false })

// --- Data Fetching ---
const fetcher = (url: string) => fetch(url).then((res) => res.json())

function dataURLtoFile(dataurl: string, filename: string) {
  const arr = dataurl.split(",")
  const mimeMatch = arr[0].match(/:(.*?);/)
  if (!mimeMatch) {
    throw new Error("Invalid data URL")
  }
  const mime = mimeMatch[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

// --- 3D Components ---
function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="text-white text-lg">{progress.toFixed(2)} % loaded</div>
    </Html>
  )
}

const ModelViewer = forwardRef<THREE.Group, { modelUrl: string; materialMode: "pbr" | "normal" | "white" }>(
  ({ modelUrl, materialMode }, ref) => {
    const gltf = useGLTF(modelUrl)
    const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

    const originalMaterials = useRef(new Map<string, THREE.Material | THREE.Material[]>())
    const whiteMaterials = useRef(new Map<string, THREE.Material | THREE.Material[]>())
    const normalMaterial = useMemo(() => new THREE.MeshNormalMaterial({ side: THREE.DoubleSide }), [])

    // This effect runs once to set up shadows and create material variants
    useEffect(() => {
      const box = new THREE.Box3().setFromObject(scene)
      const center = new THREE.Vector3()
      box.getCenter(center)

      scene.position.x -= center.x
      scene.position.z -= center.z
      scene.position.y -= box.min.y

      // Create a single 1x1 white texture to be reused
      const whiteTexture = new THREE.CanvasTexture(document.createElement("canvas"))
      const context = (whiteTexture.image as HTMLCanvasElement).getContext("2d")
      if (context) {
        whiteTexture.image.width = 1
        whiteTexture.image.height = 1
        context.fillStyle = "white"
        context.fillRect(0, 0, 1, 1)
        whiteTexture.needsUpdate = true
      }

      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true
          child.receiveShadow = true

          const mesh = child as THREE.Mesh

          // Store original material
          originalMaterials.current.set(mesh.uuid, mesh.material)

          // Create and store a "white" version of the material
          const createWhiteVariant = (mat: THREE.Material): THREE.Material => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              const whiteMat = mat.clone()
              whiteMat.map = whiteTexture // Replace the albedo texture
              whiteMat.color.set("white") // Set the base color to white
              return whiteMat
            }
            // Fallback for any non-standard materials
            return new THREE.MeshStandardMaterial({ color: "white", side: THREE.DoubleSide })
          }

          if (Array.isArray(mesh.material)) {
            whiteMaterials.current.set(mesh.uuid, mesh.material.map(createWhiteVariant))
          } else {
            whiteMaterials.current.set(mesh.uuid, createWhiteVariant(mesh.material))
          }
        }
      })
    }, [scene])

    // This effect handles switching materials based on the selected mode
    useEffect(() => {
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          let newMaterial: THREE.Material | THREE.Material[] | undefined

          if (materialMode === "pbr") {
            newMaterial = originalMaterials.current.get(mesh.uuid)
          } else if (materialMode === "white") {
            newMaterial = whiteMaterials.current.get(mesh.uuid)
          } else if (materialMode === "normal") {
            newMaterial = normalMaterial
          }

          if (newMaterial) {
            mesh.material = newMaterial
          }
        }
      })
    }, [scene, materialMode, normalMaterial])

    return <primitive ref={ref} object={scene} />
  },
)
ModelViewer.displayName = "ModelViewer"

function SpotLightInScene({
  light,
  isSelected,
  onSelect,
}: {
  light: Light
  isSelected: boolean
  onSelect: () => void
}) {
  const spotLightRef = useRef<THREE.SpotLight>(null!)
  const target = useRef(new THREE.Object3D())

  // Use the useHelper hook to show a helper for the selected light
  useHelper(isSelected ? spotLightRef : null, THREE.SpotLightHelper, "yellow")

  useFrame(() => {
    // Ensure the light always points to its target
    target.current.position.set(...light.targetPosition)
    target.current.updateMatrixWorld()
  })

  // Convert Kelvin temperature to an RGB color
  const { r, g, b } = kelvinToRgb(light.kelvin)
  const lightColor = new THREE.Color(r, g, b)

  if (!light.visible) return null

  return (
    <>
      <SpotLight
        ref={spotLightRef}
        position={light.position}
        target={target.current}
        color={lightColor}
        intensity={light.intensity}
        angle={THREE.MathUtils.degToRad(light.angle)}
        penumbra={light.penumbra}
        decay={light.decay}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
      />
      <primitive object={target.current} />
      {/* The clickable sphere representing the light source */}
      <mesh position={light.position} onClick={onSelect} onPointerOver={(e) => e.stopPropagation()}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color={isSelected ? "yellow" : lightColor} wireframe />
      </mesh>
    </>
  )
}

const CaptureController = forwardRef<
  { capture: () => Promise<File | null> },
  { modelRef: React.RefObject<THREE.Group> }
>(({ modelRef }, ref) => {
  const { gl, scene, camera } = useThree()

  useImperativeHandle(ref, () => ({
    capture: async () => {
      if (!modelRef.current) {
        toast.error("Model not loaded yet.")
        return null
      }

      // 1. Temporarily set background to transparent
      const originalBackground = scene.background
      scene.background = null
      gl.render(scene, camera) // Force a render

      // 2. Calculate model's 2D bounding box on screen
      const box = new THREE.Box3().setFromObject(modelRef.current)
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ]

      let minX = Number.POSITIVE_INFINITY,
        maxX = Number.NEGATIVE_INFINITY,
        minY = Number.POSITIVE_INFINITY,
        maxY = Number.NEGATIVE_INFINITY

      corners.forEach((corner) => {
        const screenPos = corner.clone().project(camera)
        const x = ((screenPos.x + 1) / 2) * gl.domElement.width
        const y = (-(screenPos.y - 1) / 2) * gl.domElement.height
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      })

      const boxWidth = maxX - minX
      const boxHeight = maxY - minY

      if (boxWidth <= 0 || boxHeight <= 0) {
        toast.error("Could not determine model bounds for capture.")
        scene.background = originalBackground
        return null
      }

      // 3. Create a square crop region with padding
      const size = Math.max(boxWidth, boxHeight) * 1.2 // 20% padding
      const centerX = minX + boxWidth / 2
      const centerY = minY + boxHeight / 2
      const sx = centerX - size / 2
      const sy = centerY - size / 2

      // 4. Draw the cropped region to a temporary canvas
      const tempCanvas = document.createElement("canvas")
      tempCanvas.width = 512 // Create a fixed size thumbnail
      tempCanvas.height = 512
      const ctx = tempCanvas.getContext("2d")
      if (!ctx) {
        toast.error("Could not create canvas context for capture.")
        scene.background = originalBackground
        return null
      }
      ctx.drawImage(gl.domElement, sx, sy, size, size, 0, 0, 512, 512)

      // 5. Restore original background
      scene.background = originalBackground

      // 6. Convert canvas to File and return
      const dataUrl = tempCanvas.toDataURL("image/png")
      return dataURLtoFile(dataUrl, `thumbnail-${Date.now()}.png`)
    },
  }))

  return null
})
CaptureController.displayName = "CaptureController"

// --- Main Application Component ---
function GalleryPage() {
  const { mutate } = useSWRConfig()
  const router = useRouter()
  const searchParams = useSearchParams()

  const modelId = searchParams.get("modelId")
  const currentFolderId = searchParams.get("folderId") || null

  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "Assets" }])
  const [searchQuery, setSearchQuery] = useState("")
  const [sortOption, setSortOption] = useState("created_at-desc")
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const lastSelectedItem = useRef<string | null>(null)

  const [sortBy, sortOrder] = sortOption.split("-")
  const galleryUrl = `/api/gallery?folderId=${currentFolderId || ""}&sortBy=${sortBy}&sortOrder=${sortOrder}`
  const { data: gallery, error, isLoading } = useSWR<GalleryContents>(galleryUrl, fetcher)
  const { data: allFolders } = useSWR<Folder[]>("/api/folders/all", fetcher)
  const { data: selectedModel, mutate: mutateSelectedModel } = useSWR<Model>(
    modelId ? `/api/models/${modelId}` : null,
    fetcher,
  )
  const { data: breadcrumbData, error: breadcrumbError } = useSWR<{ id: string; name: string }[]>(
    currentFolderId ? `/api/folders/${currentFolderId}/breadcrumbs` : null,
    fetcher,
  )

  const galleryItems: GalleryItem[] = [
    ...(gallery?.folders.map((f) => ({ ...f, type: "folder" })) ?? []),
    ...(gallery?.models.map((m) => ({ ...m, type: "model" })) ?? []),
  ]

  const filteredItems = galleryItems.filter((item) => {
    const nameMatch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
    if (searchQuery && item.type === "model") {
      const folderDescriptionMatch = gallery?.currentFolder?.description
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase())
      return nameMatch || folderDescriptionMatch
    }
    return nameMatch
  })

  useEffect(() => {
    if (breadcrumbError) {
      console.error("Failed to load breadcrumbs:", breadcrumbError)
      toast.error(
        "Could not load folder path. Your database schema might be out of date. Please run the latest SQL migration script.",
        { duration: 10000 },
      )
    }

    if (currentFolderId === null) {
      setBreadcrumbs([{ id: null, name: "Assets" }])
    } else if (breadcrumbData && Array.isArray(breadcrumbData)) {
      const newBreadcrumbs = [{ id: null, name: "Assets" }, ...breadcrumbData.map((f) => ({ id: f.id, name: f.name }))]
      setBreadcrumbs(newBreadcrumbs)
    }
  }, [currentFolderId, breadcrumbData, breadcrumbError])

  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([])
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false)
  const [renameItem, setRenameItem] = useState<GalleryItem | null>(null)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)

  // Viewer settings state
  const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("white")
  const [isDragging, setIsDragging] = useState(false)
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(true)
  const [lightsEnabled, setLightsEnabled] = useState(true)
  const [environmentEnabled, setEnvironmentEnabled] = useState(true)
  const [bloomEnabled, setBloomEnabled] = useState(true)
  const [bgType, setBgType] = useState<"color" | "gradient" | "image">("color")
  const [bgColor1, setBgColor1] = useState("#000000")
  const [bgColor2, setBgColor2] = useState("#1a1a1a")
  const [bgImage, setBgImage] = useState<string | null>(null)
  const [lights, setLights] = useState<Light[]>([])
  const [selectedLightId, setSelectedLightId] = useState<number | null>(null)
  const [currentPresetIndex, setCurrentPresetIndex] = useState(-1)
  const [fieldOfView, setFieldOfView] = useState(50)

  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 })
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isOrbitControlsEnabled, setIsOrbitControlsEnabled] = useState(true)
  const [isShiftDown, setIsShiftDown] = useState(false)
  const modelRef = useRef<THREE.Group>(null)
  const captureControllerRef = useRef<{ capture: () => Promise<File | null> }>(null)

  const resetViewSettings = useCallback((settings: ViewSettings | null | undefined) => {
    const defaultLights = [
      {
        id: Date.now(),
        visible: true,
        position: [-2, 3, 2] as [number, number, number],
        targetPosition: [0, 0, 0] as [number, number, number],
        intensity: 3,
        kelvin: 5500,
        decay: 1,
        angle: 45,
        penumbra: 0.5,
      },
      {
        id: Date.now() + 1,
        visible: true,
        position: [2, 2, -1] as [number, number, number],
        targetPosition: [0, 0, 0] as [number, number, number],
        intensity: 2,
        kelvin: 4000,
        decay: 1,
        angle: 60,
        penumbra: 0.3,
      },
    ]

    if (settings) {
      if (settings.lights) {
        const newLights = settings.lights.map((l, i) => ({
          ...l,
          id: Date.now() + i,
          visible: true,
        }))
        setLights(newLights)
      } else {
        setLights(defaultLights)
      }

      setLightsEnabled(settings.lightsEnabled ?? true)
      setEnvironmentEnabled(settings.environmentEnabled ?? true)
      setBloomEnabled(settings.bloomEnabled ?? true)
      setBgType(settings.bgType ?? "color")
      setBgColor1(settings.bgColor1 ?? "#000000")
      setBgColor2(settings.bgColor2 ?? "#1a1a1a")
      setFieldOfView(settings.fieldOfView ?? 50)
    } else {
      setLights(defaultLights)
      setLightsEnabled(true)
      setEnvironmentEnabled(true)
      setBloomEnabled(true)
      setBgType("color")
      setBgColor1("#000000")
      setBgColor2("#1a1a1a")
      setFieldOfView(50)
    }
    setSelectedLightId(null)
    setCurrentPresetIndex(-1)
  }, [])

  useEffect(() => {
    if (selectedModel?.view_settings) {
      resetViewSettings(selectedModel.view_settings)
    }
  }, [selectedModel, resetViewSettings])

  const hasCaptured = useRef(false)
  useEffect(() => {
    hasCaptured.current = false
  }, [modelId])

  const handleModelUpdate = async (id: string, updates: Partial<Omit<Model, "id" | "created_at">>) => {
    await fetch(`/api/models/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    mutateSelectedModel()
    mutate(galleryUrl)
  }

  const handleThumbnailUpload = useCallback(
    async (file: File) => {
      if (!selectedModel) return
      toast.info(`Uploading thumbnail...`)
      const pathname = `thumbnails/${selectedModel.id}.${file.name.split(".").pop()}`
      const newBlob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ isThumbnail: true }),
      })
      await handleModelUpdate(selectedModel.id, { thumbnail_url: newBlob.url })
    },
    [selectedModel, mutateSelectedModel, mutate, galleryUrl],
  )

  const handleCaptureThumbnail = useCallback(async () => {
    if (captureControllerRef.current) {
      toast.info("Capturing thumbnail...")
      const file = await captureControllerRef.current.capture()
      if (file) {
        await handleThumbnailUpload(file)
      }
    }
  }, [handleThumbnailUpload])

  useEffect(() => {
    if (selectedModel && selectedModel.thumbnail_url.includes("/placeholder.svg") && !hasCaptured.current) {
      const timer = setTimeout(() => {
        if (captureControllerRef.current) {
          handleCaptureThumbnail()
          hasCaptured.current = true
        }
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [selectedModel, handleCaptureThumbnail])

  const updateQuery = (newParams: Record<string, string | null>) => {
    const query = new URLSearchParams(searchParams.toString())
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null) {
        query.delete(key)
      } else {
        query.set(key, value)
      }
    })
    router.push(`?${query.toString()}`)
  }

  const handleNavigateToFolder = (folderId: string) => {
    updateQuery({ folderId, modelId: null })
    setSelectedItems(new Set())
  }
  const handleBreadcrumbClick = (folderId: string | null) => {
    updateQuery({ folderId, modelId: null })
    setSelectedItems(new Set())
  }
  const handleModelClick = (model: Model) => updateQuery({ modelId: model.id })
  const handleCloseViewer = () => updateQuery({ modelId: null })

  const handleItemClick = (e: React.MouseEvent, item: GalleryItem) => {
    e.stopPropagation()
    const newSelectedItems = new Set(selectedItems)

    if (e.shiftKey && lastSelectedItem.current) {
      const lastIndex = filteredItems.findIndex((i) => i.id === lastSelectedItem.current)
      const currentIndex = filteredItems.findIndex((i) => i.id === item.id)
      const start = Math.min(lastIndex, currentIndex)
      const end = Math.max(lastIndex, currentIndex)
      for (let i = start; i <= end; i++) {
        newSelectedItems.add(filteredItems[i].id)
      }
    } else if (e.metaKey || e.ctrlKey) {
      if (newSelectedItems.has(item.id)) {
        newSelectedItems.delete(item.id)
      } else {
        newSelectedItems.add(item.id)
      }
    } else {
      if (newSelectedItems.has(item.id) && newSelectedItems.size === 1) {
        newSelectedItems.clear()
      } else {
        newSelectedItems.clear()
        newSelectedItems.add(item.id)
      }
    }

    setSelectedItems(newSelectedItems)
    lastSelectedItem.current = item.id
  }

  const handleUploadAction = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    setUploadingFiles(fileArray.map((file) => ({ name: file.name, progress: 0 })))

    const uploadedModels: Model[] = []

    await Promise.all(
      fileArray.map(async (file) => {
        if (!file.name.endsWith(".glb")) {
          toast.error(`Skipping non-GLB file: ${file.name}`)
          return
        }
        try {
          const newBlob = await upload(file.name.replace(/\s+/g, "_"), file, {
            access: "public",
            handleUploadUrl: "/api/upload",
          })
          const res = await fetch("/api/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: file.name.replace(/\.glb$/, ""),
              model_url: newBlob.url,
              thumbnail_url: `/placeholder.svg?width=400&height=400&query=${encodeURIComponent(
                file.name.replace(/\.glb$/, ""),
              )}`,
              folder_id: currentFolderId,
            }),
          })
          if (!res.ok) throw new Error("Failed to create model record")
          const newModel = await res.json()
          uploadedModels.push(newModel)
          toast.success(`Uploaded ${file.name}`)
        } catch (error) {
          toast.error(`Failed to upload ${file.name}`)
        }
      }),
    )
    mutate(galleryUrl)
    setUploadingFiles([])

    if (uploadedModels.length === 1) {
      updateQuery({ modelId: uploadedModels[0].id })
    }
  }

  const handleCreateFolder = async (name: string) => {
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parent_id: currentFolderId }),
    })
    toast.success(`Folder "${name}" created`)
    mutate(galleryUrl)
    setIsNewFolderDialogOpen(false)
  }

  const handleRename = async (newName: string) => {
    if (!renameItem) return
    const url = renameItem.type === "folder" ? `/api/folders/${renameItem.id}` : `/api/models/${renameItem.id}`
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    })
    toast.success("Renamed successfully")
    mutate(galleryUrl)
    if (renameItem.type === "model") mutate(`/api/models/${renameItem.id}`)
    setRenameItem(null)
  }

  const handleBulkDelete = async () => {
    toast.info(`Deleting ${selectedItems.size} items...`)
    const promises = Array.from(selectedItems).map((id) => {
      const item = galleryItems.find((i) => i.id === id)
      if (!item) return Promise.resolve()
      const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`
      return fetch(url, { method: "DELETE" })
    })
    await Promise.all(promises)
    toast.success(`${selectedItems.size} items deleted.`)
    if (selectedItems.has(modelId ?? "")) handleCloseViewer()
    mutate(galleryUrl)
    setSelectedItems(new Set())
  }

  const handleBulkMove = async (targetFolderId: string | null) => {
    toast.info(`Moving ${selectedItems.size} items...`)
    const promises = Array.from(selectedItems).map((id) => {
      const item = galleryItems.find((i) => i.id === id)
      if (!item) return Promise.resolve()
      const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`
      const body = item.type === "folder" ? { parent_id: targetFolderId } : { folder_id: targetFolderId }
      return fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    })
    await Promise.all(promises)
    toast.success(`${selectedItems.size} items moved.`)
    if (selectedItems.has(modelId ?? "") && targetFolderId !== currentFolderId) handleCloseViewer()
    mutate(galleryUrl)
    setSelectedItems(new Set())
  }

  const handleBulkSetPublic = async (isPublic: boolean) => {
    toast.info(`Updating ${selectedItems.size} items...`)
    const promises = Array.from(selectedItems).map((id) => {
      const item = galleryItems.find((i) => i.id === id)
      if (!item) return Promise.resolve()
      const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`
      return fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: isPublic }),
      })
    })
    await Promise.all(promises)
    toast.success(`${selectedItems.size} items set to ${isPublic ? "public" : "private"}.`)
    mutate(galleryUrl)
    if (selectedItems.has(modelId ?? "")) mutateSelectedModel()
    setSelectedItems(new Set())
  }

  const handleSaveViewSettings = async () => {
    if (!selectedModel) return
    const settingsToSave: ViewSettings = {
      lights: lights.map(({ id, visible, ...rest }) => rest),
      lightsEnabled,
      environmentEnabled,
      bloomEnabled,
      bgType,
      bgColor1,
      bgColor2,
      fieldOfView,
    }
    await handleModelUpdate(selectedModel.id, { view_settings: settingsToSave })
    toast.success("Default view saved!")
  }

  const handleDeleteViewSettings = async () => {
    if (!selectedModel) return
    await handleModelUpdate(selectedModel.id, { view_settings: null })
    resetViewSettings(null)
    toast.success("Saved view has been deleted.")
  }

  const handleDeleteThumbnail = async () => {
    if (!selectedModel) return
    const placeholderUrl = `/placeholder.svg?width=400&height=400&query=${encodeURIComponent(selectedModel.name)}`
    await handleModelUpdate(selectedModel.id, { thumbnail_url: placeholderUrl })
    toast.success("Custom thumbnail has been deleted.")
  }

  const handleBulkDownload = () => {
    const modelsToDownload = Array.from(selectedItems)
      .map((id) => galleryItems.find((i) => i.id === id))
      .filter((item): item is Model & { type: "model" } => !!item && item.type === "model")

    if (modelsToDownload.length === 0) {
      toast.error("No models selected for download.")
      return
    }

    toast.info(`Downloading ${modelsToDownload.length} models...`)
    modelsToDownload.forEach((model) => {
      const link = document.createElement("a")
      link.href = model.model_url
      link.download = `${model.name}.glb`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
  }

  const handleSaveFolderDescription = async (description: string) => {
    if (!editingFolder) return
    await fetch(`/api/folders/${editingFolder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    })
    toast.success("Folder description saved.")
    mutate(galleryUrl)
    setEditingFolder(null)
  }

  const handleViewerKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Shift") setIsShiftDown(true)
      if (!selectedModel || !gallery?.models || gallery.models.length === 0) return
      const currentIndex = gallery.models.findIndex((m) => m.id === selectedModel.id)
      if (currentIndex === -1) return

      if (event.key === "Escape") return handleCloseViewer()
      let nextIndex: number | null = null
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % gallery.models.length
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + gallery.models.length) % gallery.models.length
      if (nextIndex !== null) updateQuery({ modelId: gallery.models[nextIndex].id })
    },
    [selectedModel, gallery?.models, searchParams, router],
  )

  const handleViewerKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.key === "Shift") setIsShiftDown(false)
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleViewerKeyDown)
    window.addEventListener("keyup", handleViewerKeyUp)
    return () => {
      window.removeEventListener("keydown", handleViewerKeyDown)
      window.removeEventListener("keyup", handleViewerKeyUp)
    }
  }, [handleViewerKeyDown, handleViewerKeyUp])

  const handlePanelDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, [role=slider], a, [role=tab]")) return
    e.preventDefault()
    setIsDraggingPanel(true)
    dragStartPos.current = { x: e.clientX - panelPosition.x, y: e.clientY - panelPosition.y }
    document.body.style.cursor = "grabbing"
    document.body.classList.add("select-none")
  }
  useEffect(() => {
    const handlePanelDragMove = (e: PointerEvent) => {
      if (!isDraggingPanel || !panelRef.current) return
      let newX = e.clientX - dragStartPos.current.x
      let newY = e.clientY - dragStartPos.current.y
      const { offsetWidth, offsetHeight } = panelRef.current
      const { innerWidth, innerHeight } = window
      newX = Math.max(-(innerWidth - offsetWidth - 16), Math.min(16, newX))
      newY = Math.max(-16, Math.min(innerHeight - offsetHeight - 16, newY))
      setPanelPosition({ x: newX, y: newY })
    }
    const handlePanelDragEnd = () => {
      setIsDraggingPanel(false)
      document.body.style.cursor = "auto"
      document.body.classList.remove("select-none")
    }
    if (isDraggingPanel) {
      window.addEventListener("pointermove", handlePanelDragMove)
      window.addEventListener("pointerup", handlePanelDragEnd)
    }
    return () => {
      window.removeEventListener("pointermove", handlePanelDragMove)
      window.removeEventListener("pointerup", handlePanelDragEnd)
    }
  }, [isDraggingPanel])

  const backgroundStyle: React.CSSProperties = {}
  if (environmentEnabled) {
    if (bgType === "gradient") {
      backgroundStyle.background = `linear-gradient(to bottom, ${bgColor1}, ${bgColor2})`
    } else if (bgType === "image" && bgImage) {
      backgroundStyle.backgroundImage = `url(${bgImage})`
      backgroundStyle.backgroundSize = "cover"
      backgroundStyle.backgroundPosition = "center"
    } else {
      backgroundStyle.backgroundColor = bgColor1
    }
  } else {
    backgroundStyle.backgroundColor = "#000000"
  }

  const cycleLightPreset = useCallback(() => {
    const nextPresetIndex = (currentPresetIndex + 1) % lightingPresets.length
    const preset = lightingPresets[nextPresetIndex]

    const scaledLights = preset.lights.map((p, i) => ({
      ...p,
      id: Date.now() + i,
      visible: true,
      position: [p.position[0] * 0.4, p.position[1] * 0.6, p.position[2] * 0.4] as [number, number, number],
      intensity: Math.max(p.intensity * 1.5, 1),
    }))

    setLights(scaledLights)
    setCurrentPresetIndex(nextPresetIndex)
    toast.success(`Lighting preset: ${preset.name}`)
  }, [currentPresetIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r" && modelId) {
        event.preventDefault()
        cycleLightPreset()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [modelId, cycleLightPreset])

  const handleLightChange = (id: number, newValues: Partial<Omit<Light, "id">>) => {
    setLights(lights.map((light) => (light.id === id ? { ...light, ...newValues } : light)))
  }

  const handleLightTargetMove = (point: THREE.Vector3) => {
    if (!selectedLightId) return
    handleLightChange(selectedLightId, { targetPosition: [point.x, point.y, point.z] })
  }

  const addLight = () => {
    if (lights.length >= 5) return toast.error("Maximum of 5 lights reached.")
    const newLight: Light = {
      id: Date.now(),
      visible: true,
      position: [-2, 3, 2],
      targetPosition: [0, 0, 0],
      intensity: 3,
      kelvin: 5500,
      decay: 1,
      angle: 45,
      penumbra: 0.5,
    }
    setLights([...lights, newLight])
    setSelectedLightId(newLight.id)
  }

  const removeLight = (id: number) => {
    if (lights.length > 1) {
      setLights(lights.filter((light) => light.id !== id))
      if (selectedLightId === id) setSelectedLightId(lights.find((l) => l.id !== id)?.id || null)
    } else {
      toast.error("Cannot remove the last light.")
    }
  }

  const toggleLightVisibility = (id: number) => {
    setLights(lights.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)))
  }

  const cloneLight = (id: number) => {
    if (lights.length >= 5) return toast.error("Maximum of 5 lights reached.")
    const lightToClone = lights.find((l) => l.id === id)
    if (lightToClone) {
      const newLight = {
        ...lightToClone,
        id: Date.now(),
        position: [lightToClone.position[0] + 1, lightToClone.position[1], lightToClone.position[2]] as [
          number,
          number,
          number,
        ],
      }
      setLights([...lights, newLight])
      setSelectedLightId(newLight.id)
    }
  }

  const focusLightOnModel = (lightId: number) => {
    if (!modelRef.current) {
      toast.error("Model not loaded yet.")
      return
    }
    const box = new THREE.Box3().setFromObject(modelRef.current)
    const center = new THREE.Vector3()
    box.getCenter(center)

    handleLightChange(lightId, { targetPosition: [center.x, center.y, center.z] })
    toast.success("Light focused on model center.")
  }

  if (modelId) {
    if (!selectedModel) {
      return (
        <div className="w-full h-screen flex items-center justify-center bg-black">
          <LoaderIcon className="w-12 h-12 animate-spin text-white" />
        </div>
      )
    }
    return (
      <div className="w-full h-screen relative" style={backgroundStyle}>
        <Toaster richColors />
        <Canvas
          shadows
          gl={{ preserveDrawingBuffer: true, alpha: true }}
          camera={{ fov: fieldOfView }}
          onPointerMissed={(e) => e.button === 0 && setSelectedLightId(null)}
        >
          <Suspense fallback={<Loader />}>
            <EffectComposer disableNormalPass>
              {lightsEnabled &&
                lights.map((light) => (
                  <SpotLightInScene
                    key={light.id}
                    light={light}
                    isSelected={light.id === selectedLightId}
                    onSelect={() => setSelectedLightId(light.id)}
                  />
                ))}
              <Bounds fit clip damping={6} margin={1.2}>
                <ModelViewer ref={modelRef} modelUrl={selectedModel.model_url} materialMode={materialMode} />
              </Bounds>
              {bloomEnabled && <Bloom mipmapBlur intensity={0.5} luminanceThreshold={1} />}
            </EffectComposer>
            <CaptureController ref={captureControllerRef} modelRef={modelRef} />
          </Suspense>
          <OrbitControls enabled={isOrbitControlsEnabled} makeDefault />
          <ambientLight intensity={0.1} />
          <Plane args={[100, 100]} rotation-x={-Math.PI / 2} receiveShadow>
            <shadowMaterial transparent opacity={0.2} />
          </Plane>
          {isShiftDown && selectedLightId && (
            <mesh onPointerMove={(e) => handleLightTargetMove(e.point)} visible={false}>
              <planeGeometry args={[100, 100]} />
              <meshBasicMaterial />
            </mesh>
          )}
        </Canvas>
        <div className="absolute top-4 left-4">
          <Button variant="ghost" size="icon" onClick={handleCloseViewer} className="text-white hover:bg-white/20">
            <ChevronLeft className="h-6 w-6" />
          </Button>
        </div>
        <div
          ref={panelRef}
          className="absolute top-4 right-4 w-[350px] bg-black/50 backdrop-blur-sm border border-white/20 rounded-lg text-white z-10 flex flex-col max-h-[calc(100vh-2rem)]"
          style={{ transform: `translate(${panelPosition.x}px, ${panelPosition.y}px)` }}
          onPointerDown={() => setIsOrbitControlsEnabled(false)}
          onPointerUp={() => setIsOrbitControlsEnabled(true)}
        >
          <div
            className="flex items-center justify-between p-4 cursor-grab"
            onPointerDown={handlePanelDragStart}
            onPointerUp={() => setIsOrbitControlsEnabled(true)}
          >
            <h2 className="text-lg font-semibold">Settings</h2>
            <button onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)} className="z-10 p-1 -m-1">
              <ChevronDown className={`h-5 w-5 transition-transform ${isSettingsPanelOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          {isSettingsPanelOpen && (
            <SettingsPanel
              model={selectedModel}
              onUpdate={handleModelUpdate}
              onDelete={() => handleBulkDelete()}
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
              fieldOfView={fieldOfView}
              onFieldOfViewChange={setFieldOfView}
              onSaveView={handleSaveViewSettings}
              onDeleteView={handleDeleteViewSettings}
              onResetView={() => resetViewSettings(selectedModel.view_settings)}
            />
          )}
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm p-2 rounded-full flex items-center gap-1">
          <Button
            variant={materialMode === "white" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setMaterialMode("white")}
            className="text-white rounded-full"
          >
            <div className="w-6 h-6 rounded-full bg-white" />
          </Button>
          <Button
            variant={materialMode === "pbr" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setMaterialMode("pbr")}
            className="text-white rounded-full"
          >
            <Palette />
          </Button>
          <Button
            variant={materialMode === "normal" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setMaterialMode("normal")}
            className="text-white rounded-full"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500" />
          </Button>
          <Separator orientation="vertical" className="h-6 bg-white/20 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const link = document.createElement("a")
              link.href = selectedModel.model_url
              link.download = `${selectedModel.name}.glb`
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
            }}
            className="text-white rounded-full"
          >
            <Download />
          </Button>
        </div>
        {isShiftDown && (
          <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm p-2 rounded-lg text-white text-sm">
            Aiming light: Drag to move target
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground">
      <Toaster richColors />
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleUploadAction(e.target.files)}
        className="hidden"
        multiple
        accept=".glb"
      />
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
                <SidebarMenuButton onClick={() => fileInputRef.current?.click()} tooltip="Upload Models">
                  <Upload />
                  <span>Upload</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleBreadcrumbClick(null)}
                  isActive={currentFolderId === null}
                  tooltip="Assets"
                >
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
                  <button
                    onClick={() => handleBreadcrumbClick(crumb.id)}
                    className="hover:underline disabled:text-foreground disabled:no-underline"
                    disabled={index === breadcrumbs.length - 1}
                  >
                    {crumb.name}
                  </button>
                  {index === breadcrumbs.length - 1 && gallery?.currentFolder && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 ml-1"
                      onClick={() => setEditingFolder(gallery.currentFolder)}
                    >
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
                <Input
                  type="search"
                  placeholder="Search..."
                  className="pl-8 w-48 md:w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
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
            onDragEnter={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              handleUploadAction(e.dataTransfer.files)
            }}
          >
            {isDragging && (
              <div className="absolute inset-4 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-10 pointer-events-none">
                <div className="text-center">
                  <Upload size={48} className="mx-auto text-primary" />
                  <p className="mt-2 font-semibold text-primary">Drop files to upload</p>
                </div>
              </div>
            )}
            {isLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 18 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            )}
            {error && <div className="text-center text-destructive">Failed to load gallery.</div>}
            {!isLoading &&
              !searchQuery &&
              gallery?.folders.length === 0 &&
              gallery?.models.length === 0 &&
              uploadingFiles.length === 0 && (
                <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-full pt-20">
                  <FolderIcon size={64} className="mb-4" />
                  <h2 className="text-2xl font-semibold">This folder is empty</h2>
                  <p className="mt-2">Drag and drop files here or use the upload button.</p>
                </div>
              )}
            {!isLoading && searchQuery && filteredItems.length === 0 && (
              <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-full pt-20">
                <Search size={64} className="mb-4" />
                <h2 className="text-2xl font-semibold">No results found</h2>
                <p className="mt-2">Your search for "{searchQuery}" did not match any items.</p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {uploadingFiles.map((file) => (
                <div
                  key={file.name}
                  className="aspect-square rounded-lg bg-muted flex flex-col items-center justify-center p-2"
                >
                  <div className="w-full bg-secondary rounded-full h-2.5 mb-2">
                    <div className="bg-primary h-2.5 rounded-full" style={{ width: `${file.progress}%` }}></div>
                  </div>
                  <p className="text-xs text-center truncate w-full">{file.name}</p>
                </div>
              ))}
              {filteredItems.map((item) => (
                <ItemContextMenu
                  key={item.id}
                  item={item}
                  onRename={() => setRenameItem(item)}
                  onDelete={() => {
                    setSelectedItems(new Set([item.id]))
                    handleBulkDelete()
                  }}
                  onMove={(targetFolderId) => {
                    setSelectedItems(new Set([item.id]))
                    handleBulkMove(targetFolderId)
                  }}
                  onSetPublic={(isPublic) => {
                    setSelectedItems(new Set([item.id]))
                    handleBulkSetPublic(isPublic)
                  }}
                  allFolders={allFolders}
                >
                  <div
                    onClick={(e) => handleItemClick(e, item)}
                    onDoubleClick={() =>
                      item.type === "folder" ? handleNavigateToFolder(item.id) : handleModelClick(item)
                    }
                    className={cn(
                      "group relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all duration-200",
                      selectedItems.has(item.id) ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
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
                            ;(e.target as HTMLImageElement).src = `/placeholder.svg?width=400&height=400&query=error`
                          }}
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-2">
                          <p className="text-sm font-semibold truncate text-white">{item.name}</p>
                        </div>
                      </>
                    )}
                    <div
                      className={cn(
                        "absolute top-2 left-2 transition-opacity",
                        selectedItems.has(item.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <Checkbox
                        checked={selectedItems.has(item.id)}
                        onCheckedChange={(checked) => {
                          const newSelectedItems = new Set(selectedItems)
                          if (checked) newSelectedItems.add(item.id)
                          else newSelectedItems.delete(item.id)
                          setSelectedItems(newSelectedItems)
                        }}
                        className="bg-background/50 border-white/50 data-[state=checked]:bg-primary"
                      />
                    </div>
                    <div className="absolute bottom-2 left-2">
                      {item.is_public ? (
                        <Globe className="h-4 w-4 text-white/70" />
                      ) : (
                        <Lock className="h-4 w-4 text-white/70" />
                      )}
                    </div>
                  </div>
                </ItemContextMenu>
              ))}
              {!isLoading && !searchQuery && (
                <div
                  onClick={() => fileInputRef.current?.click()}
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
              onDownload={handleBulkDownload}
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
        onCreate={handleCreateFolder}
      />
      {renameItem && (
        <RenameDialog item={renameItem} onOpenChange={() => setRenameItem(null)} onRename={handleRename} />
      )}
      {editingFolder && (
        <FolderDescriptionDialog
          folder={editingFolder}
          open={!!editingFolder}
          onOpenChange={() => setEditingFolder(null)}
          onSave={handleSaveFolderDescription}
        />
      )}
    </div>
  )
}

export default GalleryPage
