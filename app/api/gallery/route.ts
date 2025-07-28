import { supabaseServer as supabase } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const folderId = searchParams.get("folderId")

  const queryFilter = folderId ? { eq: { folder_id: folderId } } : { is: { folder_id: null } }
  const parentFilter = folderId ? { eq: { parent_id: folderId } } : { is: { parent_id: null } }

  try {
    const [foldersRes, modelsRes] = await Promise.all([
      supabase
        .from("folders")
        .select("*")
        .filter("parent_id", parentFilter.is ? "is" : "eq", Object.values(parentFilter)[0].folder_id || null)
        .order("name"),
      supabase
        .from("models")
        .select("*")
        .filter("folder_id", queryFilter.is ? "is" : "eq", Object.values(queryFilter)[0].folder_id || null)
        .order("name"),
    ])

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
