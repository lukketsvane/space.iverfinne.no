import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function kelvinToRgb(kelvin: number): { r: number; g: number; b: number } {
  const temp = kelvin / 100
  let r: number, g: number, b: number

  // Calculate Red
  if (temp <= 66) {
    r = 255
  } else {
    r = temp - 60
    r = 329.698727446 * Math.pow(r, -0.1332047592)
  }

  // Calculate Green
  if (temp <= 66) {
    g = temp
    g = 99.4708025861 * Math.log(g) - 161.1195681661
  } else {
    g = temp - 60
    g = 288.1221695283 * Math.pow(g, -0.0755148492)
  }

  // Calculate Blue
  if (temp >= 66) {
    b = 255
  } else {
    if (temp <= 19) {
      b = 0
    } else {
      b = temp - 10
      b = 138.5177312231 * Math.log(b) - 305.0447927307
    }
  }

  const clamp = (val: number) => Math.max(0, Math.min(255, val))

  return { r: clamp(r) / 255, g: clamp(g) / 255, b: clamp(b) / 255 }
}
