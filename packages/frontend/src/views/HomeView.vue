<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { gitRepoApi } from '@/api/gitRepo';
import { llmConfigApi } from '@/api/llmConfig';
import { reviewTaskApi } from '@/api/reviewTask';

const stats = ref({ repos: 0, configs: 0, tasks: 0 });

onMounted(async () => {
  try {
    const [repoRes, configRes, taskRes] = await Promise.all([
      gitRepoApi.getAll(),
      llmConfigApi.getAll(),
      reviewTaskApi.getAll(),
    ]);
    stats.value = {
      repos: repoRes.data.length,
      configs: configRes.data.length,
      tasks: taskRes.data.length,
    };
  } catch {
    /* ignore */
  }
});
</script>

<template>
  <div class="home-view">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header><span>Git 仓库</span></template>
          <div class="stat-number">{{ stats.repos }}</div>
          <div class="stat-label">已配置仓库数</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header><span>LLM 配置</span></template>
          <div class="stat-number">{{ stats.configs }}</div>
          <div class="stat-label">已配置模型数</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header><span>评审任务</span></template>
          <div class="stat-number">{{ stats.tasks }}</div>
          <div class="stat-label">总任务数</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.home-view {
  max-width: 900px;
}

.stat-number {
  font-size: 36px;
  font-weight: 600;
  color: #409eff;
  text-align: center;
}

.stat-label {
  text-align: center;
  color: #999;
  margin-top: 8px;
  font-size: 14px;
}
</style>
