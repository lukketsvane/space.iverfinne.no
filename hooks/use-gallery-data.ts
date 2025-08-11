"use client"

import type { Folder, GalleryContents } from "@/types"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function useGalleryData(folderId: string | null, sortBy: string, sortOrder: string) {
    const galleryUrl = `/api/gallery?folderId=${folderId || ""}&sortBy=${sortBy}&sortOrder=${sortOrder}`
    const { data: gallery, error, isLoading, mutate } = useSWR<GalleryContents>(galleryUrl, fetcher)
    const { data: allFolders } = useSWR<Folder[]>("/api/folders/all", fetcher)
    const { data: breadcrumbData, error: breadcrumbError } = useSWR<{ id: string; name: string }[]>(
        folderId ? `/api/folders/${folderId}/breadcrumbs` : null,
        fetcher,
    )

    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "Assets" }])

    useEffect(() => {
        if (breadcrumbError) {
            toast.error("Could not load folder path. Please ensure your database schema is up to date.")
        }
        if (folderId === null) {
            setBreadcrumbs([{ id: null, name: "Assets" }])
        } else if (breadcrumbData) {
            setBreadcrumbs([{ id: null, name: "Assets" }, ...breadcrumbData])
        }
    }, [folderId, breadcrumbData, breadcrumbError])

    return { gallery, allFolders, breadcrumbs, error, isLoading, mutateGallery: mutate }
}
