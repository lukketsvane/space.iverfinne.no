"use client"

import dynamic from "next/dynamic"
import { Suspense } from "react"
import { LoaderIcon } from "lucide-react"

const GalleryPageWithNoSSR = dynamic(() => import("@/components/gallery-page"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <LoaderIcon className="w-12 h-12 animate-spin text-white" />
    </div>
  ),
})

export default function GalleryClientWrapper() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-screen flex items-center justify-center bg-black">
          <LoaderIcon className="w-12 h-12 animate-spin text-white" />
        </div>
      }
    >
      <GalleryPageWithNoSSR />
    </Suspense>
  )
}
