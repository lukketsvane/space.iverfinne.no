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
    clearcoatRoughness: number
    ior: number
    transmission: number
  }
}

export interface Model {
  id: string
  name: string
  model_url: string
  thumbnail_url: string
  created_at: string
  folder_id: string | null
  is_public: boolean
  view_settings: ViewSettings | null
}

export interface Folder {
  id: string
  name: string
  parent_id: string | null
  created_at: string
  description?: string
  is_public: boolean
}

export interface GalleryContents {
  folders: Folder[]
  models: Model[]
  currentFolder: Folder | null
}

export type GalleryItem = ({ type: "folder" } & Folder) | ({ type: "model" } & Model)
