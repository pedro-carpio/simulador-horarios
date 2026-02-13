<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <v-container class="py-8">
    <v-card elevation="2" class="mx-auto" max-width="900">
      <v-card-title class="text-h5">Acerca de</v-card-title>
      <v-card-text>
        <div class="mb-6">
          <div class="text-subtitle-1 font-weight-medium mb-2">¿Qué es Capuchino Humanidades?</div>
          <p>
            Capuchino Humanidades está basado en el proyecto Capuchino original proporcionado por la
            SECI (FCyT - UMSS). Al igual que ese proyecto, este simulador es Open Source. El código
            fuente está disponible en:
            <a
              href="https://deepwiki.com/pedro-carpio/simulador-horarios"
              target="_blank"
              rel="noopener"
              >deepwiki.com/pedro-carpio/simulador-horarios</a
            >.
          </p>
        </div>

        <div class="mb-6">
          <div class="text-subtitle-1 font-weight-medium mb-2">También conocido como</div>
          <p>
            Esta herramienta puede aparecer referida como "Capuchino", "Simulador de Horarios",
            "Planificador de Horarios UMSS", "Horario UMSS", "Capuchino Horarios", "Cappuccino UMSS"
            "Cappuchino UMSS" o "Planificador de clases". Estas variantes ayudan a que la aplicación
            sea encontrada por estudiantes que usan diferentes términos para buscar soluciones de
            organización de horarios.
          </p>
        </div>

        <div class="mb-6">
          <div class="text-subtitle-1 font-weight-medium mb-2">Cómo usarlo</div>
          <ol>
            <li>Selecciona tu carrera desde la pantalla principal.</li>
            <li>Abrirá el planificador: expande niveles y selecciona materias una por una.</li>
            <li>
              Selecciona los grupos que te interesan. El calendario mostrará los choques en rojo.
            </li>
            <li>Usa las opciones de exportar o imprimir para obtener tu horario en PDF.</li>
          </ol>
          <p class="mt-2">
            Consejo: prueba distintas combinaciones para minimizar choques y encontrar el mejor
            horario.
          </p>
          <p class="mt-3">
            Usos habituales: preparar tu horario antes de registrar materias en WEBSIS, compartir tu
            horario con compañeros o imprimirlo para tenerlo a mano. El PDF generado es apto para
            impresión y no perder tus horarios de vista.
          </p>
          <p class="mt-2">
            La aplicación está pensada para facilitar la planificación y reducir conflictos entre
            clases; utiliza la vista semanal para identificar choques y probar combinaciones
            alternativas.
          </p>
        </div>

        <div class="mb-6">
          <div class="text-subtitle-1 font-weight-medium mb-2">Créditos y contacto</div>
          <p>
            Yo, Kusillo (Pedro Carpio), soy el contribuyente principal del proyecto. Si encuentras
            un bug o tienes una sugerencia, por favor abre un issue o envía un pull request en el
            repositorio. También puedes contactarme directamente.
          </p>
        </div>

        <div class="mb-6">
          <div class="text-subtitle-1 font-weight-medium mb-2">Licencia y participación</div>
          <p>
            Este proyecto es Open Source. Revisa el repositorio para detalles sobre la licencia y
            cómo contribuir. Agradezco las contribuciones, correcciones y reportes de problemas.
          </p>
        </div>

        <div class="d-flex justify-end">
          <v-btn color="primary" variant="tonal" @click="router.push({ name: 'inicio' })"
            >Simular horarios</v-btn
          >
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
:root {
  --max-width: 900px;
}
v-card {
  padding: 16px;
}
ol {
  margin-left: 1rem;
}
</style>
