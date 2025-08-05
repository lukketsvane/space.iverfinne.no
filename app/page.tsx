"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Switch } from "@/components/ui/switch"
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
  Trash2,
  Pencil,
  MoreVertical,
  FolderPlus,
  ChevronRight,
  Download,
  Grid,
  FolderSymlink,
  Search,
  ChevronDown,
  ListFilter,
  LoaderIcon,
  Info,
  Plus,
  Eye,
  EyeOff,
  CopyIcon as Clone,
  Globe,
  Lock,
  Save,
  RotateCcw,
  X,
  Crosshair,
  Camera,
} from "lucide-react"
import { upload } from "@vercel/blob/client"
import useSWR, { useSWRConfig } from "swr"
import { toast } from "sonner"
import * as THREE from "three"
import { useGesture } from "@use-gesture/react"
import dynamic from "next/dynamic"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
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
import type { Model, Folder, Light, ViewSettings, GalleryContents, GalleryItem } from "@/types"

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

      const grayPBRMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide,
      })

      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true
          child.receiveShadow = true

          const mesh = child as THREE.Mesh

          // Store original material
          originalMaterials.current.set(mesh.uuid, mesh.material)

          // Store a "white" PBR version of the material
          if (Array.isArray(mesh.material)) {
            whiteMaterials.current.set(
              mesh.uuid,
              mesh.material.map(() => grayPBRMaterial),
            )
          } else {
            whiteMaterials.current.set(mesh.uuid, grayPBRMaterial)
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
  const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("pbr")
  const [isDragging, setIsDragging] = useState(false)
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(true)
  const [lightsEnabled, setLightsEnabled] = useState(true)
  const [environmentEnabled, setEnvironmentEnabled] = useState(false)
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
      setEnvironmentEnabled(settings.environmentEnabled ?? false)
      setBloomEnabled(settings.bloomEnabled ?? true)
      setBgType(settings.bgType ?? "color")
      setBgColor1(settings.bgColor1 ?? "#000000")
      setBgColor2(settings.bgColor2 ?? "#1a1a1a")
      setFieldOfView(settings.fieldOfView ?? 50)
    } else {
      setLights(defaultLights)
      setLightsEnabled(true)
      setEnvironmentEnabled(false)
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

  const randomizeLights = useCallback(() => {
    const getRandomProps = () => ({
      position: [(Math.random() - 0.5) * 10, Math.random() * 8 + 2, (Math.random() - 0.5) * 10] as [
        number,
        number,
        number,
      ],
      intensity: Math.random() * 50 + 10,
      kelvin: Math.random() * 10000 + 2000,
      angle: Math.random() * 60 + 15,
      penumbra: Math.random(),
    })

    if (selectedLightId) {
      // Randomize only the selected light
      setLights((prevLights) => prevLights.map((l) => (l.id === selectedLightId ? { ...l, ...getRandomProps() } : l)))
      toast.success("Randomized selected light!")
    } else {
      // Randomize all lights
      setLights((prevLights) => prevLights.map((l) => ({ ...l, ...getRandomProps() })))
      toast.success(`Randomized ${lights.length} lights!`)
    }
    setCurrentPresetIndex(-1) // Invalidate preset tracking
  }, [lights, selectedLightId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r" && modelId) {
        event.preventDefault()
        randomizeLights()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [modelId, randomizeLights])

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

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-screen flex items-center justify-center bg-black">
          <LoaderIcon className="w-12 h-12 animate-spin text-white" />
        </div>
      }
    >
      <GalleryPage />
    </Suspense>
  )
}

// --- UI Components (Menu, Dialogs, SettingsPanel) ---
const MoveToSubMenuContent = ({
  onMove,
  allFolders,
  currentItem,
}: Omit<MenuItemsProps, "onRename" | "onDelete" | "onSetPublic">) => (
  <>
    {currentItem.parent_id !== null && (
      <ContextMenuItem onSelect={() => onMove(null)}>
        <FolderIcon className="mr-2 h-4 w-4" />
        <span>Assets (Root)</span>
      </ContextMenuItem>
    )}
    {allFolders
      ?.filter((f) => f.id !== currentItem.id && f.id !== currentItem.parent_id)
      .map((folder) => (
        <ContextMenuItem key={folder.id} onSelect={() => onMove(folder.id)}>
          <FolderIcon className="mr-2 h-4 w-4" />
          <span>{folder.name}</span>
        </ContextMenuItem>
      ))}
  </>
)

const MoveToDropdownSubMenuContent = ({
  onMove,
  allFolders,
  currentItem,
}: Omit<MenuItemsProps, "onRename" | "onDelete" | "onSetPublic">) => (
  <>
    {currentItem.parent_id !== null && (
      <DropdownMenuItem onSelect={() => onMove(null)}>
        <FolderIcon className="mr-2 h-4 w-4" />
        <span>Assets (Root)</span>
      </DropdownMenuItem>
    )}
    {allFolders
      ?.filter((f) => f.id !== currentItem.id && f.id !== currentItem.parent_id)
      .map((folder) => (
        <DropdownMenuItem key={folder.id} onSelect={() => onMove(folder.id)}>
          <FolderIcon className="mr-2 h-4 w-4" />
          <span>{folder.name}</span>
        </DropdownMenuItem>
      ))}
  </>
)

const DropdownMenuItems = ({ onRename, onDelete, onMove, onSetPublic, allFolders, currentItem }: MenuItemsProps) => (
  <>
    <DropdownMenuItem onSelect={onRename}>
      <Pencil className="mr-2 h-4 w-4" />
      <span>Rename</span>
    </DropdownMenuItem>
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderSymlink className="mr-2 h-4 w-4" />
        <span>Move to...</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent>
          <MoveToDropdownSubMenuContent onMove={onMove} allFolders={allFolders} currentItem={currentItem} />
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
    <DropdownMenuItem onSelect={() => onSetPublic(!currentItem.is_public)}>
      {currentItem.is_public ? <Lock className="mr-2 h-4 w-4" /> : <Globe className="mr-2 h-4 w-4" />}
      <span>Make {currentItem.is_public ? "Private" : "Public"}</span>
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
      <Trash2 className="mr-2 h-4 w-4" />
      <span>Delete</span>
    </DropdownMenuItem>
  </>
)

const ContextMenuItems = ({ onRename, onDelete, onMove, onSetPublic, allFolders, currentItem }: MenuItemsProps) => (
  <>
    <ContextMenuItem onSelect={onRename}>
      <Pencil className="mr-2 h-4 w-4" />
      <span>Rename</span>
    </ContextMenuItem>
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <FolderSymlink className="mr-2 h-4 w-4" />
        <span>Move to...</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        <MoveToSubMenuContent onMove={onMove} allFolders={allFolders} currentItem={currentItem} />
      </ContextMenuSubContent>
    </ContextMenuSub>
    <ContextMenuItem onSelect={() => onSetPublic(!currentItem.is_public)}>
      {currentItem.is_public ? <Lock className="mr-2 h-4 w-4" /> : <Globe className="mr-2 h-4 w-4" />}
      <span>Make {currentItem.is_public ? "Private" : "Public"}</span>
    </ContextMenuItem>
    <ContextMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
      <Trash2 className="mr-2 h-4 w-4" />
      <span>Delete</span>
    </ContextMenuItem>
  </>
)

interface MenuItemsProps {
  onRename: () => void
  onDelete: () => void
  onMove: (targetFolderId: string | null) => void
  onSetPublic: (isPublic: boolean) => void
  allFolders?: Folder[]
  currentItem: GalleryItem
}

function ItemContextMenu({
  children,
  item,
  onRename,
  onDelete,
  onMove,
  onSetPublic,
  allFolders,
}: {
  children: React.ReactNode
  item: GalleryItem
  onRename: () => void
  onDelete: () => void
  onMove: (targetFolderId: string | null) => void
  onSetPublic: (isPublic: boolean) => void
  allFolders?: Folder[]
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full h-full" onContextMenu={(e) => e.stopPropagation()}>
        <div className="relative group w-full h-full">
          {children}
          <div className="absolute top-2 right-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-black/30 hover:bg-black/50 text-white hover:text-white"
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItems
                  onRename={onRename}
                  onDelete={onDelete}
                  onMove={onMove}
                  onSetPublic={onSetPublic}
                  allFolders={allFolders}
                  currentItem={item}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent onClick={(e) => e.stopPropagation()}>
        <ContextMenuItems
          onRename={onRename}
          onDelete={onDelete}
          onMove={onMove}
          onSetPublic={onSetPublic}
          allFolders={allFolders}
          currentItem={item}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState("")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/50 backdrop-blur-sm border-white/20 text-white">
        <DialogHeader>
          <DialogTitle>New Folder</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter folder name"
          onKeyDown={(e) => e.key === "Enter" && name && onCreate(name)}
          className="bg-white/10 border-white/20"
        />
        <DialogFooter>
          <Button onClick={() => name && onCreate(name)} disabled={!name}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RenameDialog({
  item,
  onOpenChange,
  onRename,
}: {
  item: GalleryItem
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => void
}) {
  const [name, setName] = useState(item.name)
  return (
    <Dialog open={true} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/50 backdrop-blur-sm border-white/20 text-white">
        <DialogHeader>
          <DialogTitle>Rename {item.type}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name && onRename(name)}
          className="bg-white/10 border-white/20"
        />
        <DialogFooter>
          <Button onClick={() => name && onRename(name)} disabled={!name}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FolderDescriptionDialog({
  folder,
  open,
  onOpenChange,
  onSave,
}: {
  folder: Folder
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (description: string) => void
}) {
  const [description, setDescription] = useState(folder.description || "")
  const wordCount = description.trim() ? description.trim().split(/\s+/).length : 0

  const handleSave = () => {
    if (wordCount <= 150) {
      onSave(description)
    } else {
      toast.error("Description cannot exceed 150 words.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/50 backdrop-blur-sm border-white/20 text-white">
        <DialogHeader>
          <DialogTitle>Edit Description for "{folder.name}"</DialogTitle>
          <DialogDescription className="text-gray-400">
            Add a description or comma-separated tags. This will be used for searching models within this folder.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. sci-fi, characters, hard-surface"
          className="bg-white/10 border-white/20 min-h-[120px]"
          rows={5}
        />
        <div className={`text-right text-sm ${wordCount > 150 ? "text-destructive" : "text-muted-foreground"}`}>
          {wordCount} / 150 words
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={wordCount > 150}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditableValue({
  value,
  onSave,
  units = "",
  className,
  inputClassName,
}: {
  value: string | number
  onSave: (newValue: string) => void
  units?: string
  className?: string
  inputClassName?: string
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [currentValue, setCurrentValue] = useState(value.toString())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCurrentValue(value.toString())
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    onSave(currentValue)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave()
          if (e.key === "Escape") setIsEditing(false)
        }}
        className={`h-6 text-xs w-full text-right bg-white/20 border-white/30 ${inputClassName}`}
      />
    )
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer text-xs w-full text-right truncate ${className}`}
      title={typeof value === "number" ? value.toFixed(2) : value}
    >
      {typeof value === "number" ? value.toFixed(units === "K" ? 0 : 1) : value}
      {units}
    </span>
  )
}

function DirectionalPad({
  value,
  onChange,
}: {
  value: { x: number; z: number }
  onChange: (newValue: { x: number; z: number }) => void
}) {
  const padRef = useRef<HTMLDivElement>(null)

  const bind = useGesture(
    {
      onDrag: ({ xy }) => {
        if (!padRef.current) return
        const rect = padRef.current.getBoundingClientRect()
        const size = rect.width
        const halfSize = size / 2
        let x = xy[0] - rect.left - halfSize
        let z = xy[1] - rect.top - halfSize

        const distance = Math.sqrt(x * x + z * z)
        if (distance > halfSize) {
          x = (x / distance) * halfSize
          z = (z / distance) * halfSize
        }

        onChange({ x: (x / halfSize) * 5, z: (z / halfSize) * 5 })
      },
    },
    { drag: { filterTaps: true } },
  )

  const handleX = (value.x / 5) * 50
  const handleZ = (value.z / 5) * 50

  return (
    <div
      ref={padRef}
      {...bind()}
      className="w-24 h-24 bg-white/10 rounded-full relative cursor-pointer border border-white/20 flex items-center justify-center"
    >
      <div className="w-full h-px bg-white/20 absolute" />
      <div className="h-full w-px bg-white/20 absolute" />
      <div
        className="w-4 h-4 bg-blue-500 rounded-full absolute border-2 border-white"
        style={{
          transform: `translate(${handleX}px, ${handleZ}px)`,
          touchAction: "none",
        }}
      />
    </div>
  )
}

function LightSettings({
  light,
  onLightChange,
  onFocus,
}: {
  light: Light
  onLightChange: (id: number, newValues: Partial<Omit<Light, "id">>) => void
  onFocus: (id: number) => void
}) {
  return (
    <div className="space-y-3 text-xs mt-2 bg-white/5 p-3 rounded-md">
      <div className="flex items-center justify-between">
        <label>Position (X, Y, Z)</label>
        <div className="flex gap-1 w-1/2">
          <EditableValue
            value={light.position[0]}
            onSave={(v) => onLightChange(light.id, { position: [Number(v), light.position[1], light.position[2]] })}
          />
          <EditableValue
            value={light.position[1]}
            onSave={(v) => onLightChange(light.id, { position: [light.position[0], Number(v), light.position[2]] })}
          />
          <EditableValue
            value={light.position[2]}
            onSave={(v) => onLightChange(light.id, { position: [light.position[0], light.position[1], Number(v)] })}
          />
        </div>
      </div>
      <div className="flex items-start justify-between">
        <div className="pt-2 space-y-2">
          <label>Target</label>
          <Button size="sm" className="text-xs h-6" onClick={() => onFocus(light.id)}>
            <Crosshair className="h-3 w-3 mr-1" />
            Focus on Model
          </Button>
        </div>
        <DirectionalPad
          value={{ x: light.targetPosition[0], z: light.targetPosition[2] }}
          onChange={({ x, z }) => onLightChange(light.id, { targetPosition: [x, light.targetPosition[1], z] })}
        />
      </div>
      <div className="flex items-center justify-between">
        <label>Target Height (Y)</label>
        <Slider
          value={[light.targetPosition[1]]}
          onValueChange={([v]) =>
            onLightChange(light.id, {
              targetPosition: [light.targetPosition[0], v, light.targetPosition[2]],
            })
          }
          min={-10}
          max={10}
          step={0.1}
          className="w-1/2"
        />
      </div>
      <div className="flex items-center justify-between">
        <label>Intensity</label>
        <Slider
          value={[light.intensity]}
          onValueChange={([v]) => onLightChange(light.id, { intensity: v })}
          min={0}
          max={250}
          step={0.1}
          className="w-1/2"
        />
      </div>
      <div className="flex items-center justify-between">
        <label>Color Temp</label>
        <Slider
          value={[light.kelvin]}
          onValueChange={([v]) => onLightChange(light.id, { kelvin: v })}
          min={1000}
          max={12000}
          step={100}
          className="w-1/2"
        />
      </div>
      <div className="flex items-center justify-between">
        <label>Cone Angle</label>
        <Slider
          value={[light.angle]}
          onValueChange={([v]) => onLightChange(light.id, { angle: v })}
          min={0}
          max={90}
          step={1}
          className="w-1/2"
        />
      </div>
      <div className="flex items-center justify-between">
        <label>Penumbra</label>
        <Slider
          value={[light.penumbra]}
          onValueChange={([v]) => onLightChange(light.id, { penumbra: v })}
          min={0}
          max={1}
          step={0.01}
          className="w-1/2"
        />
      </div>
    </div>
  )
}

function SettingsPanel({
  model,
  onUpdate,
  onDelete,
  onThumbnailUpload,
  onCaptureThumbnail,
  onDeleteThumbnail,
  lights,
  onLightChange,
  addLight,
  removeLight,
  cloneLight,
  toggleLightVisibility,
  selectedLightId,
  onSelectLight,
  onFocusLight,
  lightsEnabled,
  onLightsEnabledChange,
  environmentEnabled,
  onEnvironmentEnabledChange,
  bloomEnabled,
  onBloomEnabledChange,
  bgType,
  onBgTypeChange,
  bgColor1,
  onBgColor1Change,
  bgColor2,
  onBgColor2Change,
  bgImage,
  onBgImageChange,
  fieldOfView,
  onFieldOfViewChange,
  onSaveView,
  onDeleteView,
  onResetView,
}: {
  model: Model
  onUpdate: (id: string, updates: Partial<Omit<Model, "id" | "created_at">>) => void
  onDelete: () => void
  onThumbnailUpload: (file: File) => void
  onCaptureThumbnail: () => void
  onDeleteThumbnail: () => void
  lights: Light[]
  onLightChange: (id: number, newValues: Partial<Omit<Light, "id">>) => void
  addLight: () => void
  removeLight: (id: number) => void
  cloneLight: (id: number) => void
  toggleLightVisibility: (id: number) => void
  selectedLightId: number | null
  onSelectLight: (id: number | null) => void
  onFocusLight: (id: number) => void
  lightsEnabled: boolean
  onLightsEnabledChange: (enabled: boolean) => void
  environmentEnabled: boolean
  onEnvironmentEnabledChange: (enabled: boolean) => void
  bloomEnabled: boolean
  onBloomEnabledChange: (enabled: boolean) => void
  bgType: "color" | "gradient" | "image"
  onBgTypeChange: (type: "color" | "gradient" | "image") => void
  bgColor1: string
  onBgColor1Change: (value: string) => void
  bgColor2: string
  onBgColor2Change: (value: string) => void
  bgImage: string | null
  onBgImageChange: (value: string | null) => void
  fieldOfView: number
  onFieldOfViewChange: (value: number) => void
  onSaveView: () => void
  onDeleteView: () => void
  onResetView: () => void
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  const bgImageInputRef = useRef<HTMLInputElement>(null)

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        onBgImageChange(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="px-4 pb-4 flex flex-col h-full text-white overflow-y-auto">
      <div className="space-y-4 flex-1 overflow-y-auto pr-2 -mr-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Model</h3>
          <div className="flex items-center justify-between text-xs">
            <label>Name</label>
            <div className="w-1/2">
              <EditableValue value={model.name} onSave={(newName) => onUpdate(model.id, { name: newName })} />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <label>Visibility</label>
            <Button
              size="sm"
              className="text-xs h-6 bg-transparent"
              variant="outline"
              onClick={() => onUpdate(model.id, { is_public: !model.is_public })}
            >
              {model.is_public ? <Globe className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
              {model.is_public ? "Public" : "Private"}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs">
            <label>Thumbnail</label>
            <div className="flex items-center gap-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-6 w-6"
                    disabled={model.thumbnail_url.includes("/placeholder.svg")}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Thumbnail?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will revert the thumbnail to the default placeholder.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDeleteThumbnail}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button size="sm" className="text-xs h-6" onClick={onCaptureThumbnail}>
                <Camera className="h-3 w-3 mr-1" />
                Capture
              </Button>
              <Button size="sm" className="text-xs h-6" onClick={() => thumbnailInputRef.current?.click()}>
                Upload
              </Button>
              <input
                type="file"
                ref={thumbnailInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => e.target.files && onThumbnailUpload(e.target.files[0])}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <label>Delete Model</label>
            {!showDeleteConfirm ? (
              <Button
                variant="destructive"
                size="sm"
                className="text-xs h-6"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button size="sm" className="text-xs h-6" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" className="text-xs h-6" onClick={onDelete}>
                  Confirm
                </Button>
              </div>
            )}
          </div>
        </div>
        <Separator className="bg-white/20" />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">View Settings</h3>
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon" className="h-6 w-6" disabled={!model.view_settings}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Saved View?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. The model will revert to the default scene view.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDeleteView}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onResetView}>
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="default" size="sm" className="text-xs h-6" onClick={onSaveView}>
                <Save className="h-3 w-3 mr-1" />
                Save View
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <label>Field of View</label>
            <div className="flex items-center gap-2 w-1/2">
              <Slider
                value={[fieldOfView]}
                onValueChange={([v]) => onFieldOfViewChange(v)}
                min={10}
                max={120}
                step={1}
                className="w-3/4"
              />
              <EditableValue value={fieldOfView} onSave={(v) => onFieldOfViewChange(Number(v))} className="w-1/4" />
            </div>
          </div>
        </div>
        <Separator className="bg-white/20" />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lights</h3>
            <Switch checked={lightsEnabled} onCheckedChange={onLightsEnabledChange} />
          </div>
          {lightsEnabled && (
            <>
              <Accordion
                type="single"
                collapsible
                className="w-full"
                value={selectedLightId?.toString()}
                onValueChange={(val) => onSelectLight(val ? Number(val) : null)}
              >
                {lights.map((light, index) => (
                  <AccordionItem key={light.id} value={light.id.toString()} className="border-b-white/10">
                    <div className="flex items-center w-full hover:bg-white/5 rounded-t-md">
                      <AccordionTrigger className="flex-1 px-3 py-2 text-xs">Light {index + 1}</AccordionTrigger>
                      <div className="flex items-center gap-1 pr-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleLightVisibility(light.id)
                          }}
                        >
                          {light.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            cloneLight(light.id)
                          }}
                        >
                          <Clone className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeLight(light.id)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <AccordionContent>
                      <LightSettings light={light} onLightChange={onLightChange} onFocus={onFocusLight} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <div className="flex justify-end pt-2">
                <Button size="sm" className="text-xs h-6" onClick={addLight} disabled={lights.length >= 5}>
                  <Plus className="w-3 h-3 mr-1" />
                  Add Light
                </Button>
              </div>
            </>
          )}
        </div>
        <Separator className="bg-white/20" />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Environment</h3>
            <Switch checked={environmentEnabled} onCheckedChange={onEnvironmentEnabledChange} />
          </div>
          {environmentEnabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label>Bloom</label>
                <Switch checked={bloomEnabled} onCheckedChange={onBloomEnabledChange} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <label>Background</label>
                <Select value={bgType} onValueChange={onBgTypeChange as any}>
                  <SelectTrigger className="w-1/2 h-6 text-xs bg-white/10 border-white/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="color">Color</SelectItem>
                    <SelectItem value="gradient">Gradient</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {bgType === "color" && (
                <div className="flex items-center justify-between text-xs">
                  <label>Color</label>
                  <input
                    type="color"
                    value={bgColor1}
                    onChange={(e) => onBgColor1Change(e.target.value)}
                    className="w-6 h-6 p-0 bg-transparent border-none"
                  />
                </div>
              )}
              {bgType === "gradient" && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <label>Top Color</label>
                    <input
                      type="color"
                      value={bgColor1}
                      onChange={(e) => onBgColor1Change(e.target.value)}
                      className="w-6 h-6 p-0 bg-transparent border-none"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <label>Bottom Color</label>
                    <input
                      type="color"
                      value={bgColor2}
                      onChange={(e) => onBgColor2Change(e.target.value)}
                      className="w-6 h-6 p-0 bg-transparent border-none"
                    />
                  </div>
                </>
              )}
              {bgType === "image" && (
                <div className="flex items-center justify-between text-xs">
                  <label>Image</label>
                  <Button size="sm" className="text-xs h-6" onClick={() => bgImageInputRef.current?.click()}>
                    Upload
                  </Button>
                  <input
                    type="file"
                    ref={bgImageInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleBgImageUpload}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BulkActionBar({
  selectedCount,
  onClear,
  onDelete,
  onMove,
  onSetPublic,
  onDownload,
  allItems,
  selectedIds,
  allFolders,
  currentFolderId,
}: {
  selectedCount: number
  onClear: () => void
  onDelete: () => void
  onMove: (targetFolderId: string | null) => void
  onSetPublic: (isPublic: boolean) => void
  onDownload: () => void
  allItems: GalleryItem[]
  selectedIds: Set<string>
  allFolders?: Folder[]
  currentFolderId: string | null
}) {
  const selectedItems = allItems.filter((item) => selectedIds.has(item.id))
  const canDownload = selectedItems.every((item) => item.type === "model")

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-background border-t p-2 flex items-center justify-between z-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onClear}>
          <X className="h-5 w-5" />
        </Button>
        <span className="font-semibold">{selectedCount} selected</span>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <FolderSymlink className="mr-2 h-4 w-4" /> Move
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onMove(null)} disabled={currentFolderId === null}>
              <FolderIcon className="mr-2 h-4 w-4" /> Assets (Root)
            </DropdownMenuItem>
            {allFolders
              ?.filter((f) => f.id !== currentFolderId)
              .map((folder) => (
                <DropdownMenuItem key={folder.id} onSelect={() => onMove(folder.id)}>
                  <FolderIcon className="mr-2 h-4 w-4" /> {folder.name}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" onClick={() => onSetPublic(true)}>
          <Globe className="mr-2 h-4 w-4" /> Set Public
        </Button>
        <Button variant="outline" onClick={() => onSetPublic(false)}>
          <Lock className="mr-2 h-4 w-4" /> Set Private
        </Button>
        {canDownload && (
          <Button variant="outline" onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" /> Download
          </Button>
        )}
        <Button variant="destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  )
}
