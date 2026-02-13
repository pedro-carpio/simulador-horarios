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

/**
 * Construye un contenedor off-screen con header + captura del calendario,
 * renderiza a canvas y devuelve un jsPDF listo para imprimir o guardar.
 */
async function generarPDF(opts: ExportOpts): Promise<jsPDF> {
  const { elemento, titulo, subtitulo } = opts

  // Capturar el elemento visual a canvas con alta resolución
  const canvas = await html2canvas(elemento, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  })

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })

  // -- Header --
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

  cursorY += 2 // espaciado extra

  // -- Imagen del calendario --
  const imgData = canvas.toDataURL('image/png')
  const imgW = AREA_W
  const maxImgH = ALTO_PDF - cursorY - MARGEN
  // Mantener aspect ratio
  const ratio = canvas.height / canvas.width
  let imgH = imgW * ratio
  if (imgH > maxImgH) {
    imgH = maxImgH
  }

  pdf.addImage(imgData, 'PNG', MARGEN, cursorY, imgW, imgH)

  return pdf
}

export async function descargarHorario(opts: ExportOpts): Promise<void> {
  const pdf = await generarPDF(opts)
  const nombreArchivo = opts.titulo.replace(/\s+/g, '_').toLowerCase()
  pdf.save(`${nombreArchivo}.pdf`)
}

export async function imprimirHorario(opts: ExportOpts): Promise<void> {
  const pdf = await generarPDF(opts)
  // Abrir en nueva pestaña para imprimir
  const blobUrl = pdf.output('bloburl')
  window.open(blobUrl as unknown as string, '_blank')
}
