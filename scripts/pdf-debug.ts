// Quick script to extract text from sample PDF
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// Point workerSrc to the actual worker file (needs file:// URL on Windows)
import { pathToFileURL } from 'url'
const pdfjsDir = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))
;(pdfjsLib as any).GlobalWorkerOptions.workerSrc =
  pathToFileURL(join(pdfjsDir, 'legacy', 'build', 'pdf.worker.mjs')).href

const pdfPath = process.argv[2] || 'scripts/output/sample_A.pdf'
const data = new Uint8Array(readFileSync(pdfPath))

const doc = await (pdfjsLib as any).getDocument({ data, useSystemFonts: true }).promise
console.log(`Pages: ${doc.numPages}\n`)

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  console.log(`=== PAGE ${i} ===`)
  // Print items with their positions for structure analysis
  for (const item of content.items) {
    if ('str' in item && item.str.trim()) {
      const t = item.transform
      console.log(`[x:${Math.round(t[4])}, y:${Math.round(t[5])}] "${item.str}"`)
    }
  }
  console.log('')
}
