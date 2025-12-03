import { createRouter, createWebHistory } from 'vue-router'
import SelectorView from '../views/SelectorView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: SelectorView,
    },
    {
      path: '/play/:questId',
      name: 'player',
      component: () => import('../views/PlayerView.vue'),
    },
  ],
})

export default router
