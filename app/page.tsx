"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import useSWRInfinite from "swr/infinite"
import { format, isToday, isYesterday } from "date-fns"
import { LayoutGrid, List, LoaderIcon } from "lucide-react"
import type { Model } from "@/types"
import ThiingsGrid, { type ItemConfig } from "@/components/ui/thiings-grid"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const getKey = (pageIndex: number, previousPageData: { nextPage: number | null } | null) => {
  if (previousPageData && !previousPageData.nextPage) return null // Reached the end
  return `/api/public/models?page=${pageIndex}`
}

// Helper to group models by date
const groupModelsByDate = (models: Model[]) => {
  const groups: { [key: string]: Model[] } = {}
  models.forEach((model) => {
    const date = new Date(model.created_at)
    let groupKey: string
    if (isToday(date)) {
      groupKey = "Today"
    } else if (isYesterday(date)) {
      groupKey = "Yesterday"
    } else {
      groupKey = format(date, "MMMM d, yyyy")
    }
    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(model)
  })
  return groups
}

const ListView = ({
  models,
  loadMoreRef,
  isLoadingMore,
}: { models: Model[]; loadMoreRef: React.RefObject<HTMLDivElement>; isLoadingMore: boolean }) => {
  const groupedModels = groupModelsByDate(models)
  return (
    <div className="space-y-12">
      {Object.entries(groupedModels).map(([date, modelsInGroup]) => (
        <div key={date}>
          <h2 className="text-sm font-medium text-gray-400 mb-4">{date}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {modelsInGroup.map((model) => (
              <Link href={`/view/model/${model.id}`} key={model.id} className="group block aspect-square relative">
                <img
                  src={model.thumbnail_url || `/placeholder.svg?width=400&height=400&query=${model.name}`}
                  alt={model.name}
                  className="w-full h-full object-cover rounded-lg bg-black transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg" />
                <div className="absolute bottom-0 left-0 p-3">
                  <h3 className="text-white font-medium text-sm truncate transition-opacity duration-300 opacity-0 group-hover:opacity-100">
                    {model.name}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
      <div ref={loadMoreRef} className="h-20 flex justify-center items-center">
        {isLoadingMore && <LoaderIcon className="w-6 h-6 animate-spin text-white" />}
      </div>
    </div>
  )
}

const GridView = ({ models }: { models: Model[] }) => {
  const renderItem = ({ gridIndex, isMoving }: ItemConfig) => {
    // Use modulo to create an infinite loop of models
    const model = models[gridIndex % models.length]
    if (!model) return null

    return (
      <Link href={`/view/model/${model.id}`} className="absolute inset-1 group">
        <img
          src={model.thumbnail_url || `/placeholder.svg?width=400&height=400&query=${model.name}`}
          alt={model.name}
          className={`w-full h-full object-cover rounded-md bg-black transition-all duration-300 ${isMoving ? "scale-95 shadow-2xl" : "scale-100 shadow-md group-hover:scale-105"}`}
          loading="lazy"
        />
      </Link>
    )
  }

  return (
    <div className="w-full h-[calc(100vh-120px)]">
      <ThiingsGrid gridSize={180} renderItem={renderItem} />
    </div>
  )
}

export default function ViewPage() {
  const { data, error, size, setSize, isLoading } = useSWRInfinite(getKey, fetcher)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")

  const models: Model[] = data ? [].concat(...data.map((page) => page.models)).filter(Boolean) : []
  const isLoadingMore = isLoading || (size > 0 && data && typeof data[size - 1] === "undefined")
  const isEmpty = data?.[0]?.models.length === 0
  const isReachingEnd = isEmpty || (data && data[data.length - 1]?.nextPage === null)

  useEffect(() => {
    if (viewMode !== "list") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && !isReachingEnd) {
          setSize(size + 1)
        }
      },
      { threshold: 1.0 },
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [isLoadingMore, isReachingEnd, setSize, size, viewMode])

  // For grid view, we want to load all models.
  useEffect(() => {
    if (viewMode === "grid" && !isReachingEnd && !isLoadingMore) {
      setSize(size + 1)
    }
  }, [viewMode, models, isReachingEnd, isLoadingMore, setSize, size])

  return (
    <div className="bg-black min-h-screen text-gray-300 font-sans">
      <header className="p-4 sm:p-6 sticky top-0 bg-black/80 backdrop-blur-sm z-10 border-b border-gray-800 flex justify-between items-center">
        <h1 className="text-xl font-medium text-white">Model Gallery</h1>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => {
            if (value) setViewMode(value as any)
          }}
          className="bg-gray-800 rounded-lg p-1"
        >
          <ToggleGroupItem
            value="list"
            aria-label="List view"
            className="data-[state=on]:bg-gray-700 text-white px-3 py-1 rounded-md"
          >
            <List className="h-5 w-5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="grid"
            aria-label="Grid view"
            className="data-[state=on]:bg-gray-700 text-white px-3 py-1 rounded-md"
          >
            <LayoutGrid className="h-5 w-5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </header>
      <main className="p-4 sm:p-6">
        {isLoading && models.length === 0 && (
          <div className="flex justify-center items-center h-64">
            <LoaderIcon className="w-8 h-8 animate-spin text-white" />
          </div>
        )}
        {error && <p className="text-center text-red-400">Failed to load models.</p>}
        {isEmpty && <p className="text-center text-gray-500">No models have been published yet.</p>}

        {!isEmpty &&
          (viewMode === "list" ? (
            <ListView models={models} loadMoreRef={loadMoreRef} isLoadingMore={isLoadingMore} />
          ) : isLoadingMore && models.length === 0 ? (
            <div className="flex justify-center items-center h-64">
              <LoaderIcon className="w-8 h-8 animate-spin text-white" />
            </div>
          ) : (
            <GridView models={models} />
          ))}
      </main>
    </div>
  )
}
