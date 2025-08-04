export interface Model {
  id: string
  name: string
  model_url: string
  thumbnail_url: string | null
  created_at: string
  folder_id: string | null
  is_public: boolean
  view_settings?: ViewSettings | null
}

export interface Folder {
  id: string
  name: string
  parent_id: string | null
  created_at: string
  is_public: boolean
  description?: string | null
}

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
}

export interface ViewSettings {
  lights: Omit<Light, "id" | "visible">[]
  lightsEnabled: boolean
  environmentEnabled: boolean
  bgType: "color" | "gradient" | "image"
  bgColor1: string
  bgColor2: string
}

export interface GalleryContents {
  folders: Folder[]
  models: Model[]
  currentFolder?: Folder | null
}

export type GalleryItem = (Folder | Model) & { type: "folder" | "model" }
