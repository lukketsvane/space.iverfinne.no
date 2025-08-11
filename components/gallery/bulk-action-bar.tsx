"use client"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Folder, GalleryItem } from "@/types"
import { Download, FolderIcon, FolderSymlink, Globe, Lock, Trash2, X } from "lucide-react"

interface Props {
    selectedCount: number
    onClear: () => void
    onDelete: () => void
    onMove: (targetFolderId: string | null) => void
    onSetPublic: (isPublic: boolean) => void
    onDownload: () => void
    allItems: GalleryItem[]
    selectedIds: Set<string>
    allFolders?: Folder[]
    currentFolderId: string | null
}

export function BulkActionBar({ selectedCount, onClear, onDelete, onMove, onSetPublic, onDownload, allItems, selectedIds, allFolders, currentFolderId }: Props) {
    const canDownload = allItems.filter((i) => selectedIds.has(i.id)).every((i) => i.type === "model")
    return (
        <div className="absolute bottom-0 left-0 right-0 bg-background border-t p-2 flex items-center justify-between z-20">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={onClear}><X className="h-5 w-5" /></Button>
                <span className="font-semibold">{selectedCount} selected</span>
            </div>
            <div className="flex items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><FolderSymlink className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => onMove(null)} disabled={currentFolderId === null}><FolderIcon className="mr-2 h-4 w-4" /> Assets (Root)</DropdownMenuItem>
                        {allFolders?.filter((f) => f.id !== currentFolderId).map((folder) => (
                            <DropdownMenuItem key={folder.id} onSelect={() => onMove(folder.id)}><FolderIcon className="mr-2 h-4 w-4" /> {folder.name}</DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="icon" onClick={() => onSetPublic(true)}><Globe className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onSetPublic(false)}><Lock className="h-4 w-4" /></Button>
                {canDownload && <Button variant="ghost" size="icon" onClick={onDownload}><Download className="h-4 w-4" /></Button>}
                <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
            </div>
        </div>
    )
}
