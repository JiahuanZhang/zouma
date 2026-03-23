import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppStore = defineStore('app', () => {
  const title = ref('ZouMa');
  const isLoading = ref(false);

  class AppActions {
    static setLoading(loading: boolean): void {
      isLoading.value = loading;
    }

    static setTitle(newTitle: string): void {
      title.value = newTitle;
    }
  }

  return { title, isLoading, ...AppActions };
});
