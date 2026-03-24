import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: 'Home',
        component: () => import('@/views/HomeView.vue'),
      },
      {
        path: 'git-repos',
        name: 'GitRepos',
        component: () => import('@/views/GitRepoView.vue'),
      },
      {
        path: 'llm-configs',
        name: 'LlmConfigs',
        component: () => import('@/views/LlmConfigView.vue'),
      },
      {
        path: 'review-plans',
        name: 'ReviewPlans',
        component: () => import('@/views/ReviewPlanView.vue'),
      },
      {
        path: 'review-tasks',
        name: 'ReviewTasks',
        component: () => import('@/views/ReviewTaskView.vue'),
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
