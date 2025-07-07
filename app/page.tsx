"use client"

import { useState, useRef, useEffect, Suspense, useCallback } from "react"
import { Canvas } from "@react-three/fiber"
import { useGLTF, OrbitControls, Environment, Html, useProgress } from "@react-three/drei"
import { Upload, Folder, ChevronLeft, Palette, Trash2, Menu, X, Settings, ImageIcon, Pencil } from "lucide-react"
import { upload } from "@vercel/blob/client"
import useSWR, { useSWRConfig } from "swr"
import { toast } from "sonner"
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
import { cn } from "@/lib/utils"

// Define the structure of a Model object
interface Model {
  id: string
  name: string
  model_url: string
  thumbnail_url: string
  created_at: string
}

// --- Data Fetching ---
const fetcher = (url: string) => fetch(url).then((res) => res.json())

// --- 3D Components ---

function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="text-muted-foreground text-sm">{progress.toFixed(0)}%</div>
    </Html>
  )
}

function ModelViewer({
  modelUrl,
  materialMode,
}: {
  modelUrl: string
  materialMode: "pbr" | "normal" | "white"
}) {
  const { scene } = useGLTF(modelUrl)

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (materialMode === "normal") {
          mesh.material = new THREE.MeshNormalMaterial({ flatShading: true })
        } else if (materialMode === "white") {
          mesh.material = new THREE.MeshStandardMaterial({ color: "white", metalness: 0, roughness: 0.5 })
        }
        // For 'pbr', we use the original materials from the GLTF file.
      }
    })
  }, [scene, materialMode])

  return <primitive object={scene} />
}

// --- Main Application Component ---

export default function HomePage() {
  const { data: models, error, isLoading } = useSWR<Model[]>("/api/models", fetcher)
  const { mutate } = useSWRConfig()
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([])

  // Viewer settings state
  const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("pbr")
  const [bgColor, setBgColor] = useState("#FFFFFF")
  const [lightIntensity, setLightIntensity] = useState(1)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Event Handlers ---

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const newUploads = Array.from(files).map((file) => ({
      name: file.name,
      progress: 0,
    }))
    setUploadingFiles((prev) => [...prev, ...newUploads])

    for (const file of Array.from(files)) {
      const fileType = file.name.endsWith(".glb") ? "model" : "image"
      if (fileType !== "model") {
        toast.error(`Skipping non-GLB file: ${file.name}`)
        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name))
        continue
      }

      try {
        const newBlob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
        })

        setUploadingFiles((prev) => prev.map((f) => (f.name === file.name ? { ...f, progress: 100 } : f)))

        const modelName = file.name.replace(/\.glb$/, "")
        await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: modelName,
            model_url: newBlob.url,
            thumbnail_url: `/placeholder.svg?width=400&height=400&query=${encodeURIComponent(modelName)}`,
          }),
        })

        toast.success(`Successfully uploaded ${file.name}`)
      } catch (error) {
        console.error("Upload failed:", error)
        toast.error(`Failed to upload ${file.name}`)
        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name))
      }
    }
    mutate("/api/models")
    setUploadingFiles([])
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
      mutate("/api/models")
      toast.success("Model updated successfully!")
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleThumbnailUpload = async (file: File) => {
    if (!selectedModel) return
    toast.info(`Uploading thumbnail for ${selectedModel.name}...`)
    try {
      const newBlob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      })
      await handleModelUpdate(selectedModel.id, {
        thumbnail_url: newBlob.url,
      })
    } catch (err) {
      toast.error("Failed to upload thumbnail.")
    }
  }

  const handleDelete = async () => {
    if (!selectedModel) return
    try {
      await fetch(`/api/models/${selectedModel.id}`, { method: "DELETE" })
      toast.success(`Deleted ${selectedModel.name}`)
      setSelectedModel(null)
      mutate("/api/models")
    } catch (err) {
      toast.error("Failed to delete model.")
    }
  }

  // --- Keyboard Navigation ---
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!selectedModel) return

      const currentIndex = models?.findIndex((m) => m.id === selectedModel.id)
      if (currentIndex === undefined || currentIndex === -1 || !models) return

      if (event.key === "Escape") {
        setSelectedModel(null)
      } else if (event.key === "ArrowRight") {
        const nextIndex = (currentIndex + 1) % models.length
        setSelectedModel(models[nextIndex])
      } else if (event.key === "ArrowLeft") {
        const prevIndex = (currentIndex - 1 + models.length) % models.length
        setSelectedModel(models[prevIndex])
      }
    },
    [selectedModel, models],
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  // --- Render Logic ---

  if (selectedModel) {
    return (
      <div className="w-full h-screen bg-background relative">
        <Canvas camera={{ fov: 50, position: [0, 1, 5] }} style={{ background: bgColor }}>
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
            className="text-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        </div>

        <div className="absolute top-4 right-4">
          <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-foreground hover:bg-accent">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-background text-foreground border-l w-[350px] sm:w-[400px]">
              <SettingsPanel
                model={selectedModel}
                onUpdate={handleModelUpdate}
                onDelete={handleDelete}
                onThumbnailUpload={handleThumbnailUpload}
                lightIntensity={lightIntensity}
                onLightIntensityChange={setLightIntensity}
                bgColor={bgColor}
                onBgColorChange={setBgColor}
              />
            </SheetContent>
          </Sheet>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/50 border backdrop-blur-sm p-1 rounded-lg flex items-center gap-1">
          <Button
            variant={materialMode === "pbr" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setMaterialMode("pbr")}
          >
            <Palette className="h-5 w-5" />
          </Button>
          <Button
            variant={materialMode === "normal" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setMaterialMode("normal")}
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500" />
          </Button>
          <Button
            variant={materialMode === "white" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setMaterialMode("white")}
          >
            <div className="w-5 h-5 rounded-full bg-white border" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground h-screen flex">
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleUpload(e.target.files)}
        className="hidden"
        multiple
        accept=".glb"
      />

      <aside
        className={cn(
          "bg-background border-r p-4 flex-col md:flex md:w-60 transition-all duration-300 ease-in-out",
          isSidebarOpen ? "flex w-60" : "hidden",
        )}
      >
        <div className="mb-8">
          <h1 className="text-xl font-bold tracking-tighter">My Models</h1>
        </div>
        <nav className="flex flex-col gap-2">
          <Button variant="ghost" className="justify-start gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Upload
          </Button>
          <Button variant="secondary" className="justify-start gap-2">
            <Folder className="h-4 w-4" /> Assets
          </Button>
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-8 flex flex-col overflow-hidden">
        <div className="md:hidden mb-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            {isSidebarOpen ? <X /> : <Menu />}
          </Button>
          <h1 className="text-lg font-bold tracking-tighter">My Models</h1>
        </div>

        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {error && <div className="text-center text-destructive">Failed to load models.</div>}

        {!isLoading && models?.length === 0 && (
          <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-full">
            <Folder size={48} className="mb-4" />
            <h2 className="text-xl font-semibold">Your gallery is empty</h2>
            <p className="mt-2 text-sm">Click the upload button to add your first model.</p>
            <Button className="mt-4" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload Model
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 overflow-y-auto">
          {uploadingFiles.map((file) => (
            <div
              key={file.name}
              className="aspect-square rounded-lg border bg-muted flex flex-col items-center justify-center p-2"
            >
              <div className="w-full bg-border rounded-full h-1.5 mb-2">
                <div className="bg-primary h-1.5 rounded-full" style={{ width: `${file.progress}%` }}></div>
              </div>
              <p className="text-xs text-center truncate w-full">{file.name}</p>
            </div>
          ))}
          {models?.map((model) => (
            <div
              key={model.id}
              className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer"
              onClick={() => setSelectedModel(model)}
            >
              <img
                src={model.thumbnail_url || "/placeholder.svg"}
                alt={model.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).src = `/placeholder.svg?width=400&height=400&query=error`
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                <p className="text-sm font-medium text-white truncate">{model.name}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

// --- Settings Panel Component ---

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
    if (name !== model.name) {
      onUpdate(model.id, { name })
    }
  }

  return (
    <div className="p-4 flex flex-col h-full">
      <h2 className="text-xl font-bold mb-6">Settings</h2>

      <div className="space-y-6 flex-1">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Thumbnail</label>
          <div className="mt-2 relative aspect-video w-full rounded-lg overflow-hidden group">
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
          <label htmlFor="model-name" className="text-xs font-medium text-muted-foreground">
            Model Name
          </label>
          <div className="relative mt-2">
            <Input
              id="model-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
              className="bg-transparent border pr-8"
            />
            <Pencil className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Light Intensity</label>
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
          <label className="text-xs font-medium text-muted-foreground">Background Color</label>
          <Input
            type="color"
            value={bgColor}
            onChange={(e) => onBgColorChange(e.target.value)}
            className="w-full h-10 p-1 mt-2 bg-transparent border"
          />
        </div>
      </div>

      <div className="mt-6">
        <Button variant="destructive" className="w-full" onClick={() => setShowDeleteConfirm(true)}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete Model
        </Button>
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-background text-foreground">
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
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
