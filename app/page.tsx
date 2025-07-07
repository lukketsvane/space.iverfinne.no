"use client"

import type React from "react"

import { useState, useRef, useEffect, Suspense } from "react"
import { Canvas } from "@react-three/fiber"
import { useGLTF, OrbitControls, Environment, Html } from "@react-three/drei"
import * as THREE from "three"
import {
  Box,
  Upload,
  Folder,
  Plus,
  Loader,
  Download,
  Palette,
  Eye,
  Sparkles,
  ArrowLeft,
  Trash2,
  Menu,
  X,
  Settings,
} from "lucide-react"
import { upload } from "@vercel/blob/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

// --- TYPES ---
interface Model {
  id: string
  name: string
  url: string
  thumbnailUrl: string
}

type RenderMode = "pbr" | "normal" | "white"

// --- INITIAL DATA ---
const initialModels: Model[] = []

// --- 3D COMPONENTS ---

function ModelComponent({ url, renderMode }: { url: string; renderMode: RenderMode }) {
  const { scene } = useGLTF(url)
  const originalMaterials = useRef<Map<string, THREE.Material>>(new Map())

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        if (!originalMaterials.current.has(child.uuid)) {
          originalMaterials.current.set(child.uuid, (child as THREE.Mesh).material as THREE.Material)
        }
      }
    })
  }, [scene])

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const originalMaterial = originalMaterials.current.get(child.uuid)
        if (renderMode === "pbr" && originalMaterial) {
          ;(child as THREE.Mesh).material = originalMaterial
        } else if (renderMode === "normal") {
          ;(child as THREE.Mesh).material = new THREE.MeshNormalMaterial()
        } else if (renderMode === "white") {
          ;(child as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: "white" })
        }
      }
    })
  }, [renderMode, scene])

  return <primitive object={scene} />
}

function LoaderComponent() {
  return (
    <Html center>
      <div className="flex items-center justify-center gap-2 text-gray-400">
        <Loader className="w-8 h-8 animate-spin" />
        <span>Loading...</span>
      </div>
    </Html>
  )
}

function ViewerCanvas({
  model,
  renderMode,
  bgColor,
  lightIntensity,
}: {
  model: Model
  renderMode: RenderMode
  bgColor: string
  lightIntensity: number
}) {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 50 }} style={{ background: bgColor }} shadows>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[5, 5, 5]}
        intensity={lightIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <Suspense fallback={<LoaderComponent />}>
        {model.url ? (
          <ModelComponent url={model.url} renderMode={renderMode} />
        ) : (
          <Html center>
            <div className="text-red-400">No model file available.</div>
          </Html>
        )}
        <Environment preset="studio" />
      </Suspense>
      <OrbitControls />
    </Canvas>
  )
}

// --- UI COMPONENTS ---

function Sidebar({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <aside className="w-64 bg-[#111111] p-4 flex flex-col shrink-0 h-full">
      <div className="flex items-center gap-2 mb-8">
        <Box className="w-8 h-8 text-white" />
        <span className="text-xl font-bold text-white">Model Viewer</span>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="ghost" className="justify-start gap-2" onClick={onUploadClick}>
          <Upload className="w-4 h-4" />
          Upload
        </Button>
        <Button variant="ghost" className="justify-start gap-2 bg-[#2a2a2a]">
          <Folder className="w-4 h-4" />
          Assets
        </Button>
        <Button variant="ghost" className="justify-start gap-2">
          <Plus className="w-4 h-4" />
          New folder
        </Button>
      </div>
      <div className="mt-auto">
        <div className="w-full h-40 bg-[#1c1c1c] rounded-lg flex items-center justify-center">
          <Folder className="w-16 h-16 text-gray-600" />
        </div>
      </div>
    </aside>
  )
}

function SettingsPanel({
  model,
  onUpdateModel,
  onDeleteModel,
  bgColor,
  onBgColorChange,
  lightIntensity,
  onLightIntensityChange,
  onClose,
}: {
  model: Model
  onUpdateModel: (id: string, updates: Partial<Model>) => void
  onDeleteModel: (id: string) => void
  bgColor: string
  onBgColorChange: (color: string) => void
  lightIntensity: number
  onLightIntensityChange: (intensity: number) => void
  onClose?: () => void
}) {
  const [name, setName] = useState(model.name)

  useEffect(() => {
    setName(model.name)
  }, [model])

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
  }

  const handleNameBlur = () => {
    if (name.trim() && name !== model.name) {
      onUpdateModel(model.id, { name: name.trim() })
    } else {
      setName(model.name)
    }
  }

  const handleDeleteClick = () => {
    if (window.confirm(`Are you sure you want to delete "${model.name}"? This action cannot be undone.`)) {
      onDeleteModel(model.id)
    }
  }

  return (
    <div className="w-full h-full flex flex-col text-white">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Settings</h3>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>
      <div className="space-y-6 flex-1 overflow-y-auto">
        <div>
          <label htmlFor="modelName" className="text-sm text-gray-400 block mb-2">
            Name
          </label>
          <Input
            id="modelName"
            type="text"
            value={name}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 block mb-2">Background color</label>
          <Input
            type="color"
            value={bgColor}
            onChange={(e) => onBgColorChange(e.target.value)}
            className="w-full h-10 p-0 border-none cursor-pointer bg-gray-800"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400 block mb-2">Light Intensity</label>
          <Slider
            value={[lightIntensity]}
            onValueChange={(value) => onLightIntensityChange(value[0])}
            max={5}
            step={0.1}
          />
        </div>
      </div>
      <div className="pt-4 mt-auto border-t border-gray-700">
        <Button variant="destructive" className="w-full justify-center gap-2" onClick={handleDeleteClick}>
          <Trash2 className="w-4 h-4" />
          Delete Model
        </Button>
      </div>
    </div>
  )
}

// --- MAIN PAGE COMPONENT ---

export default function ModelViewerPage() {
  const [models, setModels] = useState<Model[]>(initialModels)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [renderMode, setRenderMode] = useState<RenderMode>("pbr")
  const [bgColor, setBgColor] = useState("#000000")
  const [lightIntensity, setLightIntensity] = useState(1.5)
  const inputFileRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useEffect(() => {
    const storedModels = localStorage.getItem("3d-models")
    if (storedModels) {
      setModels(JSON.parse(storedModels))
    } else {
      setModels(initialModels)
      localStorage.setItem("3d-models", JSON.stringify(initialModels))
    }
  }, [])

  const updateLocalStorage = (updatedModels: Model[]) => {
    localStorage.setItem("3d-models", JSON.stringify(updatedModels))
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedModel) return

      if (event.key === "Escape") {
        setSelectedModel(null)
      }

      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if (models.length === 0) return
        const currentIndex = models.findIndex((m) => m.id === selectedModel.id)
        if (currentIndex === -1) return

        let nextIndex
        if (event.key === "ArrowRight") {
          nextIndex = (currentIndex + 1) % models.length
        } else {
          nextIndex = (currentIndex - 1 + models.length) % models.length
        }
        setSelectedModel(models[nextIndex])
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectedModel, models])

  const handleUploadClick = () => {
    inputFileRef.current?.click()
    setIsMobileMenuOpen(false)
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return
    const file = event.target.files[0]
    if (!file) return

    const modelName = prompt("Enter a name for the model:", file.name.replace(/\.[^/.]+$/, ""))
    if (!modelName) return

    setIsUploading(true)
    try {
      const newBlob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      })

      const newModel: Model = {
        id: newBlob.pathname,
        name: modelName,
        url: newBlob.url,
        thumbnailUrl: `/placeholder.svg?width=200&height=200&query=3d+model+of+${encodeURIComponent(modelName)}`,
      }
      setModels((prevModels) => {
        const updatedModels = [...prevModels, newModel]
        updateLocalStorage(updatedModels)
        return updatedModels
      })
    } catch (error) {
      console.error("Upload failed:", error)
      alert("Upload failed. Please check the console for details.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleUpdateModel = (id: string, updates: Partial<Model>) => {
    setModels((prevModels) => {
      const updatedModels = prevModels.map((m) => (m.id === id ? { ...m, ...updates } : m))
      updateLocalStorage(updatedModels)
      return updatedModels
    })
    if (selectedModel?.id === id) {
      setSelectedModel((prev) => (prev ? { ...prev, ...updates } : null))
    }
  }

  const handleDeleteModel = (id: string) => {
    setModels((prevModels) => {
      const updatedModels = prevModels.filter((m) => m.id !== id)
      updateLocalStorage(updatedModels)
      return updatedModels
    })
    setSelectedModel(null)
    setIsSettingsOpen(false)
  }

  const handleDownload = () => {
    if (selectedModel?.url) {
      const link = document.createElement("a")
      link.href = selectedModel.url
      link.download = `${selectedModel.name}.glb`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  if (selectedModel) {
    return (
      <div className="w-full h-screen flex bg-black text-white overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex flex-col p-4 border-r border-gray-800">
          <Button variant="ghost" size="icon" onClick={() => setSelectedModel(null)} className="mb-8">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Sidebar onUploadClick={handleUploadClick} />
        </div>

        <main className="flex-1 relative">
          <ViewerCanvas
            model={selectedModel}
            renderMode={renderMode}
            bgColor={bgColor}
            lightIntensity={lightIntensity}
          />

          {/* Mobile Header */}
          <div className="md:hidden absolute top-4 left-4 z-10">
            <Button variant="ghost" size="icon" onClick={() => setSelectedModel(null)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </div>
          <div className="md:hidden absolute top-4 right-4 z-10">
            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)}>
              <Settings className="w-5 h-5" />
            </Button>
          </div>

          {/* Desktop Settings */}
          <div className="hidden md:block absolute top-6 right-6 bg-[#1c1c1c] p-6 rounded-lg w-72">
            <SettingsPanel
              model={selectedModel}
              onUpdateModel={handleUpdateModel}
              onDeleteModel={handleDeleteModel}
              bgColor={bgColor}
              onBgColorChange={setBgColor}
              lightIntensity={lightIntensity}
              onLightIntensityChange={setLightIntensity}
            />
          </div>

          {/* Mobile Settings Overlay */}
          {isSettingsOpen && (
            <div className="md:hidden fixed inset-0 z-30">
              <div className="absolute inset-0 bg-black/60" onClick={() => setIsSettingsOpen(false)} />
              <div className="absolute top-0 right-0 h-full w-full max-w-sm bg-[#111111] p-4">
                <SettingsPanel
                  model={selectedModel}
                  onUpdateModel={handleUpdateModel}
                  onDeleteModel={handleDeleteModel}
                  bgColor={bgColor}
                  onBgColorChange={setBgColor}
                  lightIntensity={lightIntensity}
                  onLightIntensityChange={setLightIntensity}
                  onClose={() => setIsSettingsOpen(false)}
                />
              </div>
            </div>
          )}

          {/* Bottom Controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#1c1c1c] p-2 rounded-full border border-gray-700 z-10">
            <Button
              variant="ghost"
              size="icon"
              className={cn("rounded-full", renderMode === "pbr" && "bg-gray-600")}
              onClick={() => setRenderMode("pbr")}
            >
              <Sparkles className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("rounded-full", renderMode === "normal" && "bg-gray-600")}
              onClick={() => setRenderMode("normal")}
            >
              <Palette className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("rounded-full", renderMode === "white" && "bg-gray-600")}
              onClick={() => setRenderMode("white")}
            >
              <Eye className="w-5 h-5" />
            </Button>
            <div className="w-px h-6 bg-gray-600 mx-2" />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={handleDownload}
              disabled={!selectedModel.url}
            >
              <Download className="w-5 h-5" />
            </Button>
          </div>
        </main>
        <input type="file" ref={inputFileRef} onChange={handleFileChange} className="hidden" accept=".glb" />
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row bg-black text-white">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar onUploadClick={handleUploadClick} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30">
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute top-0 left-0 h-full z-40">
            <Sidebar onUploadClick={handleUploadClick} />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Box className="w-6 h-6 text-white" />
            <span className="font-bold text-white">Model Viewer</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)}>
            <Menu className="w-6 h-6" />
          </Button>
        </header>

        {models.length === 0 && !isUploading ? (
          <div className="flex flex-col items-center justify-center flex-1 text-gray-500 text-center">
            <Folder className="w-16 h-16 md:w-24 md:h-24 mb-4" />
            <h2 className="text-xl md:text-2xl font-semibold">Your gallery is empty</h2>
            <p className="mt-2 text-sm md:text-base">Upload your first 3D model to get started.</p>
            <Button className="mt-6" onClick={handleUploadClick}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Model
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 md:gap-6">
            {isUploading && (
              <div className="aspect-square bg-[#1c1c1c] rounded-lg flex flex-col items-center justify-center text-gray-400">
                <Loader className="w-8 h-8 animate-spin mb-2" />
                <span>Uploading...</span>
              </div>
            )}
            {models.map((model) => (
              <div key={model.id} className="group cursor-pointer" onClick={() => setSelectedModel(model)}>
                <div className="aspect-square bg-[#1c1c1c] rounded-lg overflow-hidden flex items-center justify-center">
                  <img
                    src={model.thumbnailUrl || "/placeholder.svg"}
                    alt={model.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <p className="text-center mt-2 text-sm text-gray-300 truncate">{model.name}</p>
              </div>
            ))}
          </div>
        )}
      </main>
      <input type="file" ref={inputFileRef} onChange={handleFileChange} className="hidden" accept=".glb" />
    </div>
  )
}
