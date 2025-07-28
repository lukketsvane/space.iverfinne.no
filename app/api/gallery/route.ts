import { supabaseServer as supabase } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const folderId = searchParams.get("folderId") || null
  const sortBy = searchParams.get("sortBy") || "created_at"
  const sortOrder = searchParams.get("sortOrder") || "desc"

  // Validate sortOrder to prevent potential issues
  const ascending = sortOrder === "asc"

  try {
    let currentFolder = null
    if (folderId) {
      const { data, error } = await supabase.from("folders").select("*").eq("id", folderId).single()
      if (error) {
        console.error("Error fetching current folder:", error)
      } else {
        currentFolder = data
      }
    }

    // Folders are always sorted by name
    const foldersQuery = supabase.from("folders").select("*").order("name", { ascending: true })

    // Models are sorted based on query params
    const modelsQuery = supabase.from("models").select("*").order(sortBy, { ascending })

    // Apply filters based on folderId
    if (folderId) {
      foldersQuery.eq("parent_id", folderId)
      modelsQuery.eq("folder_id", folderId)
    } else {
      foldersQuery.is("parent_id", null)
      modelsQuery.is("folder_id", null)
    }

    // Execute queries in parallel
    const [foldersRes, modelsRes] = await Promise.all([foldersQuery, modelsQuery])

    if (foldersRes.error) throw foldersRes.error
    if (modelsRes.error) throw modelsRes.error

    return NextResponse.json({
      folders: foldersRes.data,
      models: modelsRes.data,
      currentFolder,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `Failed to fetch gallery contents: ${message}` }, { status: 500 })
  }
}
