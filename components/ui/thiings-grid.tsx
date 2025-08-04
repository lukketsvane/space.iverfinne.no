"use client"

import type React from "react"
import { useState, useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from "react"
import { useGesture } from "@use-gesture/react"
import { a, useSpring, config } from "@react-spring/web"

export type Position = {
  x: number
  y: number
}

export type ItemConfig = {
  gridIndex: number
  position: Position
  isMoving: boolean
}

type ThiingsGridProps = {
  gridSize: number
  renderItem: (config: ItemConfig) => React.ReactNode
  className?: string
  initialPosition?: Position
}

// Function to calculate a unique index from a 2D position
const getGridIndex = (pos: Position): number => {
  const { x, y } = pos
  const A = x >= 0 ? 2 * x : -2 * x - 1
  const B = y >= 0 ? 2 * y : -2 * y - 1
  return A >= B ? A * A + A + B : B * B + A
}

const ThiingsGrid = forwardRef<{ publicGetCurrentPosition: () => Position }, ThiingsGridProps>(
  ({ gridSize, renderItem, className, initialPosition = { x: 0, y: 0 } }, ref) => {
    const [isMoving, setIsMoving] = useState(false)
    const [view, setView] = useState({ width: 0, height: 0 })
    const containerRef = useRef<HTMLDivElement>(null)

    const [{ x, y }, api] = useSpring(() => ({
      x: initialPosition.x,
      y: initialPosition.y,
      config: config.slow,
    }))

    useImperativeHandle(ref, () => ({
      publicGetCurrentPosition: () => ({ x: x.get(), y: y.get() }),
    }))

    useEffect(() => {
      const resizeObserver = new ResizeObserver((entries) => {
        if (entries[0]) {
          const { width, height } = entries[0].contentRect
          setView({ width, height })
        }
      })
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current)
      }
      return () => resizeObserver.disconnect()
    }, [])

    useGesture(
      {
        onDrag: ({ offset: [dx, dy], down }) => {
          setIsMoving(down)
          api.start({ x: dx, y: dy, immediate: true })
        },
        onWheel: ({ delta: [dx, dy] }) => {
          api.start({ x: x.get() - dx, y: y.get() - dy, immediate: true })
        },
      },
      {
        target: containerRef,
        eventOptions: { passive: false },
        drag: { from: () => [x.get(), y.get()] },
      },
    )

    const visibleCells = useMemo(() => {
      if (view.width === 0 || view.height === 0) return []

      const currentX = x.get()
      const currentY = y.get()

      const startX = Math.floor(-currentX / gridSize) - 2
      const endX = Math.floor((-currentX + view.width) / gridSize) + 2
      const startY = Math.floor(-currentY / gridSize) - 2
      const endY = Math.floor((-currentY + view.height) / gridSize) + 2

      const cells = []
      for (let i = startX; i <= endX; i++) {
        for (let j = startY; j <= endY; j++) {
          const position = { x: i, y: j }
          cells.push({
            position,
            gridIndex: getGridIndex(position),
          })
        }
      }
      return cells
    }, [x, y, view, gridSize])

    return (
      <div
        ref={containerRef}
        className={`w-full h-full overflow-hidden cursor-grab ${className}`}
        style={{ touchAction: "none" }}
      >
        <a.div style={{ x, y, width: "100%", height: "100%", position: "relative" }}>
          {visibleCells.map(({ position, gridIndex }) => (
            <div
              key={gridIndex}
              className="absolute"
              style={{
                width: gridSize,
                height: gridSize,
                transform: `translate(${position.x * gridSize}px, ${position.y * gridSize}px)`,
              }}
            >
              {renderItem({ gridIndex, position, isMoving })}
            </div>
          ))}
        </a.div>
      </div>
    )
  },
)

ThiingsGrid.displayName = "ThiingsGrid"
export default ThiingsGrid
