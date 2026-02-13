/**
 * pdf-reader.ts — Extracts structured text items from a PDF buffer using pdfjs-dist.
 * Returns an array of { text, x, y } per page for downstream parsing.
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

// Dynamic import to avoid top-level ESM issues
let pdfjsLib: any

async function ensurePdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const pkgDir = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      pathToFileURL(join(pkgDir, 'legacy', 'build', 'pdf.worker.mjs')).href
  }
  return pdfjsLib
}

export interface TextItem {
  text: string
  x: number
  y: number
}

export interface PdfPage {
  pageNum: number
  items: TextItem[]
}

/**
 * Extract text items with positions from a PDF file path.
 */
export async function extractTextFromFile(filePath: string): Promise<PdfPage[]> {
  const data = new Uint8Array(readFileSync(filePath))
  return extractText(data)
}

/**
 * Extract text items with positions from a PDF buffer.
 */
export async function extractText(data: Uint8Array): Promise<PdfPage[]> {
  const lib = await ensurePdfjs()
  const doc = await lib.getDocument({ data, useSystemFonts: true }).promise
  const pages: PdfPage[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items: TextItem[] = []

    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        items.push({
          text: item.str.trim(),
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
        })
      }
    }

    pages.push({ pageNum: i, items })
  }

  return pages
}
