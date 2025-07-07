import { supabase } from "@/lib/supabase"
import { del } from "@vercel/blob"
import { NextResponse } from "next/server"

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const body = await request.json()

  const { data, error } = await supabase.from("models").update(body).eq("id", id).select().single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { id } = params

  // First, get the model to find its blob URLs
  const { data: model, error: fetchError } = await supabase.from("models").select("*").eq("id", id).single()

  if (fetchError || !model) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 })
  }

  // Delete blobs from Vercel Blob storage
  const urlsToDelete = [model.model_url]
  if (model.thumbnail_url && !model.thumbnail_url.startsWith("/placeholder.svg")) {
    urlsToDelete.push(model.thumbnail_url)
  }
  await del(urlsToDelete)

  // Then, delete the record from Supabase
  const { error: deleteError } = await supabase.from("models").delete().eq("id", id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ message: "Model deleted successfully" }, { status: 200 })
}
