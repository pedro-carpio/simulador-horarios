# simulador-horarios

IMPORTANT: Este proyecto fue creado rápidamente (en un día) y puede contener bugs errores de diseño y problemas de seguridad. Requiere desarrollo y auditoría especializada antes de usarse en producción. Las secciones siguientes describen su estado actual y los componentes principales; contribuciones y revisiones son bienvenidas.

## Composición del proyecto (3 partes prioritarias)

El proyecto se organiza y prioriza en tres áreas principales:

- **Frontend**: Aplicación Vue + Vuetify que consume servicios/RPCs desde Supabase. El frontend utiliza los métodos siguientes a través de `src/services/horarios.ts`:
  - `obtenerCarreras(facultadId)` — lista de carreras.
  - `obtenerMaterias(carreraId)` — materias por carrera (incluye nivel).
  - `obtenerClases(materiaId, gestion)` — clases semanales por grupo para una gestión.
    Estos tres métodos son la interfaz crítica entre la UI y la base de datos.

- **Scraper / Importador**: El script `scripts/cargar-horarios.ts` actúa como scraper y pipeline de ingestión:
  - Descarga PDFs públicos desde el sitio de la facultad, extrae texto y parsea horarios.
  - Construye un payload validado y opcionalmente lo sube mediante la función RPC `cargar_horarios` en Supabase.
  - Está pensado como herramienta CLI para ser ejecutada por un manteiner con credenciales apropiadas.

- **Migraciones PostgreSQL (Supabase)**: El esquema de la base de datos, funciones RPC y scripts de manipulación están en `supabase/migrations/`. Estas migraciones son necesarias para crear tablas, índices y funciones RPC usadas por el frontend y el scraper.

Lee con atención las migraciones antes de aplicar en un entorno de producción.

--

## Requisitos previos

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`pnpm add -g supabase` o usar `pnpx supabase`)
- [Docker](https://www.docker.com/) (necesario para `supabase start` en desarrollo local)

## Project Setup

```sh
pnpm install
```

### Base de datos — Entorno local (desarrollo)

1. Iniciar los servicios locales de Supabase (requiere Docker corriendo):

```sh
pnpx supabase start
```

2. Aplicar las migraciones a la base de datos local:

```sh
pnpx supabase db reset
```

Esto creará el esquema, las funciones RPC y los índices definidos en `supabase/migrations/`.

3. Verificar que todo esté corriendo:

```sh
pnpx supabase status
```

### Base de datos — Entorno remoto (producción)

1. Vincular el proyecto local con un proyecto remoto de Supabase:

```sh
pnpx supabase link --project-ref <PROJECT_REF>
```

> El `PROJECT_REF` se obtiene de la URL del proyecto en el dashboard de Supabase (ej. `rlacdlmvipjxwesnrwnh`).

2. Subir las migraciones al proyecto remoto:

```sh
pnpx supabase db push
```

Esto aplicará todas las migraciones pendientes en la base de datos remota.

### Scraper / Importador — uso del script `scripts/cargar-horarios.ts`

El proyecto incluye un script CLI que descarga los PDFs públicos de horarios, los
parsea y opcionalmente sube los datos a Supabase: `scripts/cargar-horarios.ts`.

Resumen de uso:

- Ubicación del script: `scripts/cargar-horarios.ts`.
- Carpeta de salida: el script escribe artefactos en la carpeta `output/` junto al
  script (p. ej. `scripts/output/<CARRERA>_payload_YYYYMMDDhhmm.json`).
- URL de descarga: `https://www.hum.umss.edu.bo/horarios/horario_pdf.php`.
- Flow interactivo: al ejecutar, el script:
  1. Conecta a Supabase (lee credenciales o solicita entrada interactiva).
  2. Intenta leer las `carreras` desde la BD; si no hay carreras llama a
     `actualizarCarreras()` para extraerlas del HTML público y ejecutar el upsert.
  3. Permite elegir una carrera o "Todas las carreras" (carga masiva).
  4. Descarga el PDF (por niveles), parsea, valida el payload con `zod` (`PayloadSchema`).
  5. Guarda el JSON en `output/` y pregunta si desea subir los datos mediante la RPC
     `cargar_horarios` (requiere `service_role` key para la subida).

Credenciales y variables de entorno que el script acepta (busca `.env.local`):

- Rutas de `.env.local` buscadas: proyecto raíz o `scripts/.env.local`.
- Variables detectadas (el script acepta variantes con prefijo `PUBLIC_` o `VITE_`):
  - `PUBLIC_SUPABASE_URL` o `VITE_SUPABASE_URL`
  - `PUBLIC_SUPABASE_KEY` o `VITE_SUPABASE_KEY`
  - `PUBLIC_SERVICE_ROLE_KEY` o `VITE_SERVICE_ROLE_KEY` (NECESARIA para subir)

Si no se encuentran variables válidas, el script pedirá manualmente la `Supabase URL`
y la `Service Role Key` por prompt. El script detecta si la URL es local (localhost,
127.0.0.1 o 192.168.\*) y muestra un mensaje acorde.

Ejecutar el scraper (interactivo):

```sh
npx tsx scripts/cargar-horarios.ts
```

Notas y precauciones:

- El script es interactivo y no tiene un modo totalmente "headless" documentado.
- Para la subida automática a Supabase se requiere la `service role key`: manéjala con
  cuidado (no la publiques en repositorios). Si no la proporcionas, el script seguirá
  hasta generar el payload y lo dejará en `output/`.
- Revisa los logs `DEBUG ENV` que el script imprime cuando detecta variables de entorno
  — son útiles para diagnosticar problemas de conexión.

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

### Type-Check, Compile and Minify for Production

```sh
pnpm build
```

## Servicios (Supabase RPCs)

La aplicación consume funciones RPC de Supabase definidas en `src/services/horarios.ts`. A continuación se describe cada servicio, sus parámetros y la respuesta esperada.

### 1. `obtenerCarreras(facultadId)`

Obtiene las carreras de una facultad.

| Parámetro    | Tipo     | Descripción       |
| ------------ | -------- | ----------------- |
| `facultadId` | `number` | ID de la facultad |

**Respuesta** — `Carrera[]`

```json
[{ "id": 1, "nombre": "Trabajo Social" }]
```

### 2. `obtenerMaterias(carreraId)`

Obtiene las materias de una carrera, incluyendo información del nivel al que pertenecen.

| Parámetro   | Tipo     | Descripción      |
| ----------- | -------- | ---------------- |
| `carreraId` | `number` | ID de la carrera |

**Respuesta** — `Materia[]`

```json
[
  {
    "id": 1,
    "codigo": "1813001",
    "nombre": "Hist. e Introd. al Trabajo Social",
    "nivel_codigo": "A",
    "nivel_nombre": "Primero"
  }
]
```

### 3. `obtenerClases(materiaId, gestion)`

Obtiene todas las clases semanales de una materia para una gestión dada, organizadas por número de grupo y ordenadas por día (Lunes→Sábado) y hora de inicio.

| Parámetro   | Tipo     | Descripción                        |
| ----------- | -------- | ---------------------------------- |
| `materiaId` | `number` | ID de la materia                   |
| `gestion`   | `string` | Periodo de gestión, ej. `"1/2026"` |

**Respuesta** — `Clase[]`

```json
[
  {
    "grupo_numero": 1,
    "dia": "Miercoles",
    "docente": "Luizaga de Torrez Bacilia Rosario",
    "aula": "AUD.P",
    "hora_inicio": "08:15:00",
    "hora_fin": "09:45:00"
  },
  {
    "grupo_numero": 2,
    "dia": "Miercoles",
    "docente": "Por Designar Docente",
    "aula": "MA-2",
    "hora_inicio": "10:30:00",
    "hora_fin": "12:45:00"
  }
]
```

### 4. `cargarHorarios(payload)`

Carga masiva de horarios para una carrera existente. Recibe un JSON con múltiples niveles, materias, grupos y clases. Maneja upserts automáticos para gestiones, niveles, docentes y materias. Todo corre en una sola transacción.

| Parámetro | Tipo     | Descripción                           |
| --------- | -------- | ------------------------------------- |
| `payload` | `object` | JSON con la estructura descrita abajo |

**Estructura del payload:**

```json
{
  "carrera_id": 1,
  "gestion": "1/2026",
  "niveles": [
    {
      "codigo": "A",
      "nombre": "Primero",
      "materias": [
        {
          "nombre": "Hist. e Introd. al Trabajo Social",
          "codigo": "1813001",
          "grupos": [
            {
              "numero": 1,
              "clases": [
                {
                  "dia": "Miercoles",
                  "docente": "Luizaga de Torrez Bacilia Rosario",
                  "aula": "AUD.P",
                  "hora_inicio": "08:15",
                  "hora_fin": "09:45"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

**Respuesta** — `CargaResult`

```json
{ "ok": true, "materias": 7, "grupos": 14, "clases": 28 }
```

### Flujo de uso

```
Facultad --▶ obtenerCarreras() --▶ Carreras
Carrera  --▶ obtenerMaterias() --▶ Materias (con nivel)
Materia  --▶ obtenerClases()   --▶ Clases semanales por grupo
```

## Licencia

Este repositorio se publica bajo la licencia MIT. Se ha añadido un archivo `LICENSE`
con el texto completo de la licencia.
