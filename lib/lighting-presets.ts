import type { Light } from "@/types"

type LightPreset = Omit<Light, "id" | "visible">

const defaultStudioLights: LightPreset[] = [
  {
    position: [5, 5, 5],
    targetPosition: [0, 0, 0],
    intensity: 10.0,
    kelvin: 6500,
    decay: 2,
    angle: 30,
    penumbra: 0.2,
  },
  {
    position: [-5, 5, 5],
    targetPosition: [0, 0, 0],
    intensity: 10.0,
    kelvin: 9600,
    decay: 2,
    angle: 30,
    penumbra: 0.2,
  },
  {
    position: [0, 5, -5],
    targetPosition: [0, 0, 0],
    intensity: 9.1,
    kelvin: 2600,
    decay: 2,
    angle: 30,
    penumbra: 0.2,
  },
]

export const lightingPresets: { name: string; lights: LightPreset[] }[] = [
  {
    name: "Default Studio",
    lights: defaultStudioLights,
  },
  {
    name: "Sunset",
    lights: [
      {
        position: [-10, 5, 0],
        targetPosition: [0, 0, 0],
        intensity: 20,
        kelvin: 2000,
        decay: 1.5,
        angle: 60,
        penumbra: 0.5,
      },
      {
        position: [5, 3, 8],
        targetPosition: [0, 0, 0],
        intensity: 5,
        kelvin: 8000,
        decay: 2,
        angle: 45,
        penumbra: 0.3,
      },
    ],
  },
  {
    name: "High Key",
    lights: [
      {
        position: [0, 10, 0],
        targetPosition: [0, 0, 0],
        intensity: 15,
        kelvin: 7500,
        decay: 1,
        angle: 90,
        penumbra: 1,
      },
      {
        position: [8, 2, 4],
        targetPosition: [0, 0, 0],
        intensity: 10,
        kelvin: 6500,
        decay: 2,
        angle: 50,
        penumbra: 0.8,
      },
      {
        position: [-8, 2, -4],
        targetPosition: [0, 0, 0],
        intensity: 10,
        kelvin: 6500,
        decay: 2,
        angle: 50,
        penumbra: 0.8,
      },
    ],
  },
  {
    name: "Cinematic",
    lights: [
      {
        position: [8, 4, -6],
        targetPosition: [0, 1, 0],
        intensity: 18,
        kelvin: 3200,
        decay: 1.8,
        angle: 35,
        penumbra: 0.6,
      },
      {
        position: [-6, 2, 8],
        targetPosition: [0, 1, 0],
        intensity: 12,
        kelvin: 5600,
        decay: 2,
        angle: 70,
        penumbra: 0.4,
      },
    ],
  },
]
