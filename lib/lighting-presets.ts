import type { Light } from "@/types"

export const lightingPresets: {
  name: string
  lights: Omit<Light, "id" | "visible">[]
}[] = [
  {
    name: "Studio",
    lights: [
      {
        position: [-5, 5, -5],
        targetPosition: [0, 0, 0],
        intensity: 2,
        kelvin: 5500,
        decay: 1,
        angle: 45,
        penumbra: 0.5,
      },
      {
        position: [5, 3, 5],
        targetPosition: [0, 0, 0],
        intensity: 1,
        kelvin: 3200,
        decay: 1,
        angle: 60,
        penumbra: 0.3,
      },
    ],
  },
  {
    name: "Dramatic",
    lights: [
      {
        position: [-8, 8, -2],
        targetPosition: [0, 0, 0],
        intensity: 3,
        kelvin: 2700,
        decay: 2,
        angle: 30,
        penumbra: 0.8,
      },
    ],
  },
  {
    name: "Soft",
    lights: [
      {
        position: [0, 10, 0],
        targetPosition: [0, 0, 0],
        intensity: 1.5,
        kelvin: 6500,
        decay: 0.5,
        angle: 90,
        penumbra: 0.9,
      },
      {
        position: [3, 2, 3],
        targetPosition: [0, 0, 0],
        intensity: 0.8,
        kelvin: 4000,
        decay: 1,
        angle: 45,
        penumbra: 0.7,
      },
    ],
  },
]
