import { supabaseServer as supabase } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

const PAGE_SIZE = 20

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = Number.parseInt(searchParams.get("page") || "0", 10)
  const offset = page * PAGE_SIZE

  try {
    const {
      data: models,
      error,
      count,
    } = await supabase
      .from("models")
      .select("*", { count: "exact" })
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw error

    return NextResponse.json({
      models,
      nextPage: offset + PAGE_SIZE < (count ?? 0) ? page + 1 : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `Failed to fetch public models: ${message}` }, { status: 500 })
  }
}
