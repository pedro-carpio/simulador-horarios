-- ============================================
-- ENUM: Días de la semana (sin Domingo)
-- ============================================

CREATE TYPE dia_semana AS ENUM (
    'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'
);

-- ============================================
-- TABLAS DE REFERENCIA (lookup tables)
-- ============================================

CREATE TABLE facultades (
    id smallserial PRIMARY KEY,
    nombre text NOT NULL UNIQUE
);

-- Insertar facultad por defecto para Humanidades
INSERT INTO facultades (nombre) VALUES ('Humanidades y Cs. de la Educación');
-- TODO: revisar otras carreras/facultades necesarias para el sistema

CREATE TABLE niveles (
    id smallserial PRIMARY KEY,
    codigo text NOT NULL UNIQUE,           -- "A", "B", "C", "P", etc.
    nombre text NOT NULL UNIQUE            -- "Primero", "Segundo", etc.
);

CREATE TABLE gestiones (
    id smallserial PRIMARY KEY,
    periodo text NOT NULL UNIQUE          -- "1/2026", "2/2026"
);

CREATE TABLE docentes (
    id smallserial PRIMARY KEY,
    nombre_completo text NOT NULL UNIQUE
);

-- ============================================
-- TABLAS PRINCIPALES
-- ============================================

CREATE TABLE carreras (
    id smallserial PRIMARY KEY,
    facultad_id smallint NOT NULL REFERENCES facultades(id) ON DELETE CASCADE,
    codigo text UNIQUE,
    nombre text NOT NULL,
    UNIQUE (facultad_id, nombre)          -- misma carrera no se repite en una facultad
);

CREATE TABLE materias (
    id smallserial PRIMARY KEY,
    carrera_id smallint NOT NULL REFERENCES carreras(id) ON DELETE CASCADE,
    nivel_id smallint NOT NULL REFERENCES niveles(id) ON DELETE RESTRICT,
    codigo text NOT NULL UNIQUE,          -- "1813001"
    nombre text NOT NULL
);

CREATE TABLE grupos (
    id smallserial PRIMARY KEY,
    materia_id smallint NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
    gestion_id smallint NOT NULL REFERENCES gestiones(id) ON DELETE RESTRICT,
    numero text NOT NULL,
    UNIQUE (materia_id, gestion_id, numero)
);

CREATE TABLE clases (
    id smallserial PRIMARY KEY,
    grupo_id smallint NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
    dia dia_semana NOT NULL,
    docente_id smallint NOT NULL REFERENCES docentes(id) ON DELETE RESTRICT,
    aula text NOT NULL,
    hora_inicio time NOT NULL,
    hora_fin time NOT NULL,
    CHECK (hora_fin > hora_inicio)
);

-- ============================================
-- ÍNDICES PARA CONSULTAS FRECUENTES
-- ============================================

-- Consulta 1: carreras de una facultad
CREATE INDEX idx_carreras_facultad ON carreras (facultad_id);

-- Consulta 2: materias de una carrera (opcionalmente filtradas por nivel)
CREATE INDEX idx_materias_carrera_nivel ON materias (carrera_id, nivel_id);

-- Consulta 3: clases de un grupo (JOIN grupos → clases)
CREATE INDEX idx_clases_grupo ON clases (grupo_id);
