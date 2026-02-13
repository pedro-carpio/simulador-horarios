<script setup lang="ts">
import { computed, ref, onMounted, nextTick, watch } from 'vue'
import { mdiAlertCircleOutline } from '@mdi/js'
import type { Clase } from '@/services/horarios'

/* ── Tipos ── */
interface CursoSeleccionado {
  key: string
  materiaNombre: string
  materiaCodigo: string
  grupoNumero: number
  clases: Clase[]
}

const props = defineProps<{
  cursos: CursoSeleccionado[]
}>()

/* ── Ref del calendario ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calendarRef = ref<any>(null)

/* ── Mapeo de días a offsets desde Lunes ── */
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

/* ── Paleta de 10 colores distinguibles ── */
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
]

/** Un color por cada materia (por código) */
const coloresMaterias = computed(() => {
  const map = new Map<string, string>()
  let idx = 0
  for (const c of props.cursos) {
    if (!map.has(c.materiaCodigo)) {
      map.set(c.materiaCodigo, COLORES[idx % COLORES.length]!)
      idx++
    }
  }
  return map
})

/* ── Eventos base ── */
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
  for (const curso of props.cursos) {
    const color = coloresMaterias.value.get(curso.materiaCodigo) ?? COLORES[0]!
    for (const c of curso.clases) {
      const fecha = fechaParaDia(c.dia)
      out.push({
        name: curso.materiaNombre,
        start: `${fecha} ${c.hora_inicio.slice(0, 5)}`,
        end: `${fecha} ${c.hora_fin.slice(0, 5)}`,
        color,
        timed: true,
        materiaCodigo: curso.materiaCodigo,
        materiaNombre: curso.materiaNombre,
        grupoKey: curso.key,
        grupoNumero: curso.grupoNumero,
        dia: c.dia,
        aula: c.aula,
        docente: c.docente,
      })
    }
  }
  return out
})

/* ── Detección de choques ── */
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

/* ── Leyenda de colores ── */
const leyenda = computed(() =>
  Array.from(coloresMaterias.value.entries()).map(([codigo, color]) => {
    const c = props.cursos.find((x) => x.materiaCodigo === codigo)
    return { codigo, color, nombre: c?.materiaNombre ?? codigo }
  }),
)

/* ── Scroll al rango útil al montar ── */
async function scrollAlInicio() {
  await nextTick()
  try {
    calendarRef.value?.scrollToTime?.('07:00')
  } catch {
    /* component not ready */
  }
}

onMounted(scrollAlInicio)
watch(() => props.cursos.length, scrollAlInicio)
</script>

<template>
  <div>
    <v-calendar
      ref="calendarRef"
      :model-value="calendarValue"
      type="week"
      :weekdays="[1, 2, 3, 4, 5, 6]"
      :first-day-of-week="1"
      :events="eventos"
      event-overlap-mode="column"
      :event-overlap-threshold="30"
      :first-interval="7"
      :interval-count="16"
      :interval-height="48"
      hide-header
      locale="es"
    >
      <!-- Contenido custom de cada evento -->
      <template #event="{ event: ev }">
        <div class="semana-ev px-1">
          <div class="semana-ev__name font-weight-bold text-truncate">
            {{ ev.materiaNombre }}
          </div>
          <div class="semana-ev__detail text-truncate">G{{ ev.grupoNumero }} · {{ ev.aula }}</div>
        </div>
      </template>
    </v-calendar>

    <!-- Leyenda de colores por materia -->
    <div v-if="leyenda.length" class="d-flex flex-wrap ga-3 mt-3 px-1">
      <div v-for="item in leyenda" :key="item.codigo" class="d-flex align-center ga-1">
        <span class="semana-dot" :style="{ background: item.color }" />
        <span class="text-caption">{{ item.nombre }}</span>
      </div>
    </div>

    <!-- Alerta de choques -->
    <v-alert
      v-if="conflictos.lista.length"
      type="error"
      variant="tonal"
      density="compact"
      class="mt-3"
      :icon="mdiAlertCircleOutline"
    >
      <div class="font-weight-bold mb-1">Choques de horario detectados:</div>
      <div v-for="(c, i) in conflictos.lista" :key="i" class="text-body-2">
        {{ c.materia1 }} (G{{ c.grupo1 }}) ↔ {{ c.materia2 }} (G{{ c.grupo2 }}) — {{ c.dia }}
      </div>
    </v-alert>
  </div>
</template>

<style scoped>
.semana-ev {
  overflow: hidden;
  line-height: 1.25;
  cursor: default;
}
.semana-ev__name {
  font-size: 11px;
}
.semana-ev__detail {
  font-size: 10px;
  opacity: 0.85;
}
.semana-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}
</style>
