"use client"

import type React from "react"

import { Suspense } from "react"
import { useRouter, useParams } from "next/navigation"
import { Canvas } from "@react-three/fiber"
import { useGLTF, OrbitControls, SpotLight, useProgress, Html } from "@react-three/drei"
import useSWR from "swr"
import * as THREE from "three"
import { ChevronLeft, LoaderIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { kelvinToRgb } from "@/lib/utils"
import type { Model, ViewSettings } from "@/types"
import { lightingPresets } from "@/lib/lighting-presets"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

function Loader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="text-white text-lg">{progress.toFixed(2)} % loaded</div>
    </Html>
  )
}

function ModelScene({ modelUrl, viewSettings }: { modelUrl: string; viewSettings: ViewSettings | null }) {
  const { scene } = useGLTF(modelUrl)

  const defaultLights = lightingPresets[0].lights

  const lightsToRender =
    viewSettings?.lightsEnabled && viewSettings.lights && viewSettings.lights.length > 0
      ? viewSettings.lights
      : defaultLights

  return (
    <>
      <primitive object={scene} />
      <OrbitControls />
      <ambientLight intensity={0.1} />
      {lightsToRender.map((light, index) => {
        const { r, g, b } = kelvinToRgb(light.kelvin)
        const lightColor = new THREE.Color(r, g, b)
        const target = new THREE.Object3D()
        target.position.set(...light.targetPosition)

        return (
          <group key={index}>
            <SpotLight
              position={light.position as [number, number, number]}
              target={target}
              color={lightColor}
              intensity={light.intensity}
              angle={THREE.MathUtils.degToRad(light.angle)}
              penumbra={light.penumbra}
              decay={light.decay}
              castShadow
            />
            <primitive object={target} />
          </group>
        )
      })}
    </>
  )
}

export default function ModelViewerPage() {
  const router = useRouter()
  const params = useParams()
  const modelId = params.modelId as string

  const { data: model, error } = useSWR<Model>(modelId ? `/api/models/${modelId}` : null, fetcher)

  if (error) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-black text-white">
        <p className="text-red-400 mb-4">Failed to load model.</p>
        <Button variant="outline" onClick={() => router.push("/view")}>
          Back to Gallery
        </Button>
      </div>
    )
  }

  if (!model) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-black">
        <LoaderIcon className="w-12 h-12 animate-spin text-white" />
      </div>
    )
  }

  const viewSettings = model.view_settings
  const backgroundStyle: React.CSSProperties = {}
  if (viewSettings?.environmentEnabled) {
    if (viewSettings.bgType === "gradient") {
      backgroundStyle.background = `linear-gradient(to bottom, ${viewSettings.bgColor1}, ${viewSettings.bgColor2})`
    } else {
      backgroundStyle.backgroundColor = viewSettings.bgColor1
    }
  } else {
    backgroundStyle.backgroundColor = "#000000"
  }

  return (
    <div className="w-full h-screen relative" style={backgroundStyle}>
      <Canvas shadows camera={{ fov: 50, position: [0, 2, 8] }}>
        <Suspense fallback={<Loader />}>
          <ModelScene modelUrl={model.model_url} viewSettings={viewSettings} />
        </Suspense>
      </Canvas>
      <div className="absolute top-4 left-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/view")}
          className="text-white hover:bg-white/20"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <h1 className="text-white text-lg font-medium bg-black/30 backdrop-blur-sm px-4 py-2 rounded-lg">
          {model.name}
        </h1>
      </div>
    </div>
  )
}
