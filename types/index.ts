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
  volumeOpacity?: number
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
  fov: number
  orthographic: boolean
  cameraPosition: [number, number, number] | null
  cameraTarget: [number, number, number] | null
  materialMode: "pbr" | "normal" | "white"
  materialOverride?: {
    enabled: boolean
    color: string
    metalness: number
    roughness: number
    clearcoat: number
    clearcoatRoughness: number
    ior: number
    transmission: number
    useAlbedo?: boolean
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
