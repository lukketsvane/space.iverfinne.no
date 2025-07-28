import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: { isThumbnail?: boolean } = {}
        if (clientPayload) {
          try {
            payload = JSON.parse(clientPayload)
          } catch (error) {
            // Ignore malformed client payload
          }
        }
        const { isThumbnail } = payload

        return {
          // Don't add a random suffix for thumbnails to allow overwriting
          addRandomSuffix: !isThumbnail,
          // Pass the original pathname for thumbnails to ensure it's not changed
          pathname: isThumbnail ? pathname : undefined,
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
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("Blob upload completed:", blob.url)
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
