import type React from "react"
import { Inter } from "next/font/google"

// If you don't have this font, you can install it with `npm install next/font`
// or change it to a default one.
const inter = Inter({ subsets: ["latin"], display: "swap" })

export default function ViewLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <div className={`${inter.className} bg-black`}>{children}</div>
}
