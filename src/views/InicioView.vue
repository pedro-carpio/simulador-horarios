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

function seleccionar(carrera: Carrera) {
  carreraSeleccionada.value = carrera
  const slug = carrera.nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
  router.push({ name: 'planificador', params: { carrera: slug }, query: { id: carrera.id } })
}
</script>

<template>
  <v-container class="d-flex align-center justify-center" style="min-height: 100dvh">
    <v-card max-width="500" width="100%" elevation="2" rounded="lg">
      <v-card-title class="text-h5 text-center pt-6">
        Simulador de Horarios para Humanidades
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
  </v-container>
</template>
