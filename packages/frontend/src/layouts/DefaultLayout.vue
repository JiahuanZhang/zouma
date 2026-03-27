<script setup lang="ts">
import { useRoute } from 'vue-router';
import { useAppStore } from '@/stores/app';

const route = useRoute();
const appStore = useAppStore();
</script>

<template>
  <el-container class="app-layout">
    <el-aside width="200px" class="app-aside">
      <div class="logo-area">
        <h2 class="logo-title">{{ appStore.title }}</h2>
      </div>
      <el-menu :default-active="route.path" router class="side-menu">
        <el-menu-item index="/">
          <el-icon><i class="el-icon-house" /></el-icon>
          <span>首页</span>
        </el-menu-item>
        <el-menu-item index="/git-repos">
          <el-icon><i class="el-icon-folder" /></el-icon>
          <span>Git 仓库管理</span>
        </el-menu-item>
        <el-menu-item index="/llm-configs">
          <el-icon><i class="el-icon-setting" /></el-icon>
          <span>LLM 配置管理</span>
        </el-menu-item>
        <el-menu-item index="/file-filters">
          <el-icon><i class="el-icon-filter" /></el-icon>
          <span>文件筛选模式</span>
        </el-menu-item>
        <el-menu-item index="/review-plans">
          <el-icon><i class="el-icon-calendar" /></el-icon>
          <span>评审计划管理</span>
        </el-menu-item>
        <el-menu-item index="/review-tasks">
          <el-icon><i class="el-icon-document" /></el-icon>
          <span>评审任务管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="app-header">
        <h1 class="app-header-title">AI 代码评审管理后台</h1>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
}

.app-aside {
  background: #304156;
  overflow-y: auto;
}

.logo-area {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #263445;
}

.logo-title {
  margin: 0;
  font-size: 18px;
  color: #fff;
  font-weight: 600;
}

.side-menu {
  border-right: none;
  background: #304156;
}

.side-menu .el-menu-item {
  color: #bfcbd9;
}

.side-menu .el-menu-item:hover {
  background: #263445;
}

.side-menu .el-menu-item.is-active {
  color: #409eff;
  background: #263445;
}

.app-header {
  display: flex;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
}

.app-header-title {
  margin: 0;
  font-size: 18px;
  color: #333;
  font-weight: 500;
}

.app-main {
  padding: 20px;
  background: #f0f2f5;
}
</style>
