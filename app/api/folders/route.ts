import { supabaseServer as supabase } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const { name, parent_id } = await request.json()

  if (!name) {
    return NextResponse.json({ error: "Folder name is required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("folders")
    .insert([{ name, parent_id: parent_id || null }])
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
