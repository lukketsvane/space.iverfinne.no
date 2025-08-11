"use client"
import { kelvinToRgb } from "@/lib/utils"
import type { Light } from "@/types"
import { Html, SpotLight, useGLTF, useProgress } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react"
import * as THREE from "three"

export function Loader() {
    const { progress } = useProgress()
    return (
        <Html center>
            <div className="w-6 h-6 rounded-full border border-white/30 border-t-transparent animate-spin" aria-label={`${progress.toFixed(0)}%`} />
        </Html>
    )
}

const mkWhite = (m: THREE.Material) =>
    m instanceof THREE.MeshStandardMaterial ? Object.assign(m.clone(), { color: new THREE.Color("white"), map: null }) : new THREE.MeshStandardMaterial({ color: "white" })

const mkNormal = (_m: THREE.Material) => new THREE.MeshNormalMaterial()

export const ModelViewer = forwardRef<THREE.Group, { modelUrl: string; materialMode: "pbr" | "normal" | "white" }>(
    ({ modelUrl, materialMode }, ref) => {
        const gltf = useGLTF(modelUrl)
        const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
        const originals = useRef(new Map<string, THREE.Material | THREE.Material[]>()),
            whites = useRef(new Map<string, THREE.Material | THREE.Material[]>()),
            normals = useRef(new Map<string, THREE.Material | THREE.Material[]>())

        useEffect(() => {
            const box = new THREE.Box3().setFromObject(scene), c = new THREE.Vector3()
            box.getCenter(c); scene.position.sub(c)
            scene.traverse((ch: any) => {
                if (!ch?.isMesh) return
                const mesh = ch as THREE.Mesh
                mesh.castShadow = mesh.receiveShadow = true
                const base = mesh.material
                originals.current.set(mesh.uuid, base)
                const w = Array.isArray(base) ? base.map(mkWhite) : mkWhite(base)
                const n = Array.isArray(base) ? base.map(mkNormal) : mkNormal(base)
                whites.current.set(mesh.uuid, w); normals.current.set(mesh.uuid, n)
            })
        }, [scene])

        useEffect(() => {
            scene.traverse((ch: any) => {
                if (!ch?.isMesh) return
                const mesh = ch as THREE.Mesh
                mesh.material =
                    materialMode === "white" ? whites.current.get(mesh.uuid)! :
                        materialMode === "normal" ? normals.current.get(mesh.uuid)! :
                            originals.current.get(mesh.uuid)!
            })
        }, [scene, materialMode])

        return <primitive ref={ref} object={scene} />
    }
)
ModelViewer.displayName = "ModelViewer"

export function SpotLightInScene({ light }: { light: Light }) {
    const target = useRef(new THREE.Object3D())
    const { r, g, b } = kelvinToRgb(light.kelvin)
    const color = useMemo(() => new THREE.Color(r, g, b), [r, g, b])
    useEffect(() => { target.current.position.set(...light.targetPosition) }, [light.targetPosition])
    if (!light.visible) return null
    return (
        <>
            <SpotLight
                position={light.position}
                target={target.current}
                color={color}
                intensity={light.intensity}
                angle={THREE.MathUtils.degToRad(light.angle)}
                penumbra={light.penumbra}
                decay={light.decay}
                castShadow
                shadow-mapSize={[1024, 1024]}
                shadow-bias={-0.00015}
                distance={0}
            />
            <primitive object={target.current} />
        </>
    )
}

export const CaptureController = forwardRef<{ capture: () => Promise<File | null> }, { modelRef: React.RefObject<THREE.Group> }>(
    ({ modelRef }, ref) => {
        const { gl, scene, camera } = useThree()
        useImperativeHandle(ref, () => ({
            async capture() {
                if (!modelRef.current) return null
                const bg = scene.background; scene.background = null; gl.render(scene, camera)
                const box = new THREE.Box3().setFromObject(modelRef.current), v = new THREE.Vector3()
                const pts = [
                    v.set(box.min.x, box.min.y, box.min.z).clone(), v.set(box.min.x, box.min.y, box.max.z).clone(),
                    v.set(box.min.x, box.max.y, box.min.z).clone(), v.set(box.min.x, box.max.y, box.max.z).clone(),
                    v.set(box.max.x, box.min.y, box.min.z).clone(), v.set(box.max.x, box.min.y, box.max.z).clone(),
                    v.set(box.max.x, box.max.y, box.min.z).clone(), v.set(box.max.x, box.max.y, box.max.z).clone(),
                ]
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
                for (const p of pts) {
                    const s = p.clone().project(camera)
                    const x = ((s.x + 1) / 2) * gl.domElement.width, y = (-(s.y - 1) / 2) * gl.domElement.height
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
                }
                const bw = maxX - minX, bh = maxY - minY
                if (bw <= 0 || bh <= 0) { scene.background = bg; return null }
                const size = Math.max(bw, bh) * 1.2, cx = minX + bw / 2, cy = minY + bh / 2
                const sx = cx - size / 2, sy = cy - size / 2
                const tmp = document.createElement("canvas"); tmp.width = 512; tmp.height = 512
                const ctx = tmp.getContext("2d"); if (!ctx) { scene.background = bg; return null }
                ctx.drawImage(gl.domElement, sx, sy, size, size, 0, 0, 512, 512)
                scene.background = bg
                const b64 = tmp.toDataURL("image/png")
                const [meta, data] = b64.split(",")
                const mime = meta.match(/:(.*?);/)?.[1] ?? "image/png"
                const bin = atob(data), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
                return new File([buf], `thumbnail-${Date.now()}.png`, { type: mime })
            },
        }))
        return null
    }
)
CaptureController.displayName = "CaptureController"
