/**
 * cargar-horarios.ts — CLI interactivo para descargar, parsear, validar
 * y subir horarios desde hum.umss.edu.bo a Supabase.
 *
 * Uso:  npx tsx scripts/cargar-horarios.ts
 */

import 'dotenv/config'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import chalk from 'chalk'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { select, confirm, input } from '@inquirer/prompts'

import { extractText, extractTextFromFile } from './lib/pdf-reader.js'
import { parseHorarioPdf, mergeNiveles, type HorarioParsed } from './lib/pdf-parser.js'
import { PayloadSchema, type Payload } from './lib/schemas.js'

/* ══════════════════════════════════════════════════════════════
   Constantes
   ══════════════════════════════════════════════════════════════ */

const HORARIO_PDF_URL = 'https://www.hum.umss.edu.bo/horarios/horario_pdf.php'
const SELECT_PHP_URL = 'https://www.hum.umss.edu.bo/horarios/select.php'
const OUTPUT_DIR = resolve(import.meta.dirname!, 'output')
const FACULTAD_ID = 1 // Humanidades

/* ══════════════════════════════════════════════════════════════
   Utilidades de consola
   ══════════════════════════════════════════════════════════════ */

const log = {
  info: (msg: string) => console.log(chalk.cyan('ℹ'), msg),
  ok: (msg: string) => console.log(chalk.green('✔'), msg),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
  err: (msg: string) => console.log(chalk.red('✖'), msg),
  title: (msg: string) => console.log('\n' + chalk.bold.underline(msg)),
}

/* ══════════════════════════════════════════════════════════════
   1. Detección de credenciales y conexión
   ══════════════════════════════════════════════════════════════ */

interface EnvCredentials {
  url: string
  anonKey: string
  serviceRoleKey: string
  label: string
}

function detectEnvLocal(): EnvCredentials | null {
  // Try both root and scripts/.env.local
  const rootEnv = resolve(process.cwd(), '.env.local')
  const scriptsEnv = resolve(process.cwd(), 'scripts', '.env.local')
  let envPath = ''
  if (existsSync(rootEnv)) envPath = rootEnv
  else if (existsSync(scriptsEnv)) envPath = scriptsEnv
  else {
    console.log('DEBUG ENV: No se encontró .env.local en', rootEnv, 'ni en', scriptsEnv)
    return null
  }

  console.log('DEBUG ENV: Leyendo .env.local desde', envPath)
  const content = readFileSync(envPath, 'utf-8')
  const vars: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    console.log('DEBUG ENV: línea leída:', JSON.stringify(trimmed))
    if (!trimmed || trimmed.startsWith('#')) continue
    // Permite espacios antes/después del = y valores vacíos
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i)
    if (match) {
      vars[match[1]] = match[2]
      console.log('DEBUG ENV: variable detectada:', match[1], '→', match[2])
    }
  }

  // Logging for env detection
  console.log('DEBUG ENV: detectEnvLocal loaded vars:', vars)

  const url = vars.PUBLIC_SUPABASE_URL || vars.VITE_SUPABASE_URL
  const anonKey = vars.PUBLIC_SUPABASE_KEY || vars.VITE_SUPABASE_KEY
  // Accept both PUBLIC_SERVICE_ROLE_KEY and VITE_SERVICE_ROLE_KEY
  const serviceRoleKey = vars.PUBLIC_SERVICE_ROLE_KEY || vars.VITE_SERVICE_ROLE_KEY

  console.log('DEBUG ENV: url:', url)
  console.log('DEBUG ENV: anonKey:', anonKey)
  console.log('DEBUG ENV: serviceRoleKey:', serviceRoleKey)

  if (!url || !anonKey || !serviceRoleKey) return null

  const isLocal = url.includes('localhost') || url.includes('127.0.0.1') || url.match(/192\.168\.\d+\.\d+/)
  return { url, anonKey, serviceRoleKey, label: isLocal ? 'Local (desarrollo)' : 'Remoto (producción)' }
}

async function setupSupabase(): Promise<SupabaseClient> {
  log.title('Configuración de Supabase')

  const envCreds = detectEnvLocal()

  if (envCreds) {
    log.info(`Credenciales encontradas en .env.local → ${chalk.bold(envCreds.label)}`)
    log.info(`URL: ${chalk.dim(envCreds.url)}`)

    const useEnv = await confirm({
      message: `¿Usar estas credenciales (${envCreds.label})?`,
      default: true,
    })

    if (useEnv) {
      return createClient(envCreds.url, envCreds.serviceRoleKey)
    }
  }

  // Manual input
  log.info('Ingresa las credenciales de Supabase manualmente:')
  const url = await input({ message: 'Supabase URL:' })
  const serviceRoleKey = await input({ message: 'Service Role Key:' })

  return createClient(url, serviceRoleKey)
}

/* ══════════════════════════════════════════════════════════════
   2. Obtener carreras desde la BD
   ══════════════════════════════════════════════════════════════ */

interface CarreraRow {
  id: number
  codigo: string
  nombre: string
}

async function fetchCarreras(sb: SupabaseClient): Promise<CarreraRow[]> {
  const { data, error } = await sb
    .from('carreras')
    .select('id, codigo, nombre')
    .eq('facultad_id', FACULTAD_ID)
    .order('nombre')

  if (error) throw new Error(`Error al obtener carreras: ${error.message}`)
  return (data ?? []) as CarreraRow[]
}

async function actualizarCarreras(sb: SupabaseClient): Promise<void> {
  log.info('Actualizando carreras desde hum.umss.edu.bo …')

  // Fetch the HTML page to get carreras
  const resp = await fetch('https://www.hum.umss.edu.bo/horarios/')
  if (!resp.ok) throw new Error(`HTTP ${resp.status} al acceder a la página de horarios`)

    const html = await resp.text()
  // Flexible regex: accepts single/double quotes, spaces, id, class, etc.
  const selectMatch = html.match(/<select[^>]*name=['"]?plan['"]?[^>]*>([\s\S]*?)<\/select>/i)
  if (!selectMatch) throw new Error('No se encontró el <select name="plan"> en el HTML')
  // Flexible: value can be quoted/unquoted, digits or text, tolerate spaces
  const optionRegex = /<option\s+value=['"]?([^'">\s]+)['"]?[^>]*>([^<]+)<\/option>/gi
  const carreras: { codigo: string; nombre: string }[] = []
  let m: RegExpExecArray | null

  while ((m = optionRegex.exec(selectMatch[1])) !== null) {
    const codigo = m[1]
    const nombre = m[2].trim()
    // Ignorar opción "Elija una Carrera" y códigos -1 o vacíos o no numéricos
    if (
      codigo === '-1' ||
      !/^[0-9]+$/.test(codigo) ||
      nombre.toLowerCase().includes('elija')
    ) {
      continue
    }
    carreras.push({ codigo, nombre })
  }
  if (carreras.length === 0) throw new Error('No se encontraron carreras en el HTML')

  log.info(`Encontradas ${carreras.length} carreras. Ejecutando upsert…`)

  const { data, error } = await sb.rpc('upsert_carreras', {
    p_facultad_id: FACULTAD_ID,
    p_carreras: carreras,
  })

  if (error) throw new Error(`Error en upsert_carreras: ${error.message}`)
  log.ok(`Carreras actualizadas: ${JSON.stringify(data)}`)
}

/* ══════════════════════════════════════════════════════════════
   3. Obtener niveles de una carrera desde el sitio web
   ══════════════════════════════════════════════════════════════ */

interface NivelOption {
  codigo: string
  nombre: string
}

async function fetchNivelesWeb(carreraCodigo: string): Promise<NivelOption[]> {
  const url = `${SELECT_PHP_URL}?select=nivel&plan=${carreraCodigo}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} al obtener niveles`)

  const html = await resp.text()
  const optionRegex = /<option\s+value="([^"]+)"[^>]*>([^<]+)<\/option>/g
  const niveles: NivelOption[] = []
  let m: RegExpExecArray | null

  while ((m = optionRegex.exec(html)) !== null) {
    if (m[1] && m[1] !== '%') {
      niveles.push({ codigo: m[1], nombre: m[2].trim() })
    }
  }

  return niveles
}

/* ══════════════════════════════════════════════════════════════
   4. Descargar PDF de horarios
   ══════════════════════════════════════════════════════════════ */

async function downloadPdf(carreraCodigo: string, nivel: string): Promise<Buffer> {
  const body = new URLSearchParams({
    plan: carreraCodigo,
    nivel,
    enviar: 'Enviar',
  })

  const resp = await fetch(HORARIO_PDF_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!resp.ok) throw new Error(`HTTP ${resp.status} al descargar PDF`)

  const contentType = resp.headers.get('content-type') ?? ''
  const arrayBuf = await resp.arrayBuffer()
  const buf = Buffer.from(arrayBuf)
  // Logging for debug
  console.log('DEBUG PDF content-type:', contentType)
  console.log('DEBUG PDF buf.slice(0, 16):', buf.slice(0, 16).toString())
  console.log('DEBUG PDF buf raw bytes:', buf.slice(0, 16))
  // Accept application/pdf or application/x-download if '%PDF' appears in first 512 bytes
  const isPdf = contentType.includes('pdf') ||
    (contentType.includes('x-download') && buf.slice(0, 512).toString().includes('%PDF'))
  if (!isPdf) {
    // Try to show text if not binary
    let preview = ''
    try { preview = buf.toString('utf8', 0, 200) } catch {}
    throw new Error(`Respuesta no es PDF (${contentType}): ${preview}`)
  }
  return buf
}

/* ══════════════════════════════════════════════════════════════
   5. Pipeline completo
   ══════════════════════════════════════════════════════════════ */

async function main() {
  console.log(chalk.bold.magenta('\n🎓 Cargador de Horarios — Fac. Humanidades\n'))

  // -- Setup --
  const sb = await setupSupabase()

  // -- Carreras --
  log.title('Selección de carrera')

  let carreras = await fetchCarreras(sb)

  if (carreras.length === 0) {
    log.warn('No hay carreras en la BD. Actualizando desde la web…')
    await actualizarCarreras(sb)
    carreras = await fetchCarreras(sb)
  }

  const ACTUALIZAR_VALUE = '__actualizar__'
  const TODAS_VALUE = '__todas__'
  const carreraChoice = await select({
    message: 'Elige una carrera:',
    choices: [
      { name: chalk.yellow('★ Todas las carreras (llenar toda la base)'), value: TODAS_VALUE },
      ...carreras.map((c) => ({
        name: `${c.nombre} (${c.codigo})`,
        value: String(c.id),
      })),
      { name: chalk.yellow('↻ Actualizar lista de carreras'), value: ACTUALIZAR_VALUE },
    ],
  })

  if (carreraChoice === ACTUALIZAR_VALUE) {
    await actualizarCarreras(sb)
    carreras = await fetchCarreras(sb)

    const newChoice = await select({
      message: 'Elige una carrera:',
      choices: [
        { name: chalk.yellow('★ Todas las carreras (llenar toda la base)'), value: TODAS_VALUE },
        ...carreras.map((c) => ({
          name: `${c.nombre} (${c.codigo})`,
          value: String(c.id),
        })),
      ],
    })
    if (newChoice === TODAS_VALUE) {
      await cargarTodasCarreras(sb, carreras)
      return
    }
    const carrera = carreras.find((c) => String(c.id) === newChoice)!
    await cargarUnaCarrera(sb, carrera)
    return
  }

  if (carreraChoice === TODAS_VALUE) {
    const confirmar = await confirm({
      message: chalk.red('¿Estás seguro que quieres cargar horarios de TODAS las carreras? (puede tardar varios minutos)'),
      default: false,
    })
    if (!confirmar) {
      log.info('Operación cancelada. No se cargó nada.')
      process.exit(0)
    }
    await cargarTodasCarreras(sb, carreras)
    return
  }

  const carrera = carreras.find((c) => String(c.id) === carreraChoice)!
  await cargarUnaCarrera(sb, carrera)
}

// Carga una sola carrera (extraído de main)
async function cargarUnaCarrera(sb: SupabaseClient, carrera: CarreraRow) {
  const chalk = (await import('chalk')).default
  const { extractText } = await import('./lib/pdf-reader.js')
  const { parseHorarioPdf } = await import('./lib/pdf-parser.js')
  const { PayloadSchema } = await import('./lib/schemas.js')
  const { resolve } = await import('path')
  const { mkdirSync, writeFileSync } = await import('fs')
  const log = {
    info: (msg: string) => console.log(chalk.cyan('ℹ'), msg),
    ok: (msg: string) => console.log(chalk.green('✔'), msg),
    warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
    err: (msg: string) => console.log(chalk.red('✖'), msg),
    title: (msg: string) => console.log('\n' + chalk.bold.underline(msg)),
  }
  log.ok(`Carrera: ${chalk.bold(carrera.nombre)} (codigo: ${carrera.codigo})`)
  log.title('Descarga y parseo')
  mkdirSync(OUTPUT_DIR, { recursive: true })
  log.info('Descargando PDF de todos los niveles (%) …')
  const pdfBuf = await downloadPdf(carrera.codigo, '%')
  const now = new Date()
  const dt = now.toISOString().replace(/[-:T]/g, '').slice(0, 12) // yyyymmddhhmm
  const outFile = resolve(OUTPUT_DIR, `${carrera.codigo}_todos_${dt}.pdf`)
  writeFileSync(outFile, pdfBuf)
  log.ok(`PDF guardado: ${outFile} (${pdfBuf.length} bytes)`)
  const pages = await extractText(new Uint8Array(pdfBuf))
  const result = parseHorarioPdf(pages)
  const payload = {
    carrera_id: carrera.id,
    gestion: result.gestion,
    niveles: result.niveles,
  } as Payload
  log.title('Validación')
  const validation = PayloadSchema.safeParse(payload)
  if (!validation.success) {
    log.err('El payload no pasó la validación:')
    for (const issue of validation.error.issues) {
      console.log(chalk.red(`  → [${issue.path.join('.')}] ${issue.message}`))
    }
    const failPath = resolve(OUTPUT_DIR, `${carrera.codigo}_FALLÓ_${dt}.json`)
    writeFileSync(failPath, JSON.stringify(payload, null, 2), 'utf-8')
    log.warn(`Payload guardado para inspección: ${failPath}`)
    return
  }
  log.ok('Validación exitosa ✓')
  log.title('Resumen')
  let totalMaterias = 0
  let totalGrupos = 0
  let totalClases = 0
  for (const nivel of payload.niveles) {
    console.log(chalk.bold(`  Nivel ${nivel.codigo} — ${nivel.nombre}`))
    for (const mat of nivel.materias) {
      const nClases = mat.grupos.reduce((sum, g) => sum + g.clases.length, 0)
      console.log(`    ${mat.codigo} ${mat.nombre}: ${mat.grupos.length} grupo(s), ${nClases} clase(s)`)
      totalMaterias++
      totalGrupos += mat.grupos.length
      totalClases += nClases
    }
  }
  console.log(
    chalk.dim(`\n  Total: ${totalMaterias} materias, ${totalGrupos} grupos, ${totalClases} clases`)
  )
  const jsonPath = resolve(OUTPUT_DIR, `${carrera.codigo}_payload_${dt}.json`)
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8')
  log.ok(`Payload JSON: ${jsonPath}`)
  log.title('Subida')
  const doUpload = await confirm({
    message: `¿Subir estos datos a Supabase (cargar_horarios)?`,
    default: true,
  })
  if (!doUpload) {
    log.info('Subida cancelada. El JSON queda guardado.')
    return
  }
  log.info('Ejecutando cargar_horarios …')
  const { data, error } = await sb.rpc('cargar_horarios', { payload })
  if (error) {
    log.err(`Error al subir: ${error.message}`)
    return
  }
  log.ok(`¡Subida exitosa! Resultado: ${JSON.stringify(data)}`)
}

// Carga todas las carreras
async function cargarTodasCarreras(sb: SupabaseClient, carreras: CarreraRow[]) {
  for (const carrera of carreras) {
    try {
      await cargarUnaCarrera(sb, carrera)
    } catch (err) {
      console.error(`Error al cargar ${carrera.nombre} (${carrera.codigo}):`, err)
    }
  }
  console.log('\n✔ Proceso de carga masiva finalizado.')
}

main().catch((err) => {
  log.err(err.message ?? err)
  process.exit(1)
})
