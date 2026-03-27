<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance } from 'element-plus';
import type {
  ReviewPlanWithRelations,
  CreateReviewPlanDTO,
  GitRepo,
  LlmConfig,
  FileFilter,
  ReviewPlanTriggerType,
  IntervalTriggerConfig,
  DailyTriggerConfig,
} from '@zouma/common';
import { reviewPlanApi } from '@/api/reviewPlan';
import { gitRepoApi } from '@/api/gitRepo';
import { llmConfigApi } from '@/api/llmConfig';
import { fileFilterApi } from '@/api/fileFilter';

const loading = ref(false);
const tableData = ref<ReviewPlanWithRelations[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const repos = ref<GitRepo[]>([]);
const llmConfigs = ref<LlmConfig[]>([]);
const fileFilters = ref<FileFilter[]>([]);

const dialogVisible = ref(false);
const dialogTitle = ref('');
const editingId = ref<number | null>(null);
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
  enabled: number;
}

const defaultForm = (): PlanForm => ({
  name: '',
  repo_id: 0,
  llm_config_id: 0,
  target_branch: '',
  file_filter_id: null,
  trigger_type: 'interval',
  interval_hours: 24,
  daily_time: '09:00',
  enabled: 1,
});

const form = reactive<PlanForm>(defaultForm());
type RepoStatus = 'downloading' | 'ready' | 'error';

const rules = {
  name: [{ required: true, message: '请输入计划名称', trigger: 'blur' }],
  repo_id: [{ required: true, message: '请选择仓库', trigger: 'change', type: 'number', min: 1 }],
  llm_config_id: [
    { required: true, message: '请选择 LLM 配置', trigger: 'change', type: 'number', min: 1 },
  ],
  trigger_type: [{ required: true, message: '请选择触发方式', trigger: 'change' }],
};

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

function buildTriggerConfig(): CreateReviewPlanDTO['trigger_config'] {
  if (form.trigger_type === 'interval') {
    return { interval_hours: form.interval_hours };
  }
  if (form.trigger_type === 'daily') {
    return { time: form.daily_time };
  }
  return {};
}

function extractTriggerConfig(row: ReviewPlanWithRelations): {
  interval_hours: number;
  daily_time: string;
} {
  const config = row.trigger_config;
  if (row.trigger_type === 'interval') {
    return {
      interval_hours: (config as IntervalTriggerConfig).interval_hours ?? 24,
      daily_time: '09:00',
    };
  }
  if (row.trigger_type === 'daily') {
    return { interval_hours: 24, daily_time: (config as DailyTriggerConfig).time ?? '09:00' };
  }
  return { interval_hours: 24, daily_time: '09:00' };
}

async function fetchData() {
  loading.value = true;
  try {
    const res = await reviewPlanApi.getPage(page.value, pageSize.value);
    tableData.value = res.data.items;
    total.value = res.data.total;
  } finally {
    loading.value = false;
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

function handleAdd() {
  editingId.value = null;
  dialogTitle.value = '新增评审计划';
  Object.assign(form, defaultForm());
  dialogVisible.value = true;
}

function handleEdit(row: ReviewPlanWithRelations) {
  editingId.value = row.id;
  dialogTitle.value = '编辑评审计划';
  const { interval_hours, daily_time } = extractTriggerConfig(row);
  Object.assign(form, {
    name: row.name,
    repo_id: row.repo_id,
    llm_config_id: row.llm_config_id,
    target_branch: row.target_branch ?? '',
    file_filter_id: row.file_filter_id ?? null,
    trigger_type: row.trigger_type,
    interval_hours,
    daily_time,
    enabled: row.enabled,
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate();
  const selectedRepo = repos.value.find((r) => r.id === form.repo_id);
  if (!selectedRepo) {
    ElMessage.error('关联仓库不存在，请重新选择');
    return;
  }
  if (!isRepoReady(selectedRepo)) {
    const detail = selectedRepo.status_message ? `：${selectedRepo.status_message}` : '';
    ElMessage.error(`仓库未就绪，无法保存评审计划${detail}`);
    return;
  }

  const dto: CreateReviewPlanDTO = {
    name: form.name,
    repo_id: form.repo_id,
    llm_config_id: form.llm_config_id,
    trigger_type: form.trigger_type,
    trigger_config: buildTriggerConfig(),
    enabled: form.enabled,
  };
  if (form.target_branch) dto.target_branch = form.target_branch;
  if (form.file_filter_id) dto.file_filter_id = form.file_filter_id;

  if (editingId.value) {
    await reviewPlanApi.update(editingId.value, dto);
    ElMessage.success('更新成功');
  } else {
    await reviewPlanApi.create(dto);
    ElMessage.success('创建成功');
  }
  dialogVisible.value = false;
  fetchData();
}

async function handleDelete(row: ReviewPlanWithRelations) {
  await ElMessageBox.confirm(`确定删除计划「${row.name}」？`, '确认删除', { type: 'warning' });
  await reviewPlanApi.remove(row.id);
  ElMessage.success('删除成功');
  fetchData();
}

async function handleTrigger(row: ReviewPlanWithRelations) {
  const selectedRepo = repos.value.find((r) => r.id === row.repo_id);
  if (selectedRepo && !isRepoReady(selectedRepo)) {
    const detail = selectedRepo.status_message ? `：${selectedRepo.status_message}` : '';
    ElMessage.error(`仓库未就绪，无法触发计划${detail}`);
    return;
  }
  await ElMessageBox.confirm(`确定立即触发计划「${row.name}」？将新增一条评审任务。`, '确认触发', {
    type: 'info',
    confirmButtonText: '立即触发',
    cancelButtonText: '取消',
  });
  const res = await reviewPlanApi.trigger(row.id);
  ElMessage.success(`已触发，评审任务 ID: ${res.data.taskId}`);
  fetchData();
}

async function handleToggleEnabled(row: ReviewPlanWithRelations) {
  const newEnabled = row.enabled ? 0 : 1;
  await reviewPlanApi.update(row.id, { enabled: newEnabled });
  ElMessage.success(newEnabled ? '已启用' : '已停用');
  fetchData();
}

function handlePageChange(val: number) {
  page.value = val;
  fetchData();
}

function handleSizeChange(val: number) {
  pageSize.value = val;
  page.value = 1;
  fetchData();
}

function formatTrigger(row: ReviewPlanWithRelations): string {
  const config = row.trigger_config;
  if (row.trigger_type === 'interval') {
    return `每 ${(config as IntervalTriggerConfig).interval_hours} 小时`;
  }
  if (row.trigger_type === 'daily') {
    return `每天 ${(config as DailyTriggerConfig).time}`;
  }
  if (row.trigger_type === 'webhook') {
    return 'Webhook 触发';
  }
  return row.trigger_type;
}

onMounted(() => {
  fetchData();
  fetchOptions();
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>评审计划管理</h2>
      <el-button type="primary" @click="handleAdd">新增计划</el-button>
    </div>

    <el-table v-loading="loading" :data="tableData" stripe border>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="计划名称" min-width="140" />
      <el-table-column prop="repo_name" label="关联仓库" min-width="120" />
      <el-table-column prop="llm_config_name" label="LLM 配置" min-width="120" />
      <el-table-column prop="target_branch" label="目标分支" width="100" />
      <el-table-column prop="file_filter_name" label="筛选模式" width="120" />
      <el-table-column label="触发时机" width="130">
        <template #default="{ row }">
          {{ formatTrigger(row) }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="last_triggered_at" label="上次触发" width="170" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="success" @click="handleTrigger(row)">触发</el-button>
          <el-button size="small" @click="handleToggleEnabled(row)">
            {{ row.enabled ? '停用' : '启用' }}
          </el-button>
          <el-button size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="page-pagination"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50]"
      layout="total, sizes, prev, pager, next"
      @current-change="handlePageChange"
      @size-change="handleSizeChange"
    />

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="580px" destroy-on-close>
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
        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-container {
  background: #fff;
  padding: 20px;
  border-radius: 4px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.page-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
