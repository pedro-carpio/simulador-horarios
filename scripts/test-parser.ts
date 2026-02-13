/**
 * Quick test: parse the sample PDF and print the structured result.
 */
import { extractTextFromFile } from './lib/pdf-reader.js'
import { parseHorarioPdf } from './lib/pdf-parser.js'
import { PayloadSchema } from './lib/schemas.js'

const pdfPath = process.argv[2] || 'scripts/output/sample_A.pdf'

console.log(`Parsing: ${pdfPath}\n`)

const pages = await extractTextFromFile(pdfPath)
const result = parseHorarioPdf(pages)

console.log('=== Parsed result ===')
console.log(JSON.stringify(result, null, 2))

// Quick validation test with a fake carrera_id
const payload = {
  carrera_id: 1,
  gestion: result.gestion,
  niveles: result.niveles,
}

console.log('\n=== Validation ===')
const validation = PayloadSchema.safeParse(payload)

if (validation.success) {
  console.log('✔ Payload válido')
} else {
  console.log('✖ Errores de validación:')
  for (const issue of validation.error.issues) {
    console.log(`  → [${issue.path.join('.')}] ${issue.message}`)
  }
}

// Stats
let materias = 0, grupos = 0, clases = 0
for (const n of result.niveles) {
  for (const m of n.materias) {
    materias++
    for (const g of m.grupos) {
      grupos++
      clases += g.clases.length
    }
  }
}
console.log(`\nStats: ${materias} materias, ${grupos} grupos, ${clases} clases`)
