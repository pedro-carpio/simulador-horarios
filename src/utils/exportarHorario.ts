import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

/**
 * Carta horizontal: 279.4 × 215.9 mm
 * Con márgenes de 12 mm → área útil: 255.4 × 191.9 mm
 */
const MARGEN = 12 // mm
const ANCHO_PDF = 279.4
const ALTO_PDF = 215.9
const AREA_W = ANCHO_PDF - MARGEN * 2
const AREA_H = ALTO_PDF - MARGEN * 2

interface ExportOpts {
  /** Elemento DOM del calendario + leyenda */
  elemento: HTMLElement
  titulo: string
  subtitulo?: string
}

async function generarPDF(opts: ExportOpts): Promise<jsPDF> {
  const { elemento, titulo, subtitulo } = opts

  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
  const deviceScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const scale = isMobile ? 1 : Math.min(2, Math.max(1, deviceScale))

  let targetElement: HTMLElement = elemento
  let removedClone = false
  try {
    const rect = elemento.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      const clone = elemento.cloneNode(true) as HTMLElement
      clone.style.position = 'absolute'
      clone.style.left = '-9999px'
      clone.style.top = '0'
      clone.style.zIndex = '99999'
      clone.style.display = 'block'
      const pxPerMm = 96 / 25.4
      const desiredCssPx = Math.max(200, Math.round((AREA_W * pxPerMm) / scale))
      const maxAllowed = window.innerWidth || desiredCssPx
      const width = Math.min(desiredCssPx, maxAllowed)
      clone.style.width = width + 'px'
      clone.style.background = '#ffffff'
      document.body.appendChild(clone)
      targetElement = clone
      removedClone = true
      try {
        const fonts: any = (document as any).fonts
        if (fonts && 'ready' in fonts && fonts.ready instanceof Promise) await fonts.ready
      } catch (e) {
        // ignore
      }
    }

    const canvas = await html2canvas(targetElement, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
    })

    if (canvas.width === 0 || canvas.height === 0) throw new Error('Elemento capturado 0x0')

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })

    let cursorY = MARGEN
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text(titulo, ANCHO_PDF / 2, cursorY, { align: 'center' })
    cursorY += 7
    if (subtitulo) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      pdf.text(subtitulo, ANCHO_PDF / 2, cursorY, { align: 'center' })
      cursorY += 6
    }
    cursorY += 2

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.9))
    if (!blob) throw new Error('No blob')
    const imgData = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(new Error('Error reading blob'))
      fr.readAsDataURL(blob)
    })

    const pxPerMm = 96 / 25.4
    const imageWidthMm = canvas.width / pxPerMm
    const imageHeightMm = canvas.height / pxPerMm
    const maxImgH = ALTO_PDF - cursorY - MARGEN
    const scaleFactor = Math.min(AREA_W / imageWidthMm, maxImgH / imageHeightMm, 1)
    const finalW = imageWidthMm * scaleFactor
    const finalH = imageHeightMm * scaleFactor

    pdf.addImage(imgData, 'PNG', MARGEN, cursorY, finalW, finalH)
    return pdf
  } finally {
    if (removedClone && targetElement && targetElement.parentElement) targetElement.parentElement.removeChild(targetElement)
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])
}

// Parse basic CSS color strings (rgb(...), rgba(...), #rrggbb, #rgb)
function parseColorToHex(input?: string): string | null {
  if (!input) return null
  input = input.trim()
  // rgb/rgba
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/i.exec(input)
  if (rgb) {
    const r = Number(rgb[1])
    const g = Number(rgb[2])
    const b = Number(rgb[3])
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
  }
  // hex
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input)
  if (hex && hex[1]) {
    let v = hex[1]
    if (v && v.length === 3) v = v.split('').map((c) => c + c).join('')
    return '#' + v.toLowerCase()
  }
  return null
}

function darkenHex(hex: string, amount = 0.15): string {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    const nr = Math.max(0, Math.min(255, Math.round(r * (1 - amount))))
    const ng = Math.max(0, Math.min(255, Math.round(g * (1 - amount))))
    const nb = Math.max(0, Math.min(255, Math.round(b * (1 - amount))))
    return '#' + [nr, ng, nb].map((n) => n.toString(16).padStart(2, '0')).join('')
  } catch (e) {
    return hex
  }
}

function lightenHex(hex: string, amount = 0.85): string {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    const nr = Math.max(0, Math.min(255, Math.round(r + (255 - r) * amount)))
    const ng = Math.max(0, Math.min(255, Math.round(g + (255 - g) * amount)))
    const nb = Math.max(0, Math.min(255, Math.round(b + (255 - b) * amount)))
    return '#' + [nr, ng, nb].map((n) => n.toString(16).padStart(2, '0')).join('')
  } catch (e) {
    return hex
  }
}

function readableTextColor(hex: string): string {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    // luminance
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return lum > 160 ? '#000000' : '#ffffff'
  } catch (e) {
    return '#000'
  }
}

function generatePrintableHTMLFromCalendar(elemento: HTMLElement): string {
  try {
    const dayContainers = Array.from(elemento.querySelectorAll('.v-calendar-daily__day')) as HTMLElement[]
    if (!dayContainers.length) return ''

    const rows = 11
    const startHour = 6
    const startMinute = 45
    const minutesStep = 90
    const times: string[] = []
    for (let i = 0; i < rows; i++) {
      const startTotal = startHour * 60 + startMinute + i * minutesStep
      const endTotal = startTotal + minutesStep
      const sh = Math.floor(startTotal / 60)
      const sm = startTotal % 60
      const eh = Math.floor(endTotal / 60)
      const em = endTotal % 60
      const startStr = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`
      const endStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
      times.push(`${startStr} - ${endStr}`)
    }

    const grid: string[][] = Array.from({ length: rows }, () => Array.from({ length: 6 }, () => ''))
    const firstInterval = elemento.querySelector('.v-calendar-daily__interval') as HTMLElement | null
    const intervalPx = firstInterval ? (parseFloat(window.getComputedStyle(firstInterval).height) || 44) : 44

    const events = Array.from(elemento.querySelectorAll('.v-event-timed')) as HTMLElement[]
    events.forEach((ev) => {
      const dayEl = ev.closest('.v-calendar-daily__day') as HTMLElement | null
      const dayIndex = dayEl ? dayContainers.indexOf(dayEl) : -1
      if (dayIndex < 0 || dayIndex > 5) return
      let topPx = 0
      const style = ev.getAttribute('style') || ''
      const m = /top:\s*([0-9.]+)px/.exec(style)
      if (m) topPx = parseFloat(m[1]!)
      else {
        const cs = window.getComputedStyle(ev)
        topPx = parseFloat(cs.top || '0') || 0
      }
      const row = Math.max(0, Math.min(rows - 1, Math.floor(topPx / intervalPx)))
      if (row < 0 || row >= rows) return
      const nameEl = ev.querySelector('.semana-ev__name')
      const details = Array.from(ev.querySelectorAll('.semana-ev__detail')).map((d) => (d.textContent || '').trim())
      const name = nameEl ? (nameEl.textContent || '').trim() : (ev.textContent || '').trim() || ''
      const aula = details.length ? details[details.length - 1] : ''
      const teacher = details.length > 1 ? details[0] : ''
      // Extraer color del elemento (inline style o computed style)
      const cs = window.getComputedStyle(ev)
      let bg = ''
      const inlineStyle = ev.getAttribute('style') || ''
      const mColor = /background(?:-color)?:\s*([^;]+)/i.exec(inlineStyle)
      if (mColor && mColor[1]) bg = mColor[1].trim()
      if (!bg) bg = cs.backgroundColor || ''
        const bgHex = parseColorToHex(bg) || '#e3f2fd'
        // Use a very light background (blend towards white) so printed cells
        // are nearly white and text remains black for maximum contrast.
        const bgLight = lightenHex(bgHex, 0.88)
        const borderHex = darkenHex(bgHex, 0.18)
        const textColor = '#000000'

      const content = `<div class=\"clase-item\" style=\"background:${bgLight};border-left-color:${borderHex};color:${textColor}\"><div class=\"clase-title\">${escapeHtml(String(name))}<\/div><div class=\"clase-detail\">${escapeHtml(String(teacher))}<\/div><div class=\"clase-aula\">${escapeHtml(String(aula))}<\/div><\/div>`
      const prev = grid[row]![dayIndex] || ''
      grid[row]![dayIndex] = prev ? prev + '<hr/>' + content : content
    })

    const style = `
    <style>
      .calendario-container { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 12px; }
      table { width: 100%; border-collapse: collapse; background-color: #fcfcfc; table-layout: fixed; }
      th { background-color: #4a90e2; color: white; padding: 8px; border: 1px solid #ddd; font-size: 0.85em; }
      td { border: 1px solid #ddd; padding: 2px 4px; text-align: left; font-size: 0.75em; height: 24px; vertical-align: middle; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; }
      .hora-col { background-color: #f2f2f2; font-weight: bold; font-size: 0.7rem; width: 96px; max-width: 96px; text-align: center; white-space: nowrap; padding: 2px 4px; }
      .clase-item { background-color: #e3f2fd; border-radius: 4px; padding: 4px 6px; border-left: 4px solid #2196f3; display: block; max-width: 100%; min-width: 0; overflow: hidden; white-space: normal; word-break: break-word; }
      .lista-clases { margin-top: 18px; padding: 10px; background: #f9f9f9; border-radius: 6px; font-size: 0.8em; }
      .legend-list { column-count: 2; column-gap: 16px; list-style: none; padding-left: 0; margin: 0 }
      .legend-list li { break-inside: avoid; }
      .clase-title { font-weight: 600; font-size: 0.8em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .clase-detail, .clase-aula { font-size: 0.72em; color: #444; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      /* Ensure cells don't wrap and overflow is hidden */
      th, td, .clase-item, .clase-title, .clase-detail, .clase-aula { box-sizing: border-box; }
      @page { size: letter landscape; margin: 8mm; }
      body { margin: 0; padding: 8mm; background: #fff; }
    </style>
    `

    let html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    html += `<title>Horario - impresión</title>`
    html += style
    html += '</head><body><div class="calendario-container">'

    html += '<table>'
    html += '<colgroup><col style="width:48px" /><col /><col /><col /><col /><col /><col /></colgroup>'
    html += '<thead><tr><th>Horario</th><th>Lunes</th><th>Martes</th><th>Miércoles</th><th>Jueves</th><th>Viernes</th><th>Sábado</th></tr></thead><tbody>'
    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      html += `<td class="hora-col">${times[r]}</td>`
      for (let d = 0; d < 6; d++) html += `<td>${(grid[r] && grid[r]![d]) || ''}</td>`
      html += '</tr>'
    }
    html += '</tbody></table>'

    // Construir leyenda con colores: extraer títulos únicos y color desde las celdas
    const legendItems: Record<string, { color: string }> = {}
    for (let r = 0; r < rows; r++) for (let d = 0; d < 6; d++) if (grid[r] && grid[r]![d]) {
      const cell = grid[r]![d] as string
      const m = cell.match(/<div class="clase-title">([^<]+)<\/div>/)
      const colorMatch = cell.match(/style="[^"]*background:([^;"]+)[;"]/)
      const color = colorMatch ? (colorMatch[1] || '').trim() : ''
      if (m && m[1]) legendItems[m[1]] = { color: parseColorToHex(color) || '#e3f2fd' }
    }
    html += '<div class="lista-clases"><h3>Resumen de Clases</h3><ul class="legend-list">'
    for (const key of Object.keys(legendItems).slice(0, 200)) {
      const col = legendItems[key]!.color
      const bgLight = lightenHex(col, 0.88)
      const borderHex = darkenHex(col, 0.25)
      // Show a solid swatch matching the original cell color so legend and table match
      html += `<li style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="display:inline-block;width:18px;height:12px;background:${col};border-radius:2px"></span><strong style="color:#000">${escapeHtml(key)}</strong></li>`
    }
    html += '</ul></div>'

    html += '</div></body></html>'
    return html
  } catch (e) {
    console.error('generatePrintableHTMLFromCalendar error', e)
    return ''
  }
}

async function openPrintWindowPreserveText(elemento: HTMLElement, titulo: string): Promise<boolean> {
  try {
    const tableHtml = generatePrintableHTMLFromCalendar(elemento)
    const w = window.open('', '_blank') as Window | null
    if (!w) return false

    const doc = w.document
    doc.open()
    doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">')
    doc.write(`<title>${titulo}</title>`)

    if (tableHtml) {
      doc.write(tableHtml)
    } else {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[]
      for (const l of links) {
        const href = l.href
        if (href) doc.write(`<link rel="stylesheet" href="${href}">`)
      }
      doc.write('<style>@page{size:letter landscape;margin:12mm}body{background:#fff;margin:0;padding:12mm;font-family:sans-serif}img{max-width:100%}</style>')
      doc.write('</head><body>')
      const clone = elemento.cloneNode(true) as HTMLElement
      clone.style.background = '#ffffff'
      const imported = doc.importNode(clone, true)
      doc.body.appendChild(imported)
    }

    try {
      const fonts: any = (w.document as any).fonts || (document as any).fonts
      if (fonts && 'ready' in fonts && fonts.ready instanceof Promise) await fonts.ready
    } catch (e) {
      // ignore
    }

    doc.close()
    w.focus()
    setTimeout(() => { try { w.print() } catch (e) { /* nothing */ } }, 500)
    return true
  } catch (err) {
    console.error('openPrintWindowPreserveText error', err)
    return false
  }
}

export async function descargarHorario(opts: ExportOpts): Promise<void> {
  // Preferir descarga como imagen (preserva apariencia). Si falla, caer
  // al flujo PDF existente.
  try {
    const nombreArchivo = opts.titulo.replace(/\s+/g, '_').toLowerCase() + (opts.subtitulo ? `_${opts.subtitulo.replace(/\s+/g, '_').toLowerCase()}` : '') + '.png'
    await downloadHtmlAsImage(opts.elemento, nombreArchivo)
    return
  } catch (e) {
    // continue to PDF fallback
    console.warn('downloadHtmlAsImage failed, falling back to PDF', e)
  }

  const pdf = await generarPDF(opts)
  let nombreArchivo = opts.titulo.replace(/\s+/g, '_').toLowerCase()
  if (opts.subtitulo) nombreArchivo += `_${opts.subtitulo.replace(/\s+/g, '_').toLowerCase()}`
  const filename = `${nombreArchivo}.pdf`

  try {
    const blob = pdf.output('blob') as Blob
    const file = new File([blob], filename, { type: 'application/pdf' })
    const nav: any = navigator
    if (nav && nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: opts.titulo })
      return
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  } catch (err) {
    try { pdf.save(filename); return } catch (e) { console.error('Error al descargar PDF:', e); throw e }
  }
}

async function downloadHtmlAsImage(elemento: HTMLElement, filename = 'horario.png') {
  const tableHtml = generatePrintableHTMLFromCalendar(elemento)
  if (!tableHtml) throw new Error('No printable HTML')

  // Enforce letter-size landscape export. Use DPI to compute target px.
  // Letter: 8.5 x 11 in. Landscape => width=11in, height=8.5in.
  const DPI = 150 // chosen quality for export (can be changed later)
  const LETTER_W_IN = 11
  const LETTER_H_IN = 8.5
  const targetWidth = Math.round(LETTER_W_IN * DPI)
  const targetHeight = Math.round(LETTER_H_IN * DPI)
  // Divide width into 7 equal columns for uniform layout
  const colW = Math.floor(targetWidth / 7)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.width = targetWidth + 'px'
  iframe.style.height = targetHeight + 'px'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(tableHtml)
  doc.close()

  // Force the printed HTML to layout at the desired width so html2canvas
  // captures a landscape composition.
  try { doc.documentElement.style.width = targetWidth + 'px'; doc.body.style.width = targetWidth + 'px'; doc.body.style.margin = '0' } catch {}

  try { const f: any = doc.fonts || document.fonts; if (f && 'ready' in f) await f.ready } catch {}
  await new Promise((r) => setTimeout(r, 300))

  const body = doc.body as HTMLElement
  // Force table and column widths inside the iframe so html2canvas captures a
  // landscape layout without horizontal overflow.
  try {
    const table = doc.querySelector('table') as HTMLTableElement | null
    if (table) {
      table.style.tableLayout = 'fixed'
      table.style.width = targetWidth + 'px'
      // ensure container has exact width
      const container = doc.querySelector('.calendario-container') as HTMLElement | null
      if (container) container.style.width = targetWidth + 'px'

      const firstColW = colW
      const otherW = colW
      let colgroup = table.querySelector('colgroup')
      if (!colgroup) {
        colgroup = doc.createElement('colgroup')
        table.insertBefore(colgroup, table.firstChild)
      }
      // clear existing cols
      colgroup.innerHTML = ''
      const c0 = doc.createElement('col')
      c0.style.width = firstColW + 'px'
      colgroup.appendChild(c0)
      for (let i = 0; i < 6; i++) {
        const c = doc.createElement('col')
        c.style.width = otherW + 'px'
        colgroup.appendChild(c)
      }
    }
  } catch (e) {
    // non-fatal
    console.warn('Could not set table widths in iframe', e)
  }
  const canvas = await html2canvas(body, {
    useCORS: true,
    scale: Math.min(2, window.devicePixelRatio || 1),
    width: targetWidth,
    height: targetHeight,
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.92))
  if (!blob) { iframe.remove(); throw new Error('No blob produced') }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  iframe.remove()
}

export async function imprimirHorario(opts: ExportOpts): Promise<void> {
  const tried = await openPrintWindowPreserveText(opts.elemento, opts.titulo)
  if (tried) return

  const pdf = await generarPDF(opts)
  try {
    const blob = pdf.output('blob') as Blob
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    if (!w) {
      const a = document.createElement('a')
      a.href = url
      a.download = 'horario.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  } catch (e) {
    console.error('Error al abrir PDF para imprimir:', e)
    try { const blobUrl = pdf.output('bloburl'); window.open(blobUrl as unknown as string, '_blank') } catch (err) { console.error('Error fallback imprimir:', err) }
  }
}
