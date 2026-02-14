<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDisplay } from 'vuetify'
import { mdiAlertCircleOutline } from '@mdi/js'
import type { Clase } from '@/services/horarios'
import { descargarHorario, imprimirHorario } from '@/utils/exportarHorario'

/* -- Tipos -- */

interface CursoSeleccionado {
  key: string
  materiaNombre: string
  materiaCodigo: string
  grupoNumero: string
  clases: Clase[]
}

const props = defineProps<{
  cursos: CursoSeleccionado[]
  nombreCarrera?: string
  nombreNivel?: string
}>()

/* -- Responsive -- */
const { mobile } = useDisplay()
const intervalHeight = computed(() => (mobile.value ? 36 : 44))

/* -- Rango dinámico: solo intervalos con eventos -- */
const INTERVALO_MIN = 90 // minutos
const BASE_INICIO = 6 * 60 + 45 // 6:45 en minutos

const rangoVisible = computed(() => {
  if (eventosBase.value.length === 0) {
    return { firstTime: { hour: 6, minute: 45 }, intervalCount: 10 }
  }

  let minT = Infinity
  let maxT = -Infinity
  for (const e of eventosBase.value) {
    const s = timeMin(e.start.slice(11))
    const end = timeMin(e.end.slice(11))
    if (s < minT) minT = s
    if (end > maxT) maxT = end
  }

  // Alinear al slot de 90 min más cercano por debajo del inicio
  let slotInicio = BASE_INICIO
  while (slotInicio + INTERVALO_MIN <= minT) slotInicio += INTERVALO_MIN
  // Al menos un slot antes si hay espacio
  if (slotInicio > BASE_INICIO) slotInicio -= INTERVALO_MIN

  // Cantidad de intervalos necesarios para cubrir hasta maxT + margen
  const totalMin = maxT - slotInicio + INTERVALO_MIN // +1 slot de margen
  const count = Math.max(2, Math.ceil(totalMin / INTERVALO_MIN))

  return {
    firstTime: { hour: Math.floor(slotInicio / 60), minute: slotInicio % 60 },
    intervalCount: count,
  }
})

/* -- Mapeo de días a offsets desde Lunes -- */
const DIA_OFFSET: Record<string, number> = {
  Lunes: 0,
  Martes: 1,
  Miercoles: 2,
  Jueves: 3,
  Viernes: 4,
  Sabado: 5,
}

function getLunesRef(): Date {
  const hoy = new Date()
  const dow = hoy.getDay() // 0 = Dom
  const diff = dow === 0 ? -6 : 1 - dow
  const d = new Date(hoy)
  d.setDate(hoy.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function fechaParaDia(dia: string): string {
  const lunes = getLunesRef()
  lunes.setDate(lunes.getDate() + (DIA_OFFSET[dia] ?? 0))
  return fmtDate(lunes)
}

const calendarValue = computed(() => fmtDate(getLunesRef()))

/* -- Formateo del header: solo nombre de día, sin fecha -- */
const NOMBRES_DIA: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
}
const NOMBRES_DIA_CORTO: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
}
function weekdayFormat(ts: { weekday: number }, short: boolean) {
  return short ? (NOMBRES_DIA_CORTO[ts.weekday] ?? '') : (NOMBRES_DIA[ts.weekday] ?? '')
}
function dayFormat() {
  return ''
}

/* -- Paleta de 20 colores distinguibles -- */
const COLORES = [
  '#1976D2', // azul
  '#388E3C', // verde
  '#F57C00', // naranja
  '#7B1FA2', // morado
  '#00897B', // teal
  '#5D4037', // café
  '#C2185B', // rosa
  '#0277BD', // celeste
  '#EF6C00', // naranja fuerte
  '#283593', // índigo
  '#00ACC1', // cyan
  '#8E24AA', // púrpura
  '#43A047', // verde medio
  '#D81B60', // magenta
  '#3949AB', // azul índigo
  '#6D4C41', // marrón
  '#039BE5', // azul claro
  '#E65100', // naranja oscuro
  '#1B5E20', // verde oscuro
  '#AD1457', // rosa oscuro
]

/** Un color por cada grupo seleccionado (grupoKey = "materiaId-grupoNumero") */
const coloresGrupos = computed(() => {
  const map = new Map<string, string>()
  let idx = 0
  for (const c of props.cursos) {
    if (!map.has(c.key)) {
      map.set(c.key, COLORES[idx % COLORES.length]!)
      idx++
    }
  }
  return map
})

/* -- Eventos base -- */
interface EventoCal {
  name: string
  start: string
  end: string
  color: string
  timed: boolean
  materiaCodigo: string
  materiaNombre: string
  grupoKey: string
  grupoNumero: number
  dia: string
  aula: string
  docente: string
}

const eventosBase = computed<EventoCal[]>(() => {
  const out: EventoCal[] = []
  const seen = new Set<string>()
  for (const curso of props.cursos) {
    const color = coloresGrupos.value.get(curso.key) ?? COLORES[0]!
    for (const c of curso.clases) {
      // dedupe by curso key + dia + horarios
      const startShort = c.hora_inicio.slice(0, 5)
      const endShort = c.hora_fin.slice(0, 5)
      const id = `${curso.key}|${c.dia}|${startShort}|${endShort}`
      if (seen.has(id)) continue
      seen.add(id)

      const fecha = fechaParaDia(c.dia)
      out.push({
        name: curso.materiaNombre,
        start: `${fecha} ${startShort}`,
        end: `${fecha} ${endShort}`,
        color,
        timed: true,
        materiaCodigo: curso.materiaCodigo,
        materiaNombre: curso.materiaNombre,
        grupoKey: curso.key,
        grupoNumero: Number(curso.grupoNumero),
        dia: c.dia,
        aula: c.aula,
        docente: c.docente,
      })
    }
  }
  return out
})

/* -- Detección de choques -- */
function timeMin(t: string) {
  const parts = t.split(':').map(Number)
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
}

interface Conflicto {
  materia1: string
  grupo1: number
  materia2: string
  grupo2: number
  dia: string
}

const conflictos = computed(() => {
  const lista: Conflicto[] = []
  const keys = new Set<string>()
  const seen = new Set<string>()
  const evts = eventosBase.value

  for (let i = 0; i < evts.length; i++) {
    for (let j = i + 1; j < evts.length; j++) {
      const a = evts[i]!
      const b = evts[j]!
      if (a.grupoKey === b.grupoKey || a.dia !== b.dia) continue

      const aS = timeMin(a.start.slice(11))
      const aE = timeMin(a.end.slice(11))
      const bS = timeMin(b.start.slice(11))
      const bE = timeMin(b.end.slice(11))

      if (aS < bE && bS < aE) {
        const id = [a.grupoKey, b.grupoKey].sort().join('|') + '|' + a.dia
        if (!seen.has(id)) {
          seen.add(id)
          lista.push({
            materia1: a.materiaNombre,
            grupo1: a.grupoNumero,
            materia2: b.materiaNombre,
            grupo2: b.grupoNumero,
            dia: a.dia,
          })
        }
        keys.add(`${a.grupoKey}|${a.dia}`)
        keys.add(`${b.grupoKey}|${b.dia}`)
      }
    }
  }
  return { lista, keys }
})

/** Eventos finales: solapamientos forzados a rojo */
const eventos = computed(() =>
  eventosBase.value.map((e) => ({
    ...e,
    color: conflictos.value.keys.has(`${e.grupoKey}|${e.dia}`) ? '#D32F2F' : e.color,
  })),
)

/* -- Leyenda de colores -- */
const leyenda = computed(() =>
  props.cursos.map((c) => {
    const color = coloresGrupos.value.get(c.key) ?? COLORES[0]!
    const docente = c.clases[0]?.docente ?? ''
    return {
      key: c.key,
      color,
      texto: `G ${c.grupoNumero}: ${c.materiaNombre} - ${docente}`,
    }
  }),
)

/* -- Exportar: imprimir / descargar -- */
const capturaRef = ref<HTMLElement | null>(null)
const exportando = ref(false)

function buildTitulo() {
  return `Horario ${props.nombreCarrera ?? ''}`
}

function buildSubtitulo() {
  return props.nombreNivel ? `Semestre: ${props.nombreNivel}` : undefined
}

async function descargar() {
  if (!capturaRef.value) return
  exportando.value = true
  try {
    await descargarHorario({
      elemento: capturaRef.value,
      titulo: buildTitulo(),
      subtitulo: buildSubtitulo(),
    })
  } finally {
    exportando.value = false
  }
}

async function imprimir() {
  if (!capturaRef.value) return
  exportando.value = true
  try {
    await imprimirHorario({
      elemento: capturaRef.value,
      titulo: buildTitulo(),
      subtitulo: buildSubtitulo(),
    })
  } finally {
    exportando.value = false
  }
}

defineExpose({ descargar, imprimir })
</script>

<template>
  <div style="position: relative">
    <!-- Overlay de carga al exportar -->
    <v-overlay :model-value="exportando" contained persistent class="align-center justify-center">
      <div class="d-flex flex-column align-center">
        <v-progress-circular indeterminate size="48" color="primary" />
        <p class="text-body-1 mt-3">Generando documento…</p>
      </div>
    </v-overlay>

    <!-- Zona capturable para PDF/impresión -->
    <div ref="capturaRef" style="background: #fff">
      <!-- Alerta de choques -->
      <v-alert
        v-if="conflictos.lista.length"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-3"
        :icon="mdiAlertCircleOutline"
      >
        <div class="font-weight-bold mb-1">Choques de horario detectados:</div>
        <div v-for="(c, i) in conflictos.lista" :key="i" class="text-body-2">
          {{ c.materia1 }} (G{{ c.grupo1 }}) ↔ {{ c.materia2 }} (G{{ c.grupo2 }}) - {{ c.dia }}
        </div>
      </v-alert>

      <v-calendar
        :model-value="calendarValue"
        type="week"
        :weekdays="[1, 2, 3, 4, 5, 6]"
        :first-day-of-week="1"
        :events="eventos"
        event-overlap-mode="column"
        :event-overlap-threshold="30"
        :first-time="rangoVisible.firstTime"
        :interval-minutes="90"
        :interval-count="rangoVisible.intervalCount"
        :interval-height="intervalHeight"
        :weekday-format="weekdayFormat"
        :day-format="dayFormat"
        now="2000-01-01 00:00:00"
        locale="es"
      >
        <!-- Contenido custom de cada evento -->
        <template #event="{ event: ev }">
          <div class="semana-ev px-1">
            <div class="semana-ev__name font-weight-bold text-truncate">
              G{{ ev.grupoNumero }}: {{ ev.materiaNombre }}
            </div>
            <div v-if="!mobile" class="semana-ev__detail text-truncate">{{ ev.docente }}</div>
            <div class="semana-ev__detail text-truncate">{{ ev.aula }}</div>
          </div>
        </template>
      </v-calendar>

      <!-- Leyenda de colores por materia -->
      <div v-if="leyenda.length" class="d-flex flex-wrap ga-3 mt-3 px-1">
        <div v-for="item in leyenda" :key="item.key" class="d-flex align-center ga-1">
          <span class="semana-dot" :style="{ background: item.color }" />
          <span class="text-caption">{{ item.texto }}</span>
        </div>
      </div>
    </div>
    <!-- /capturaRef -->
  </div>
</template>

<style scoped>
:deep(.v-calendar-daily_head-day-label) {
  display: none !important;
}
:deep(.v-calendar-weekly__head-weekday),
:deep(.v-calendar-daily_head-weekday) {
  background-color: #1565c0;
  color: #fff !important;
  font-weight: 600;
  padding: 4px 0;
}
.semana-ev {
  overflow: hidden;
  line-height: 1.3;
  cursor: default;
}
.semana-ev__name {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
.semana-ev__detail {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
.semana-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}
</style>
