"use client"

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"

import type React from "react"

import { useState, useRef, useEffect, Suspense, useCallback, Fragment } from "react"
import { Canvas } from "@react-three/fiber"
import { useGLTF, OrbitControls, Environment, Html, useProgress } from "@react-three/drei"
import {
  Upload,
  FolderIcon,
  ChevronLeft,
  Palette,
  Trash2,
  Settings,
  ImageIcon,
  Pencil,
  MoreVertical,
  FolderPlus,
  ChevronRight,
  Download,
  Grid,
} from "lucide-react"
import { upload } from "@vercel/blob/client"
import useSWR, { useSWRConfig } from "swr"
import { Toaster, toast } from "sonner"
import * as THREE from "three"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
  const { scene } = useGLTF(modelUrl)
  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (materialMode === "normal") mesh.material = new THREE.MeshNormalMaterial()
        else if (materialMode === "white") mesh.material = new THREE.MeshStandardMaterial({ color: "white" })
      }
    })
  }, [scene, materialMode])
  return <primitive object={scene} />
}

// --- Main Application Component ---
function App() {
  const { mutate } = useSWRConfig()
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "Assets" }])

  const galleryUrl = `/api/gallery?folderId=${currentFolderId || ""}`
  const { data: gallery, error, isLoading } = useSWR<GalleryContents>(galleryUrl, fetcher)

  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([])

  // Dialog states
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false)
  const [renameItem, setRenameItem] = useState<{ id: string; name: string; type: "folder" | "model" } | null>(null)

  // Viewer settings state
  const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("pbr")
  const [bgColor, setBgColor] = useState("#000000")
  const [lightIntensity, setLightIntensity] = useState(1)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Event Handlers & Actions ---
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
        const newBlob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/upload" })
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
    if (!window.confirm(`Are you sure you want to delete this ${item.type}?`)) return
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

  const handleNavigateToFolder = (folder: Folder) => {
    setCurrentFolderId(folder.id)
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }])
  }

  const handleBreadcrumbClick = (folderId: string | null, index: number) => {
    setCurrentFolderId(folderId)
    setBreadcrumbs((prev) => prev.slice(0, index + 1))
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
      const newBlob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/upload" })
      await handleModelUpdate(selectedModel.id, { thumbnail_url: newBlob.url })
    } catch (err) {
      toast.error("Failed to upload thumbnail.")
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

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // --- Render Logic ---
  if (selectedModel) {
    return (
      <div className="w-full h-screen relative" style={{ backgroundColor: bgColor }}>
        <Toaster richColors />
        <Canvas camera={{ fov: 50, position: [0, 1, 5] }}>
          <Suspense fallback={<Loader />}>
            <Environment preset="city" />
            <ambientLight intensity={0.2} />
            <directionalLight position={[5, 5, 5]} intensity={lightIntensity} />
            <ModelViewer modelUrl={selectedModel.model_url} materialMode={materialMode} />
          </Suspense>
          <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
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
        <div className="absolute top-4 right-4">
          <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                <Settings className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-black/50 backdrop-blur-sm border-white/20 w-[350px] sm:w-[400px]">
              <SettingsPanel
                model={selectedModel}
                onUpdate={handleModelUpdate}
                onDelete={() =>
                  handleDeleteItem({ id: selectedModel.id, type: "model" }).then(() => setSelectedModel(null))
                }
                onThumbnailUpload={handleThumbnailUpload}
                lightIntensity={lightIntensity}
                onLightIntensityChange={setLightIntensity}
                bgColor={bgColor}
                onBgColorChange={setBgColor}
              />
            </SheetContent>
          </Sheet>
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
          <header className="flex items-center justify-between p-4 border-b">
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
          </header>
          <main className="flex-1 p-4 md:p-8 overflow-y-auto">
            {isLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 18 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg bg-muted" />
                ))}
              </div>
            )}
            {error && <div className="text-center text-destructive">Failed to load gallery.</div>}
            {!isLoading &&
              gallery &&
              Array.isArray(gallery.folders) &&
              Array.isArray(gallery.models) &&
              gallery.folders.length === 0 &&
              gallery.models.length === 0 &&
              uploadingFiles.length === 0 && (
                <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-full pt-20">
                  <FolderIcon size={64} className="mb-4" />
                  <h2 className="text-2xl font-semibold">This folder is empty</h2>
                  <p className="mt-2">Upload a model or create a new folder.</p>
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
              {gallery?.folders.map((folder) => (
                <ItemContextMenu
                  key={folder.id}
                  onRename={() => setRenameItem({ ...folder, type: "folder" })}
                  onDelete={() => handleDeleteItem({ id: folder.id, type: "folder" })}
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
              {gallery?.models.map((model) => (
                <ItemContextMenu
                  key={model.id}
                  onRename={() => setRenameItem({ ...model, type: "model" })}
                  onDelete={() => handleDeleteItem({ id: model.id, type: "model" })}
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
function ItemContextMenu({
  children,
  onRename,
  onDelete,
}: {
  children: React.ReactNode
  onRename: () => void
  onDelete: () => void
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
                <DropdownMenuItem onSelect={onRename}>
                  <Pencil className="mr-2 h-4 w-4" />
                  <span>Rename</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>Rename</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (name: string) => void }) {
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
  lightIntensity,
  onLightIntensityChange,
  bgColor,
  onBgColorChange,
}: {
  model: Model
  onUpdate: (id: string, updates: Partial<Omit<Model, "id" | "created_at">>) => void
  onDelete: () => void
  onThumbnailUpload: (file: File) => void
  lightIntensity: number
  onLightIntensityChange: (value: number) => void
  bgColor: string
  onBgColorChange: (value: string) => void
}) {
  const [name, setName] = useState(model.name)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setName(model.name)
  }, [model.name])
  const handleNameBlur = () => {
    if (name !== model.name) onUpdate(model.id, { name })
  }

  return (
    <div className="p-4 flex flex-col h-full text-white">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <div className="space-y-6 flex-1 overflow-y-auto pr-2">
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
          <label className="text-sm font-medium text-gray-400">Light Intensity</label>
          <Slider
            value={[lightIntensity]}
            onValueChange={(v) => onLightIntensityChange(v[0])}
            min={0}
            max={5}
            step={0.1}
            className="mt-2"
          />
        </div>
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
      <div className="mt-6 pt-6 border-t border-white/20">
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
