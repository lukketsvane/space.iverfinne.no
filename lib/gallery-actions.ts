import type { GalleryItem, Model, ViewSettings } from "@/types"
import { upload } from "@vercel/blob/client"
import { toast } from "sonner"
import type { KeyedMutator } from "swr"

type MutateGallery = KeyedMutator<any>

export async function handleUpload(
    files: FileList | null,
    currentFolderId: string | null,
    mutateGallery: MutateGallery,
    updateQuery: (params: Record<string, string | null>) => void,
) {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    const uploadedModels: Model[] = []

    const uploadToast = toast.loading(`Uploading ${fileArray.length} file(s)...`)

    await Promise.all(
        fileArray.map(async (file) => {
            if (!file.name.endsWith(".glb")) {
                toast.error(`Skipping non-GLB file: ${file.name}`)
                return
            }
            try {
                const newBlob = await upload(file.name.replace(/\s+/g, "_"), file, {
                    access: "public",
                    handleUploadUrl: "/api/upload",
                })

                const res = await fetch("/api/models", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: file.name.replace(/\.glb$/, ""),
                        model_url: newBlob.url,
                        thumbnail_url: `/placeholder.svg?width=400&height=400&query=${encodeURIComponent(
                            file.name.replace(/\.glb$/, ""),
                        )}`,
                        folder_id: currentFolderId,
                    }),
                })

                if (!res.ok) throw new Error(`Failed to create database record for ${file.name}`)
                const newModel = await res.json()
                uploadedModels.push(newModel)

                toast.success(`Uploaded ${file.name}`, { id: uploadToast, duration: 2000 })
            } catch (error) {
                toast.error(`Failed to upload ${file.name}`, { id: uploadToast })
            }
        }),
    )

    mutateGallery()
    if (uploadedModels.length === 1) {
        updateQuery({ modelId: uploadedModels[0].id })
    }
}

export async function handleThumbnailUpload(
    file: File,
    modelId: string,
    mutateGallery: MutateGallery,
    mutateSelectedModel: KeyedMutator<Model>,
) {
    try {
        toast.info(`Uploading thumbnail...`)
        const pathname = `thumbnails/${modelId}.${file.name.split(".").pop()}`
        const newBlob = await upload(pathname, file, {
            access: "public",
            handleUploadUrl: "/api/upload",
            clientPayload: JSON.stringify({ isThumbnail: true }),
        })

        await fetch(`/api/models/${modelId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ thumbnail_url: newBlob.url }),
        })

        await mutateGallery()
        await mutateSelectedModel()
        toast.success("Thumbnail updated successfully!")
    } catch (error) {
        console.error("Thumbnail upload failed:", error)
        toast.error(error instanceof Error ? error.message : "Failed to upload thumbnail.")
    }
}

export async function createFolder(name: string, parent_id: string | null, mutateGallery: MutateGallery) {
    await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parent_id }),
    })
    toast.success(`Folder "${name}" created`)
    mutateGallery()
}

export async function renameItem(
    item: GalleryItem,
    newName: string,
    mutateGallery: MutateGallery,
    mutateSelectedModel?: KeyedMutator<Model>,
) {
    const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`
    await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
    })
    toast.success("Renamed successfully")
    mutateGallery()
    if (item.type === "model" && mutateSelectedModel) mutateSelectedModel()
}

async function performBulkAction(
    items: GalleryItem[],
    action: (item: GalleryItem) => Promise<Response>,
    successMessage: string,
    mutators: { closeViewer: () => void; mutateGallery: MutateGallery },
) {
    if (items.length === 0) return;
    const toastId = toast.loading(`Processing ${items.length} item(s)...`);

    const results = await Promise.allSettled(items.map(action));

    let successCount = 0;
    let failureCount = 0;
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.ok) {
            successCount++;
        } else {
            failureCount++;
        }
    });

    if (failureCount > 0) {
        toast.error(`${successCount} ${successMessage}, ${failureCount} failed.`, { id: toastId });
    } else {
        toast.success(`${successCount} ${successMessage}.`, { id: toastId });
    }

    if (items.some(item => item.type === 'model')) {
        mutators.closeViewer();
    }
    mutators.mutateGallery();
}


export async function deleteItems(items: GalleryItem[], closeViewer: () => void, mutateGallery: MutateGallery) {
    const deleteAction = (item: GalleryItem) => {
        const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`;
        return fetch(url, { method: "DELETE" });
    };
    await performBulkAction(items, deleteAction, "item(s) deleted", { closeViewer, mutateGallery });
}

export async function moveItems(
    items: GalleryItem[],
    targetFolderId: string | null,
    currentFolderId: string | null,
    closeViewer: () => void,
    mutateGallery: MutateGallery,
) {
    const moveAction = (item: GalleryItem) => {
        const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`;
        const body = item.type === "folder" ? { parent_id: targetFolderId } : { folder_id: targetFolderId };
        return fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    };

    const shouldCloseViewer = items.some(item => item.type === 'model') && targetFolderId !== currentFolderId;
    await performBulkAction(items, moveAction, "item(s) moved", { closeViewer: shouldCloseViewer ? closeViewer : () => { }, mutateGallery });
}


export async function setItemPublic(
    items: GalleryItem[],
    isPublic: boolean,
    mutateGallery: MutateGallery,
    mutateSelectedModel?: KeyedMutator<Model>,
) {
    const setPublicAction = (item: GalleryItem) => {
        const url = item.type === "folder" ? `/api/folders/${item.id}` : `/api/models/${item.id}`;
        return fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_public: isPublic }),
        });
    };
    await performBulkAction(items, setPublicAction, `item(s) set to ${isPublic ? "public" : "private"}`, { closeViewer: () => { }, mutateGallery });
    if (items.some(item => item.type === 'model') && mutateSelectedModel) {
        mutateSelectedModel();
    }
}


export async function saveViewSettings(modelId: string, settings: ViewSettings) {
    await fetch(`/api/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view_settings: settings }),
    })
    toast.success("Default view saved!")
}

export async function deleteViewSettings(modelId: string) {
    await fetch(`/api/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view_settings: null }),
    })
    toast.success("Saved view has been deleted.")
}
