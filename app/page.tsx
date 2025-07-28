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
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Slider } from "@/components/ui/slider"

import type React from "react"

import { useState, useRef, useEffect, Suspense, useCallback, Fragment, useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { useGLTF, OrbitControls, Html, useProgress } from "@react-three/drei"
import {
  Upload,
  FolderIcon,
  ChevronLeft,
  Palette,
  Trash2,
  ImageIcon,
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
}

interface GalleryContents {
  folders: Folder[]
  models: Model[]
}

interface Light {
  id: number
  position: [number, number, number]
  intensity: number
  kelvin: number
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
  // Clone the scene to avoid mutating the cached GLTF data, and use useMemo to prevent re-cloning on every render.
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

  // Store the original materials in a map, using useMemo so it only runs when the scene changes.
  const originalMaterials = useMemo(() => {
    const materialsMap = new Map<string, THREE.Material | THREE.Material[]>()
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        materialsMap.set(child.uuid, (child as THREE.Mesh).material)
      }
    })
    return materialsMap
  }, [scene])

  // Effect to apply the correct material based on the selected mode.
  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (materialMode === "pbr") {
          // Restore the original material from our map.
          const originalMaterial = originalMaterials.get(mesh.uuid)
          if (originalMaterial) {
            mesh.material = originalMaterial
          }
        } else if (materialMode === "normal") {
          // Apply the normal material.
          mesh.material = new THREE.MeshNormalMaterial()
        } else if (materialMode === "white") {
          // Apply a simple white material.
          mesh.material = new THREE.MeshStandardMaterial({ color: "white" })
        }
      }
    })
  }, [scene, materialMode, originalMaterials]) // Re-run when mode or model changes.

  return <primitive object={scene} />
}

// --- Main Application Component ---
function App() {
  const { mutate } = useSWRConfig()
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "Assets" }])
  const [searchQuery, setSearchQuery] = useState("")
  const [sortOption, setSortOption] = useState("created_at-desc")

  const [sortBy, sortOrder] = sortOption.split("-")
  const galleryUrl = `/api/gallery?folderId=${currentFolderId || ""}&sortBy=${sortBy}&sortOrder=${sortOrder}`
  const { data: gallery, error, isLoading } = useSWR<GalleryContents>(galleryUrl, fetcher)
  const { data: allFolders } = useSWR<Folder[]>("/api/folders/all", fetcher)

  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([])

  // Dialog states
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false)
  const [renameItem, setRenameItem] = useState<{ id: string; name: string; type: "folder" | "model" } | null>(null)

  // Viewer settings state
  const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("pbr")
  const [bgColor, setBgColor] = useState("#000000")
  const [lights, setLights] = useState<Light[]>([{ id: Date.now(), position: [5, 5, 5], intensity: 1.5, kelvin: 6500 }])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(true)

  // Add these lines for panel dragging
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 })
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isOrbitControlsEnabled, setIsOrbitControlsEnabled] = useState(true)
  const isMovingLight = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const tipShown = useRef(false)

  // --- Event Handlers & Actions ---

  const handlePanelDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, .slider-thumb")) {
      return
    }
    e.preventDefault()
    setIsDraggingPanel(true)
    dragStartPos.current = {
      x: e.clientX - panelPosition.x,
      y: e.clientY - panelPosition.y,
    }
    document.body.style.cursor = "grabbing"
    document.body.style.userSelect = "none"
  }

  useEffect(() => {
    const handlePanelDragMove = (e: PointerEvent) => {
      if (!isDraggingPanel || !panelRef.current) return

      let newX = e.clientX - dragStartPos.current.x
      let newY = e.clientY - dragStartPos.current.y

      const panelWidth = panelRef.current.offsetWidth
      const panelHeight = panelRef.current.offsetHeight
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const initialTop = 16 // from top-4
      const initialRight = 16 // from right-4

      const minX = -(viewportWidth - panelWidth - initialRight)
      const maxX = initialRight
      const minY = -initialTop
      const maxY = viewportHeight - panelHeight - initialTop

      newX = Math.max(minX, Math.min(newX, maxX))
      newY = Math.max(minY, Math.min(newY, maxY))

      setPanelPosition({ x: newX, y: newY })
    }

    const handlePanelDragEnd = () => {
      if (!isDraggingPanel) return
      setIsDraggingPanel(false)
      document.body.style.cursor = "auto"
      document.body.style.userSelect = "auto"
    }

    if (isDraggingPanel) {
      window.addEventListener("pointermove", handlePanelDragMove)
      window.addEventListener("pointerup", handlePanelDragEnd)
    }

    return () => {
      window.removeEventListener("pointermove", handlePanelDragMove)
      window.removeEventListener("pointerup", handlePanelDragEnd)
    }
  }, [isDraggingPanel, isSettingsPanelOpen]) // Re-check constraints if panel height changes

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const newUploads = Array.from(files).map((file) => ({ name: file.name, progress: 0 }))
    setUploadingFiles((prev) => [...prev, ...newUploads])

    const uploadPromises = Array.from(files).map(async (file) => {
      if (!file.name.endsWith(".glb")) {
        toast.error(`Skipping non-GLB file: ${file.name}`)
        return
      }
      try {
        const sanitizedFilename = file.name.replace(/\s+/g, "_")
        const newBlob = await upload(sanitizedFilename, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
          clientPayload: JSON.stringify({ isThumbnail: false }), // Explicitly a new model
        })
        const modelName = file.name.replace(/\.glb$/, "")
        await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: modelName,
            model_url: newBlob.url,
            thumbnail_url: `/placeholder.svg?width=400&height=400&query=${encodeURIComponent(modelName)}`,
            folder_id: currentFolderId,
          }),
        })
        toast.success(`Uploaded ${file.name}`)
      } catch (error) {
        toast.error(`Failed to upload ${file.name}`)
        console.error(error)
      }
    })
    await Promise.all(uploadPromises)
    mutate(galleryUrl)
    setUploadingFiles([])
  }

  const handleCreateFolder = async (name: string) => {
    try {
      await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parent_id: currentFolderId }),
      })
      toast.success(`Folder "${name}" created`)
      mutate(galleryUrl)
      setIsNewFolderDialogOpen(false)
    } catch (err) {
      toast.error("Failed to create folder.")
    }
  }

  const handleRename = async (newName: string) => {
    if (!renameItem) return
    const { id, type } = renameItem
    const url = type === "folder" ? `/api/folders/${id}` : `/api/models/${id}`
    try {
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      })
      toast.success("Renamed successfully")
      mutate(galleryUrl)
      if (selectedModel && type === "model" && selectedModel.id === id) {
        setSelectedModel((prev) => prev && { ...prev, name: newName })
      }
      setRenameItem(null)
    } catch (err) {
      toast.error("Failed to rename.")
    }
  }

  const handleDeleteItem = async (item: { id: string; type: "folder" | "model" }) => {
    const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`
    try {
      const res = await fetch(url, { method: "DELETE" })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error)
      }
      toast.success(`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} deleted`)
      mutate(galleryUrl)
    } catch (err) {
      toast.error(`Failed to delete: ${(err as Error).message}`)
    }
  }

  const handleMoveItem = async (item: { id: string; type: "folder" | "model" }, targetFolderId: string | null) => {
    const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`
    const body = item.type === "folder" ? { parent_id: targetFolderId } : { folder_id: targetFolderId }

    try {
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      toast.success("Item moved successfully")
      mutate(galleryUrl)
    } catch (err) {
      toast.error("Failed to move item.")
    }
  }

  const handleNavigateToFolder = (folder: Folder) => {
    setCurrentFolderId(folder.id)
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }])
    setSearchQuery("")
  }

  const handleBreadcrumbClick = (folderId: string | null, index: number) => {
    setCurrentFolderId(folderId)
    setBreadcrumbs((prev) => prev.slice(0, index + 1))
    setSearchQuery("")
  }

  const handleModelUpdate = async (id: string, updates: Partial<Omit<Model, "id" | "created_at">>) => {
    try {
      const res = await fetch(`/api/models/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error("Failed to update model")
      const updatedModel = await res.json()
      setSelectedModel(updatedModel)
      mutate(galleryUrl)
      toast.success("Model updated successfully!")
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleThumbnailUpload = async (file: File) => {
    if (!selectedModel) return
    toast.info(`Uploading thumbnail for ${selectedModel.name}...`)
    try {
      const fileExtension = file.name.split(".").pop() || "png"
      const pathname = `thumbnails/${selectedModel.id}.${fileExtension}`

      const newBlob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: JSON.stringify({ isThumbnail: true }), // Signal to overwrite
        allowOverwrite: true,
      })
      await handleModelUpdate(selectedModel.id, { thumbnail_url: newBlob.url })
    } catch (err) {
      toast.error("Failed to upload thumbnail.")
      console.error(err)
    }
  }

  const handleDownloadModel = () => {
    if (!selectedModel) return
    const link = document.createElement("a")
    link.href = selectedModel.model_url
    link.download = `${selectedModel.name}.glb`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success(`Downloading ${selectedModel.name}.glb`)
  }

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!selectedModel || !gallery || !gallery.models || gallery.models.length === 0) return

      const currentIndex = gallery.models.findIndex((m) => m.id === selectedModel.id)
      if (currentIndex === -1) return

      if (event.key === "Escape") {
        setSelectedModel(null)
      } else if (event.key === "ArrowRight") {
        const nextIndex = (currentIndex + 1) % gallery.models.length
        setSelectedModel(gallery.models[nextIndex])
      } else if (event.key === "ArrowLeft") {
        const prevIndex = (currentIndex - 1 + gallery.models.length) % gallery.models.length
        setSelectedModel(gallery.models[prevIndex])
      }
    },
    [selectedModel, gallery],
  )

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.shiftKey && lights.length > 0) {
      isMovingLight.current = true
      setIsOrbitControlsEnabled(false)
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      ;(e.target as HTMLElement).style.cursor = "grabbing"
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isMovingLight.current && dragStartRef.current && lights.length > 0) {
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y

      const sensitivity = 0.05
      setLights((prevLights) => {
        const newLights = [...prevLights]
        const mainLight = { ...newLights[0] }
        mainLight.position = [
          mainLight.position[0] + deltaX * sensitivity,
          mainLight.position[1] - deltaY * sensitivity,
          mainLight.position[2],
        ]
        newLights[0] = mainLight
        return newLights
      })

      dragStartRef.current = { x: e.clientX, y: e.clientY }
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isMovingLight.current) {
      isMovingLight.current = false
      setIsOrbitControlsEnabled(true)
      dragStartRef.current = null
      ;(e.target as HTMLElement).style.cursor = e.shiftKey ? "grab" : "auto"
    }
  }

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (selectedModel && !tipShown.current) {
      toast.info("Pro-tip: Hold Shift and drag to move the main light source.", {
        duration: 5000,
      })
      tipShown.current = true
    }
  }, [selectedModel])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift" && !isMovingLight.current) {
        const canvas = document.querySelector("canvas")
        if (canvas) canvas.style.cursor = "grab"
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift" && !isMovingLight.current) {
        const canvas = document.querySelector("canvas")
        if (canvas) canvas.style.cursor = "auto"
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      const canvas = document.querySelector("canvas")
      if (canvas) canvas.style.cursor = "auto"
    }
  }, [])

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files)
    }
  }

  const filteredFolders =
    gallery?.folders?.filter((folder) => folder.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? []
  const filteredModels =
    gallery?.models?.filter((model) => model.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? []

  // --- Render Logic ---
  if (selectedModel) {
    return (
      <div className="w-full h-screen relative" style={{ backgroundColor: bgColor }}>
        <Toaster richColors />
        <Canvas
          camera={{ fov: 50, position: [0, 1, 5] }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <Suspense fallback={<Loader />}>
            {lights.map((light) => {
              const color = kelvinToRgb(light.kelvin)
              return (
                <directionalLight
                  key={light.id}
                  position={light.position}
                  intensity={light.intensity}
                  color={[color.r, color.g, color.b]}
                />
              )
            })}
            <ModelViewer modelUrl={selectedModel.model_url} materialMode={materialMode} />
          </Suspense>
          <OrbitControls enabled={isOrbitControlsEnabled} enablePan={true} enableZoom={true} enableRotate={true} />
        </Canvas>
        <div className="absolute top-4 left-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedModel(null)}
            className="text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        </div>
        <div
          ref={panelRef}
          className="absolute top-4 right-4 w-[350px] bg-black/50 backdrop-blur-sm border border-white/20 rounded-lg text-white z-10"
          style={{ transform: `translate(${panelPosition.x}px, ${panelPosition.y}px)` }}
        >
          <div className="flex items-center justify-between p-4 cursor-grab" onPointerDown={handlePanelDragStart}>
            <h2 className="text-lg font-semibold">Settings</h2>
            <button
              onClick={() => setIsSettingsPanelOpen(!isSettingsPanelOpen)}
              className="z-10 p-1 -m-1 cursor-pointer"
            >
              <ChevronDown
                className={`h-5 w-5 transition-transform duration-300 pointer-events-none ${
                  isSettingsPanelOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${
              isSettingsPanelOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <SettingsPanel
              model={selectedModel}
              onUpdate={handleModelUpdate}
              onDelete={() =>
                handleDeleteItem({ id: selectedModel.id, type: "model" }).then(() => setSelectedModel(null))
              }
              onThumbnailUpload={handleThumbnailUpload}
              lights={lights}
              onLightsChange={setLights}
              bgColor={bgColor}
              onBgColorChange={setBgColor}
            />
          </div>
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
        onChange={(e) => handleUpload(e.target.files)}
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
                  onClick={() => handleBreadcrumbClick(null, 0)}
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
            <div className="flex items-center gap-2">
              <div className="flex items-center text-sm">
                {breadcrumbs.map((crumb, index) => (
                  <Fragment key={crumb.id || "root"}>
                    <button
                      onClick={() => handleBreadcrumbClick(crumb.id, index)}
                      className="hover:underline disabled:hover:no-underline disabled:text-foreground"
                      disabled={index === breadcrumbs.length - 1}
                    >
                      {crumb.name}
                    </button>
                    {index < breadcrumbs.length - 1 && <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />}
                  </Fragment>
                ))}
              </div>
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
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
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
                  <Skeleton key={i} className="aspect-square rounded-lg bg-muted" />
                ))}
              </div>
            )}
            {error && <div className="text-center text-destructive">Failed to load gallery.</div>}
            {!isLoading &&
              !searchQuery &&
              gallery &&
              Array.isArray(gallery.folders) &&
              gallery.folders.length === 0 &&
              Array.isArray(gallery.models) &&
              gallery.models.length === 0 &&
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
                    onDoubleClick={() => handleNavigateToFolder(folder)}
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
                    onClick={() => setSelectedModel(model)}
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
    </div>
  )
}

export default function HomePage() {
  return <App />
}

// --- UI Components ---

interface MenuItemsProps {
  onRename: () => void
  onDelete: () => void
  onMove: (targetFolderId: string | null) => void
  allFolders?: Folder[]
  currentItem: { id: string; type: "folder" | "model"; parent_id: string | null }
}

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

function SettingsPanel({
  model,
  onUpdate,
  onDelete,
  onThumbnailUpload,
  lights,
  onLightsChange,
  bgColor,
  onBgColorChange,
}: {
  model: Model
  onUpdate: (id: string, updates: Partial<Omit<Model, "id" | "created_at">>) => void
  onDelete: () => void
  onThumbnailUpload: (file: File) => void
  lights: Light[]
  onLightsChange: (lights: Light[]) => void
  bgColor: string
  onBgColorChange: (value: string) => void
}) {
  const [name, setName] = useState(model.name)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)

  const { data: allFolders, error: foldersError } = useSWR<Folder[]>("/api/folders/all", fetcher)

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
      }
      onLightsChange([...lights, newLight])
    }
  }

  const removeLight = (id: number) => {
    if (lights.length > 1) {
      onLightsChange(lights.filter((light) => light.id !== id))
    }
  }

  return (
    <div className="px-4 pb-4 flex flex-col h-full text-white">
      <div className="space-y-4 flex-1 overflow-y-auto pr-2">
        <div>
          <label className="text-sm font-medium text-gray-400">Thumbnail</label>
          <div className="mt-2 relative aspect-video w-full rounded-lg overflow-hidden group bg-white/10">
            <img
              src={model.thumbnail_url || "/placeholder.svg"}
              alt={model.name}
              className="w-full h-full object-cover"
            />
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => thumbnailInputRef.current?.click()}
            >
              <ImageIcon className="mr-2 h-4 w-4" /> Change
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
        <div>
          <label htmlFor="model-name" className="text-sm font-medium text-gray-400">
            Model Name
          </label>
          <div className="relative mt-2">
            <Input
              id="model-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="bg-white/10 border-white/20 text-white pr-8"
            />
            <Pencil className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          </div>
        </div>
        <div>
          <label htmlFor="folder-select" className="text-sm font-medium text-gray-400">
            Folder
          </label>
          <Select value={model.folder_id || "root"} onValueChange={handleFolderChange}>
            <SelectTrigger id="folder-select" className="mt-2 bg-white/10 border-white/20 text-white">
              <SelectValue placeholder="Select a folder" />
            </SelectTrigger>
            <SelectContent className="bg-neutral-900 border-white/20 text-white">
              <SelectItem value="root">Assets (Root)</SelectItem>
              {foldersError && (
                <SelectItem value="error" disabled>
                  Error loading folders
                </SelectItem>
              )}
              {!allFolders && !foldersError && (
                <SelectItem value="loading" disabled>
                  Loading...
                </SelectItem>
              )}
              {allFolders?.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="bg-white/20" />

        <div>
          <label className="text-sm font-medium text-gray-400">Lighting</label>
          <Accordion type="multiple" defaultValue={["light-0"]} className="w-full mt-2">
            {lights.map((light, index) => {
              const color = kelvinToRgb(light.kelvin)
              const colorStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`
              return (
                <AccordionItem key={light.id} value={`light-${index}`} className="border-b-white/10">
                  <div className="flex items-center w-full">
                    <AccordionTrigger className="flex-1 text-left py-3">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full border border-white/20"
                            style={{ backgroundColor: colorStyle }}
                          />
                          <span>Light {index + 1}</span>
                        </div>
                        {index === 0 && <span className="text-xs font-normal text-gray-400">(Shift+Drag)</span>}
                      </div>
                    </AccordionTrigger>
                    {lights.length > 1 && (
                      <div className="pl-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:bg-white/20 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeLight(light.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <AccordionContent className="pt-2 pb-4 space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs text-gray-400">Intensity</label>
                        <span className="text-xs w-12 text-right">{light.intensity.toFixed(1)}</span>
                      </div>
                      <Slider
                        value={[light.intensity]}
                        onValueChange={(value) => handleLightChange(light.id, { intensity: value[0] })}
                        min={0}
                        max={5}
                        step={0.1}
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs text-gray-400">Temperature</label>
                        <span className="text-xs w-16 text-right">{light.kelvin}K</span>
                      </div>
                      <Slider
                        value={[light.kelvin]}
                        onValueChange={(value) => handleLightChange(light.id, { kelvin: value[0] })}
                        min={2000}
                        max={10000}
                        step={100}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
          {lights.length < 3 && (
            <Button variant="outline" className="w-full mt-4 bg-white/10 border-white/20" onClick={addLight}>
              Add Light
            </Button>
          )}
        </div>

        <Separator className="bg-white/20" />

        <div>
          <label className="text-sm font-medium text-gray-400">Background Color</label>
          <Input
            type="color"
            value={bgColor}
            onChange={(e) => onBgColorChange(e.target.value)}
            className="w-full h-10 p-1 mt-2 bg-white/10 border-white/20"
          />
        </div>
      </div>
      <div className="mt-6 pt-4 border-t border-white/20">
        <Button variant="destructive" className="w-full" onClick={() => setShowDeleteConfirm(true)}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete Model
        </Button>
      </div>
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-black/50 backdrop-blur-sm border-white/20 text-white">
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription className="text-gray-400">
              This will permanently delete the model "{model.name}". This action cannot be undone.
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
    </div>
  )
}
