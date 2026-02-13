import { extractTextFromFile } from './lib/pdf-reader.js'
import { parseHorarioPdf } from './lib/pdf-parser.js'
import { PayloadSchema } from './lib/schemas.js'

for (const file of process.argv.slice(2)) {
  console.log(`\n━━━ ${file} ━━━`)
  const pages = await extractTextFromFile(file)
  const r = parseHorarioPdf(pages)

  console.log(`Carrera: ${r.carrera}`)
  console.log(`Nivel global: ${r.nivel_codigo} (${r.nivel_nombre})`)
  console.log(`Gestión: ${r.gestion}`)
  console.log(`Niveles: ${r.niveles.length}`)

  let mats = 0, grps = 0, cls = 0
  for (const n of r.niveles) {
    const nCls = n.materias.reduce((s, m) => s + m.grupos.reduce((s2, g) => s2 + g.clases.length, 0), 0)
    console.log(`  ${n.codigo} ${n.nombre}: ${n.materias.length} mat, ${nCls} cls`)
    mats += n.materias.length
    grps += n.materias.reduce((s, m) => s + m.grupos.length, 0)
    cls += nCls
  }
  console.log(`Total: ${mats} materias, ${grps} grupos, ${cls} clases`)

  const v = PayloadSchema.safeParse({ carrera_id: 1, gestion: r.gestion, niveles: r.niveles })
  console.log(v.success ? '✔ Válido' : '✖ Inválido: ' + v.error!.issues.map(i => `[${i.path.join('.')}] ${i.message}`).join(', '))
}
