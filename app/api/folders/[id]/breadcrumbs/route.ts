import { supabaseServer as supabase } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params

  try {
    // Calls the PostgreSQL function to get the folder hierarchy
    const { data, error } = await supabase.rpc("get_folder_path", { start_folder_id: id })

    if (error) {
      console.error("Error fetching breadcrumbs:", error)
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `Failed to fetch breadcrumbs: ${message}` }, { status: 500 })
  }
}
