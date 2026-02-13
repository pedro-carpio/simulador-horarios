/**
 * schemas.ts — Zod schemas matching the `cargar_horarios` RPC payload shape.
 */

import { z } from 'zod/v4'

const DIAS_VALIDOS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'] as const

const timeRegex = /^\d{1,2}:\d{2}$/

export const ClaseSchema = z.object({
  dia: z.enum(DIAS_VALIDOS),
  docente: z.string().min(3, 'Nombre de docente muy corto'),
  aula: z.string().min(1, 'Aula vacía'),
  hora_inicio: z.string().regex(timeRegex, 'Formato de hora inválido (HH:MM)'),
  hora_fin: z.string().regex(timeRegex, 'Formato de hora inválido (HH:MM)'),
})

export const GrupoSchema = z.object({
  numero: z.string().min(1, 'Número de grupo vacío'),
  clases: z.array(ClaseSchema).min(1, 'Grupo sin clases'),
})

export const MateriaSchema = z.object({
  nombre: z.string().min(3),
  codigo: z.string().regex(/^\d+$/, 'Código de materia debe ser numérico'),
  grupos: z.array(GrupoSchema).min(1, 'Materia sin grupos'),
})

export const NivelSchema = z.object({
  codigo: z.string().min(1, 'Código de nivel vacío'),
  nombre: z.string().min(3, 'Nombre de nivel muy corto'),
  materias: z.array(MateriaSchema).min(1, 'Nivel sin materias'),
})

export const PayloadSchema = z.object({
  carrera_id: z.number().int().positive(),
  gestion: z.string().regex(/^\d\/\d{4}$/, 'Gestión debe ser formato N/YYYY'),
  niveles: z.array(NivelSchema).min(1, 'Sin niveles'),
})

export type Payload = z.infer<typeof PayloadSchema>
export type Clase = z.infer<typeof ClaseSchema>
export type Grupo = z.infer<typeof GrupoSchema>
export type Materia = z.infer<typeof MateriaSchema>
export type Nivel = z.infer<typeof NivelSchema>
