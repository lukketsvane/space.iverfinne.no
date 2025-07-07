"use client"

import type React from "react"

import { useState, useRef, useEffect, Suspense } from "react"
import { Canvas } from "@react-three/fiber"
import { useGLTF, OrbitControls, Environment, Html } from "@react-three/drei"
import { PanelLeft, Upload, Folder, Settings, X, Trash2, Loader, ChevronLeft, Menu, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { Skeleton } from "@/components/ui/skeleton"
import { upload } from "@vercel/blob/client"
import useSWR, { mutate } from "swr"
import * as THREE from "three"

type Model = {
  id: string
  name: string
  url: string
  thumbnailUrl: string
  createdAt: string
}

type RenderMode = "pbr" | "normal" | "white"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function ModelViewer({
  model,
  renderMode,
  lightIntensity,
  bgColor,
}: {
  model: Model
  renderMode: RenderMode
  lightIntensity: number
  bgColor: string
}) {
  const { scene } = useGLTF(model.url)

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true

        if (renderMode === "normal") {
          mesh.material = new THREE.MeshNormalMaterial()
        } else if (renderMode === "white") {
          mesh.material = new THREE.MeshStandardMaterial({
            color: "white",
            metalness: 0.1,
            roughness: 0.5,
          })
        } else {
          // PBR - use original materials, just ensure they are standard
          if (!(mesh.material instanceof THREE.MeshStandardMaterial) && Array.isArray(mesh.material)) {
            // Handle multi-material objects if necessary
          }
        }
      }
    })
  }, [scene, renderMode])

  return (
    <Suspense
      fallback={
        <Html center>
          <Loader className="animate-spin" />
        </Html>
      }
    >
      <primitive object={scene} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 7.5]} intensity={lightIntensity} castShadow />
      <OrbitControls />
      <Environment preset="sunset" />
      <color attach="background" args={[bgColor]} />
    </Suspense>
  )
}

export default function ModelGalleryPage() {
  const { data: models, error, isLoading } = useSWR<Model[]>("/api/models", fetcher)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  // Viewer settings
  const [renderMode, setRenderMode] = useState<RenderMode>("pbr")
  const [lightIntensity, setLightIntensity] = useState(1.5)
  const [bgColor, setBgColor] = useState("#111111")
  const [modelName, setModelName] = useState("")

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile) {
      setIsSidebarOpen(false)
      setIsSettingsOpen(false)
    } else {
      setIsSidebarOpen(true)
      setIsSettingsOpen(true)
    }
  }, [isMobile])

  useEffect(() => {
    if (selectedModel) {
      setModelName(selectedModel.name)
      setBgColor("#111111")
      setLightIntensity(1.5)
      setRenderMode("pbr")
    }
  }, [selectedModel])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedModel) return

      if (event.key === "Escape") {
        setSelectedModel(null)
      }
      if (event.key === "ArrowRight") {
        const currentIndex = models?.findIndex((m) => m.id === selectedModel.id)
        if (models && currentIndex !== undefined && currentIndex < models.length - 1) {
          setSelectedModel(models[currentIndex + 1])
        }
      }
      if (event.key === "ArrowLeft") {
        const currentIndex = models?.findIndex((m) => m.id === selectedModel.id)
        if (models && currentIndex !== undefined && currentIndex > 0) {
          setSelectedModel(models[currentIndex - 1])
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedModel, models])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setUploadingFiles(Array.from(files).map((f) => ({ name: f.name, progress: 0 })))

    for (const file of Array.from(files)) {
      try {
        const newBlob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
        })

        const modelName = file.name.replace(/\.(glb|gltf)$/i, "")
        const response = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: modelName,
            url: newBlob.url,
            thumbnailUrl: `/placeholder.svg?width=200&height=200&query=${encodeURIComponent(modelName)}`,
          }),
        })

        if (!response.ok) {
          throw new Error("Failed to save model to database.")
        }

        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name))
        toast({ title: `"${file.name}" uploaded successfully!` })
      } catch (error) {
        console.error("Upload failed:", error)
        toast({
          title: `Upload failed for ${file.name}`,
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name))
      }
    }
    mutate("/api/models")
  }

  const handleThumbnailUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || !selectedModel) return
    const file = event.target.files[0]
    try {
      const newBlob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      })
      await handleUpdateModel({ thumbnailUrl: newBlob.url })
      toast({ title: "Thumbnail updated!" })
    } catch (error) {
      console.error("Thumbnail upload failed:", error)
      toast({ title: "Thumbnail upload failed", variant: "destructive" })
    }
  }

  const handleUpdateModel = async (updateData: Partial<Model>) => {
    if (!selectedModel) return
    try {
      const response = await fetch(`/api/models/${selectedModel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })
      if (!response.ok) throw new Error("Failed to update model")
      mutate("/api/models")
      if (updateData.name) {
        setSelectedModel((prev) => (prev ? { ...prev, name: updateData.name! } : null))
      }
    } catch (error) {
      console.error("Update failed:", error)
      toast({ title: "Failed to update model", variant: "destructive" })
    }
  }

  const handleDeleteModel = async () => {
    if (!selectedModel) return
    try {
      const response = await fetch(`/api/models/${selectedModel.id}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Failed to delete model")
      toast({ title: `"${selectedModel.name}" deleted.` })
      setSelectedModel(null)
      mutate("/api/models")
    } catch (error) {
      console.error("Delete failed:", error)
      toast({ title: "Failed to delete model", variant: "destructive" })
    }
  }

  const handleDownloadModel = () => {
    if (!selectedModel) return
    const link = document.createElement("a")
    link.href = selectedModel.url
    link.download = selectedModel.name + ".glb"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const renderGallery = () => (
    <div className="flex h-screen bg-neutral-900 text-white">
      <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept=".glb,.gltf" multiple />
      {/* Sidebar */}
      <aside
        className={`bg-neutral-950 p-4 flex flex-col transition-all duration-300 ${
          isSidebarOpen ? "w-64" : "w-0 -translate-x-full"
        } ${isMobile ? "absolute h-full z-20" : "relative"}`}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <PanelLeft />
            <h1 className="font-bold text-lg">My Models</h1>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 mb-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={16} /> Upload
        </Button>
        <Button variant="secondary" className="w-full justify-start gap-2 mb-2">
          <Folder size={16} /> Assets
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 mb-4">
          <Folder size={16} /> New folder
        </Button>

        {uploadingFiles.length > 0 && (
          <div className="space-y-2 mt-auto">
            <p className="text-sm font-medium">Uploading...</p>
            {uploadingFiles.map((file, index) => (
              <div key={index} className="text-xs text-neutral-400 flex items-center gap-2">
                <Loader className="animate-spin" size={14} />
                <span>{file.name}</span>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 left-4 z-30"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <Menu />
          </Button>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {isLoading &&
            Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
          {models && models.length > 0
            ? models.map((model) => (
                <Card
                  key={model.id}
                  className="bg-neutral-800 border-neutral-700 hover:bg-neutral-700 cursor-pointer"
                  onClick={() => setSelectedModel(model)}
                >
                  <CardContent className="p-0 aspect-square">
                    <img
                      src={model.thumbnailUrl || "/placeholder.svg"}
                      alt={model.name}
                      className="w-full h-full object-cover rounded-t-lg"
                      onError={(e) => {
                        e.currentTarget.src = "/placeholder.svg?width=200&height=200"
                      }}
                    />
                  </CardContent>
                  <CardFooter className="p-2">
                    <p className="text-xs truncate">{model.name}</p>
                  </CardFooter>
                </Card>
              ))
            : !isLoading && (
                <div className="col-span-full text-center py-20 text-neutral-500">
                  <p>Your gallery is empty.</p>
                  <Button variant="link" className="text-blue-400" onClick={() => fileInputRef.current?.click()}>
                    Upload your first model
                  </Button>
                </div>
              )}
        </div>
      </main>
    </div>
  )

  const renderViewer = () => (
    <div className="h-screen w-screen bg-neutral-900 flex">
      <input type="file" ref={thumbnailInputRef} onChange={handleThumbnailUpload} className="hidden" accept="image/*" />
      {/* Back Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 left-4 z-10 text-white"
        onClick={() => setSelectedModel(null)}
      >
        <ChevronLeft />
      </Button>

      {/* Viewer */}
      <div className="flex-1 h-full relative">
        {selectedModel && (
          <Canvas shadows camera={{ position: [0, 1, 4], fov: 50 }}>
            <ModelViewer
              model={selectedModel}
              renderMode={renderMode}
              lightIntensity={lightIntensity}
              bgColor={bgColor}
            />
          </Canvas>
        )}
        {/* Bottom Controls */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-neutral-800/50 backdrop-blur-sm p-2 rounded-full text-white">
          <Button
            variant={renderMode === "pbr" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setRenderMode("pbr")}
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-red-500 to-blue-500" />
          </Button>
          <Button
            variant={renderMode === "normal" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setRenderMode("normal")}
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-yellow-500" />
          </Button>
          <Button
            variant={renderMode === "white" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setRenderMode("white")}
          >
            <div className="w-5 h-5 rounded-full bg-white border border-neutral-400" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDownloadModel}>
            <Download size={18} />
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {isMobile && !isSettingsOpen && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10 text-white"
          onClick={() => setIsSettingsOpen(true)}
        >
          <Settings />
        </Button>
      )}
      <aside
        className={`bg-neutral-950 p-4 flex flex-col text-white transition-all duration-300 ${
          isSettingsOpen ? "w-80" : "w-0 translate-x-full"
        } ${isMobile ? "absolute right-0 h-full z-20" : "relative"}`}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-lg">Settings</h2>
          <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(false)}>
            <X />
          </Button>
        </div>
        {selectedModel && (
          <div className="space-y-6 flex-1 overflow-y-auto">
            <div>
              <Label htmlFor="model-name">Name</Label>
              <Input
                id="model-name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                onBlur={() => handleUpdateModel({ name: modelName })}
                className="bg-neutral-800 border-neutral-700"
              />
            </div>
            <div>
              <Label>Thumbnail</Label>
              <div className="aspect-video rounded-lg bg-neutral-800 overflow-hidden relative group">
                <img
                  src={selectedModel.thumbnailUrl || "/placeholder.svg"}
                  alt="Thumbnail"
                  className="w-full h-full object-cover"
                />
                <Button
                  variant="secondary"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => thumbnailInputRef.current?.click()}
                >
                  Change
                </Button>
              </div>
            </div>
            <div>
              <Label>Background Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="p-1 h-10 w-10 bg-transparent border-none"
                />
                <Input
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="bg-neutral-800 border-neutral-700"
                />
              </div>
            </div>
            <div>
              <Label>Light Intensity</Label>
              <Slider
                value={[lightIntensity]}
                onValueChange={(v) => setLightIntensity(v[0])}
                min={0}
                max={5}
                step={0.1}
              />
            </div>
            <div className="pt-4 border-t border-neutral-800">
              <Button variant="destructive" className="w-full" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 size={16} className="mr-2" /> Delete Model
              </Button>
            </div>
          </div>
        )}
      </aside>
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{selectedModel?.name}" and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteModel}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )

  return (
    <>
      <Toaster />
      {selectedModel ? renderViewer() : renderGallery()}
    </>
  )
}
