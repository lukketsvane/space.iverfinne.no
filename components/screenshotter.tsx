"use client"

import { forwardRef, useImperativeHandle, useEffect, useRef, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

type ScreenshotState = {
  active: boolean
  keyColor: string
  resolve: ((value: string | PromiseLike<string>) => void) | null
}

export const Screenshotter = forwardRef((props, ref) => {
  const { gl, scene } = useThree()
  const [screenshotState, setScreenshotState] = useState<ScreenshotState>({
    active: false,
    keyColor: "#00ff00",
    resolve: null,
  })

  const originalBackground = useRef<THREE.Color | THREE.Texture | null>(null)

  useFrame(() => {
    if (screenshotState.active && screenshotState.resolve) {
      const dataUrl = gl.domElement.toDataURL("image/png")
      screenshotState.resolve(dataUrl)
      setScreenshotState({ active: false, keyColor: "#00ff00", resolve: null })
    }
  })

  useEffect(() => {
    if (screenshotState.active) {
      originalBackground.current = scene.background
      scene.background = new THREE.Color(screenshotState.keyColor)
    } else if (originalBackground.current !== null) {
      scene.background = originalBackground.current
      originalBackground.current = null
    }
  }, [screenshotState.active, screenshotState.keyColor, scene])

  useImperativeHandle(ref, () => ({
    takeScreenshot: (keyColor = "#00ff00"): Promise<string> => {
      return new Promise((resolve) => {
        setScreenshotState({ active: true, keyColor, resolve })
      })
    },
  }))

  return null
})

Screenshotter.displayName = "Screenshotter"
