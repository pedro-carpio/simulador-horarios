<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
const carrera = route.params.carrera as string
const carreraId = Number(route.query.id)
</script>

<template>
  <v-container fluid>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h5 text-md-h4">Planificador</h1>
        <p class="text-medium-emphasis">{{ carrera }}</p>
      </v-col>
    </v-row>
  </v-container>
</template>
