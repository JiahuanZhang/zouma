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
        path: 'git-repos/:id',
        name: 'GitRepoDetail',
        component: () => import('@/views/GitRepoDetailView.vue'),
        props: true,
      },
      {
        path: 'llm-configs',
        name: 'LlmConfigs',
        component: () => import('@/views/LlmConfigView.vue'),
      },
      {
        path: 'file-filters',
        name: 'FileFilters',
        component: () => import('@/views/FileFilterView.vue'),
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
      {
        path: 'review-tasks/:id/progress',
        name: 'TaskProgress',
        component: () => import('@/views/TaskProgressView.vue'),
        props: true,
      },
      {
        path: 'review-tasks/:id/issues',
        name: 'TaskIssues',
        component: () => import('@/views/TaskIssuesView.vue'),
        props: true,
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
