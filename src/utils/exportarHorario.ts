import html2canvas from 'html2canvas-pro'

/* ── Tipos públicos ────────────────────────────────────────────────── */

export interface EventoExport {
  materiaNombre: string
  grupoNumero: number | string
  docente: string
  aula: string
  /** Lunes | Martes | Miercoles | Jueves | Viernes | Sabado */
  dia: string
  /** HH:MM */
  horaInicio: string
  /** HH:MM */
  horaFin: string
  color: string
}

export interface LeyendaExport {
  color: string
  texto: string
}

export interface ExportOpts {
  eventos: EventoExport[]
  leyenda?: LeyendaExport[]
  titulo: string
  subtitulo?: string
  advertencias?: string[]
}

/* ── Geometría de página: carta horizontal a 96 dpi ────────────────── */

const PX_POR_PULGADA = 96
const MARGEN_PX = 31 // ≈ 8 mm
const PAGINA_W = Math.round(11 * PX_POR_PULGADA) // 1056
const PAGINA_H = Math.round(8.5 * PX_POR_PULGADA) // 816
const CONTENIDO_W = PAGINA_W - MARGEN_PX * 2
const CONTENIDO_H = PAGINA_H - MARGEN_PX * 2

const DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'] as const
const DIAS_ETIQUETA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/* ── Utilidades ────────────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

/** Quita acentos y normaliza para comparar nombres de día. */
function indiceDia(dia: string): number {
  const limpio = String(dia ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
  return DIAS.findIndex((d) => d.toLowerCase() === limpio)
}

/** "HH:MM" o "HH:MM:SS" → minutos desde medianoche. NaN si no es válido. */
function aMinutos(hora: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? '').trim())
  if (!m) return NaN
  return Number(m[1]) * 60 + Number(m[2])
}

function aHHMM(hora: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? '').trim())
  if (!m) return ''
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`
}

function deMinutos(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function parseColorToHex(input?: string): string | null {
  if (!input) return null
  const valor = input.trim()
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(valor)
  if (rgb) {
    return (
      '#' + [rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    )
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(valor)
  if (hex && hex[1]) {
    const v =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((c) => c + c)
            .join('')
        : hex[1]
    return '#' + v.toLowerCase()
  }
  return null
}

function componentes(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function aclarar(hex: string, cantidad: number): string {
  try {
    const [r, g, b] = componentes(hex)
    return (
      '#' +
      [r, g, b]
        .map((n) =>
          Math.round(n + (255 - n) * cantidad)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    )
  } catch {
    return hex
  }
}

function oscurecer(hex: string, cantidad: number): string {
  try {
    const [r, g, b] = componentes(hex)
    return (
      '#' +
      [r, g, b]
        .map((n) =>
          Math.round(n * (1 - cantidad))
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    )
  } catch {
    return hex
  }
}

const limitar = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/* ── Construcción de la rejilla a partir de los datos reales ───────── */

/** Tramo entre dos cortes horarios consecutivos: una fila de la tabla. */
interface Segmento {
  inicio: string
  fin: string
  inicioMin: number
  finMin: number
}

/** Una clase colocada en la rejilla, con el rango de celdas que ocupa. */
interface Bloque {
  ev: EventoExport
  dia: number
  /** Primer y último segmento (ambos inclusive) que cubre la clase. */
  filaInicio: number
  filaFin: number
  /** Primer carril del día y cuántos carriles abarca. */
  carril: number
  anchoCarriles: number
}

interface Rejilla {
  segmentos: Segmento[]
  /** Índices de DIAS que se muestran como columnas */
  dias: number[]
  /** Subcolumnas que necesita cada día para que ninguna clase se solape */
  carriles: number[]
  /** ocupacion[dia][carril][fila] → bloque que cubre esa celda */
  ocupacion: (Bloque | null)[][][]
}

/**
 * Las filas se cortan por todos los inicios y finales que existen de verdad en
 * la selección del usuario. Si una clase de 9:00 a 11:15 se cruza con otra de
 * 8:15 a 9:45, el día se parte en 8:15-9:00, 9:00-9:45 y 9:45-11:15, y cada
 * clase se extiende sobre los tramos que le corresponden en lugar de aparecer
 * como una fila suelta. Los tramos sin ninguna clase no ocupan fila.
 */
function construirRejilla(eventos: EventoExport[]): Rejilla {
  const validos: { ev: EventoExport; dia: number; inicioMin: number; finMin: number }[] = []
  const vistos = new Set<string>()

  for (const ev of eventos) {
    const dia = indiceDia(ev.dia)
    const inicio = aHHMM(ev.horaInicio)
    const fin = aHHMM(ev.horaFin)
    if (dia < 0 || !inicio || !fin) continue
    const inicioMin = aMinutos(inicio)
    const finMin = aMinutos(fin)
    if (!(finMin > inicioMin)) continue

    const id = `${ev.materiaNombre}|${ev.grupoNumero}|${dia}|${inicio}|${fin}`
    if (vistos.has(id)) continue
    vistos.add(id)
    validos.push({ ev: { ...ev, horaInicio: inicio, horaFin: fin }, dia, inicioMin, finMin })
  }

  const cortes = Array.from(new Set(validos.flatMap((v) => [v.inicioMin, v.finMin]))).sort(
    (a, b) => a - b,
  )

  const segmentos: Segmento[] = []
  for (let i = 0; i < cortes.length - 1; i++) {
    const inicioMin = cortes[i]!
    const finMin = cortes[i + 1]!
    if (!validos.some((v) => v.inicioMin < finMin && inicioMin < v.finMin)) continue
    segmentos.push({ inicioMin, finMin, inicio: deMinutos(inicioMin), fin: deMinutos(finMin) })
  }

  const conClases = new Set(validos.map((v) => v.dia))
  let dias: number[]
  if (conClases.size === 0) {
    dias = [0, 1, 2, 3, 4]
  } else {
    // Columnas desde el primer hasta el último día con clases: no se recorta
    // un día intermedio libre (es información real) pero sí se omite el sábado
    // vacío, que solo gastaría espacio en la hoja.
    const primero = Math.min(...conClases)
    const ultimo = Math.max(...conClases)
    dias = []
    for (let d = primero; d <= ultimo; d++) dias.push(d)
  }

  const carriles: number[] = Array.from({ length: DIAS.length }, () => 1)
  const ocupacion: (Bloque | null)[][][] = Array.from({ length: DIAS.length }, () => [
    Array.from({ length: segmentos.length }, () => null),
  ])

  for (const d of dias) {
    const delDia = validos
      .filter((v) => v.dia === d)
      .sort((a, b) => a.inicioMin - b.inicioMin || b.finMin - a.finMin)
    if (!delDia.length) continue

    // Cada clase va al primer carril que quede libre a su hora de inicio; el
    // número de carriles del día es el máximo de clases simultáneas.
    const finPorCarril: number[] = []
    const bloques: Bloque[] = []
    for (const v of delDia) {
      let carril = finPorCarril.findIndex((fin) => fin <= v.inicioMin)
      if (carril < 0) {
        carril = finPorCarril.length
        finPorCarril.push(v.finMin)
      } else {
        finPorCarril[carril] = v.finMin
      }

      let filaInicio = -1
      let filaFin = -1
      segmentos.forEach((s, i) => {
        if (s.inicioMin >= v.inicioMin && s.finMin <= v.finMin) {
          if (filaInicio < 0) filaInicio = i
          filaFin = i
        }
      })
      if (filaInicio < 0) continue

      bloques.push({ ev: v.ev, dia: d, filaInicio, filaFin, carril, anchoCarriles: 1 })
    }

    const total = Math.max(1, finPorCarril.length)
    carriles[d] = total
    const rejilla: (Bloque | null)[][] = Array.from({ length: total }, () =>
      Array.from({ length: segmentos.length }, () => null),
    )
    for (const b of bloques) {
      for (let f = b.filaInicio; f <= b.filaFin; f++) rejilla[b.carril]![f] = b
    }

    // Una clase sin ninguna otra simultánea ocupa todo el ancho de su día; solo
    // el tramo realmente compartido queda dividido en carriles.
    for (const b of bloques) {
      for (let c = b.carril + 1; c < total; c++) {
        let libre = true
        for (let f = b.filaInicio; f <= b.filaFin && libre; f++) if (rejilla[c]![f]) libre = false
        if (!libre) break
        for (let f = b.filaInicio; f <= b.filaFin; f++) rejilla[c]![f] = b
        b.anchoCarriles++
      }
    }

    ocupacion[d] = rejilla
  }

  return { segmentos, dias, carriles, ocupacion }
}

/**
 * Reparte el alto disponible entre las filas de forma proporcional a su
 * duración, con un mínimo legible y un máximo para que un bloque largo no se
 * coma la hoja. Nunca devuelve más alto del que se le da.
 */
function repartirAlturas(segmentos: Segmento[], disponible: number): number[] {
  const n = segmentos.length
  if (!n) return []

  const MIN = Math.min(26, Math.floor(disponible / n))
  const MAX = 150
  const duraciones = segmentos.map((s) => s.finMin - s.inicioMin)
  const alturas = duraciones.map(() => 0)
  const fijas = duraciones.map(() => false)
  let restante = disponible
  let pendiente = duraciones.reduce((a, b) => a + b, 0)

  // Reparto proporcional a la duración, elevando al mínimo legible los tramos
  // más cortos y repartiendo lo que queda entre los demás.
  for (let pasada = 0; pasada < 4; pasada++) {
    const libres = fijas.filter((f) => !f).length
    if (!libres) break
    for (let i = 0; i < n; i++) {
      if (fijas[i]) continue
      alturas[i] = pendiente > 0 ? (restante * duraciones[i]!) / pendiente : restante / libres
    }
    let ajustada = false
    for (let i = 0; i < n; i++) {
      if (fijas[i] || alturas[i]! >= MIN) continue
      alturas[i] = MIN
      fijas[i] = true
      restante -= MIN
      pendiente -= duraciones[i]!
      ajustada = true
    }
    if (!ajustada) break
  }

  // El tope se aplica sin repartir el sobrante: estirar el resto para llenar la
  // hoja rompería la proporción entre tramos de distinta duración.
  return alturas.map((a) => limitar(Math.floor(a), MIN, MAX))
}

/* ── Documento imprimible ──────────────────────────────────────────── */

function construirDocumento(opts: ExportOpts): string {
  const { segmentos, dias, carriles, ocupacion } = construirRejilla(opts.eventos)
  const leyenda = opts.leyenda ?? []
  const advertencias = (opts.advertencias ?? []).slice(0, 3)

  // Reparto vertical: todo debe caber en una sola hoja carta horizontal.
  const altoCabecera = opts.subtitulo ? 46 : 30
  const filasLeyenda = leyenda.length ? Math.ceil(leyenda.length / 3) : 0
  const altoLeyenda = filasLeyenda ? 22 + filasLeyenda * 17 : 0
  const altoAvisos = advertencias.length ? 8 + advertencias.length * 14 : 0
  const altoEncabezadoTabla = 26

  const disponible =
    CONTENIDO_H - altoCabecera - altoLeyenda - altoAvisos - altoEncabezadoTabla - 12
  const alturas = repartirAlturas(segmentos, disponible)

  const anchoHora = 88
  const anchoDia = Math.floor((CONTENIDO_W - anchoHora) / Math.max(1, dias.length))

  /** El detalle que cabe depende del tamaño real del bloque, no de la fila. */
  const contenido = (b: Bloque): string => {
    let alto = 0
    for (let f = b.filaInicio; f <= b.filaFin; f++) alto += alturas[f] ?? 0
    const ancho = Math.floor((anchoDia / carriles[b.dia]!) * b.anchoCarriles)

    const base = parseColorToHex(b.ev.color) || '#1976d2'
    const fondo = aclarar(base, 0.86)
    const borde = oscurecer(base, 0.12)
    const fuenteNombre = alto >= 58 ? 11 : alto >= 40 ? 10 : 9
    const fuenteDetalle = Math.max(7.5, fuenteNombre - 1.5)

    let interior = `<div class="ev-nombre" style="font-size:${fuenteNombre}px">G${escapeHtml(String(b.ev.grupoNumero))}: ${escapeHtml(b.ev.materiaNombre)}</div>`
    if (alto >= 46 && ancho >= 80 && b.ev.docente) {
      interior += `<div class="ev-detalle" style="font-size:${fuenteDetalle}px">${escapeHtml(b.ev.docente)}</div>`
    }
    if (alto >= 32 && b.ev.aula) {
      interior += `<div class="ev-detalle" style="font-size:${fuenteDetalle}px">${escapeHtml(b.ev.aula)}</div>`
    }
    return `style="background:${fondo};border-left:3px solid ${borde}">${interior}`
  }

  let filas = ''
  segmentos.forEach((seg, f) => {
    filas += `<tr style="height:${alturas[f]}px">`
    filas += `<td class="hora"><span>${seg.inicio}</span><span>${seg.fin}</span></td>`
    for (const d of dias) {
      // Los carriles libres contiguos se funden en una sola celda para que un
      // hueco no aparezca dividido por líneas que no significan nada.
      let libres = 0
      const cerrarLibres = () => {
        if (!libres) return
        filas += libres > 1 ? `<td colspan="${libres}"></td>` : '<td></td>'
        libres = 0
      }
      for (let c = 0; c < carriles[d]!; c++) {
        const b = ocupacion[d]![c]![f]
        if (!b) {
          libres++
          continue
        }
        cerrarLibres()
        // Las demás celdas del bloque ya las cubre su rowspan/colspan.
        if (b.filaInicio !== f || b.carril !== c) continue
        const filasQueOcupa = b.filaFin - b.filaInicio + 1
        filas +=
          '<td class="ev"' +
          (filasQueOcupa > 1 ? ` rowspan="${filasQueOcupa}"` : '') +
          (b.anchoCarriles > 1 ? ` colspan="${b.anchoCarriles}"` : '') +
          ' ' +
          contenido(b) +
          '</td>'
      }
      cerrarLibres()
    }
    filas += '</tr>'
  })

  const totalColumnas = dias.reduce((n, d) => n + carriles[d]!, 1)
  if (!segmentos.length) {
    filas = `<tr style="height:60px"><td class="vacio" colspan="${totalColumnas}">No hay clases seleccionadas</td></tr>`
  }

  const cols =
    `<col style="width:${anchoHora}px">` +
    dias
      .map((d) => {
        const ancho = Math.floor(anchoDia / carriles[d]!)
        return `<col style="width:${ancho}px">`.repeat(carriles[d]!)
      })
      .join('')

  const encabezados = dias
    .map(
      (d) =>
        `<th${carriles[d]! > 1 ? ` colspan="${carriles[d]}"` : ''}>${escapeHtml(DIAS_ETIQUETA[d]!)}</th>`,
    )
    .join('')

  const avisosHtml = advertencias.length
    ? `<div class="avisos">${advertencias
        .map((a) => `<div>⚠ ${escapeHtml(a)}</div>`)
        .join('')}</div>`
    : ''

  const leyendaHtml = leyenda.length
    ? `<ul class="leyenda">${leyenda
        .map((item) => {
          const color = parseColorToHex(item.color) || '#1976d2'
          return `<li><span class="punto" style="background:${color}"></span>${escapeHtml(item.texto)}</li>`
        })
        .join('')}</ul>`
    : ''

  const estilos = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      width: ${PAGINA_W}px;
      height: ${PAGINA_H}px;
      padding: ${MARGEN_PX}px;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .hoja { width: ${CONTENIDO_W}px; height: ${CONTENIDO_H}px; overflow: hidden; }
    .cabecera { text-align: center; margin-bottom: 8px; }
    .cabecera h1 { margin: 0; font-size: 17px; font-weight: 700; }
    .cabecera p { margin: 3px 0 0; font-size: 11px; color: #555; }
    .avisos { font-size: 10px; color: #b71c1c; margin-bottom: 4px; }
    table { width: ${CONTENIDO_W}px; border-collapse: collapse; table-layout: fixed; }
    th {
      height: ${altoEncabezadoTabla}px;
      background: #1565c0;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid #0d47a1;
    }
    td {
      border: 1px solid #d6d6d6;
      padding: 2px;
      vertical-align: top;
      overflow: hidden;
    }
    td.hora {
      background: #f2f4f7;
      font-size: 10px;
      font-weight: 600;
      color: #333;
      text-align: center;
      vertical-align: middle;
      white-space: nowrap;
      line-height: 1.25;
    }
    td.hora span { display: block; }
    td.vacio { text-align: center; color: #777; font-size: 12px; vertical-align: middle; }
    td.ev { padding: 2px 5px; line-height: 1.2; overflow: hidden; }
    .ev-nombre {
      font-weight: 600;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .ev-detalle {
      color: #444;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .leyenda {
      list-style: none;
      margin: 8px 0 0;
      padding: 0;
      column-count: 3;
      column-gap: 16px;
      font-size: 9.5px;
    }
    .leyenda li {
      break-inside: avoid;
      display: flex;
      align-items: center;
      gap: 5px;
      height: 17px;
      overflow: hidden;
      white-space: nowrap;
    }
    .punto { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
    @page { size: letter landscape; margin: 8mm; }
    @media print {
      body { width: auto; height: auto; padding: 0; }
      .hoja { height: auto; }
    }
  `

  return (
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    `<title>${escapeHtml(opts.titulo)}</title>` +
    `<style>${estilos}</style></head><body><div class="hoja">` +
    '<div class="cabecera">' +
    `<h1>${escapeHtml(opts.titulo)}</h1>` +
    (opts.subtitulo ? `<p>${escapeHtml(opts.subtitulo)}</p>` : '') +
    '</div>' +
    avisosHtml +
    `<table><colgroup>${cols}</colgroup>` +
    `<thead><tr><th>Horario</th>${encabezados}</tr></thead>` +
    `<tbody>${filas}</tbody></table>` +
    leyendaHtml +
    '</div></body></html>'
  )
}

/* ── Render offscreen ──────────────────────────────────────────────── */

async function renderizarCanvas(html: string): Promise<HTMLCanvasElement> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.border = '0'
  iframe.style.width = PAGINA_W + 'px'
  iframe.style.height = PAGINA_H + 'px'
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) throw new Error('No se pudo crear el documento de exportación')
    doc.open()
    doc.write(html)
    doc.close()

    try {
      const fuentes = (doc as Document & { fonts?: FontFaceSet }).fonts
      if (fuentes?.ready) await fuentes.ready
    } catch {
      /* sin soporte de Font Loading API */
    }
    await new Promise((r) => setTimeout(r, 150))

    const canvas = await html2canvas(doc.body, {
      backgroundColor: '#ffffff',
      useCORS: true,
      scale: 2,
      width: PAGINA_W,
      height: PAGINA_H,
      windowWidth: PAGINA_W,
      windowHeight: PAGINA_H,
    })
    if (!canvas.width || !canvas.height) throw new Error('El horario se generó vacío')
    return canvas
  } finally {
    iframe.remove()
  }
}

function nombreArchivo(opts: ExportOpts, extension: string): string {
  const partes = [opts.titulo, opts.subtitulo].filter(Boolean).join(' ')
  const base =
    partes
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase() || 'horario'
  return `${base}.${extension}`
}

/* ── API pública ───────────────────────────────────────────────────── */

export async function descargarHorario(opts: ExportOpts): Promise<void> {
  const canvas = await renderizarCanvas(construirDocumento(opts))
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('No se pudo generar la imagen del horario')

  const archivo = nombreArchivo(opts, 'png')
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = archivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function imprimirHorario(opts: ExportOpts): Promise<void> {
  const html = construirDocumento(opts)
  const ventana = window.open('', '_blank')

  if (ventana) {
    const doc = ventana.document
    doc.open()
    doc.write(html)
    doc.close()
    ventana.focus()
    setTimeout(() => {
      try {
        ventana.print()
      } catch {
        /* el usuario puede imprimir manualmente */
      }
    }, 400)
    return
  }

  // Bloqueador de pop-ups: imprimir desde un iframe en la misma página.
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    iframe.remove()
    throw new Error('No se pudo preparar la impresión')
  }
  doc.open()
  doc.write(html)
  doc.close()

  await new Promise((r) => setTimeout(r, 400))
  try {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  } finally {
    setTimeout(() => iframe.remove(), 60_000)
  }
}
