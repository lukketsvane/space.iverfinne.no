"use client"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"

import type React from "react"

import { useState, useRef, useEffect, Suspense, useCallback, Fragment } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Canvas, useFrame } from "@react-three/fiber"
import { useGLTF, OrbitControls, Html, useProgress, SpotLight, SpotLightHelper } from "@react-three/drei"
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
  Minus,
} from "lucide-react"
import { upload } from "@vercel/blob/client"
import useSWR, { useSWRConfig } from "swr"
import { Toaster, toast } from "sonner"
import * as THREE from "three"
import { useGesture } from "@use-gesture/react"

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
import { kelvinToRgb } from "@/lib/utils"

// --- Type Definitions ---
interface Model {
  id: string
  name: string
  model_url: string
  thumbnail_url: string
  created_at: string
  folder_id: string | null
}

interface Folder {
  id: string
  name: string
  parent_id: string | null
  created_at: string
  description?: string
}

interface GalleryContents {
  folders: Folder[]
  models: Model[]
  currentFolder: Folder | null
}

interface Light {
  id: number
  position: [number, number, number]
  targetPosition: [number, number, number]
  intensity: number
  kelvin: number
  decay: number
  angle: number // in degrees
  penumbra: number // 0-1
}

// --- Data Fetching ---
const fetcher = (url: string) => fetch(url).then((res) => res.json())

// --- 3D Components ---
function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="text-white text-lg">{progress.toFixed(2)} % loaded</div>
    </Html>
  )
}

function ModelViewer({ modelUrl, materialMode }: { modelUrl: string; materialMode: "pbr" | "normal" | "white" }) {
  const gltf = useGLTF(modelUrl)
  const scene = gltf.scene.clone(true)

  const originalMaterials = useRef(new Map<string, THREE.Material | THREE.Material[]>())
  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        originalMaterials.current.set(child.uuid, (child as THREE.Mesh).material)
      }
    })
  }, [scene])

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        const originalMaterial = originalMaterials.current.get(mesh.uuid)
        if (materialMode === "pbr") {
          if (originalMaterial) mesh.material = originalMaterial
        } else if (materialMode === "normal") {
          mesh.material = new THREE.MeshNormalMaterial()
        } else if (materialMode === "white") {
          mesh.material = new THREE.MeshStandardMaterial({ color: "white" })
        }
      }
    })
  }, [scene, materialMode])

  return <primitive object={scene} />
}

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
  const helperRef = useRef<THREE.SpotLightHelper>()

  useFrame(() => {
    target.current.position.set(...light.targetPosition)
    if (helperRef.current) {
      helperRef.current.update()
    }
  })

  const lightColor = new THREE.Color(
    kelvinToRgb(light.kelvin).r,
    kelvinToRgb(light.kelvin).g,
    kelvinToRgb(light.kelvin).b,
  )

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
      />
      <primitive object={target.current} />
      {isSelected && <SpotLightHelper light={spotLightRef.current} ref={helperRef} color={lightColor} />}
      <mesh position={light.position} onClick={onSelect} onPointerOver={(e) => e.stopPropagation()}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color={isSelected ? "yellow" : lightColor} wireframe />
      </mesh>
    </>
  )
}

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

  const [sortBy, sortOrder] = sortOption.split("-")
  const galleryUrl = `/api/gallery?folderId=${currentFolderId || ""}&sortBy=${sortBy}&sortOrder=${sortOrder}`
  const { data: gallery, error, isLoading } = useSWR<GalleryContents>(galleryUrl, fetcher)
  const { data: allFolders } = useSWR<Folder[]>("/api/folders/all", fetcher)
  const { data: selectedModel } = useSWR<Model>(modelId ? `/api/models/${modelId}` : null, fetcher)
  const { data: breadcrumbData, error: breadcrumbError } = useSWR<{ id: string; name: string }[]>(
    currentFolderId ? `/api/folders/${currentFolderId}/breadcrumbs` : null,
    fetcher,
  )

  useEffect(() => {
    if (breadcrumbError) {
      console.error("Failed to load breadcrumbs:", breadcrumbError)
      toast.error(
        "Could not load folder path. Your database schema might be out of date. Try running `npm run db:push`.",
        {
          duration: 10000,
        },
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
  const [renameItem, setRenameItem] = useState<{ id: string; name: string; type: "folder" | "model" } | null>(null)
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)

  // Viewer settings state
  const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("pbr")
  const [isDragging, setIsDragging] = useState(false)
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(true)
  const [bgType, setBgType] = useState<"color" | "gradient" | "image">("color")
  const [bgColor1, setBgColor1] = useState("#000000")
  const [bgColor2, setBgColor2] = useState("#1a1a1a")
  const [bgImage, setBgImage] = useState<string | null>(null)
  const [lights, setLights] = useState<Light[]>([
    {
      id: Date.now() + 1,
      position: [5, 5, 5],
      targetPosition: [0, 0, 0],
      intensity: 10.0,
      kelvin: 6500,
      decay: 2,
      angle: 30,
      penumbra: 0.2,
    },
    {
      id: Date.now() + 2,
      position: [-5, 5, 5],
      targetPosition: [0, 0, 0],
      intensity: 10.0,
      kelvin: 9600,
      decay: 2,
      angle: 30,
      penumbra: 0.2,
    },
    {
      id: Date.now() + 3,
      position: [0, 5, -5],
      targetPosition: [0, 0, 0],
      intensity: 9.1,
      kelvin: 2600,
      decay: 2,
      angle: 30,
      penumbra: 0.2,
    },
  ])
  const [selectedLightId, setSelectedLightId] = useState<number | null>(lights[0].id)

  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 })
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isOrbitControlsEnabled, setIsOrbitControlsEnabled] = useState(true)
  const [isShiftDown, setIsShiftDown] = useState(false)

  const filteredFolders =
    gallery?.folders?.filter((folder) => folder.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? []

  const folderDescription = gallery?.currentFolder?.description?.toLowerCase() || ""

  const filteredModels = gallery?.models
    ? !searchQuery
      ? gallery.models
      : gallery.models.filter((model) => {
          const modelNameMatch = model.name.toLowerCase().includes(searchQuery.toLowerCase())
          const folderDescriptionMatch = folderDescription.includes(searchQuery.toLowerCase())
          return modelNameMatch || folderDescriptionMatch
        })
    : []

  // --- Navigation and Actions ---
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

  const handleNavigateToFolder = (folderId: string) => updateQuery({ folderId, modelId: null })
  const handleBreadcrumbClick = (folderId: string | null) => updateQuery({ folderId, modelId: null })
  const handleModelClick = (model: Model) => updateQuery({ modelId: model.id })
  const handleCloseViewer = () => updateQuery({ modelId: null })

  const handleUploadAction = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadingFiles(Array.from(files).map((file) => ({ name: file.name, progress: 0 })))

    await Promise.all(
      Array.from(files).map(async (file) => {
        if (!file.name.endsWith(".glb")) return toast.error(`Skipping non-GLB file: ${file.name}`)
        try {
          const newBlob = await upload(file.name.replace(/\s+/g, "_"), file, {
            access: "public",
            handleUploadUrl: "/api/upload",
          })
          await fetch("/api/models", {
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
          toast.success(`Uploaded ${file.name}`)
        } catch (error) {
          toast.error(`Failed to upload ${file.name}`)
        }
      }),
    )
    mutate(galleryUrl)
    setUploadingFiles([])
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

  const handleDeleteItem = async (item: { id: string; type: "folder" | "model" }) => {
    const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`
    const res = await fetch(url, { method: "DELETE" })
    if (!res.ok) return toast.error(`Failed to delete: ${(await res.json()).error}`)
    toast.success(`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} deleted`)
    if (item.type === "model" && item.id === modelId) handleCloseViewer()
    mutate(galleryUrl)
  }

  const handleMoveItem = async (item: { id: string; type: "folder" | "model" }, targetFolderId: string | null) => {
    const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`
    const body = item.type === "folder" ? { parent_id: targetFolderId } : { folder_id: targetFolderId }
    await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    toast.success("Item moved successfully")
    if (item.type === "model" && item.id === modelId && targetFolderId !== currentFolderId) handleCloseViewer()
    mutate(galleryUrl)
  }

  const handleModelUpdate = async (id: string, updates: Partial<Omit<Model, "id" | "created_at">>) => {
    await fetch(`/api/models/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    mutate(`/api/models/${id}`)
    mutate(galleryUrl)
    toast.success("Model updated successfully!")
  }

  const handleThumbnailUpload = async (file: File) => {
    if (!selectedModel) return
    toast.info(`Uploading thumbnail...`)
    const pathname = `thumbnails/${selectedModel.id}.${file.name.split(".").pop()}`
    const newBlob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
      clientPayload: JSON.stringify({ isThumbnail: true }),
    })
    await handleModelUpdate(selectedModel.id, { thumbnail_url: newBlob.url })
  }

  const handleDownloadModel = () => {
    if (!selectedModel) return
    const link = document.createElement("a")
    link.href = selectedModel.model_url
    link.download = `${selectedModel.name}.glb`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleSaveFolderDescription = async (description: string) => {
    if (!editingFolder) return

    await fetch(`/api/folders/${editingFolder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    })

    toast.success("Folder description saved.")
    mutate(galleryUrl) // Re-fetch gallery data
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
    if ((e.target as HTMLElement).closest("button, input, [role=slider], a")) return
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

  const backgroundStyle = {
    background:
      bgType === "gradient"
        ? `linear-gradient(to bottom, ${bgColor1}, ${bgColor2})`
        : bgType === "image"
          ? `url(${bgImage})`
          : bgColor1,
    backgroundImage: bgType === "image" ? `url(${bgImage})` : "",
    backgroundSize: bgType === "image" ? "cover" : "",
    backgroundPosition: bgType === "image" ? "center" : "",
  }

  const randomizeLights = useCallback(() => {
    setLights((prevLights) =>
      prevLights.map((light) => ({
        ...light,
        position: [(Math.random() - 0.5) * 20, Math.random() * 10, (Math.random() - 0.5) * 20],
        targetPosition: [(Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10],
        intensity: Math.random() * 20,
        kelvin: Math.floor(Math.random() * 11000) + 1000,
        decay: Math.random() * 2,
        angle: Math.random() * 60 + 10,
        penumbra: Math.random(),
      })),
    )
    toast.success("Lighting randomized!")
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r" && modelId) {
        event.preventDefault()
        randomizeLights()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [modelId, randomizeLights])

  const handleLightChange = (id: number, newValues: Partial<Omit<Light, "id">>) => {
    setLights(lights.map((light) => (light.id === id ? { ...light, ...newValues } : light)))
  }

  const handleLightTargetMove = (point: THREE.Vector3) => {
    if (!selectedLightId) return
    handleLightChange(selectedLightId, { targetPosition: [point.x, point.y, point.z] })
  }

  // --- Render Logic ---
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
          camera={{ fov: 50, position: [0, 2, 8] }}
          onPointerMissed={(e) => e.button === 0 && setSelectedLightId(null)}
        >
          <Suspense fallback={<Loader />}>
            {lights.map((light) => (
              <SpotLightInScene
                key={light.id}
                light={light}
                isSelected={light.id === selectedLightId}
                onSelect={() => setSelectedLightId(light.id)}
              />
            ))}
            <ModelViewer modelUrl={selectedModel.model_url} materialMode={materialMode} />
          </Suspense>
          <OrbitControls enabled={isOrbitControlsEnabled} />
          <ambientLight intensity={0.1} />
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
              onDelete={() => handleDeleteItem({ id: selectedModel.id, type: "model" })}
              onThumbnailUpload={handleThumbnailUpload}
              lights={lights}
              onLightsChange={setLights}
              selectedLightId={selectedLightId}
              onSelectLight={setSelectedLightId}
              bgType={bgType}
              onBgTypeChange={setBgType}
              bgColor1={bgColor1}
              onBgColor1Change={setBgColor1}
              bgColor2={bgColor2}
              onBgColor2Change={setBgColor2}
              bgImage={bgImage}
              onBgImageChange={setBgImage}
            />
          )}
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm p-2 rounded-full flex items-center gap-1">
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
          <Button
            variant={materialMode === "white" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setMaterialMode("white")}
            className="text-white rounded-full"
          >
            <div className="w-6 h-6 rounded-full bg-white" />
          </Button>
          <Separator orientation="vertical" className="h-6 bg-white/20 mx-1" />
          <Button variant="ghost" size="icon" onClick={handleDownloadModel} className="text-white rounded-full">
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
            {!isLoading && searchQuery && filteredFolders.length === 0 && filteredModels.length === 0 && (
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
              {filteredFolders.map((folder) => (
                <ItemContextMenu
                  key={folder.id}
                  onRename={() => setRenameItem({ ...folder, type: "folder" })}
                  onDelete={() => handleDeleteItem({ id: folder.id, type: "folder" })}
                  onMove={(targetFolderId) => handleMoveItem({ id: folder.id, type: "folder" }, targetFolderId)}
                  allFolders={allFolders}
                  currentItem={{ id: folder.id, type: "folder", parent_id: folder.parent_id }}
                >
                  <div
                    onDoubleClick={() => handleNavigateToFolder(folder.id)}
                    className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer flex flex-col items-center justify-center bg-muted hover:bg-secondary transition-colors"
                  >
                    <FolderIcon className="w-1/3 h-1/3 text-foreground/50" />
                    <p className="text-sm font-semibold truncate mt-2 text-center w-full px-2">{folder.name}</p>
                  </div>
                </ItemContextMenu>
              ))}
              {filteredModels.map((model) => (
                <ItemContextMenu
                  key={model.id}
                  onRename={() => setRenameItem({ ...model, type: "model" })}
                  onDelete={() => handleDeleteItem({ id: model.id, type: "model" })}
                  onMove={(targetFolderId) => handleMoveItem({ id: model.id, type: "model" }, targetFolderId)}
                  allFolders={allFolders}
                  currentItem={{ id: model.id, type: "model", parent_id: model.folder_id }}
                >
                  <div
                    onClick={() => handleModelClick(model)}
                    className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer"
                  >
                    <img
                      src={model.thumbnail_url || "/placeholder.svg"}
                      alt={model.name}
                      className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110 bg-muted"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).src = `/placeholder.svg?width=400&height=400&query=error`
                      }}
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-2">
                      <p className="text-sm font-semibold truncate text-white">{model.name}</p>
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
const MoveToSubMenuContent = ({ onMove, allFolders, currentItem }: Omit<MenuItemsProps, "onRename" | "onDelete">) => (
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
}: Omit<MenuItemsProps, "onRename" | "onDelete">) => (
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

const DropdownMenuItems = ({ onRename, onDelete, onMove, allFolders, currentItem }: MenuItemsProps) => (
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
    <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
      <Trash2 className="mr-2 h-4 w-4" />
      <span>Delete</span>
    </DropdownMenuItem>
  </>
)

const ContextMenuItems = ({ onRename, onDelete, onMove, allFolders, currentItem }: MenuItemsProps) => (
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
  allFolders?: Folder[]
  currentItem: { id: string; type: "folder" | "model"; parent_id: string | null }
}

function ItemContextMenu({
  children,
  onRename,
  onDelete,
  onMove,
  allFolders,
  currentItem,
}: {
  children: React.ReactNode
  onRename: () => void
  onDelete: () => void
  onMove: (targetFolderId: string | null) => void
  allFolders?: Folder[]
  currentItem: { id: string; type: "folder" | "model"; parent_id: string | null }
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full h-full">
        <div className="relative group w-full h-full">
          {children}
          <div className="absolute top-2 right-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-black/30 hover:bg-black/50 text-white hover:text-white"
                  onContextMenu={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItems
                  onRename={onRename}
                  onDelete={onDelete}
                  onMove={onMove}
                  allFolders={allFolders}
                  currentItem={currentItem}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItems
          onRename={onRename}
          onDelete={onDelete}
          onMove={onMove}
          allFolders={allFolders}
          currentItem={currentItem}
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
  item: { id: string; name: string; type: string }
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
  const handleRef = useRef<HTMLDivElement>(null)

  const bind = useGesture(
    {
      onDrag: ({ xy, down }) => {
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

        onChange({ x: (x / halfSize) * 5, z: (z / halfSize) * 5 }) // Scale to a reasonable range
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
        ref={handleRef}
        className="w-4 h-4 bg-blue-500 rounded-full absolute border-2 border-white"
        style={{
          transform: `translate(${handleX}px, ${handleZ}px)`,
          touchAction: "none",
        }}
      />
    </div>
  )
}

function SettingsPanel({
  model,
  onUpdate,
  onDelete,
  onThumbnailUpload,
  lights,
  onLightsChange,
  selectedLightId,
  onSelectLight,
  bgType,
  onBgTypeChange,
  bgColor1,
  onBgColor1Change,
  bgColor2,
  onBgColor2Change,
  bgImage,
  onBgImageChange,
}: {
  model: Model
  onUpdate: (id: string, updates: Partial<Omit<Model, "id" | "created_at">>) => void
  onDelete: () => void
  onThumbnailUpload: (file: File) => void
  lights: Light[]
  onLightsChange: (lights: Light[]) => void
  selectedLightId: number | null
  onSelectLight: (id: number | null) => void
  bgType: "color" | "gradient" | "image"
  onBgTypeChange: (type: "color" | "gradient" | "image") => void
  bgColor1: string
  onBgColor1Change: (value: string) => void
  bgColor2: string
  onBgColor2Change: (value: string) => void
  bgImage: string | null
  onBgImageChange: (value: string | null) => void
}) {
  const [name, setName] = useState(model.name)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  const bgImageInputRef = useRef<HTMLInputElement>(null)

  const { data: allFolders } = useSWR<Folder[]>("/api/folders/all", fetcher)

  useEffect(() => {
    setName(model.name)
  }, [model.name])

  const handleNameBlur = () => {
    if (name !== model.name) onUpdate(model.id, { name })
  }

  const handleLightChange = (id: number, newValues: Partial<Omit<Light, "id">>) => {
    onLightsChange(lights.map((light) => (light.id === id ? { ...light, ...newValues } : light)))
  }

  const addLight = () => {
    if (lights.length < 3) {
      const newLight: Light = {
        id: Date.now(),
        position: [-5, 5, -5],
        targetPosition: [0, 0, 0],
        intensity: 1,
        kelvin: 5500,
        decay: 1,
        angle: 45,
        penumbra: 0.5,
      }
      onLightsChange([...lights, newLight])
    }
  }

  const removeLight = (id: number) => {
    if (lights.length > 1) {
      onLightsChange(lights.filter((light) => light.id !== id))
      if (selectedLightId === id) {
        onSelectLight(lights.find((l) => l.id !== id)?.id || null)
      }
    }
  }

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

  const selectedLight = lights.find((l) => l.id === selectedLightId)

  return (
    <div className="px-4 pb-4 flex flex-col h-full text-white overflow-y-auto">
      <div className="space-y-4 flex-1 overflow-y-auto pr-2 -mr-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Model</h3>
          <div className="flex items-center justify-between text-xs">
            <label>Name</label>
            <div className="w-1/2">
              <EditableValue value={name} onSave={(newName) => onUpdate(model.id, { name: newName })} />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <label>Thumbnail</label>
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
          <h3 className="text-sm font-semibold">Scene</h3>
          <div className="flex items-center justify-between text-xs">
            <label>Background</label>
            <Select value={bgType} onValueChange={(v) => onBgTypeChange(v as any)}>
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
        <Separator className="bg-white/20" />
        <Tabs
          value={selectedLightId?.toString()}
          onValueChange={(val) => onSelectLight(Number(val))}
          className="w-full"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lights</h3>
            <TabsList className="h-7">
              {lights.map((light, i) => (
                <TabsTrigger key={light.id} value={light.id.toString()} className="h-5 text-xs px-2">
                  {i + 1}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {lights.map((light) => (
            <TabsContent key={light.id} value={light.id.toString()} className="space-y-3 text-xs mt-2">
              <div className="flex items-center justify-between">
                <label>Position (X, Y, Z)</label>
                <div className="flex gap-1 w-1/2">
                  <EditableValue
                    value={light.position[0]}
                    onSave={(v) =>
                      handleLightChange(light.id, { position: [Number(v), light.position[1], light.position[2]] })
                    }
                  />
                  <EditableValue
                    value={light.position[1]}
                    onSave={(v) =>
                      handleLightChange(light.id, { position: [light.position[0], Number(v), light.position[2]] })
                    }
                  />
                  <EditableValue
                    value={light.position[2]}
                    onSave={(v) =>
                      handleLightChange(light.id, { position: [light.position[0], light.position[1], Number(v)] })
                    }
                  />
                </div>
              </div>
              <div className="flex items-start justify-between">
                <label className="pt-2">Target (X, Z)</label>
                <DirectionalPad
                  value={{ x: light.targetPosition[0], z: light.targetPosition[2] }}
                  onChange={({ x, z }) =>
                    handleLightChange(light.id, { targetPosition: [x, light.targetPosition[1], z] })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <label>Target Height (Y)</label>
                <Slider
                  value={[light.targetPosition[1]]}
                  onValueChange={([v]) =>
                    handleLightChange(light.id, {
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
                  onValueChange={([v]) => handleLightChange(light.id, { intensity: v })}
                  min={0}
                  max={50}
                  step={0.1}
                  className="w-1/2"
                />
              </div>
              <div className="flex items-center justify-between">
                <label>Color Temp</label>
                <Slider
                  value={[light.kelvin]}
                  onValueChange={([v]) => handleLightChange(light.id, { kelvin: v })}
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
                  onValueChange={([v]) => handleLightChange(light.id, { angle: v })}
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
                  onValueChange={([v]) => handleLightChange(light.id, { penumbra: v })}
                  min={0}
                  max={1}
                  step={0.01}
                  className="w-1/2"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  className="text-xs h-6"
                  onClick={() => removeLight(light.id)}
                  disabled={lights.length <= 1}
                >
                  <Minus className="w-3 h-3 mr-1" />
                  Remove Light
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <div className="flex justify-end">
          <Button size="sm" className="text-xs h-6" onClick={addLight} disabled={lights.length >= 3}>
            <Plus className="w-3 h-3 mr-1" />
            Add Light
          </Button>
        </div>
      </div>
    </div>
  )
}
