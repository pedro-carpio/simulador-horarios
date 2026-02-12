import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'inicio',
      component: () => import('@/views/InicioView.vue'),
    },
    {
      path: '/:carrera',
      name: 'planificador',
      component: () => import('@/views/PlanificadorView.vue'),
    },
  ],
})

export default router
