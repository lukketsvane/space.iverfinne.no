export function removeBackground(
  dataUrl: string,
  options: { keyColor: { r: number; g: number; b: number }; tolerance: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("Could not get canvas context"))

      ctx.drawImage(image, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const { keyColor, tolerance } = options

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        const distance = Math.sqrt(
          Math.pow(r - keyColor.r, 2) + Math.pow(g - keyColor.g, 2) + Math.pow(b - keyColor.b, 2),
        )

        if (distance < tolerance) {
          data[i + 3] = 0 // Set alpha to 0
        }
      }
      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL("image/png"))
    }
    image.onerror = (err) => reject(err)
    image.src = dataUrl
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return await res.blob()
}
