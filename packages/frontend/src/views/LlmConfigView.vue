<script lang="ts">
import type { LlmTestResult } from '@zouma/common';

const REFRESH_INTERVAL = 5 * 60 * 1000;
const _statusCache: Record<number, { loading: boolean; result?: LlmTestResult }> = {};
let _lastTestTime = 0;
let _refreshTimer: ReturnType<typeof setInterval> | null = null;
</script>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance } from 'element-plus';
import type { LlmConfig, CreateLlmConfigDTO, ModelInfo } from '@zouma/common';
import { llmConfigApi } from '@/api/llmConfig';

const loading = ref(false);
const modelOptions = ref<ModelInfo[]>([]);
const fetchingModels = ref(false);
const tableData = ref<LlmConfig[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const dialogVisible = ref(false);
const dialogTitle = ref('');
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const statusMap = ref(_statusCache);

const defaultForm = (): CreateLlmConfigDTO => ({
  name: '',
  provider: '',
  model: '',
  api_key: '',
  base_url: '',
  max_tokens: 4096,
  temperature: 0.3,
  enabled: 1,
});

const form = reactive<CreateLlmConfigDTO>(defaultForm());

const rules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  provider: [{ required: true, message: '请输入供应商', trigger: 'blur' }],
  model: [{ required: true, message: '请输入模型标识', trigger: 'blur' }],
  api_key: [{ required: true, message: '请输入 API Key', trigger: 'blur' }],
};

const providerOptions = ['OpenAI', 'Anthropic', 'Azure', 'DeepSeek', 'Qwen', 'Other'];

async function fetchData(testAfterLoad = false) {
  loading.value = true;
  try {
    const res = await llmConfigApi.getPage(page.value, pageSize.value);
    tableData.value = res.data.items;
    total.value = res.data.total;
    if (testAfterLoad) batchTestAll();
  } finally {
    loading.value = false;
  }
}

async function batchTestAll() {
  _lastTestTime = Date.now();
  for (const row of tableData.value) {
    if (!statusMap.value[row.id]) {
      testSingle(row.id);
    }
  }
}

function needsRefresh(): boolean {
  return !_lastTestTime || Date.now() - _lastTestTime >= REFRESH_INTERVAL;
}

async function testSingle(id: number) {
  statusMap.value[id] = { loading: true };
  try {
    const res = await llmConfigApi.testConnection(id);
    statusMap.value[id] = { loading: false, result: res.data };
  } catch {
    statusMap.value[id] = {
      loading: false,
      result: { ok: false, message: '请求失败', latencyMs: 0 },
    };
  }
}

function getStatusInfo(row: LlmConfig) {
  const s = statusMap.value[row.id];
  if (!s) return { color: '#909399', tip: '未检测' };
  if (s.loading) return { color: '#E6A23C', tip: '检测中...' };
  if (s.result?.ok) return { color: '#67C23A', tip: `${s.result.message} (${s.result.latencyMs}ms)` };
  return { color: '#F56C6C', tip: s.result?.message || '异常' };
}

async function handleTest(row: LlmConfig) {
  await testSingle(row.id);
  const r = statusMap.value[row.id]?.result;
  if (r?.ok) {
    ElMessage.success(`${row.name}: 连接正常 (${r.latencyMs}ms)`);
  } else {
    ElMessage.error(`${row.name}: ${r?.message || '测试失败'}`);
  }
}

async function handleFetchModels() {
  if (!form.api_key) {
    ElMessage.warning('请先填写 API Key');
    return;
  }
  fetchingModels.value = true;
  try {
    const res = await llmConfigApi.fetchModels({
      api_key: form.api_key,
      base_url: form.base_url || undefined,
      provider: form.provider || undefined,
    });
    modelOptions.value = res.data;
    if (res.data.length === 0) {
      ElMessage.info('未获取到模型列表');
    } else {
      ElMessage.success(`获取到 ${res.data.length} 个模型`);
    }
  } catch {
    ElMessage.error('获取模型列表失败，请检查 API Key 和 Base URL');
  } finally {
    fetchingModels.value = false;
  }
}

function handleAdd() {
  editingId.value = null;
  dialogTitle.value = '新增 LLM 配置';
  Object.assign(form, defaultForm());
  modelOptions.value = [];
  dialogVisible.value = true;
}

function handleEdit(row: LlmConfig) {
  editingId.value = row.id;
  dialogTitle.value = '编辑 LLM 配置';
  Object.assign(form, {
    name: row.name,
    provider: row.provider,
    model: row.model,
    api_key: row.api_key,
    base_url: row.base_url ?? '',
    max_tokens: row.max_tokens,
    temperature: row.temperature,
    enabled: row.enabled,
  });
  modelOptions.value = [];
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate();

  const dto = { ...form };
  if (!dto.base_url) delete dto.base_url;

  if (editingId.value) {
    await llmConfigApi.update(editingId.value, dto);
    ElMessage.success('更新成功');
    delete _statusCache[editingId.value];
  } else {
    await llmConfigApi.create(dto);
    ElMessage.success('创建成功');
  }
  dialogVisible.value = false;
  fetchData();
}

async function handleDelete(row: LlmConfig) {
  await ElMessageBox.confirm(`确定删除配置「${row.name}」？`, '确认删除', { type: 'warning' });
  await llmConfigApi.remove(row.id);
  ElMessage.success('删除成功');
  delete _statusCache[row.id];
  fetchData();
}

async function handleToggleEnabled(row: LlmConfig) {
  const newEnabled = row.enabled ? 0 : 1;
  await llmConfigApi.update(row.id, { enabled: newEnabled });
  ElMessage.success(newEnabled ? '已启用' : '已禁用');
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

function ensureAutoRefresh() {
  if (_refreshTimer) return;
  _refreshTimer = setInterval(() => {
    Object.keys(_statusCache).forEach(k => delete _statusCache[Number(k)]);
    _lastTestTime = 0;
    fetchData(true);
  }, REFRESH_INTERVAL);
}

onMounted(() => {
  const shouldTest = needsRefresh();
  fetchData(shouldTest);
  ensureAutoRefresh();
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>LLM 配置管理</h2>
      <el-button type="primary" @click="handleAdd">新增配置</el-button>
    </div>

    <el-table v-loading="loading" :data="tableData" stripe border>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="配置名称" min-width="120" />
      <el-table-column prop="provider" label="供应商" width="110" />
      <el-table-column prop="model" label="模型" min-width="140" show-overflow-tooltip />
      <el-table-column prop="base_url" label="Base URL" min-width="180" show-overflow-tooltip />
      <el-table-column label="状态" width="60" align="center">
        <template #default="{ row }">
          <el-tooltip
            :content="getStatusInfo(row).tip"
            placement="top"
          >
            <span
              class="status-dot"
              :style="{ backgroundColor: getStatusInfo(row).color }"
            />
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="80" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="!!row.enabled"
            @change="handleToggleEnabled(row)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="170" />
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            :loading="statusMap[row.id]?.loading"
            @click="handleTest(row)"
          >
            测试
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="550px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="配置名称" prop="name">
          <el-input v-model="form.name" placeholder="如: GPT-4o 生产环境" />
        </el-form-item>
        <el-form-item label="供应商" prop="provider">
          <el-select v-model="form.provider" placeholder="选择供应商" allow-create filterable>
            <el-option v-for="p in providerOptions" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="模型标识" prop="model">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-select
              v-model="form.model"
              filterable
              allow-create
              default-first-option
              placeholder="选择或输入模型标识"
              style="flex: 1"
            >
              <el-option
                v-for="m in modelOptions"
                :key="m.id"
                :label="m.id"
                :value="m.id"
              />
            </el-select>
            <el-button
              :loading="fetchingModels"
              @click="handleFetchModels"
            >
              获取模型
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="API Key" prop="api_key">
          <el-input v-model="form.api_key" type="password" show-password placeholder="请输入 API Key" />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="form.base_url" placeholder="可选，如: https://api.openai.com/v1" />
        </el-form-item>
        <el-form-item label="Max Tokens">
          <el-input-number v-model="form.max_tokens" :min="1" :max="128000" :step="512" />
        </el-form-item>
        <el-form-item label="Temperature">
          <el-slider v-model="form.temperature" :min="0" :max="2" :step="0.1" show-input />
        </el-form-item>
        <el-form-item label="启用">
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

.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  cursor: pointer;
}
</style>
