<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { obtenerCarreras, type Carrera } from '@/services/horarios'
import { mdiMagnify, mdiSchool, mdiChevronRight } from '@mdi/js'

const router = useRouter()
const carreras = ref<Carrera[]>([])
const carreraSeleccionada = ref<Carrera | null>(null)
const busqueda = ref('')
const cargando = ref(true)
const error = ref('')
const navegando = ref(false)

// TODO: obtener facultad_id dinámicamente si se requiere
const FACULTAD_ID = 1

onMounted(async () => {
  try {
    carreras.value = await obtenerCarreras(FACULTAD_ID)
  } catch (e: any) {
    error.value = 'No se pudieron cargar las carreras'
  } finally {
    cargando.value = false
  }
})

async function seleccionar(carrera: Carrera) {
  carreraSeleccionada.value = carrera
  navegando.value = true
  const slug = carrera.nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
  try {
    const query: Record<string, string | number> = { id: carrera.id }
    if (carrera.last_scraped_at) query.last_scraped = String(carrera.last_scraped_at)
    await router.push({ name: 'planificador', params: { carrera: slug }, query })
  } catch (e: any) {
    error.value = 'No se pudo navegar a la vista del planificador'
    navegando.value = false
  }
}
</script>

<template>
  <v-container class="d-flex flex-column align-center justify-center" style="min-height: 100dvh">
    <div class="w-100 d-flex justify-center mb-4">
      <router-link
        to="/acerca-de"
        class="text-caption text-medium-emphasis"
        style="text-decoration: underline"
      >
        Acerca de esta aplicación
      </router-link>
    </div>
    <v-card max-width="500" width="100%" elevation="2" rounded="lg">
      <v-card-title class="text-center pt-6">
        <h1 class="text-h5 inicio-title" style="margin: 0">
          Simulador de Horarios para Humanidades UMSS
        </h1>
        <div class="text-body-2 text-center mt-2">
          Planifica tus materias, combina grupos y exporta tu horario en PDF.
        </div>
      </v-card-title>

      <v-card-subtitle class="text-center pb-2">
        Selecciona tu carrera para comenzar
      </v-card-subtitle>

      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
          {{ error }}
        </v-alert>

        <v-text-field
          v-model="busqueda"
          label="Buscar carrera"
          :prepend-inner-icon="mdiMagnify"
          variant="outlined"
          density="comfortable"
          hide-details
          clearable
          :loading="cargando"
          class="mb-4"
        />

        <v-list v-if="!cargando" density="compact" rounded>
          <v-list-item
            v-for="carrera in carreras.filter((c) =>
              c.nombre.toLowerCase().includes((busqueda || '').toLowerCase()),
            )"
            :key="carrera.id"
            :title="carrera.nombre"
            rounded="lg"
            @click="seleccionar(carrera)"
          >
            <template #prepend>
              <v-icon :icon="mdiSchool" size="small" />
            </template>
            <template #append>
              <v-icon :icon="mdiChevronRight" size="small" />
            </template>
          </v-list-item>

          <v-list-item
            v-if="
              carreras.filter((c) =>
                c.nombre.toLowerCase().includes((busqueda || '').toLowerCase()),
              ).length === 0
            "
          >
            <v-list-item-title class="text-center text-medium-emphasis">
              No se encontraron carreras
            </v-list-item-title>
          </v-list-item>
        </v-list>

        <div v-else class="d-flex justify-center py-4">
          <v-progress-circular indeterminate color="primary" />
        </div>
      </v-card-text>
    </v-card>
    <div
      v-if="navegando"
      style="
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.45);
        z-index: 2000;
      "
    >
      <v-card max-width="400" elevation="6" class="pa-6" rounded="lg">
        <div class="d-flex flex-column align-center">
          <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
          <div class="text-subtitle-1 text-center">Cargando planificador…</div>
        </div>
      </v-card>
    </div>
  </v-container>
</template>

<style scoped>
.inicio-title {
  margin: 0;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}
@media (max-width: 420px) {
  .inicio-title {
    font-size: 1.05rem; /* reduce slightly on very small screens */
    line-height: 1.15;
  }
}
</style>
