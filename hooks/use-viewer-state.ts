"use client"

import { lightingPresets } from "@/lib/lighting-presets"
import type { Light, Model, ViewSettings } from "@/types"
import { useCallback, useMemo, useState } from "react"

export function useViewerState(_selectedModel: Model | undefined) {
    const defaultLights: Light[] = useMemo(() => {
        const preset = lightingPresets.find((p) => p.name === "3-Point")?.lights ?? []
        return preset.map((l, i) => ({ ...l, id: Date.now() + i, visible: true }))
    }, [])

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

    const resetViewSettings = useCallback(
        (s: ViewSettings | null | undefined) => {
            setLights(s?.lights?.map((l, i) => ({ ...l, id: Date.now() + i, visible: true })) ?? defaultLights)
            onLightsEnabledChange(s?.lightsEnabled ?? true)
            onEnvironmentEnabledChange(s?.environmentEnabled ?? false)
            onBloomEnabledChange(s?.bloomEnabled ?? false)
            onBgTypeChange(s?.bgType ?? "color")
            onBgColor1Change(s?.bgColor1 ?? "#000000")
            onBgColor2Change(s?.bgColor2 ?? "#1a1a1a")
            onBgImageChange(s?.bgImage ?? null)
            setMaterialMode(s?.materialMode ?? "white")
            setSelectedLightId(null)
        },
        [defaultLights],
    )

    return {
        materialMode,
        setMaterialMode,
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
        lights,
        setLights,
        selectedLightId,
        setSelectedLightId,
        resetViewSettings,
    }
}
