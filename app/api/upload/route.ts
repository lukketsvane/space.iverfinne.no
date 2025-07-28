import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch (e) {
    return NextResponse.json({ error: "Failed to parse request body." }, { status: 400 })
  }

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
            console.error("Error parsing clientPayload:", error)
            // Handle case where clientPayload is not valid JSON
          }
        }

        const { isThumbnail } = payload

        return {
          // If it's a thumbnail, we want to overwrite, so we disable the random suffix.
          // If it's a model, we want a unique name, so we enable the random suffix.
          addRandomSuffix: isThumbnail !== true,
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
        // This callback is called after the file is uploaded.
        // We don't do anything here because the client-side will handle
        // updating the database.
        console.log("Blob upload completed:", blob.url)
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error("Error in handleUpload:", error)
    return NextResponse.json({ error: `Vercel Blob upload error: ${(error as Error).message}` }, { status: 400 })
  }
}
