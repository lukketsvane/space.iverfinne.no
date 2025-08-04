import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { message: "The BLOB_READ_WRITE_TOKEN environment variable is not set." },
      { status: 401 }, // 401 Unauthorized is more appropriate
    )
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
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
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ message: `Upload failed: ${message}` }, { status: 400 })
  }
}
