"use client"

import { ContextMenuTrigger } from "@/components/ui/context-menu"

import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import type React from "react"

import { useState, useRef, useEffect, Suspense, useCallback, Fragment } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Canvas, useFrame } from "@react-three/fiber"
import { useGLTF, OrbitControls, Html, useProgress } from "@react-three/drei"
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
  Camera,
} from "lucide-react"
import { upload } from "@vercel/blob/client"
import useSWR, { useSWRConfig } from "swr"
import { Toaster, toast } from "sonner"
import * as THREE from "three"

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
import { Screenshotter } from "@/components/screenshotter"
import { removeBackground, dataUrlToBlob } from "@/lib/image"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  intensity: number
  kelvin: number
  decay: number
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
    const newOriginalMaterials = new Map<string, THREE.Material | THREE.Material[]>()
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        newOriginalMaterials.set(child.uuid, (child as THREE.Mesh).material)
      }
    })
    originalMaterials.current = newOriginalMaterials
  }, [scene])

  useFrame(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (materialMode === "pbr") {
          const originalMaterial = originalMaterials.current.get(mesh.uuid)
          if (originalMaterial) mesh.material = originalMaterial
        } else if (materialMode === "normal") {
          mesh.material = new THREE.MeshNormalMaterial()
        } else if (materialMode === "white") {
          mesh.material = new THREE.MeshStandardMaterial({ color: "white" })
        }
      }
    })
  })

  return <primitive object={scene} />
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
  const [bgColor1, setBgColor1] = useState("#1a1a1a")
  const [bgColor2, setBgColor2] = useState("#101010")
  const [bgImage, setBgImage] = useState<string | null>(null)
  const [lights, setLights] = useState<Light[]>([
    { id: Date.now() + 1, position: [5, 5, 5], intensity: 10.0, kelvin: 6500, decay: 0.0 },
    { id: Date.now() + 2, position: [-5, 5, 5], intensity: 10.0, kelvin: 9600, decay: 1.0 },
    { id: Date.now() + 3, position: [0, -5, -5], intensity: 9.1, kelvin: 2600, decay: 1.0 },
  ])

  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 })
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isOrbitControlsEnabled, setIsOrbitControlsEnabled] = useState(true)
  const isMovingLight = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const tipShown = useRef(false)

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
      // Pass a clientPayload to indicate this is a thumbnail and should overwrite.
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

  useEffect(() => {
    window.addEventListener("keydown", handleViewerKeyDown)
    return () => window.removeEventListener("keydown", handleViewerKeyDown)
  }, [handleViewerKeyDown])

  // Other effects for dragging, tips, etc. remain largely the same...
  const handlePanelDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, .slider-thumb, .editable-value")) return
    e.preventDefault()
    setIsDraggingPanel(true)
    dragStartPos.current = { x: e.clientX - panelPosition.x, y: e.clientY - panelPosition.y }
    document.body.style.cursor = "grabbing"
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
        position: [(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20],
        intensity: Math.random() * 10,
        kelvin: Math.floor(Math.random() * 11000) + 1000,
        decay: Math.random() * 2,
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

  const screenshotterRef = useRef<{ takeScreenshot: (keyColor?: string) => Promise<string> }>(null)
  const [isScreenshotting, setIsScreenshotting] = useState(false)

  const handleTakeScreenshot = async () => {
    if (!screenshotterRef.current || isScreenshotting || !selectedModel) return

    setIsScreenshotting(true)
    toast.info("Generating thumbnail...")

    try {
      const greenScreenDataUrl = await screenshotterRef.current.takeScreenshot("#00ff00")

      const transparentDataUrl = await removeBackground(greenScreenDataUrl, {
        keyColor: { r: 0, g: 255, b: 0 },
        tolerance: 40,
      })

      const blob = await dataUrlToBlob(transparentDataUrl)
      const file = new File([blob], `${selectedModel.name}-thumbnail.png`, { type: "image/png" })

      await handleThumbnailUpload(file)
    } catch (error) {
      console.error("Failed to generate thumbnail:", error)
      toast.error("Failed to generate thumbnail.")
    } finally {
      setIsScreenshotting(false)
    }
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
        <Canvas gl={{ preserveDrawingBuffer: true }} camera={{ fov: 50, position: [0, 1, 5] }}>
          <Suspense fallback={<Loader />}>
            <Screenshotter ref={screenshotterRef} />
            {lights.map((light) => (
              <pointLight
                key={light.id}
                position={light.position}
                intensity={light.intensity}
                color={
                  new THREE.Color(kelvinToRgb(light.kelvin).r, kelvinToRgb(light.kelvin).g, kelvinToRgb(light.kelvin).b)
                }
                decay={light.decay}
              />
            ))}
            <ModelViewer modelUrl={selectedModel.model_url} materialMode={materialMode} />
          </Suspense>
          <OrbitControls enabled={isOrbitControlsEnabled} />
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
        >
          <div className="flex items-center justify-between p-4 cursor-grab" onPointerDown={handlePanelDragStart}>
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
              onTakeScreenshot={handleTakeScreenshot}
              isScreenshotting={isScreenshotting}
              lights={lights}
              onLightsChange={setLights}
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
  value: number
  onSave: (newValue: number) => void
  units?: string
  className?: string
  inputClassName?: string
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [currentValue, setCurrentValue] = useState(value.toString())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    const numericValue = Number.parseFloat(currentValue)
    if (!isNaN(numericValue)) {
      onSave(numericValue)
    } else {
      setCurrentValue(value.toString())
    }
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
        className={`h-6 text-xs w-16 text-right bg-white/20 border-white/30 ${inputClassName}`}
      />
    )
  }

  return (
    <span onClick={() => setIsEditing(true)} className={`cursor-pointer text-xs w-16 text-right ${className}`}>
      {value.toFixed(units === "K" ? 0 : 1)}
      {units}
    </span>
  )
}

function SettingsPanel({
  model,
  onUpdate,
  onDelete,
  onThumbnailUpload,
  onTakeScreenshot,
  isScreenshotting,
  lights,
  onLightsChange,
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
  onTakeScreenshot: () => Promise<void>
  isScreenshotting: boolean
  lights: Light[]
  onLightsChange: (lights: Light[]) => void
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

  const handleFolderChange = (newFolderId: string) => {
    const folderId = newFolderId === "root" ? null : newFolderId
    onUpdate(model.id, { folder_id: folderId })
    toast.success(`Moved "${model.name}" to a new folder.`)
  }

  const handleLightChange = (id: number, newValues: Partial<Omit<Light, "id">>) => {
    onLightsChange(lights.map((light) => (light.id === id ? { ...light, ...newValues } : light)))
  }

  const addLight = () => {
    if (lights.length < 3) {
      const newLight: Light = {
        id: Date.now(),
        position: [-5, 5, -5],
        intensity: 1,
        kelvin: 5500,
        decay: 1,
      }
      onLightsChange([...lights, newLight])
    } else {
      toast.error("A maximum of 3 lights are allowed.")
    }
  }

  const removeLight = (id: number) => {
    if (lights.length > 1) {
      onLightsChange(lights.filter((light) => light.id !== id))
    } else {
      toast.error("At least one light is required.")
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

  return (
    <div className="px-4 pb-4 flex flex-col h-full text-white overflow-y-auto">
      <div className="space-y-4 flex-1 overflow-y-auto pr-2 -mr-2">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            className="bg-white/10 border-white/30 h-9"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Folder</Label>
          <Select value={model.folder_id || "root"} onValueChange={handleFolderChange}>
            <SelectTrigger className="bg-white/10 border-white/30 h-9">
              <SelectValue placeholder="Select folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Assets (Root)</SelectItem>
              {allFolders?.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="my-4 bg-white/20" />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Lights</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addLight}>
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>
          <Accordion type="multiple" defaultValue={lights.map((l) => `light-${l.id}`)} className="w-full">
            {lights.map((light, index) => (
              <AccordionItem key={light.id} value={`light-${light.id}`} className="border-white/10">
                <AccordionTrigger>
                  <div className="flex items-center justify-between w-full">
                    <span>Light {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-destructive/50 hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeLight(light.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Position (X, Y, Z)</Label>
                    <div className="flex gap-2">
                      {([0, 1, 2] as const).map((i) => (
                        <Input
                          key={i}
                          type="number"
                          value={light.position[i]}
                          onChange={(e) => {
                            const newPos = [...light.position] as [number, number, number]
                            newPos[i] = Number.parseFloat(e.target.value)
                            handleLightChange(light.id, { position: newPos })
                          }}
                          className="bg-white/10 border-white/30 h-8 text-xs"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">Intensity</Label>
                      <span className="text-xs text-muted-foreground">{light.intensity.toFixed(1)}</span>
                    </div>
                    <Slider
                      value={[light.intensity]}
                      onValueChange={([val]) => handleLightChange(light.id, { intensity: val })}
                      max={50}
                      step={0.1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">Temperature</Label>
                      <span className="text-xs text-muted-foreground">{light.kelvin.toFixed(0)}K</span>
                    </div>
                    <Slider
                      value={[light.kelvin]}
                      onValueChange={([val]) => handleLightChange(light.id, { kelvin: val })}
                      min={1000}
                      max={12000}
                      step={100}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <Separator className="my-4 bg-white/20" />

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Background</h3>
          <Tabs
            value={bgType}
            onValueChange={(value) => onBgTypeChange(value as "color" | "gradient" | "image")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3 h-9">
              <TabsTrigger value="color">Color</TabsTrigger>
              <TabsTrigger value="gradient">Gradient</TabsTrigger>
              <TabsTrigger value="image">Image</TabsTrigger>
            </TabsList>
            <TabsContent value="color" className="pt-2">
              <div className="flex items-center justify-between rounded-md border border-white/20 p-2">
                <Label className="text-sm">Color</Label>
                <Input
                  type="color"
                  value={bgColor1}
                  onChange={(e) => onBgColor1Change(e.target.value)}
                  className="w-8 h-8 p-0 bg-transparent border-none rounded-md cursor-pointer"
                />
              </div>
            </TabsContent>
            <TabsContent value="gradient" className="pt-2 space-y-2">
              <div className="flex items-center justify-between rounded-md border border-white/20 p-2">
                <Label className="text-sm">Top</Label>
                <Input
                  type="color"
                  value={bgColor1}
                  onChange={(e) => onBgColor1Change(e.target.value)}
                  className="w-8 h-8 p-0 bg-transparent border-none rounded-md cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-white/20 p-2">
                <Label className="text-sm">Bottom</Label>
                <Input
                  type="color"
                  value={bgColor2}
                  onChange={(e) => onBgColor2Change(e.target.value)}
                  className="w-8 h-8 p-0 bg-transparent border-none rounded-md cursor-pointer"
                />
              </div>
            </TabsContent>
            <TabsContent value="image" className="pt-2">
              <Input
                type="file"
                ref={bgImageInputRef}
                onChange={handleBgImageUpload}
                accept="image/*"
                className="bg-white/10 border-white/30 text-xs file:text-white"
              />
            </TabsContent>
          </Tabs>
        </div>

        <Separator className="my-4 bg-white/20" />

        <div>
          <h3 className="text-sm font-semibold mb-2">Thumbnail</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="w-full bg-white/10 border-white/30 hover:bg-white/20 text-white"
              onClick={() => thumbnailInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
            <input
              type="file"
              ref={thumbnailInputRef}
              className="hidden"
              accept="image/*"
              onChange={(e) => e.target.files && onThumbnailUpload(e.target.files[0])}
            />
            <Button
              variant="outline"
              className="w-full bg-white/10 border-white/30 hover:bg-white/20 text-white"
              onClick={onTakeScreenshot}
              disabled={isScreenshotting}
            >
              {isScreenshotting ? (
                <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              Capture
            </Button>
          </div>
        </div>

        <Separator className="my-4 bg-white/20" />

        <div>
          <Button variant="destructive" className="w-full" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Model
          </Button>
        </div>
        {showDeleteConfirm && (
          <Dialog open onOpenChange={setShowDeleteConfirm}>
            <DialogContent className="bg-black/80 border-destructive text-white">
              <DialogHeader>
                <DialogTitle>Are you sure?</DialogTitle>
                <DialogDescription>
                  This will permanently delete the model and its files. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onDelete()
                    setShowDeleteConfirm(false)
                  }}
                >
                  Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  )
}
