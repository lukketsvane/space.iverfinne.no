import { handleUpload } from "@vercel/blob/client"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(request: Request): Promise<NextResponse> {
  // The request body should not be consumed here.
  // The `handleUpload` function will read the request body itself.

  try {
    const jsonResponse = await handleUpload({
      request, // Pass the raw request object directly to the handler.
      onBeforeGenerateToken: async (pathname: string) => {
        return {
          // Allow .glb files, which can have either of these content types.
          allowedContentTypes: ["model/gltf-binary", "application/octet-stream"],
          tokenPayload: JSON.stringify({
            // Optional: pass any custom data to the onUploadCompleted callback.
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // This callback is called after the file is uploaded to Vercel Blob.
        console.log("Blob upload completed", blob, tokenPayload)
        try {
          // You can add any server-side logic here, e.g., saving the blob.url to your database.
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
