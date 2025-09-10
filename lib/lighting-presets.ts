// === /workspaces/space.iverfinne.no/lib/lighting-presets.ts ===
import type { Light } from "@/types";

type LightPreset = Omit<Light, "id" | "visible">

export const lightingPresets: { name: string; lights: LightPreset[] }[] = [
  {
    name: "3-Point",
    lights: [
      // Increased key light intensity for stronger default
      { position: [-2.5, 2.2, 3.2], targetPosition: [0, 0.6, 0], intensity: 28, kelvin: 5600, decay: 1.6, angle: 38, penumbra: 0.4 },
      { position: [2.8, 1.2, 2.2], targetPosition: [0, 0.6, 0], intensity: 8, kelvin: 4200, decay: 2.0, angle: 55, penumbra: 0.7 },
      { position: [0.0, 2.0, -2.4], targetPosition: [0, 0.4, 0], intensity: 18, kelvin: 7000, decay: 1.8, angle: 50, penumbra: 0.5 },
    ],
  },
  {
    name: "Studio Soft",
    lights: [
      { position: [0, 3.5, 2.2], targetPosition: [0, 0.5, 0], intensity: 16, kelvin: 6500, decay: 1.2, angle: 85, penumbra: 1.0 },
      { position: [-3, 2, 3], targetPosition: [0, 0.5, 0], intensity: 6, kelvin: 6000, decay: 1.8, angle: 65, penumbra: 0.8 },
    ],
  },
  {
    name: "Hard Rim",
    lights: [
      { position: [3.5, 1.5, -2.5], targetPosition: [0, 0.7, 0], intensity: 28, kelvin: 7500, decay: 1.6, angle: 30, penumbra: 0.3 },
      { position: [-3.0, 1.0, 2.5], targetPosition: [0, 0.6, 0], intensity: 10, kelvin: 4000, decay: 2.0, angle: 45, penumbra: 0.5 },
    ],
  },
  {
    name: "Moody",
    lights: [
      { position: [-1.5, 1.2, 1.8], targetPosition: [0, 0.4, 0], intensity: 10, kelvin: 3200, decay: 1.4, angle: 25, penumbra: 0.6 },
      { position: [1.4, 0.8, -2.0], targetPosition: [0, 0.3, 0], intensity: 14, kelvin: 9000, decay: 1.8, angle: 35, penumbra: 0.4 },
    ],
  },
]
