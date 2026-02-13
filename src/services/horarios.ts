import { supabase } from '@/lib/supabase'

// -- Tipos ----------------------------------------------

export interface Carrera {
  id: number
  nombre: string
  last_scraped_at?: string | null
}

export interface Materia {
  id: number
  codigo: string
  nombre: string
  nivel_codigo: string
  nivel_nombre: string
}

export interface Clase {
  grupo_numero: string
  dia: string
  docente: string
  aula: string
  hora_inicio: string
  hora_fin: string
}

export interface CargaResult {
  ok: boolean
  materias: number
  grupos: number
  clases: number
}

// -- Servicios ------------------------------------------

export async function obtenerCarreras(facultadId: number): Promise<Carrera[]> {
  const { data, error } = await supabase.rpc('obtener_carreras_por_facultad', {
    p_facultad_id: facultadId,
  })
  if (error) throw error
  return data as Carrera[]
}

export async function obtenerMaterias(carreraId: number): Promise<Materia[]> {
  const { data, error } = await supabase.rpc('obtener_materias_por_carrera', {
    p_carrera_id: carreraId,
  })
  if (error) throw error
  return data as Materia[]
}


export async function obtenerClases(materiaId: number, gestion: string): Promise<Clase[]> {
  const { data, error } = await supabase.rpc('obtener_clases_por_materia', {
    p_materia_id: materiaId,
    p_gestion: gestion,
  })
  if (error) throw error
  return data as Clase[]
}

export async function cargarHorarios(payload: {
  carrera_id: number
  gestion: string
  niveles: {
    codigo: string
    nombre: string
    materias: {
      nombre: string
      codigo: string
      grupos: {
        numero: number
        clases: {
          dia: string
          docente: string
          aula: string
          hora_inicio: string
          hora_fin: string
        }[]
      }[]
    }[]
  }[]
}): Promise<CargaResult> {
  const { data, error } = await supabase.rpc('cargar_horarios', { payload })
  if (error) throw error
  return data as CargaResult
}
