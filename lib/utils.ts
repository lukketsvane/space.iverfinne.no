import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function kelvinToRgb(kelvin: number) {
  const temp = kelvin / 100

  let red: number
  let green: number
  let blue: number

  if (temp <= 66) {
    red = 255
    green = temp
    green = 99.4708025861 * Math.log(green) - 161.1195681661
    if (temp >= 19) {
      blue = temp - 10
      blue = 138.5177312231 * Math.log(blue) - 305.0447927307
    } else {
      blue = 0
    }
  } else {
    red = temp - 60
    red = 329.698727446 * Math.pow(red, -0.1332047592)
    green = temp - 60
    green = 288.1221695283 * Math.pow(green, -0.0755148492)
    blue = 255
  }

  return {
    r: Math.max(0, Math.min(255, red)) / 255,
    g: Math.max(0, Math.min(255, green)) / 255,
    b: Math.max(0, Math.min(255, blue)) / 255,
  }
}
