-- ============================================================
-- RPC: cargar_horarios
-- Carga masiva de horarios para una carrera existente.
-- Recibe un JSON con múltiples niveles, materias, grupos y
-- clases. Inserta/reutiliza registros en gestiones, niveles,
-- docentes (ON CONFLICT) y crea materias, grupos y clases.
-- Todo corre en una transacción implícita.
-- ============================================================
--
-- JSON DE EJEMPLO:
-- {
--   "carrera_id": 1,
--   "gestion": "1/2026",
--   "niveles": [
--     {
--       "codigo": "A",
--       "nombre": "Primero",
--       "materias": [
--         {
--           "nombre": "Hist. e Introd. al Trabajo Social",
--           "codigo": "1813001",
--           "grupos": [
--             {
--               "numero": 1,
--               "clases": [
--                 {
--                   "dia": "Miercoles",
--                   "docente": "Luizaga de Torrez Bacilia Rosario",
--                   "aula": "AUD.P",
--                   "hora_inicio": "08:15",
--                   "hora_fin": "09:45"
--                 },
--                 {
--                   "dia": "Viernes",
--                   "docente": "Luizaga de Torrez Bacilia Rosario",
--                   "aula": "MA-2",
--                   "hora_inicio": "09:00",
--                   "hora_fin": "11:15"
--                 }
--               ]
--             },
--             {
--               "numero": 2,
--               "clases": [
--                 {
--                   "dia": "Miercoles",
--                   "docente": "Por Designar Docente",
--                   "aula": "MA-2",
--                   "hora_inicio": "10:30",
--                   "hora_fin": "12:45"
--                 }
--               ]
--             }
--           ]
--         },
--         {
--           "nombre": "Introduccion al Derecho",
--           "codigo": "1813002",
--           "grupos": [
--             {
--               "numero": 1,
--               "clases": [
--                 {
--                   "dia": "Martes",
--                   "docente": "Por Designar Docente",
--                   "aula": "PB-8",
--                   "hora_inicio": "18:45",
--                   "hora_fin": "20:15"
--                 }
--               ]
--             }
--           ]
--         }
--       ]
--     },
--     {
--       "codigo": "B",
--       "nombre": "Segundo",
--       "materias": [
--         {
--           "nombre": "Materia de ejemplo",
--           "codigo": "1813099",
--           "grupos": [
--             {
--               "numero": 1,
--               "clases": [
--                 {
--                   "dia": "Lunes",
--                   "docente": "Docente Ejemplo",
--                   "aula": "SP-1",
--                   "hora_inicio": "06:45",
--                   "hora_fin": "08:15"
--                 }
--               ]
--             }
--           ]
--         }
--       ]
--     }
--   ]
-- }
-- ============================================================

CREATE OR REPLACE FUNCTION cargar_horarios(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_carrera_id   smallint;
    v_gestion_id   smallint;
    v_nivel_id     smallint;
    v_materia_id   smallint;
    v_grupo_id     smallint;
    v_docente_id   smallint;

    v_nivel        jsonb;
    v_materia      jsonb;
    v_grupo        jsonb;
    v_clase        jsonb;

    v_materias_cnt int := 0;
    v_grupos_cnt   int := 0;
    v_clases_cnt   int := 0;
BEGIN
    -- ── 1. Validar carrera_id ──────────────────────────────
    v_carrera_id := (payload->>'carrera_id')::smallint;

    IF NOT EXISTS (SELECT 1 FROM carreras WHERE id = v_carrera_id) THEN
        RAISE EXCEPTION 'La carrera con id % no existe', v_carrera_id;
    END IF;

    -- ── 2. Gestión (upsert) ────────────────────────────────
    INSERT INTO gestiones (periodo)
    VALUES (payload->>'gestion')
    ON CONFLICT (periodo) DO NOTHING;

    SELECT id INTO v_gestion_id
    FROM gestiones
    WHERE periodo = payload->>'gestion';

    -- ── 3. Iterar niveles ──────────────────────────────────
    FOR v_nivel IN SELECT * FROM jsonb_array_elements(payload->'niveles')
    LOOP
        -- Upsert nivel (codigo es text: "A", "B", "P", etc.)
        INSERT INTO niveles (codigo, nombre)
        VALUES (
            v_nivel->>'codigo',
            v_nivel->>'nombre'
        )
        ON CONFLICT (codigo) DO NOTHING;

        SELECT id INTO v_nivel_id
        FROM niveles
        WHERE codigo = v_nivel->>'codigo';

        -- ── 4. Iterar materias del nivel ───────────────────
        FOR v_materia IN SELECT * FROM jsonb_array_elements(v_nivel->'materias')
        LOOP
            INSERT INTO materias (carrera_id, nivel_id, codigo, nombre)
            VALUES (
                v_carrera_id,
                v_nivel_id,
                v_materia->>'codigo',
                v_materia->>'nombre'
            )
            ON CONFLICT (codigo) DO UPDATE
                SET nombre   = EXCLUDED.nombre,
                    nivel_id = EXCLUDED.nivel_id
            RETURNING id INTO v_materia_id;

            v_materias_cnt := v_materias_cnt + 1;

            -- ── 5. Iterar grupos de la materia ─────────────
            FOR v_grupo IN SELECT * FROM jsonb_array_elements(v_materia->'grupos')
            LOOP

                                INSERT INTO grupos (materia_id, gestion_id, numero)
                                VALUES (
                                        v_materia_id,
                                        v_gestion_id,
                                        v_grupo->>'numero'
                                )
                                ON CONFLICT (materia_id, gestion_id, numero) DO NOTHING;

                                SELECT id INTO v_grupo_id
                                FROM grupos
                                WHERE materia_id = v_materia_id
                                    AND gestion_id = v_gestion_id
                                    AND numero = v_grupo->>'numero';

                v_grupos_cnt := v_grupos_cnt + 1;

                -- ── 6. Iterar clases del grupo ─────────────
                FOR v_clase IN SELECT * FROM jsonb_array_elements(v_grupo->'clases')
                LOOP
                    -- Upsert docente
                    INSERT INTO docentes (nombre_completo)
                    VALUES (v_clase->>'docente')
                    ON CONFLICT (nombre_completo) DO NOTHING;

                    SELECT id INTO v_docente_id
                    FROM docentes
                    WHERE nombre_completo = v_clase->>'docente';

                    INSERT INTO clases (grupo_id, dia, docente_id, aula, hora_inicio, hora_fin)
                    VALUES (
                        v_grupo_id,
                        (v_clase->>'dia')::dia_semana,
                        v_docente_id,
                        v_clase->>'aula',
                        (v_clase->>'hora_inicio')::time,
                        (v_clase->>'hora_fin')::time
                    );

                    v_clases_cnt := v_clases_cnt + 1;
                END LOOP; -- clases
            END LOOP; -- grupos
        END LOOP; -- materias
    END LOOP; -- niveles

    -- ── 7. Retorno con resumen ─────────────────────────────
    RETURN jsonb_build_object(
        'ok',       true,
        'materias', v_materias_cnt,
        'grupos',   v_grupos_cnt,
        'clases',   v_clases_cnt
    );
END;
$$;
