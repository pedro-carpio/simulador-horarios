# simulador-horarios

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
Facultad ──▶ obtenerCarreras() ──▶ Carreras
Carrera  ──▶ obtenerMaterias() ──▶ Materias (con nivel)
Materia  ──▶ obtenerClases()   ──▶ Clases semanales por grupo
```
