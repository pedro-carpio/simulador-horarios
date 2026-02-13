-- ============================================================
-- Migración: RPC upsert_carreras
-- ============================================================

-- RPC: upsert_carreras
-- Recibe un JSON array de objetos {codigo, nombre} y un facultad_id.
-- Si la carrera (por codigo) no existe, la inserta.
-- Si ya existe, actualiza el nombre si cambió.
-- Retorna la cantidad de carreras insertadas y actualizadas.
--
-- Ejemplo de uso:
--   SELECT upsert_carreras(1, '[
--     {"codigo": "123456", "nombre": "Trabajo Social"},
--     {"codigo": "234567", "nombre": "Psicología"},
--     {"codigo": "345678", "nombre": "Ciencias de la Comunicación Social"}
--   ]'::jsonb);
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_carreras(
    p_facultad_id smallint,
    p_carreras jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_item    jsonb;
    v_ins     int := 0;
    v_upd     int := 0;
    v_codigo  text;
    v_nombre  text;
    v_exists  boolean;
BEGIN
    -- Validar que la facultad existe
    IF NOT EXISTS (SELECT 1 FROM facultades WHERE id = p_facultad_id) THEN
        RAISE EXCEPTION 'La facultad con id % no existe', p_facultad_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_carreras)
    LOOP
        v_codigo := v_item->>'codigo';
        v_nombre := v_item->>'nombre';

        IF v_codigo IS NULL OR v_nombre IS NULL THEN
            RAISE EXCEPTION 'Cada carrera debe tener "codigo" y "nombre". Recibido: %', v_item;
        END IF;

        -- Verificar si ya existe
        SELECT EXISTS(SELECT 1 FROM carreras WHERE codigo = v_codigo)
        INTO v_exists;

        IF v_exists THEN
            -- Actualizar nombre si cambió
            UPDATE carreras
            SET nombre = v_nombre,
                facultad_id = p_facultad_id
            WHERE codigo = v_codigo
              AND (nombre != v_nombre OR facultad_id != p_facultad_id);

            IF FOUND THEN
                v_upd := v_upd + 1;
            END IF;
        ELSE
            INSERT INTO carreras (facultad_id, codigo, nombre)
            VALUES (p_facultad_id, v_codigo, v_nombre);

            v_ins := v_ins + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok',          true,
        'insertadas',  v_ins,
        'actualizadas', v_upd,
        'total',       jsonb_array_length(p_carreras)
    );
END;
$$;

-- ============================================================
-- Seguridad: solo service_role puede ejecutar funciones de escritura
-- El rol anon (usado por el frontend) NO puede llamarlas.
-- ============================================================
REVOKE EXECUTE ON FUNCTION upsert_carreras FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION upsert_carreras FROM anon;
REVOKE EXECUTE ON FUNCTION upsert_carreras FROM authenticated;
GRANT EXECUTE ON FUNCTION upsert_carreras TO service_role;
