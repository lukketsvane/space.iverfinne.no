// === /workspaces/space.iverfinne.no/types/index.ts ===
export interface Light {
  id: number
  visible: boolean
  position: [number, number, number]
  targetPosition: [number, number, number]
  intensity: number
  kelvin: number
  decay: number
  angle: number
  penumbra: number
  /** legacy, ignored by the new renderer */
  volumeOpacity?: number
  /** physically-correct falloff distance (0 = infinite) */
  distance?: number
}

export interface ViewSettings {
  lights: Omit<Light, "id" | "visible">[]
  lightsEnabled: boolean
  environmentEnabled: boolean
  bloomEnabled: boolean
  ssaoEnabled: boolean
  bgType: "color" | "gradient" | "image"
  bgColor1: string
  bgColor2: string
  bgImage: string | null
  /** kept for backward compatibility, not used */
  fieldOfView?: number
  cameraPosition: [number, number, number] | null
  cameraTarget: [number, number, number] | null
  materialMode: "pbr" | "normal" | "white"
  /** Material override (clay/physical) */
  materialOverride?: {
    enabled: boolean
    color: string
    metalness: number
    roughness: number
    clearcoat: number
    clearcoat
