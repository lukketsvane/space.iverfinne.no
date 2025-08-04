"use client";
import { LoaderIcon } from "lucide-react"
import { Suspense } from "react"

const GalleryPageWithNoSSR = dynamic(() => import("@/components/gallery-page"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <LoaderIcon className="w-12 h-12 animate-spin text-white" />
    </div>
  ),
})

export default function HomePage() {
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
