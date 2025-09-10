"use client"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import type { Light, Model } from "@/types"
import { useGesture } from "@use-gesture/react"
import { Camera, CopyIcon as Clone, Crosshair, Eye, EyeOff, Globe, Lock, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react"
import React, { useRef, useState } from "react"

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
    React.useEffect(() => setCurrentValue(value.toString()), [value])
    React.useEffect(() => {
        if (isEditing) inputRef.current?.select()
    }, [isEditing])
    const handleSave = () => {
        onSave(currentValue)
        setIsEditing(false)
    }
    return isEditing ? (
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
            className={`h-6 text-xs w-full text-right bg-white/20 border-white/30 ${inputClassName ?? ""}`}
        />
    ) : (
        <span
            onClick={() => setIsEditing(true)}
            className={`cursor-pointer text-xs w-full text-right truncate ${className ?? ""}`}
            title={typeof value === "number" ? (value as number).toFixed(2) : (value as string)}
        >
            {typeof value === "number" ? (value as number).toFixed(units === "K" ? 0 : 1) : value}
            {units}
        </span>
    )
}

function DirectionalPad({ value, onChange }: { value: { x: number; z: number }; onChange: (v: { x: number; z: number }) => void }) {
    const padRef = useRef<HTMLDivElement>(null)
    const bind = useGesture(
        {
            onDrag: ({ xy }) => {
                if (!padRef.current) return
                const rect = padRef.current.getBoundingClientRect(),
                    half = rect.width / 2
                let x = xy[0] - rect.left - half,
                    z = xy[1] - rect.top - half
                const d = Math.hypot(x, z)
                if (d > half) {
                    x = (x / d) * half
                    z = (z / d) * half
                }
                onChange({ x: (x / half) * 5, z: (z / half) * 5 })
            },
        },
        { drag: { filterTaps: true } },
    )
    const handleX = (value.x / 5) * 50,
        handleZ = (value.z / 5) * 50
    return (
        <div ref={padRef} {...bind()} className="w-24 h-24 bg-white/10 rounded-full relative cursor-pointer border border-white/20 flex items-center justify-center">
            <div className="w-full h-px bg-white/20 absolute" />
            <div className="h-full w-px bg-white/20 absolute" />
            <div className="w-4 h-4 rounded-full absolute border-2 border-white bg-blue-500" style={{ transform: `translate(${handleX}px, ${handleZ}px)`, touchAction: "none" }} />
        </div>
    )
}

function LightSettings({ light, onLightChange, onFocus }: { light: Light; onLightChange: (id: number, newValues: Partial<Omit<Light, "id">>) => void; onFocus: (id: number) => void }) {
    return (
        <div className="space-y-3 text-xs mt-2 bg-white/5 p-3 rounded-md">
            <div className="flex items-center justify-between">
                <label>Position (X, Y, Z)</label>
                <div className="flex gap-1 w-1/2">
                    <EditableValue value={light.position[0]} onSave={(v) => onLightChange(light.id, { position: [Number(v), light.position[1], light.position[2]] })} />
                    <EditableValue value={light.position[1]} onSave={(v) => onLightChange(light.id, { position: [light.position[0], Number(v), light.position[2]] })} />
                    <EditableValue value={light.position[2]} onSave={(v) => onLightChange(light.id, { position: [light.position[0], light.position[1], Number(v)] })} />
                </div>
            </div>
            <div className="flex items-start justify-between">
                <div className="pt-2 space-y-2">
                    <label>Target</label>
                    <Button size="icon" className="text-xs h-6 w-6" variant="ghost" onClick={() => onFocus(light.id)}>
                        <Crosshair className="h-3 w-3" />
                    </Button>
                </div>
                <DirectionalPad value={{ x: light.targetPosition[0], z: light.targetPosition[2] }} onChange={({ x, z }) => onLightChange(light.id, { targetPosition: [x, light.targetPosition[1], z] })} />
            </div>
            <div className="flex items-center justify-between">
                <label>Target Height (Y)</label>
                <Slider value={[light.targetPosition[1]]} onValueChange={([v]) => onLightChange(light.id, { targetPosition: [light.targetPosition[0], v, light.targetPosition[2]] })} min={-10} max={10} step={0.1} className="w-1/2" />
            </div>
            <div className="flex items-center justify-between">
                <label>Intensity</label>
                <Slider value={[light.intensity]} onValueChange={([v]) => onLightChange(light.id, { intensity: v })} min={0} max={250} step={0.1} className="w-1/2" />
            </div>
            <div className="flex items-center justify-between">
                <label>Color Temp</label>
                <Slider value={[light.kelvin]} onValueChange={([v]) => onLightChange(light.id, { kelvin: v })} min={1000} max={12000} step={100} className="w-1/2" />
            </div>
            <div className="flex items-center justify-between">
                <label>Cone Angle</label>
                <Slider value={[light.angle]} onValueChange={([v]) => onLightChange(light.id, { angle: v })} min={0} max={90} step={1} className="w-1/2" />
            </div>
            <div className="flex items-center justify-between">
                <label>Penumbra</label>
                <Slider value={[light.penumbra]} onValueChange={([v]) => onLightChange(light.id, { penumbra: v })} min={0} max={1} step={0.01} className="w-1/2" />
            </div>
            <div className="flex items-center justify-between">
                <label>Distance</label>
                <Slider value={[light.distance ?? 0]} onValueChange={([v]) => onLightChange(light.id, { distance: v })} min={0} max={20} step={0.1} className="w-1/2" />
            </div>
        </div>
    )
}

export interface SettingsPanelProps {
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
    onSaveView: () => void
    onDeleteView: () => void
    onResetView: () => void
    onApplyPreset: (name: string) => void
    presets: string[]
}

export function SettingsPanel(p: SettingsPanelProps) {
    const {
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
        onSaveView,
        onDeleteView,
        onResetView,
        onApplyPreset,
        presets,
    } = p

    const [preset, setPreset] = useState<string>(presets[0] ?? "")
    const thumbnailInputRef = useRef<HTMLInputElement>(null)
    const bgImageInputRef = useRef<HTMLInputElement>(null)

    const [lightsSectionOpen, setLightsSectionOpen] = useState(false) // collapsed by default

    const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const r = new FileReader()
        r.onloadend = () => onBgImageChange(r.result as string)
        r.readAsDataURL(file)
    }

    return (
        <div className="px-4 pb-4 flex flex-col h-full text-white overflow-y-auto">
            <div className="space-y-4 flex-1 overflow-y-auto pr-2 -mr-2">
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <label>Name</label>
                        <div className="w-1/2">
                            <EditableValue value={model.name} onSave={(v) => onUpdate(model.id, { name: v })} />
                        </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <label>Visibility</label>
                        <Button size="sm" className="h-6 bg-transparent" variant="outline" onClick={() => onUpdate(model.id, { is_public: !model.is_public })}>
                            {model.is_public ? <Globe className="h-3 w-3 mr-1" /> : <Lock className="h-3 w-3 mr-1" />}
                            {model.is_public ? "Public" : "Private"}
                        </Button>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <label>Thumbnail</label>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={model.thumbnail_url.includes("/placeholder.svg")} onClick={onDeleteThumbnail}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                            <Button size="icon" className="h-6 w-6" variant="ghost" onClick={onCaptureThumbnail}>
                                <Camera className="h-3 w-3" />
                            </Button>
                            <Button size="icon" className="h-6 w-6" variant="ghost" onClick={() => thumbnailInputRef.current?.click()}>
                                <Upload className="h-3 w-3" />
                            </Button>
                            <input type="file" ref={thumbnailInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files && onThumbnailUpload(e.target.files[0])} />
                        </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                        <label>Delete Model</label>
                        <Button variant="ghost" size="sm" className="h-6" onClick={onDelete}>
                            Delete
                        </Button>
                    </div>
                </div>

                <Separator className="bg-white/20" />

                {/* Lights section (collapsed by default) */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setLightsSectionOpen((s) => !s)}>
                        <h3 className="text-sm font-semibold">Lights</h3>
                        <div className="flex items-center gap-2">
                            <Switch checked={lightsEnabled} onCheckedChange={onLightsEnabledChange} />
                            <span className={`transition-transform ${lightsSectionOpen ? "rotate-180" : ""}`}>⌄</span>
                        </div>
                    </div>
                    {lightsEnabled && lightsSectionOpen && (
                        <>
                            <div className="flex items-center justify-between text-xs">
                                <label>Presets</label>
                                <div className="flex items-center gap-2 w-1/2">
                                    <Select value={preset} onValueChange={setPreset}>
                                        <SelectTrigger className="h-6 text-xs bg-white/10 border-white/30 w-2/3">
                                            <SelectValue placeholder="Choose preset" />
                                        </SelectTrigger>
                                        <SelectContent>{presets.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Button variant="ghost" size="sm" className="h-6" onClick={() => preset && onApplyPreset(preset)}>
                                        Apply
                                    </Button>
                                </div>
                            </div>
                            <Accordion type="single" collapsible className="w-full" value={selectedLightId !== null ? String(selectedLightId) : ""}>
                                {lights.map((light, i) => (
                                    <AccordionItem key={light.id} value={String(light.id)} className="border-b-white/10">
                                        <AccordionTrigger className="flex-1 px-3 py-2 text-xs hover:bg-white/5 rounded-t-md" onClick={() => onSelectLight(light.id === selectedLightId ? null : light.id)}>
                                            <div className="flex items-center justify-between w-full">
                                                <span>Light {i + 1}</span>
                                                <div className="flex items-center gap-1 pr-3" onClick={(e) => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleLightVisibility(light.id)}>
                                                        {light.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => cloneLight(light.id)}>
                                                        <Clone className="h-3 w-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLight(light.id)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <LightSettings light={light} onLightChange={onLightChange} onFocus={onFocusLight} />
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                            <div className="flex justify-end pt-2">
                                <Button size="icon" className="h-6 w-6" variant="ghost" onClick={addLight} disabled={lights.length >= 5}>
                                    <Plus className="w-3 h-3" />
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
                                    <input type="color" value={bgColor1} onChange={(e) => onBgColor1Change(e.target.value)} className="w-6 h-6 p-0 bg-transparent border-none" />
                                </div>
                            )}
                            {bgType === "gradient" && (
                                <>
                                    <div className="flex items-center justify-between text-xs">
                                        <label>Top Color</label>
                                        <input type="color" value={bgColor1} onChange={(e) => onBgColor1Change(e.target.value)} className="w-6 h-6 p-0 bg-transparent border-none" />
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <label>Bottom Color</label>
                                        <input type="color" value={bgColor2} onChange={(e) => onBgColor2Change(e.target.value)} className="w-6 h-6 p-0 bg-transparent border-none" />
                                    </div>
                                </>
                            )}
                            {bgType === "image" && (
                                <div className="flex items-center justify-between text-xs">
                                    <label>Image</label>
                                    <Button size="icon" className="h-6 w-6" variant="ghost" onClick={() => bgImageInputRef.current?.click()}>
                                        <Upload className="h-3 w-3" />
                                    </Button>
                                    <input type="file" ref={bgImageInputRef} className="hidden" accept="image/*" onChange={handleBgImageUpload} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!model.view_settings} onClick={onDeleteView}>
                        <Trash2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onResetView}>
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onSaveView}>
                        <Save className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
