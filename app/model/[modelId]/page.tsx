"use client"

import type React from "react"

import { useState, useRef, useEffect, Suspense, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Canvas, useFrame } from "@react-three/fiber"
import { useGLTF, OrbitControls, Html, useProgress, SpotLight, useHelper } from "@react-three/drei"
import {
  ChevronLeft,
  Palette,
  Download,
  ChevronDown,
  LoaderIcon,
  Plus,
  Eye,
  EyeOff,
  CopyIcon as Clone,
  Globe,
  Lock,
  RotateCcw,
  Trash2,
} from "lucide-react"
import useSWR from "swr"
import { Toaster, toast } from "sonner"
import * as THREE from "three"
import { useGesture } from "@use-gesture/react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { kelvinToRgb } from "@/lib/utils"
import { lightingPresets } from "@/lib/lighting-presets"
import type { Model, Light, ViewSettings } from "@/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

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

  useHelper(isSelected ? spotLightRef : null, THREE.SpotLightHelper, "yellow")

  useFrame(() => {
    target.current.position.set(...light.targetPosition)
    target.current.updateMatrixWorld()
  })

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
      />
      <primitive object={target.current} />
      <mesh position={light.position} onClick={onSelect} onPointerOver={(e) => e.stopPropagation()}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color={isSelected ? "yellow" : lightColor} wireframe />
      </mesh>
    </>
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
}: {
  light: Light
  onLightChange: (id: number, newValues: Partial<Omit<Light, "id">>) => void
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
        <label className="pt-2">Target (X, Z)</label>
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
          max={50}
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
  lights,
  onLightChange,
  addLight,
  removeLight,
  cloneLight,
  toggleLightVisibility,
  selectedLightId,
  onSelectLight,
  lightsEnabled,
  onLightsEnabledChange,
  environmentEnabled,
  onEnvironmentEnabledChange,
  bgType,
  onBgTypeChange,
  bgColor1,
  onBgColor1Change,
  bgColor2,
  onBgColor2Change,
  bgImage,
  onBgImageChange,
  onResetView,
}: {
  model: Model
  lights: Light[]
  onLightChange: (id: number, newValues: Partial<Omit<Light, "id">>) => void
  addLight: () => void
  removeLight: (id: number) => void
  cloneLight: (id: number) => void
  toggleLightVisibility: (id: number) => void
  selectedLightId: number | null
  onSelectLight: (id: number | null) => void
  lightsEnabled: boolean
  onLightsEnabledChange: (enabled: boolean) => void
  environmentEnabled: boolean
  onEnvironmentEnabledChange: (enabled: boolean) => void
  bgType: "color" | "gradient" | "image"
  onBgTypeChange: (type: "color" | "gradient" | "image") => void
  bgColor1: string
  onBgColor1Change: (value: string) => void
  bgColor2: string
  onBgColor2Change: (value: string) => void
  bgImage: string | null
  onBgImageChange: (value: string | null) => void
  onResetView: () => void
}) {
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
            <span className="text-xs truncate">{model.name}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <label>Visibility</label>
            <div className="flex items-center gap-1">
              {model.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              <span className="text-xs">{model.is_public ? "Public" : "Private"}</span>
            </div>
          </div>
        </div>
        <Separator className="bg-white/20" />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">View Settings</h3>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onResetView}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
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
                      <LightSettings light={light} onLightChange={onLightChange} />
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
          )}
        </div>
      </div>
    </div>
  )
}

export default function ModelViewerPage({ params }: { params: { modelId: string } }) {
  const router = useRouter()
  const { data: selectedModel } = useSWR<Model>(`/api/models/${params.modelId}`, fetcher)

  // Viewer settings state
  const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("pbr")
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(true)
  const [lightsEnabled, setLightsEnabled] = useState(true)
  const [environmentEnabled, setEnvironmentEnabled] = useState(true)
  const [bgType, setBgType] = useState<"color" | "gradient" | "image">("color")
  const [bgColor1, setBgColor1] = useState("#000000")
  const [bgColor2, setBgColor2] = useState("#1a1a1a")
  const [bgImage, setBgImage] = useState<string | null>(null)
  const [lights, setLights] = useState<Light[]>([])
  const [selectedLightId, setSelectedLightId] = useState<number | null>(null)
  const [currentPresetIndex, setCurrentPresetIndex] = useState(-1)

  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 })
  const [isDraggingPanel, setIsDraggingPanel] = useState(false)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const [isOrbitControlsEnabled, setIsOrbitControlsEnabled] = useState(true)
  const [isShiftDown, setIsShiftDown] = useState(false)

  const resetViewSettings = useCallback((settings: ViewSettings | null | undefined) => {
    const preset = lightingPresets[0]
    const defaultLights =
      preset?.lights.map((p, i) => ({
        ...p,
        id: Date.now() + i,
        visible: true,
      })) ?? []

    if (settings && settings.lights) {
      const newLights = settings.lights.map((l, i) => ({
        ...l,
        id: Date.now() + i,
        visible: true,
      }))
      setLights(newLights)
      setLightsEnabled(settings.lightsEnabled)
      setEnvironmentEnabled(settings.environmentEnabled)
      setBgType(settings.bgType)
      setBgColor1(settings.bgColor1)
      setBgColor2(settings.bgColor2)
      setSelectedLightId(newLights[0]?.id ?? null)
    } else {
      setLights(defaultLights)
      setLightsEnabled(true)
      setEnvironmentEnabled(true)
      setBgType("color")
      setBgColor1("#000000")
      setBgColor2("#1a1a1a")
      setSelectedLightId(defaultLights[0]?.id ?? null)
    }
    setCurrentPresetIndex(0)
  }, [])

  useEffect(() => {
    resetViewSettings(selectedModel?.view_settings)
  }, [selectedModel, resetViewSettings])

  const handleCloseViewer = () => router.push("/")

  const handleViewerKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Shift") setIsShiftDown(true)
    if (event.key === "Escape") handleCloseViewer()
  }, [])

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
    setLights(preset.lights.map((p, i) => ({ ...p, id: Date.now() + i, visible: true })))
    setCurrentPresetIndex(nextPresetIndex)
    toast.success(`Lighting preset: ${preset.name}`)
  }, [currentPresetIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") {
        event.preventDefault()
        cycleLightPreset()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [cycleLightPreset])

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
      position: [-5, 5, -5],
      targetPosition: [0, 0, 0],
      intensity: 1,
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
          {lightsEnabled &&
            lights.map((light) => (
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
            lights={lights}
            onLightChange={handleLightChange}
            addLight={addLight}
            removeLight={removeLight}
            cloneLight={cloneLight}
            toggleLightVisibility={toggleLightVisibility}
            selectedLightId={selectedLightId}
            onSelectLight={setSelectedLightId}
            lightsEnabled={lightsEnabled}
            onLightsEnabledChange={setLightsEnabled}
            environmentEnabled={environmentEnabled}
            onEnvironmentEnabledChange={setEnvironmentEnabled}
            bgType={bgType}
            onBgTypeChange={setBgType}
            bgColor1={bgColor1}
            onBgColor1Change={setBgColor1}
            bgColor2={bgColor2}
            onBgColor2Change={setBgColor2}
            bgImage={bgImage}
            onBgImageChange={setBgImage}
            onResetView={() => resetViewSettings(selectedModel.view_settings)}
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
