import { supabaseServer as supabase } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const { data, error } = await supabase.from("models").select("*").eq("id", id).single()

  if (error) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 })
  }

  // Ensure the model is public before returning it
  if (!data.is_public) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 })
  }

  return NextResponse.json(data)
}
