import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.NEON_NEON_DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Number.parseInt(searchParams.get("page") || "0")
    const limit = 20
    const offset = page * limit

    // Get public models with pagination
    const models = await sql`
      SELECT 
        id,
        name,
        model_url,
        thumbnail_url,
        created_at,
        view_settings,
        is_public,
        folder_id
      FROM models 
      WHERE is_public = true 
      ORDER BY created_at DESC 
      LIMIT ${limit + 1} 
      OFFSET ${offset}
    `

    const hasMore = models.length > limit
    const modelsToReturn = hasMore ? models.slice(0, -1) : models

    return NextResponse.json({
      models: modelsToReturn,
      nextPage: hasMore ? page + 1 : null,
    })
  } catch (error) {
    console.error("Error fetching public models:", error)
    return NextResponse.json({ error: "Failed to fetch models" }, { status: 500 })
  }
}
