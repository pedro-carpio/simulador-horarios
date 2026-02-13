/**
 * pdf-parser.ts — Parses raw PDF text items into structured horario data
 * matching the `cargar_horarios` RPC payload shape.
 *
 * PDF structure discovered from analysis:
 * - Page 1 header: Carrera, Nivel, Gestion
 * - MATERIA blocks: "MATERIA:" at x≈31, name+code at x≈88
 * - Grupo blocks: "Grupo:" at x≈31, number at x≈88
 * - Class rows:   Dia at x≈130, Docente at x≈201, Aula at x≈494, Horario at x≈529
 */

import type { PdfPage, TextItem } from './pdf-reader.js'

/* -- Tipos de salida --------------------------------------- */

export interface ClaseParsed {
  dia: string
  docente: string
  aula: string
  hora_inicio: string
  hora_fin: string
}

export interface GrupoParsed {
  numero: string
  clases: ClaseParsed[]
}

export interface MateriaParsed {
  nombre: string
  codigo: string
  grupos: GrupoParsed[]
}

export interface NivelParsed {
  codigo: string
  nombre: string
  materias: MateriaParsed[]
}

export interface HorarioParsed {
  carrera: string
  nivel_nombre: string
  nivel_codigo: string
  gestion: string
  niveles: NivelParsed[]
}

/* -- Mapas de normalización -------------------------------- */

const DIA_MAP: Record<string, string> = {
  LUNES: 'Lunes',
  MARTES: 'Martes',
  MIERCOLES: 'Miercoles',
  MIÉRCOLES: 'Miercoles',
  JUEVES: 'Jueves',
  VIERNES: 'Viernes',
  SABADO: 'Sabado',
  SÁBADO: 'Sabado',
}

const NIVEL_NOMBRE_A_CODIGO: Record<string, string> = {
  PRIMERO: 'A',
  SEGUNDO: 'B',
  TERCERO: 'C',
  CUARTO: 'D',
  QUINTO: 'E',
  SEXTO: 'F',
  SEPTIMO: 'G',
  OCTAVO: 'H',
  NOVENO: 'I',
  DECIMO: 'J',
}

const DIAS_VALIDOS = new Set(Object.keys(DIA_MAP))

/* -- Utilidades -------------------------------------------- */

/** Title Case: "TRABAJO SOCIAL" → "Trabajo Social" */
function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    // Fix common connectors that shouldn't be capitalized
    .replace(/\b(De|Del|La|Las|Los|El|Al|Y|E|Para|Por|Con)\b/g, (m) => m.toLowerCase())
    // But capitalize first word
    .replace(/^\S/, (c) => c.toUpperCase())
}

/** Strip "Doc. " prefix and title-case the docente name */
function normalizeDocente(raw: string): string {
  const stripped = raw.replace(/^Doc\.\s*/i, '')
  return titleCase(stripped)
}

/** Parse "HH:MM - HH:MM" into [hora_inicio, hora_fin] */
function parseHorario(raw: string): [string, string] {
  const match = raw.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
  if (!match) throw new Error(`Horario inválido: "${raw}"`)
  return [match[1], match[2]]
}

/** Extract materia code from name like "HIST. E INTROD.AL TRABAJO SOCIAL (1813001)" */
function parseMateriaLine(raw: string): { nombre: string; codigo: string } {
  const match = raw.match(/^(.+?)\s*\((\d+)\)\s*$/)
  if (!match) throw new Error(`No se pudo parsear materia: "${raw}"`)
  return {
    nombre: titleCase(match[1].trim()),
    codigo: match[2],
  }
}

/* -- Helpers internos del parser ---------------------------- */

/** Items to skip: header labels, footers, decorative brackets */
const SKIP_TEXTS = new Set([
  'Dia', 'Docente / Auxiliar', 'Aula', 'Horario', '[]',
  'FACULTAD DE HUMANIDADES Y CS. DE LA EDUCACIÓN',
  'SISTEMA INTEGRADO DE GESTIÓN ACADÉMICA V3.0',
  'Unidad de Tecnologías de la Información',
])

function isFooter(item: TextItem): boolean {
  return item.y <= 40
}

function isHeaderLabel(item: TextItem): boolean {
  return SKIP_TEXTS.has(item.text) || item.text.startsWith('© 2021') || item.text.startsWith('Fecha/Hora')
}

/* -- Parser principal -------------------------------------- */

/**
 * Parse all pages of a PDF into structured horario data.
 *
 * Handles both single-nivel PDFs (nivel=A) and multi-nivel PDFs (nivel=%).
 * In multi-nivel PDFs the header block (Carrera/Nivel/Gestion) repeats
 * inline each time a new nivel begins — sometimes mid-page.
 */
export function parseHorarioPdf(pages: PdfPage[]): HorarioParsed {
  // Flatten all items across pages (keeping page order)
  const allItems: TextItem[] = pages.flatMap((p) => p.items)

  // Result accumulators
  const niveles: NivelParsed[] = []
  let carrera = ''
  let gestion = ''

  // Current state
  let currentNivel: NivelParsed | null = null
  let currentMateria: MateriaParsed | null = null
  let currentGrupo: GrupoParsed | null = null

  /** Flush the current grupo → materia → nivel chain */
  function flush() {
    if (currentGrupo && currentMateria) {
      currentMateria.grupos.push(currentGrupo)
      currentGrupo = null
    }
    if (currentMateria && currentNivel) {
      currentNivel.materias.push(currentMateria)
      currentMateria = null
    }
  }

  /** Flush everything including the current nivel into the result array */
  function flushNivel() {
    flush()
    if (currentNivel && currentNivel.materias.length > 0) {
      niveles.push(currentNivel)
    }
    currentNivel = null
  }

  for (let i = 0; i < allItems.length; i++) {
    const it = allItems[i]

    // Skip footers and decorative items
    if (isFooter(it) || isHeaderLabel(it)) continue

    // -- HEADER BLOCK: "Carrera:" signals a (new) nivel section --
    if (it.text === 'Carrera:') {
      // Flush previous nivel
      flushNivel()

      // Read the header fields that follow on the same Y row (±5)
      const headerY = it.y
      let nivelNombre = ''

      // Scan ahead to consume the header fields
      let j = i + 1
      while (j < allItems.length && allItems[j].y >= headerY - 10) {
        const h = allItems[j]
        // Carrera name: immediately after "Carrera:" at x≈74
        if (j === i + 1 && h.x >= 50 && h.x <= 200) {
          carrera = h.text
        }
        if (h.text === 'Nivel:' && allItems[j + 1]) {
          nivelNombre = allItems[j + 1].text
          j++ // skip nivel value
        }
        if (h.text.startsWith('Gestion') && allItems[j + 1]) {
          gestion = allItems[j + 1].text
          j++ // skip gestion value
        }
        j++
      }

      const nivelCodigo = NIVEL_NOMBRE_A_CODIGO[nivelNombre.toUpperCase()] ?? nivelNombre
      currentNivel = {
        codigo: nivelCodigo,
        nombre: titleCase(nivelNombre),
        materias: [],
      }

      i = j - 1 // advance past header block
      continue
    }

    // No nivel context yet — skip
    if (!currentNivel) continue

    // -- MATERIA marker --
    if (it.text === 'MATERIA:' && it.x <= 40) {
      flush()

      // Next item is the materia name+code
      const nextItem = allItems[i + 1]
      if (!nextItem) throw new Error('MATERIA: sin nombre a continuación')

      const { nombre, codigo } = parseMateriaLine(nextItem.text)
      currentMateria = { nombre, codigo, grupos: [] }
      i++ // skip the name item
      continue
    }

    // -- GRUPO marker --
    if (it.text === 'Grupo:' && it.x <= 40) {
      // Flush previous grupo (but stay in same materia)
      if (currentGrupo && currentMateria) {
        currentMateria.grupos.push(currentGrupo)
      }

      const nextItem = allItems[i + 1]
      if (!nextItem) throw new Error('Grupo: sin número a continuación')

      // Guardar el grupo como texto tal cual aparece
      currentGrupo = { numero: nextItem.text.trim(), clases: [] };
      i++; // skip number
      continue
    }

    // -- Class data row: detect by day name at x≈130 --
    if (it.x >= 100 && it.x <= 180 && DIAS_VALIDOS.has(it.text.toUpperCase())) {
      if (!currentGrupo) continue

      const dia = DIA_MAP[it.text.toUpperCase()]
      if (!dia) continue

      // Look for docente, aula, horario on the same Y level (within ±3)
      const y = it.y
      const sameRow = allItems.filter(
        (other, idx) => idx > i && Math.abs(other.y - y) <= 3 && other.x > it.x
      )

      // Docente is around x≈201, Aula around x≈488-496, Horario around x≈529
      const docenteItem = sameRow.find((r) => r.x >= 180 && r.x <= 350)
      const aulaItem = sameRow.find((r) => r.x >= 480 && r.x <= 525)
      const horarioItem = sameRow.find((r) => r.x >= 525)

      if (!docenteItem || !horarioItem) {
        console.warn(`  ⚠ Fila incompleta en y=${y}: dia=${it.text}, faltan datos`)
        continue
      }

      const [hora_inicio, hora_fin] = parseHorario(horarioItem.text)

      currentGrupo.clases.push({
        dia,
        docente: normalizeDocente(docenteItem.text),
        aula: aulaItem?.text ?? 'S/A',
        hora_inicio,
        hora_fin,
      })
      continue
    }
  }

  // Flush last nivel
  flushNivel()

  // Determine overall nivel info
  const isSingle = niveles.length === 1
  const nivelNombreGlobal = isSingle ? niveles[0].nombre : 'Todos'
  const nivelCodigoGlobal = isSingle ? niveles[0].codigo : '%'

  return {
    carrera: titleCase(carrera),
    nivel_nombre: nivelNombreGlobal,
    nivel_codigo: nivelCodigoGlobal,
    gestion,
    niveles,
  }
}

/**
 * Merge multiple single-nivel HorarioParsed results into one with multiple niveles.
 */
export function mergeNiveles(parsed: HorarioParsed[]): HorarioParsed {
  if (parsed.length === 0) throw new Error('No hay datos para combinar')
  const base = parsed[0]
  return {
    carrera: base.carrera,
    nivel_nombre: 'Todos',
    nivel_codigo: '%',
    gestion: base.gestion,
    niveles: parsed.flatMap((p) => p.niveles),
  }
}
