"use client"

import { Button } from "@/components/ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent,
    DropdownMenuSubTrigger, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Folder, GalleryItem } from "@/types"
import { FolderIcon, FolderSymlink, Globe, Lock, MoreVertical, Pencil, Trash2 } from "lucide-react"
import React, { useState } from "react"
import { toast } from "sonner"

// ---- shared menu ----
interface MenuItemsProps {
    onRename: () => void
    onDelete: () => void
    onMove: (targetFolderId: string | null) => void
    onSetPublic: (isPublic: boolean) => void
    allFolders?: Folder[]
    currentItem: GalleryItem
}

const MoveToList = ({ onMove, allFolders, currentItem, Item }: Omit<MenuItemsProps, "onRename" | "onDelete" | "onSetPublic"> & { Item: any }) => (
    <>
        {currentItem.folder_id !== null && (
            <Item onSelect={() => onMove(null)}>
                <FolderIcon className="mr-2 h-4 w-4" />
                <span>Assets (Root)</span>
            </Item>
        )}
        {allFolders?.filter((f) => f.id !== currentItem.id && f.id !== currentItem.folder_id).map((folder) => (
            <Item key={folder.id} onSelect={() => onMove(folder.id)}>
                <FolderIcon className="mr-2 h-4 w-4" />
                <span>{folder.name}</span>
            </Item>
        ))}
    </>
)

const FullMenu = ({ onRename, onDelete, onMove, onSetPublic, allFolders, currentItem, Item }: MenuItemsProps & { Item: any }) => (
    <>
        <Item onSelect={onRename}><Pencil className="mr-2 h-4 w-4" /><span>Rename</span></Item>
        <DropdownMenuSub>
            <DropdownMenuSubTrigger><FolderSymlink className="mr-2 h-4 w-4" /><span>Move to...</span></DropdownMenuSubTrigger>
            <DropdownMenuPortal>
                <DropdownMenuSubContent><MoveToList onMove={onMove} allFolders={allFolders} currentItem={currentItem} Item={DropdownMenuItem} /></DropdownMenuSubContent>
            </DropdownMenuPortal>
        </DropdownMenuSub>
        <Item onSelect={() => onSetPublic(!currentItem.is_public)}>
            {currentItem.is_public ? <Lock className="mr-2 h-4 w-4" /> : <Globe className="mr-2 h-4 w-4" />}
            <span>Make {currentItem.is_public ? "Private" : "Public"}</span>
        </Item>
        <Item onSelect={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /><span>Delete</span></Item>
    </>
)

export function ItemContextMenu({ children, item, onRename, onDelete, onMove, onSetPublic, allFolders }: { children: React.ReactNode } & MenuItemsProps) {
    return (
        <ContextMenu>
            <ContextMenuTrigger className="w-full h-full" onContextMenu={(e) => e.stopPropagation()}>
                <div className="relative group w-full h-full">
                    {children}
                    <div className="absolute top-2 right-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-black/30 hover:bg-black/50 text-white hover:text-white"
                                    onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
                                <FullMenu {...{ onRename, onDelete, onMove, onSetPublic, allFolders, currentItem: item }} Item={DropdownMenuItem} />
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent onClick={(e) => e.stopPropagation()}>
                <MoveToList onMove={onMove} allFolders={allFolders} currentItem={item} Item={ContextMenuItem} />
            </ContextMenuContent>
        </ContextMenu>
    )
}

// ---- dialogs ----
export function NewFolderDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (name: string) => void }) {
    const [name, setName] = useState("")
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-black/50 backdrop-blur-sm border-white/20 text-white">
                <DialogHeader><DialogTitle>New Folder</DialogTitle></DialogHeader>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter folder name"
                    onKeyDown={(e) => e.key === "Enter" && name && onCreate(name)} className="bg-white/10 border-white/20" />
                <DialogFooter><Button onClick={() => name && onCreate(name)} disabled={!name}>Create</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function RenameDialog({ item, onOpenChange, onRename }: { item: GalleryItem; onOpenChange: (o: boolean) => void; onRename: (name: string) => void }) {
    const [name, setName] = useState(item.name)
    return (
        <Dialog open={true} onOpenChange={onOpenChange}>
            <DialogContent className="bg-black/50 backdrop-blur-sm border-white/20 text-white">
                <DialogHeader><DialogTitle>Rename {item.type}</DialogTitle></DialogHeader>
                <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name && onRename(name)} className="bg-white/10 border-white/20" />
                <DialogFooter><Button onClick={() => name && onRename(name)} disabled={!name}>Save</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export function FolderDescriptionDialog({ folder, open, onOpenChange, onSave }: {
    folder: Folder; open: boolean; onOpenChange: (o: boolean) => void; onSave: (description: string) => void
}) {
    const [description, setDescription] = useState(folder.description || "")
    const words = description.trim() ? description.trim().split(/\s+/).length : 0
    const handleSave = () => { if (words > 150) toast.error("Description cannot exceed 150 words."); else onSave(description) }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-black/50 backdrop-blur-sm border-white/20 text-white">
                <DialogHeader>
                    <DialogTitle>Edit Description for "{folder.name}"</DialogTitle>
                    <DialogDescription className="text-gray-400">Add a description or comma-separated tags. Used for searching models in this folder.</DialogDescription>
                </DialogHeader>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. sci-fi, characters, hard-surface"
                    className="bg-white/10 border-white/20 min-h-[120px]" rows={5} />
                <div className={`text-right text-sm ${words > 150 ? "text-destructive" : "text-muted-foreground"}`}>{words} / 150 words</div>
                <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSave} disabled={words > 150}>Save</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
