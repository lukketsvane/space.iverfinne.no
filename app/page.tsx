"use client";
import { LoaderIcon } from "lucide-react";
import dynamic from "next/dynamic";
import GalleryClientWrapper from "./gallery-client-wrapper";

const GalleryPageWithNoSSR = dynamic(() => import("@/components/gallery-page"), {
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-black">
      <LoaderIcon className="w-12 h-12 animate-spin text-white" />
    </div>
  ),
})

export default function HomePage() {
  return <GalleryClientWrapper />
}
