<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { GitRepo, GitRepoReviewRecord } from '@zouma/common';
import { gitRepoApi } from '@/api/gitRepo';

const props = defineProps<{ id: string }>();
const router = useRouter();

const loading = ref(true);
const repo = ref<GitRepo | null>(null);
const reviewRecords = ref<GitRepoReviewRecord[]>([]);

const repoId = computed(() => Number(props.id));

type RepoStatus = 'downloading' | 'ready' | 'error';
const statusMap: Record<RepoStatus, { label: string; type: 'warning' | 'success' | 'danger' }> = {
  downloading: { label: '下载中', type: 'warning' },
  ready: { label: '正常', type: 'success' },
  error: { label: '异常', type: 'danger' },
};

function normalizeStatus(r: GitRepo): RepoStatus {
  if (r.status === 'downloading' || r.status === 'ready' || r.status === 'error') return r.status;
  return r.local_path ? 'ready' : 'error';
}

async function fetchData() {
  loading.value = true;
  try {
    const res = await gitRepoApi.getDetail(repoId.value);
    const { review_records, ...repoData } = res.data;
    repo.value = repoData;
    reviewRecords.value = review_records ?? [];
  } catch {
    ElMessage.error('获取仓库详情失败');
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.push({ name: 'GitRepos' });
}

function formatCommit(commit: string): string {
  return commit?.slice(0, 8) ?? '-';
}

function formatDate(d: string | null): string {
  if (!d) return '-';
  return d.replace('T', ' ').replace(/\.\d+Z$/, '');
}

onMounted(fetchData);
</script>

<template>
  <div class="detail-page">
    <!-- Header -->
    <div class="detail-header">
      <div class="header-left">
        <el-button plain size="small" @click="goBack">&larr; 返回列表</el-button>
        <h2>{{ repo?.name ?? `仓库 #${id}` }}</h2>
      </div>
      <div v-if="repo" class="header-right">
        <el-tag :type="statusMap[normalizeStatus(repo)].type" size="large">
          {{ statusMap[normalizeStatus(repo)].label }}
        </el-tag>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" v-loading="true" class="loading-box" />

    <template v-else-if="repo">
      <!-- Repo Info Cards -->
      <el-row :gutter="16" class="info-row">
        <el-col :xs="24" :sm="12" :md="6">
          <div class="info-card">
            <div class="info-label">仓库名称</div>
            <div class="info-value">{{ repo.name }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="info-card">
            <div class="info-label">默认分支</div>
            <div class="info-value">{{ repo.branch }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="info-card">
            <div class="info-label">类型</div>
            <div class="info-value">
              <el-tag :type="repo.local_path ? 'success' : 'primary'" size="small">
                {{ repo.local_path ? '本地' : '远程' }}
              </el-tag>
            </div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="info-card">
            <div class="info-label">创建时间</div>
            <div class="info-value small">{{ formatDate(repo.created_at) }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- Extended info -->
      <el-card shadow="never" class="section-card">
        <template #header><span class="section-title">仓库信息</span></template>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="仓库地址">
            <span class="mono-text">{{ repo.url || '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="本地路径">
            <span class="mono-text">{{ repo.local_path || '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="repo.description" label="描述">
            {{ repo.description }}
          </el-descriptions-item>
          <el-descriptions-item label="最近评审 Commit">
            <template v-if="repo.last_reviewed_commit">
              <el-tooltip :content="repo.last_reviewed_commit" placement="top">
                <span class="commit-hash">{{ formatCommit(repo.last_reviewed_commit) }}</span>
              </el-tooltip>
              <el-tag v-if="repo.last_reviewed_branch" size="small" type="info" style="margin-left: 8px">
                {{ repo.last_reviewed_branch }}
              </el-tag>
            </template>
            <span v-else class="text-muted">暂无</span>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- Per-branch review records -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="section-header-row">
            <span class="section-title">分支评审记录</span>
            <span class="section-sub">共 {{ reviewRecords.length }} 条</span>
          </div>
        </template>

        <el-empty v-if="reviewRecords.length === 0" description="暂无评审记录" :image-size="80" />

        <el-table v-else :data="reviewRecords" stripe border size="default">
          <el-table-column label="分支" min-width="140">
            <template #default="{ row }">
              <el-tag size="small" type="info">{{ row.branch }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="上次评审 Commit" min-width="200">
            <template #default="{ row }">
              <el-tooltip :content="row.last_commit" placement="top">
                <span class="commit-hash">{{ formatCommit(row.last_commit) }}</span>
              </el-tooltip>
              <span class="commit-full">{{ row.last_commit }}</span>
            </template>
          </el-table-column>
          <el-table-column label="评审时间" width="180">
            <template #default="{ row }">
              {{ formatDate(row.reviewed_at) }}
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <el-empty v-else description="未找到仓库信息" />
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 960px;
  margin: 0 auto;
}

/* Header */
.detail-header {
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
  min-height: 200px;
}

/* Info cards */
.info-row {
  margin-bottom: 16px;
}

.info-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  border: 1px solid #ebeef5;
  height: 100%;
}

.info-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.info-value {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.info-value.small {
  font-size: 13px;
  font-weight: 400;
}

/* Section */
.section-card {
  margin-bottom: 16px;
}

.section-title {
  font-weight: 600;
  font-size: 15px;
}

.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.section-sub {
  font-size: 13px;
  color: #909399;
}

/* Commit & mono */
.commit-hash {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  color: #409eff;
  cursor: pointer;
}

.commit-full {
  display: none;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
}

@media (min-width: 768px) {
  .commit-full {
    display: inline;
  }
  .commit-hash {
    display: none;
  }
}

.mono-text {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  word-break: break-all;
}

.text-muted {
  color: #c0c4cc;
  font-size: 13px;
}
</style>
