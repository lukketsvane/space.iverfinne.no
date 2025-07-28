import { supabaseServer as supabase } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  try {
    const { data, error } = await supabase.from("folders").select("id, name").order("name")

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `Failed to fetch folders: ${message}` }, { status: 500 })
  }
}
