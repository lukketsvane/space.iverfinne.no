import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

// This is the crucial line that ensures the function runs in a Node.js environment.
export const runtime = "nodejs"

export async function POST(request: Request): Promise<NextResponse> {
  // The `handleUpload` function from Vercel's SDK requires the body to be parsed.
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // This function generates the secure token for the client to upload the file.
        return {
          allowedContentTypes: [
            "model/gltf-binary",
            "application/octet-stream",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
          ],
        }
      },
      // We are NOT using onUploadCompleted here. The client will handle database logic.
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 400 })
  }
}
