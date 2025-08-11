"use client"

import type { GalleryItem } from "@/types"
import { useRef, useState } from "react"

export function useItemSelection(filteredItems: GalleryItem[]) {
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
    const lastSelectedItem = useRef<string | null>(null)

    const handleItemClick = (e: React.MouseEvent, item: GalleryItem) => {
        e.stopPropagation()
        const newSelectedItems = new Set(selectedItems)

        if (e.shiftKey && lastSelectedItem.current) {
            const lastIndex = filteredItems.findIndex((i) => i.id === lastSelectedItem.current)
            const currentIndex = filteredItems.findIndex((i) => i.id === item.id)
            const [start, end] = [lastIndex, currentIndex].sort((a, b) => a - b)
            for (let i = start; i <= end; i++) {
                newSelectedItems.add(filteredItems[i].id)
            }
        } else if (e.metaKey || e.ctrlKey) {
            newSelectedItems.has(item.id) ? newSelectedItems.delete(item.id) : newSelectedItems.add(item.id)
        } else {
            if (newSelectedItems.size === 1 && newSelectedItems.has(item.id)) {
                newSelectedItems.clear()
            } else {
                newSelectedItems.clear()
                newSelectedItems.add(item.id)
            }
        }

        setSelectedItems(newSelectedItems)
        lastSelectedItem.current = item.id
    }

    return { selectedItems, setSelectedItems, handleItemClick }
}
