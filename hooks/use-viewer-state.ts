"use client"

import type { Light, Model, ViewSettings } from "@/types"
import { useCallback, useState } from "react"

const defaultLights: Light[] = [
    { id: Date.now(), visible: true, position: [-2, 3, 2], targetPosition: [0, 0, 0], intensity: 3, kelvin: 5500, decay: 1, angle: 45, penumbra: 0.5 },
    { id: Date.now() + 1, visible: true, position: [2, 2, -1], targetPosition: [0, 0, 0], intensity: 2, kelvin: 4000, decay: 1, angle: 60, penumbra: 0.3 },
]

export function useViewerState(_selectedModel: Model | undefined) {
    const [materialMode, setMaterialMode] = useState<"pbr" | "normal" | "white">("white")
    const [lightsEnabled, onLightsEnabledChange] = useState(true)
    const [environmentEnabled, onEnvironmentEnabledChange] = useState(false)
    const [bloomEnabled, onBloomEnabledChange] = useState(false)
    const [bgType, onBgTypeChange] = useState<"color" | "gradient" | "image">("color")
    const [bgColor1, onBgColor1Change] = useState("#000000")
    const [bgColor2, onBgColor2Change] = useState("#1a1a1a")
    const [bgImage, onBgImageChange] = useState<string | null>(null)
    const [lights, setLights] = useState<Light[]>(defaultLights)
    const [selectedLightId, setSelectedLightId] = useState<number | null>(null)
    const [fieldOfView, onFieldOfViewChange] = useState(50)

    const resetViewSettings = useCallback((s: ViewSettings | null | undefined) => {
        setLights(s?.lights?.map((l, i) => ({ ...l, id: Date.now() + i, visible: true })) ?? defaultLights)
        onLightsEnabledChange(s?.lightsEnabled ?? true)
        onEnvironmentEnabledChange(s?.environmentEnabled ?? false)
        onBloomEnabledChange(s?.bloomEnabled ?? false)
        onBgTypeChange(s?.bgType ?? "color")
        onBgColor1Change(s?.bgColor1 ?? "#000000")
        onBgColor2Change(s?.bgColor2 ?? "#1a1a1a")
        onBgImageChange(s?.bgImage ?? null)
        onFieldOfViewChange(s?.fieldOfView ?? 50)
        setMaterialMode(s?.materialMode ?? "white")
        setSelectedLightId(null)
    }, [])

    return {
        materialMode, setMaterialMode,
        lightsEnabled, onLightsEnabledChange,
        environmentEnabled, onEnvironmentEnabledChange,
        bloomEnabled, onBloomEnabledChange,
        bgType, onBgTypeChange,
        bgColor1, onBgColor1Change,
        bgColor2, onBgColor2Change,
        bgImage, onBgImageChange,
        lights, setLights,
        selectedLightId, setSelectedLightId,
        fieldOfView, onFieldOfViewChange,
        resetViewSettings,
    }
}
