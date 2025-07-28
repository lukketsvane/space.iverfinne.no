import { supabaseServer as supabase } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const folderId = searchParams.get("folderId") || null

  try {
    // Build queries
    const foldersQuery = supabase.from("folders").select("*").order("name")
    const modelsQuery = supabase.from("models").select("*").order("name")

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
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `Failed to fetch gallery contents: ${message}` }, { status: 500 })
  }
}
