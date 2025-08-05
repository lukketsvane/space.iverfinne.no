"use client";
import dynamic from "next/dynamic"
import { LoaderIcon } from "lucide-react"

const GalleryPage = dynamic(() => import("@/components/gallery-page"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <LoaderIcon className="w-12 h-12 animate-spin text-white" />
    </div>
  ),
})

export default function HomePage() {
  return <GalleryPage />
}
