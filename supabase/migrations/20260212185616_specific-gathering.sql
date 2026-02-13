-- ============================================================
-- RPC 1: obtener_carreras_por_facultad
-- Dado el ID de una facultad, retorna sus carreras.
-- Usa: idx_carreras_facultad
-- ============================================================
-- Ejemplo de llamada:
--   SELECT * FROM obtener_carreras_por_facultad(1);
-- Retorna:
--   [{ "id": 1, "nombre": "Trabajo Social" }, ...]
-- ============================================================

CREATE OR REPLACE FUNCTION obtener_carreras_por_facultad(p_facultad_id smallint)
RETURNS TABLE (
    id       smallint,
    nombre   text
)
LANGUAGE sql STABLE
AS $$
    SELECT c.id, c.nombre
    FROM carreras c
    WHERE c.facultad_id = p_facultad_id
    ORDER BY c.nombre;
$$;

-- ============================================================
-- RPC 2: obtener_materias_por_carrera
-- Dado el ID de una carrera, retorna sus materias agrupadas
-- por nivel (codigo y nombre del nivel incluidos).
-- Usa: idx_materias_carrera_nivel
-- ============================================================
-- Ejemplo de llamada:
--   SELECT * FROM obtener_materias_por_carrera(1);
-- Retorna:
--   [
--     {
--       "id": 1,
--       "codigo": "1813001",
--       "nombre": "Hist. e Introd. al Trabajo Social",
--       "nivel_codigo": "P",
--       "nivel_nombre": "Primero"
--     },
--     ...
--   ]
-- ============================================================

CREATE OR REPLACE FUNCTION obtener_materias_por_carrera(p_carrera_id smallint)
RETURNS TABLE (
    id            smallint,
    codigo        text,
    nombre        text,
    nivel_codigo  text,
    nivel_nombre  text
)
LANGUAGE sql STABLE
AS $$
    SELECT m.id, m.codigo, m.nombre,
           n.codigo  AS nivel_codigo,
           n.nombre  AS nivel_nombre
    FROM materias m
    JOIN niveles n ON n.id = m.nivel_id
    WHERE m.carrera_id = p_carrera_id
    ORDER BY n.codigo, m.nombre;
$$;

-- ============================================================
-- RPC 3: obtener_clases_por_materia
-- Dado el ID de una materia y el periodo de gestión, retorna
-- todas las clases de la semana organizadas por grupo.
-- Usa: UNIQUE(materia_id, gestion_id, numero) + idx_clases_grupo
-- ============================================================
-- Ejemplo de llamada:
--   SELECT * FROM obtener_clases_por_materia(1, '1/2026');
-- Retorna:
--   [
--     {
--       "grupo_numero": 1,
--       "dia": "Miercoles",
--       "docente": "Luizaga de Torrez Bacilia Rosario",
--       "aula": "AUD.P",
--       "hora_inicio": "08:15:00",
--       "hora_fin": "09:45:00"
--     },
--     {
--       "grupo_numero": 1,
--       "dia": "Viernes",
--       "docente": "Luizaga de Torrez Bacilia Rosario",
--       "aula": "MA-2",
--       "hora_inicio": "09:00:00",
--       "hora_fin": "11:15:00"
--     },
--     {
--       "grupo_numero": 2,
--       "dia": "Miercoles",
--       "docente": "Por Designar Docente",
--       "aula": "MA-2",
--       "hora_inicio": "10:30:00",
--       "hora_fin": "12:45:00"
--     },
--     ...
--   ]
-- ============================================================

CREATE OR REPLACE FUNCTION obtener_clases_por_materia(
    p_materia_id smallint,
    p_gestion    text
)
RETURNS TABLE (
    grupo_numero text,
    dia          dia_semana,
    docente      text,
    aula         text,
    hora_inicio  time,
    hora_fin     time
)
LANGUAGE sql STABLE
AS $$
    SELECT g.numero    AS grupo_numero,
           cl.dia,
           d.nombre_completo AS docente,
           cl.aula,
           cl.hora_inicio,
           cl.hora_fin
    FROM grupos g
    JOIN gestiones ge ON ge.id = g.gestion_id
    JOIN clases cl    ON cl.grupo_id = g.id
    JOIN docentes d   ON d.id = cl.docente_id
    WHERE g.materia_id = p_materia_id
      AND ge.periodo   = p_gestion
    ORDER BY g.numero,
             CASE cl.dia
                 WHEN 'Lunes'     THEN 1
                 WHEN 'Martes'    THEN 2
                 WHEN 'Miercoles' THEN 3
                 WHEN 'Jueves'    THEN 4
                 WHEN 'Viernes'   THEN 5
                 WHEN 'Sabado'    THEN 6
             END,
             cl.hora_inicio;
$$;
