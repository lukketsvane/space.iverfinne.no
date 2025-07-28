import { supabaseServer as supabase } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const { name, description } = await request.json()

  if (!name && description === undefined) {
    return NextResponse.json({ error: "Name or description is required" }, { status: 400 })
  }

  const updateData: { name?: string; description?: string } = {}
  if (name) {
    updateData.name = name
  }
  if (description !== undefined) {
    updateData.description = description
  }

  const { data, error } = await supabase.from("folders").update(updateData).eq("id", id).select().single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { id } = params

  // Check if folder is empty
  const { data: children, error: childrenError } = await supabase
    .from("folders")
    .select("id")
    .eq("parent_id", id)
    .limit(1)

  const { data: models, error: modelsError } = await supabase.from("models").select("id").eq("folder_id", id).limit(1)

  if (childrenError || modelsError) {
    return NextResponse.json({ error: "Could not verify if folder is empty" }, { status: 500 })
  }

  if (children.length > 0 || models.length > 0) {
    return NextResponse.json({ error: "Folder is not empty" }, { status: 400 })
  }

  // Delete the folder
  const { error } = await supabase.from("folders").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ message: "Folder deleted successfully" }, { status: 200 })
}
