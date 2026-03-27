<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { ReviewIssueRecord, ReviewTaskWithRelations } from '@zouma/common';
import { reviewTaskApi } from '@/api/reviewTask';

const props = defineProps<{ id: string }>();
const router = useRouter();

const loading = ref(true);
const issues = ref<ReviewIssueRecord[]>([]);
const taskInfo = ref<ReviewTaskWithRelations | null>(null);

const filterSeverity = ref('');
const filterCategory = ref('');

const taskId = computed(() => Number(props.id));

const SEVERITY_CFG: Record<string, { label: string; type: 'danger' | 'warning' | 'info' }> = {
  error: { label: '错误', type: 'danger' },
  warning: { label: '警告', type: 'warning' },
  info: { label: '建议', type: 'info' },
};

const CATEGORY_CFG: Record<string, { label: string; color: string }> = {
  style: { label: '代码风格', color: '#409EFF' },
  logic: { label: '逻辑问题', color: '#67C23A' },
  robustness: { label: '健壮性', color: '#E6A23C' },
};

const severityStats = computed(() => {
  const map = { error: 0, warning: 0, info: 0 };
  for (const i of issues.value) {
    if (i.severity in map) map[i.severity as keyof typeof map]++;
  }
  return map;
});

const categoryStats = computed(() => {
  const map = { style: 0, logic: 0, robustness: 0 };
  for (const i of issues.value) {
    if (i.category in map) map[i.category as keyof typeof map]++;
  }
  return map;
});

const filteredIssues = computed(() => {
  return issues.value.filter((i) => {
    if (filterSeverity.value && i.severity !== filterSeverity.value) return false;
    if (filterCategory.value && i.category !== filterCategory.value) return false;
    return true;
  });
});

async function fetchData() {
  loading.value = true;
  try {
    const [issueRes, taskRes] = await Promise.all([
      reviewTaskApi.getIssues(taskId.value),
      taskInfo.value ? Promise.resolve(null) : reviewTaskApi.getById(taskId.value),
    ]);
    issues.value = issueRes.data;
    if (taskRes) taskInfo.value = taskRes.data;
  } catch {
    ElMessage.error('获取问题列表失败');
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.push({ name: 'TaskProgress', params: { id: props.id } });
}

function clearFilters() {
  filterSeverity.value = '';
  filterCategory.value = '';
}

function handleSeverityFilter(severity: string) {
  filterSeverity.value = filterSeverity.value === severity ? '' : severity;
}

function handleCategoryFilter(category: string) {
  filterCategory.value = filterCategory.value === category ? '' : category;
}

onMounted(fetchData);
</script>

<template>
  <div class="issues-page">
    <!-- Header -->
    <div class="issues-header">
      <div class="header-left">
        <el-button plain size="small" @click="goBack">&larr; 返回进展</el-button>
        <h2>{{ taskInfo?.name ?? `任务 #${id}` }} - 问题列表</h2>
      </div>
      <div class="header-right">
        <el-tag size="large" :type="issues.length > 0 ? 'danger' : 'success'">
          共 {{ issues.length }} 个问题
        </el-tag>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" v-loading="true" class="loading-box" />

    <!-- Empty -->
    <el-empty v-else-if="issues.length === 0" description="未发现问题" />

    <template v-else>
      <!-- Stats -->
      <el-row :gutter="16" class="stats-row">
        <el-col :xs="24" :sm="12">
          <el-card shadow="never" class="stat-card">
            <div class="stat-card-title">按严重程度</div>
            <div class="stat-chips">
              <div
                v-for="(cfg, key) in SEVERITY_CFG"
                :key="key"
                class="stat-chip"
                :class="{ active: filterSeverity === key }"
                @click="handleSeverityFilter(key)"
              >
                <el-tag :type="cfg.type" size="small" effect="dark" round>
                  {{ severityStats[key as keyof typeof severityStats] }}
                </el-tag>
                <span>{{ cfg.label }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-card shadow="never" class="stat-card">
            <div class="stat-card-title">按问题类别</div>
            <div class="stat-chips">
              <div
                v-for="(cfg, key) in CATEGORY_CFG"
                :key="key"
                class="stat-chip"
                :class="{ active: filterCategory === key }"
                @click="handleCategoryFilter(key)"
              >
                <span class="cat-dot" :style="{ background: cfg.color }" />
                <span class="cat-count">{{
                  categoryStats[key as keyof typeof categoryStats]
                }}</span>
                <span>{{ cfg.label }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- Filter bar -->
      <div v-if="filterSeverity || filterCategory" class="filter-bar">
        <span class="filter-label">当前筛选：</span>
        <el-tag
          v-if="filterSeverity"
          closable
          size="small"
          :type="SEVERITY_CFG[filterSeverity]?.type"
          @close="filterSeverity = ''"
        >
          {{ SEVERITY_CFG[filterSeverity]?.label }}
        </el-tag>
        <el-tag v-if="filterCategory" closable size="small" @close="filterCategory = ''">
          {{ CATEGORY_CFG[filterCategory]?.label }}
        </el-tag>
        <el-button text size="small" @click="clearFilters">清除所有</el-button>
        <span class="filter-result">{{ filteredIssues.length }} 条结果</span>
      </div>

      <!-- Issues table -->
      <el-card shadow="never" class="issues-table-card">
        <el-table :data="filteredIssues" stripe border row-key="id" default-expand-all>
          <el-table-column label="严重程度" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="SEVERITY_CFG[row.severity]?.type ?? 'info'" size="small" effect="dark">
                {{ SEVERITY_CFG[row.severity]?.label ?? row.severity }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="类别" width="110" align="center">
            <template #default="{ row }">
              <span class="category-label">
                <span
                  class="cat-dot"
                  :style="{ background: CATEGORY_CFG[row.category]?.color ?? '#909399' }"
                />
                {{ CATEGORY_CFG[row.category]?.label ?? row.category }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="文件" min-width="200">
            <template #default="{ row }">
              <span class="file-path">{{ row.file }}</span>
              <span v-if="row.line" class="line-num">:{{ row.line }}</span>
            </template>
          </el-table-column>
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="expand-content">
                <div class="expand-section">
                  <div class="expand-label">问题描述</div>
                  <div class="expand-text">{{ row.description }}</div>
                </div>
                <div class="expand-section">
                  <div class="expand-label">修改建议</div>
                  <div class="expand-text suggestion">{{ row.suggestion }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="描述" min-width="300" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="desc-text">{{ row.description }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.issues-page {
  max-width: 1200px;
  margin: 0 auto;
}

.issues-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  padding: 16px 20px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
  font-size: 18px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading-box {
  min-height: 300px;
}

/* Stats */
.stats-row {
  margin-bottom: 16px;
}

.stat-card {
  height: 100%;
}

.stat-card-title {
  font-size: 13px;
  color: #909399;
  margin-bottom: 12px;
  font-weight: 500;
}

.stat-chips {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.stat-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  font-size: 13px;
}

.stat-chip:hover {
  background: #f5f7fa;
}

.stat-chip.active {
  background: #ecf5ff;
  font-weight: 500;
}

.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.cat-count {
  font-weight: 600;
  font-size: 15px;
}

/* Filter bar */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 13px;
}

.filter-label {
  color: #909399;
}

.filter-result {
  margin-left: auto;
  color: #909399;
  font-size: 12px;
}

/* Table */
.issues-table-card {
  margin-bottom: 16px;
}

.file-path {
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 13px;
  color: #409eff;
}

.line-num {
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 13px;
  color: #909399;
}

.category-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.desc-text {
  font-size: 13px;
  color: #606266;
}

/* Expand content */
.expand-content {
  padding: 12px 20px;
}

.expand-section {
  margin-bottom: 12px;
}

.expand-section:last-child {
  margin-bottom: 0;
}

.expand-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
  font-weight: 500;
}

.expand-text {
  font-size: 13px;
  color: #303133;
  line-height: 1.6;
  white-space: pre-wrap;
}

.expand-text.suggestion {
  background: #f0f9eb;
  padding: 8px 12px;
  border-radius: 4px;
  border-left: 3px solid #67c23a;
}
</style>
