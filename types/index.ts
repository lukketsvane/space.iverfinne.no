export interface Light {
  position: [number, number, number]
  targetPosition: [number, number, number]
  intensity: number
  kelvin: number
  decay: number
  angle: number // in degrees
  penumbra: number // 0-1
}

// Settings that are saved to the database
export interface ViewSettings {
  lights: Light[]
  lightsEnabled: boolean
  environmentEnabled: boolean
  bgType: "color" | "gradient" | "image"
  bgColor1: string
  bgColor2: string
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
