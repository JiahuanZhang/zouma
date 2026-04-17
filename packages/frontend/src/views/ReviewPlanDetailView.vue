<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { FormInstance } from 'element-plus';
import type {
  ReviewPlanWithRelations,
  ReviewTaskWithRelations,
  UpdateReviewPlanDTO,
  GitRepo,
  LlmConfig,
  FileFilter,
  ReviewPlanTriggerType,
  IntervalTriggerConfig,
  DailyTriggerConfig,
  WebhookTriggerConfig,
} from '@zouma/common';
import { reviewPlanApi } from '@/api/reviewPlan';
import { reviewTaskApi } from '@/api/reviewTask';
import { gitRepoApi } from '@/api/gitRepo';
import { llmConfigApi } from '@/api/llmConfig';
import { fileFilterApi } from '@/api/fileFilter';

const props = defineProps<{ id: string }>();
const router = useRouter();
const planId = computed(() => Number(props.id));

const loading = ref(false);
const plan = ref<ReviewPlanWithRelations | null>(null);

// Tasks variables
const tasksLoading = ref(false);
const tasks = ref<ReviewTaskWithRelations[]>([]);
const totalTasks = ref(0);
const page = ref(1);
const pageSize = ref(10);

// Status Map for task
const taskStatusMap: Record<string, { label: string; type: string }> = {
  pending: { label: '待执行', type: 'info' },
  running: { label: '执行中', type: 'warning' },
  completed: { label: '已完成', type: 'success' },
  failed: { label: '失败', type: 'danger' },
};

// Edit Support properties
const repos = ref<GitRepo[]>([]);
const llmConfigs = ref<LlmConfig[]>([]);
const fileFilters = ref<FileFilter[]>([]);

const dialogVisible = ref(false);
const formRef = ref<FormInstance>();

interface PlanForm {
  name: string;
  repo_id: number;
  llm_config_id: number;
  target_branch: string;
  file_filter_id: number | null;
  trigger_type: ReviewPlanTriggerType;
  interval_hours: number;
  daily_time: string;
  webhook_secret: string;
  enabled: number;
}

function generateRandomString(length: number = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const form = reactive<PlanForm>({
  name: '',
  repo_id: 0,
  llm_config_id: 0,
  target_branch: '',
  file_filter_id: null,
  trigger_type: 'interval',
  interval_hours: 24,
  daily_time: '09:00',
  webhook_secret: '',
  enabled: 1,
});

const rules = {
  name: [{ required: true, message: '请输入计划名称', trigger: 'blur' }],
  repo_id: [{ required: true, message: '请选择仓库', trigger: 'change', type: 'number', min: 1 }],
  llm_config_id: [
    { required: true, message: '请选择 LLM 配置', trigger: 'change', type: 'number', min: 1 },
  ],
  trigger_type: [{ required: true, message: '请选择触发方式', trigger: 'change' }],
};

type RepoStatus = 'downloading' | 'ready' | 'error';
const repoStatusLabelMap: Record<RepoStatus, string> = {
  downloading: '下载中',
  ready: '正常',
  error: '异常',
};
function normalizeRepoStatus(repo: GitRepo): RepoStatus {
  if (repo.status === 'downloading' || repo.status === 'ready' || repo.status === 'error') {
    return repo.status;
  }
  return repo.local_path ? 'ready' : 'error';
}

function isRepoReady(repo: GitRepo): boolean {
  return normalizeRepoStatus(repo) === 'ready' && !!repo.local_path;
}

function getRepoOptionLabel(repo: GitRepo): string {
  return `${repo.name} [${repoStatusLabelMap[normalizeRepoStatus(repo)]}]`;
}

const webhookBaseUrl = computed(() => {
  const base = window.location.origin;
  return `${base}/api/review-plans/webhook`;
});

function copyWebhookUrl() {
  const url = `${webhookBaseUrl.value}/${planId.value}`;
  navigator.clipboard.writeText(url);
  ElMessage.success('已复制 URL 到剪贴板');
}

function copySecret() {
  if (form.webhook_secret) {
    navigator.clipboard.writeText(form.webhook_secret);
    ElMessage.success('已复制密钥到剪贴板');
  }
}

// Data fetchers
async function fetchPlan() {
  loading.value = true;
  try {
    const res = await reviewPlanApi.getById(planId.value);
    plan.value = res.data;
  } catch (err) {
    ElMessage.error('获取计划信息失败');
  } finally {
    loading.value = false;
  }
}

async function fetchTasks() {
  tasksLoading.value = true;
  try {
    const res = await reviewTaskApi.getPage(page.value, pageSize.value, planId.value);
    tasks.value = res.data.items;
    totalTasks.value = res.data.total;
  } catch (err) {
    ElMessage.error('获取任务列表失败');
  } finally {
    tasksLoading.value = false;
  }
}

async function fetchOptions() {
  const [repoRes, configRes, filterRes] = await Promise.all([
    gitRepoApi.getAll(),
    llmConfigApi.getAll(),
    fileFilterApi.getAll(),
  ]);
  repos.value = repoRes.data;
  llmConfigs.value = configRes.data;
  fileFilters.value = filterRes.data;
}

function extractTriggerConfig(row: ReviewPlanWithRelations): {
  interval_hours: number;
  daily_time: string;
  webhook_secret: string;
} {
  const config = row.trigger_config;
  if (row.trigger_type === 'interval') {
    return {
      interval_hours: (config as IntervalTriggerConfig).interval_hours ?? 24,
      daily_time: '09:00',
      webhook_secret: '',
    };
  }
  if (row.trigger_type === 'daily') {
    return { interval_hours: 24, daily_time: (config as DailyTriggerConfig).time ?? '09:00', webhook_secret: '' };
  }
  if (row.trigger_type === 'webhook') {
    return {
      interval_hours: 24,
      daily_time: '09:00',
      webhook_secret: (config as WebhookTriggerConfig).secret ?? '',
    };
  }
  return { interval_hours: 24, daily_time: '09:00', webhook_secret: '' };
}

function buildTriggerConfig(): UpdateReviewPlanDTO['trigger_config'] {
  if (form.trigger_type === 'interval') {
    return { interval_hours: form.interval_hours };
  }
  if (form.trigger_type === 'daily') {
    return { time: form.daily_time };
  }
  if (form.trigger_type === 'webhook') {
    return form.webhook_secret ? { secret: form.webhook_secret } : {};
  }
  return {};
}

function openEdit() {
  if (!plan.value) return;
  const { interval_hours, daily_time, webhook_secret } = extractTriggerConfig(plan.value);
  Object.assign(form, {
    name: plan.value.name,
    repo_id: plan.value.repo_id,
    llm_config_id: plan.value.llm_config_id,
    target_branch: plan.value.target_branch ?? '',
    file_filter_id: plan.value.file_filter_id ?? null,
    trigger_type: plan.value.trigger_type,
    interval_hours,
    daily_time,
    webhook_secret: webhook_secret || generateRandomString(),
    enabled: plan.value.enabled,
  });
  dialogVisible.value = true;
}

async function handleEditSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate();
  
  const dto: UpdateReviewPlanDTO = {
    name: form.name,
    repo_id: form.repo_id,
    llm_config_id: form.llm_config_id,
    target_branch: form.target_branch || undefined,
    file_filter_id: form.file_filter_id || null,
    trigger_type: form.trigger_type,
    trigger_config: buildTriggerConfig() as any,
    enabled: form.enabled,
  };

  try {
    await reviewPlanApi.update(planId.value, dto);
    ElMessage.success('更新成功');
    dialogVisible.value = false;
    fetchPlan();
  } catch (err) {
    // Error is handled globally or we can ignore
  }
}

function handlePageChange(val: number) {
  page.value = val;
  fetchTasks();
}

function handleSizeChange(val: number) {
  pageSize.value = val;
  page.value = 1;
  fetchTasks();
}

function goBack() {
  router.push({ name: 'ReviewPlans' });
}

function viewTaskProgress(row: ReviewTaskWithRelations) {
  router.push({ name: 'TaskProgress', params: { id: row.id } });
}

function formatTrigger(plan: ReviewPlanWithRelations): string {
  const config = plan.trigger_config;
  if (plan.trigger_type === 'interval') {
    return `每 ${(config as IntervalTriggerConfig).interval_hours} 小时`;
  }
  if (plan.trigger_type === 'daily') {
    return `每天 ${(config as DailyTriggerConfig).time}`;
  }
  if (plan.trigger_type === 'webhook') {
    return 'Webhook 触发';
  }
  return plan.trigger_type;
}

onMounted(() => {
  fetchPlan();
  fetchTasks();
  fetchOptions();
});
</script>

<template>
  <div class="detail-page">
    <div class="detail-header">
      <div class="header-left">
        <el-button plain size="small" @click="goBack">&larr; 返回列表</el-button>
        <h2>{{ plan?.name ?? `计划 #${planId}` }}</h2>
      </div>
      <div v-if="plan" class="header-right">
        <el-tag :type="plan.enabled ? 'success' : 'info'" size="large">
          {{ plan.enabled ? '启用' : '停用' }}
        </el-tag>
        <el-button type="primary" @click="openEdit" style="margin-left: 12px;">编辑计划</el-button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" v-loading="true" class="loading-box" />

    <template v-else-if="plan">
      <!-- Info Box -->
      <el-row :gutter="16" class="info-row">
        <el-col :xs="24" :sm="12" :md="6">
          <div class="info-card">
            <div class="info-label">计划名称</div>
            <div class="info-value">{{ plan.name }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="info-card">
            <div class="info-label">关联仓库</div>
            <div class="info-value">{{ plan.repo_name }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="info-card">
            <div class="info-label">LLM 配置</div>
            <div class="info-value">{{ plan.llm_config_name }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="info-card">
            <div class="info-label">触发机制</div>
            <div class="info-value">{{ formatTrigger(plan) }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- Tasks List -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="section-header-row">
            <span class="section-title">评审任务记录</span>
            <span class="section-sub">共 {{ totalTasks }} 条任务</span>
          </div>
        </template>
        
        <el-table v-loading="tasksLoading" :data="tasks" stripe border @row-click="viewTaskProgress">
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column prop="name" label="任务名称" min-width="140" />
          <el-table-column prop="target_branch" label="目标分支" width="100" />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="(taskStatusMap[row.status]?.type as any) ?? 'info'" size="small">
                {{ taskStatusMap[row.status]?.label ?? row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="170" />
          <el-table-column label="操作" width="100" align="center">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="viewTaskProgress(row)">查看进展</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          class="page-pagination"
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="totalTasks"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </el-card>

    </template>

    <el-empty v-else description="未找到评审计划信息" />

    <!-- Edit Dialog -->
    <el-dialog v-model="dialogVisible" title="编辑计划" width="580px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="计划名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入计划名称" />
        </el-form-item>
        <el-form-item label="关联仓库" prop="repo_id">
          <el-select v-model="form.repo_id" placeholder="请选择仓库" style="width: 100%">
            <el-option
              v-for="r in repos"
              :key="r.id"
              :label="getRepoOptionLabel(r)"
              :value="r.id"
              :disabled="!isRepoReady(r)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="LLM 配置" prop="llm_config_id">
          <el-select v-model="form.llm_config_id" placeholder="请选择配置" style="width: 100%">
            <el-option
              v-for="c in llmConfigs"
              :key="c.id"
              :label="`${c.name} (${c.provider}/${c.model})`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="目标分支">
          <el-input v-model="form.target_branch" placeholder="可选，留空使用仓库默认分支" />
        </el-form-item>
        <el-form-item label="文件筛选">
          <el-select
            v-model="form.file_filter_id"
            placeholder="可选，留空使用默认规则"
            clearable
            style="width: 100%"
          >
            <el-option v-for="f in fileFilters" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="触发方式" prop="trigger_type">
          <el-radio-group v-model="form.trigger_type">
            <el-radio value="interval">按间隔</el-radio>
            <el-radio value="daily">每天定时</el-radio>
            <el-radio value="webhook">Webhook</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.trigger_type === 'interval'" label="间隔时间">
          <el-input-number
            v-model="form.interval_hours"
            :min="1"
            :max="720"
            :step="1"
            style="width: 200px"
          />
          <span style="margin-left: 8px; color: #909399">小时</span>
        </el-form-item>
        <el-form-item v-if="form.trigger_type === 'daily'" label="触发时间">
          <el-time-picker
            v-model="form.daily_time"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="选择时间"
            style="width: 200px"
          />
        </el-form-item>
        <el-form-item v-if="form.trigger_type === 'webhook'" label="Webhook 密钥">
          <div style="display: flex; align-items: center; gap: 8px">
            <el-input
              v-model="form.webhook_secret"
              readonly
              style="width: 250px"
            />
            <el-button size="small" @click="() => form.webhook_secret = generateRandomString()">重新生成</el-button>
            <el-button size="small" @click="copySecret">复制</el-button>
          </div>
          <div style="color: #909399; font-size: 12px; margin-top: 4px; line-height: 1.4;">
            系统已自动生成密钥，请复制并填入 Git 平台的 Webhook 设置中。
          </div>
        </el-form-item>
        <el-form-item v-if="form.trigger_type === 'webhook'" label="Webhook URL">
          <div style="display: flex; align-items: center; gap: 8px">
            <el-input
              :model-value="`${webhookBaseUrl}/${planId}`"
              readonly
              style="width: 350px"
            />
            <el-button size="small" @click="copyWebhookUrl">复制</el-button>
          </div>
          <div style="color: #909399; font-size: 12px; margin-top: 4px; line-height: 1.4;">
            将此 URL 配置到 Git 仓库的 webhook 设置中（推送或合并请求事件）。
          </div>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleEditSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.detail-page {
  max-width: 960px;
  margin: 0 auto;
}

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

.page-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
