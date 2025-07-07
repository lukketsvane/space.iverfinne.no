import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string) => {
        return {
          allowedContentTypes: [
            "model/gltf-binary",
            "application/octet-stream",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
          ],
          tokenPayload: JSON.stringify({
            // Optional: pass any custom data to the onUploadCompleted callback.
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("Blob upload completed", blob, tokenPayload)
        try {
          // Server-side logic after upload completes
        } catch (error) {
          throw new Error("Could not run post-upload logic")
        }
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Error in upload handler:", message)
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 400 })
  }
}
