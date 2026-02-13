<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { obtenerMaterias, obtenerClases, type Materia, type Clase } from '@/services/horarios'
import {
  mdiChevronLeft,
  mdiBookOpenVariant,
  mdiChevronDown,
  mdiPlus,
  mdiDeleteSweep,
  mdiPrinter,
  mdiDownload,
  mdiDotsVertical,
  mdiClose,
} from '@mdi/js'
import SemanaView from '@/components/SemanaView.vue'

const route = useRoute()
const carrera = route.params.carrera as string
const carreraId = Number(route.query.id)

// TODO: hacerlo dinámico
const GESTION = '1/2026'

const materias = ref<Materia[]>([])
const cargando = ref(true)
const errorMsg = ref('')

// Sidebar: nivel seleccionado y materias expandidas
const nivelActivo = ref<string | null>(null)
const materiasExpandidas = ref(new Set<number>())
const clasesCache = ref<Record<number, Clase[]>>({})
const cargandoClases = ref<Record<number, boolean>>({})

// Grupos seleccionados (checkbox): clave "materiaId-grupoNumero"
const gruposSeleccionados = ref(new Set<string>())

// Mobile: panel inferior visible
const panelMobileAbierto = ref(true)

// Mobile: FAB menú acciones
const fabAbierto = ref(false)

// Acción: quitar todos los grupos seleccionados
function quitarTodo() {
  gruposSeleccionados.value = new Set()
  fabAbierto.value = false
}

// Agrupar materias por nivel
interface Nivel {
  codigo: string
  nombre: string
  materias: Materia[]
}

const niveles = computed<Nivel[]>(() => {
  const map = new Map<string, Nivel>()
  for (const m of materias.value) {
    if (!map.has(m.nivel_codigo)) {
      map.set(m.nivel_codigo, { codigo: m.nivel_codigo, nombre: m.nivel_nombre, materias: [] })
    }
    map.get(m.nivel_codigo)!.materias.push(m)
  }
  return Array.from(map.values())
})

// Extraer grupos únicos de las clases cacheadas de una materia
function gruposDeMateria(materiaId: number): { numero: number; docente: string }[] {
  const clases = clasesCache.value[materiaId] ?? []
  const map = new Map<number, string>()
  for (const c of clases) {
    if (!map.has(c.grupo_numero)) map.set(c.grupo_numero, c.docente)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([numero, docente]) => ({ numero, docente }))
}

function grupoKey(materiaId: number, grupoNumero: number) {
  return `${materiaId}-${grupoNumero}`
}

function isGrupoSeleccionado(materiaId: number, grupoNumero: number) {
  return gruposSeleccionados.value.has(grupoKey(materiaId, grupoNumero))
}

function toggleGrupo(materiaId: number, grupoNumero: number) {
  const key = grupoKey(materiaId, grupoNumero)
  const next = new Set(gruposSeleccionados.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  gruposSeleccionados.value = next
}

// Datos para la vista principal: todos los grupos seleccionados con su info
interface GrupoSeleccionado {
  key: string
  materiaNombre: string
  materiaCodigo: string
  grupoNumero: number
  clases: Clase[]
}

const cursosSeleccionados = computed<GrupoSeleccionado[]>(() => {
  const result: GrupoSeleccionado[] = []
  for (const key of gruposSeleccionados.value) {
    const [matIdStr, grpStr] = key.split('-')
    const materiaId = Number(matIdStr)
    const grupoNumero = Number(grpStr)
    const mat = materias.value.find((m) => m.id === materiaId)
    if (!mat) continue
    const clases = (clasesCache.value[materiaId] ?? []).filter(
      (c) => c.grupo_numero === grupoNumero,
    )
    result.push({
      key,
      materiaNombre: mat.nombre,
      materiaCodigo: mat.codigo,
      grupoNumero,
      clases,
    })
  }
  return result.sort((a, b) => a.materiaNombre.localeCompare(b.materiaNombre))
})

onMounted(async () => {
  try {
    materias.value = await obtenerMaterias(carreraId)
  } catch {
    errorMsg.value = 'No se pudieron cargar las materias'
  } finally {
    cargando.value = false
  }
})

function seleccionarNivel(codigo: string) {
  nivelActivo.value = nivelActivo.value === codigo ? null : codigo
}

async function toggleMateria(materia: Materia) {
  const expandidas = new Set(materiasExpandidas.value)
  if (expandidas.has(materia.id)) {
    expandidas.delete(materia.id)
    materiasExpandidas.value = expandidas
    return
  }
  expandidas.add(materia.id)
  materiasExpandidas.value = expandidas

  if (!clasesCache.value[materia.id]) {
    cargandoClases.value = { ...cargandoClases.value, [materia.id]: true }
    try {
      clasesCache.value[materia.id] = await obtenerClases(materia.id, GESTION)
    } catch {
      clasesCache.value[materia.id] = []
    } finally {
      cargandoClases.value = { ...cargandoClases.value, [materia.id]: false }
    }
  }
}
</script>

<template>
  <!-- ════════ DESKTOP ════════ -->
  <v-layout class="h-screen d-none d-md-flex">
    <!-- Sidebar izquierdo -->
    <v-navigation-drawer permanent width="320">
      <v-list-item>
        <template #prepend>
          <v-btn :icon="mdiChevronLeft" variant="text" size="small" to="/" />
        </template>
        <v-list-item-title class="text-subtitle-1 font-weight-bold">
          {{ carrera.replace(/-/g, ' ') }}
        </v-list-item-title>
        <v-list-item-subtitle>{{ GESTION }}</v-list-item-subtitle>
      </v-list-item>

      <v-divider />

      <div v-if="cargando" class="d-flex justify-center py-6">
        <v-progress-circular indeterminate size="32" />
      </div>

      <v-alert v-else-if="errorMsg" type="error" variant="tonal" class="ma-2">
        {{ errorMsg }}
      </v-alert>

      <v-list v-else density="compact" nav>
        <template v-for="nivel in niveles" :key="nivel.codigo">
          <!-- Nivel -->
          <v-list-item
            :active="nivelActivo === nivel.codigo"
            color="primary"
            @click="seleccionarNivel(nivel.codigo)"
          >
            <v-list-item-title class="font-weight-medium">
              {{ nivel.nombre }}
            </v-list-item-title>
            <v-list-item-subtitle>{{ nivel.codigo }}</v-list-item-subtitle>
          </v-list-item>

          <!-- Materias del nivel -->
          <v-expand-transition>
            <div v-if="nivelActivo === nivel.codigo">
              <template v-for="materia in nivel.materias" :key="materia.id">
                <!-- Materia (click expande grupos) -->
                <v-list-item
                  :active="materiasExpandidas.has(materia.id)"
                  color="secondary"
                  class="pl-8"
                  @click="toggleMateria(materia)"
                >
                  <template #prepend>
                    <v-icon :icon="mdiBookOpenVariant" size="x-small" />
                  </template>
                  <v-list-item-title class="text-body-2">
                    {{ materia.nombre }}
                  </v-list-item-title>
                </v-list-item>

                <!-- Grupos como checkboxes -->
                <v-expand-transition>
                  <div v-if="materiasExpandidas.has(materia.id)">
                    <div v-if="cargandoClases[materia.id]" class="d-flex justify-center py-2">
                      <v-progress-circular indeterminate size="20" width="2" />
                    </div>
                    <template v-else>
                      <v-checkbox
                        v-for="grupo in gruposDeMateria(materia.id)"
                        :key="grupo.numero"
                        :model-value="isGrupoSeleccionado(materia.id, grupo.numero)"
                        :label="`G ${grupo.numero}: ${grupo.docente}`"
                        density="compact"
                        hide-details
                        class="pl-12"
                        @update:model-value="toggleGrupo(materia.id, grupo.numero)"
                      />
                    </template>
                  </div>
                </v-expand-transition>
              </template>
            </div>
          </v-expand-transition>
        </template>
      </v-list>
    </v-navigation-drawer>

    <!-- Contenido principal desktop -->
    <v-main scrollable>
      <v-container fluid>
        <!-- Barra de acciones desktop -->
        <div v-if="cursosSeleccionados.length > 0" class="d-flex justify-end ga-2 mb-3">
          <v-btn icon variant="outlined" size="small" @click="quitarTodo" title="Quitar todo">
            <v-icon :icon="mdiDeleteSweep" />
          </v-btn>
          <v-btn icon variant="outlined" size="small" title="Imprimir">
            <v-icon :icon="mdiPrinter" />
          </v-btn>
          <v-btn icon variant="outlined" size="small" title="Descargar">
            <v-icon :icon="mdiDownload" />
          </v-btn>
        </div>

        <!-- Sin grupos seleccionados -->
        <div
          v-if="cursosSeleccionados.length === 0"
          class="d-flex flex-column align-center justify-center"
          style="min-height: 60vh"
        >
          <v-icon :icon="mdiBookOpenVariant" size="64" color="grey-lighten-1" />
          <p class="text-h6 text-medium-emphasis mt-4">
            Selecciona grupos desde el panel izquierdo
          </p>
        </div>

        <!-- Cursos seleccionados -->
        <semana-view v-else :cursos="cursosSeleccionados" />
      </v-container>
    </v-main>
  </v-layout>

  <!-- ════════ MOBILE ════════ -->
  <div class="d-flex d-md-none flex-column h-screen">
    <!-- Parte superior: cursos seleccionados -->
    <div class="flex-grow-1 overflow-y-auto" style="min-height: 0">
      <!-- Header mobile -->
      <v-toolbar density="compact" flat>
        <v-btn :icon="mdiChevronLeft" variant="text" size="small" to="/" />
        <v-toolbar-title class="text-subtitle-2">
          {{ carrera.replace(/-/g, ' ') }}
        </v-toolbar-title>
      </v-toolbar>

      <v-container>
        <!-- Sin grupos seleccionados -->
        <div
          v-if="cursosSeleccionados.length === 0"
          class="d-flex flex-column align-center justify-center"
          style="min-height: 40vh"
        >
          <v-icon :icon="mdiBookOpenVariant" size="48" color="grey-lighten-1" />
          <p class="text-body-1 text-medium-emphasis mt-3 text-center">
            Selecciona grupos para comenzar
          </p>
        </div>

        <!-- Cursos seleccionados -->
        <semana-view v-else :cursos="cursosSeleccionados" />
      </v-container>
    </div>

    <!-- FAB flotante + opciones móvil -->
    <div class="flex-shrink-0 position-relative">
      <!-- FAB flotante (encima del panel de opciones) -->
      <v-btn
        v-if="cursosSeleccionados.length > 0"
        icon
        size="small"
        :color="fabAbierto ? 'error' : 'primary'"
        class="fab-acciones"
        elevation="4"
        @click="fabAbierto = !fabAbierto"
      >
        <v-icon :icon="fabAbierto ? mdiClose : mdiDotsVertical" />
      </v-btn>

      <v-expand-transition>
        <div v-show="fabAbierto && cursosSeleccionados.length > 0" class="border-t bg-surface">
          <v-list density="compact" nav class="py-1">
            <v-list-item @click="quitarTodo">
              <v-list-item-title class="text-body-2">Quitar todo</v-list-item-title>
              <template #append>
                <v-avatar size="32" color="error" variant="tonal">
                  <v-icon :icon="mdiDeleteSweep" size="18" />
                </v-avatar>
              </template>
            </v-list-item>
            <v-list-item>
              <v-list-item-title class="text-body-2">Imprimir</v-list-item-title>
              <template #append>
                <v-avatar size="32" color="primary" variant="tonal">
                  <v-icon :icon="mdiPrinter" size="18" />
                </v-avatar>
              </template>
            </v-list-item>
            <v-list-item>
              <v-list-item-title class="text-body-2">Descargar</v-list-item-title>
              <template #append>
                <v-avatar size="32" color="primary" variant="tonal">
                  <v-icon :icon="mdiDownload" size="18" />
                </v-avatar>
              </template>
            </v-list-item>
          </v-list>
        </div>
      </v-expand-transition>
    </div>

    <!-- Toggle panel inferior -->
    <div class="flex-shrink-0">
      <v-btn block variant="tonal" rounded="0" @click="panelMobileAbierto = !panelMobileAbierto">
        <v-icon :icon="panelMobileAbierto ? mdiChevronDown : mdiPlus" class="mr-2" />
        {{ panelMobileAbierto ? 'Ocultar materias' : 'Añadir materias' }}
      </v-btn>
    </div>

    <!-- Parte inferior: navegación de materias -->
    <v-expand-transition>
      <div
        v-show="panelMobileAbierto"
        class="flex-shrink-0 overflow-y-auto border-t"
        style="max-height: 45vh"
      >
        <div v-if="cargando" class="d-flex justify-center py-4">
          <v-progress-circular indeterminate size="28" />
        </div>

        <v-alert v-else-if="errorMsg" type="error" variant="tonal" class="ma-2" density="compact">
          {{ errorMsg }}
        </v-alert>

        <v-list v-else density="compact" nav>
          <template v-for="nivel in niveles" :key="nivel.codigo">
            <v-list-item
              :active="nivelActivo === nivel.codigo"
              color="primary"
              @click="seleccionarNivel(nivel.codigo)"
            >
              <v-list-item-title class="font-weight-medium text-body-2">
                {{ nivel.nombre }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption">{{ nivel.codigo }}</v-list-item-subtitle>
            </v-list-item>

            <v-expand-transition>
              <div v-if="nivelActivo === nivel.codigo">
                <template v-for="materia in nivel.materias" :key="materia.id">
                  <v-list-item
                    :active="materiasExpandidas.has(materia.id)"
                    color="secondary"
                    class="pl-8"
                    @click="toggleMateria(materia)"
                  >
                    <template #prepend>
                      <v-icon :icon="mdiBookOpenVariant" size="x-small" />
                    </template>
                    <v-list-item-title class="text-caption">
                      {{ materia.nombre }}
                    </v-list-item-title>
                  </v-list-item>

                  <v-expand-transition>
                    <div v-if="materiasExpandidas.has(materia.id)">
                      <div v-if="cargandoClases[materia.id]" class="d-flex justify-center py-2">
                        <v-progress-circular indeterminate size="18" width="2" />
                      </div>
                      <template v-else>
                        <v-checkbox
                          v-for="grupo in gruposDeMateria(materia.id)"
                          :key="grupo.numero"
                          :model-value="isGrupoSeleccionado(materia.id, grupo.numero)"
                          :label="`G ${grupo.numero}: ${grupo.docente}`"
                          density="compact"
                          hide-details
                          class="pl-12"
                          @update:model-value="toggleGrupo(materia.id, grupo.numero)"
                        />
                      </template>
                    </div>
                  </v-expand-transition>
                </template>
              </div>
            </v-expand-transition>
          </template>
        </v-list>
      </div>
    </v-expand-transition>
  </div>
</template>

<style scoped>
.fab-acciones {
  position: absolute;
  top: -44px;
  right: 12px;
  z-index: 5;
}
</style>
