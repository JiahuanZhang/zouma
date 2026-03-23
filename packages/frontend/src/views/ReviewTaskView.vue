<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance } from 'element-plus';
import type {
  ReviewTaskWithRelations,
  CreateReviewTaskDTO,
  GitRepo,
  LlmConfig,
} from '@zouma/common';
import { reviewTaskApi } from '@/api/reviewTask';
import { gitRepoApi } from '@/api/gitRepo';
import { llmConfigApi } from '@/api/llmConfig';

const loading = ref(false);
const tableData = ref<ReviewTaskWithRelations[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const repos = ref<GitRepo[]>([]);
const llmConfigs = ref<LlmConfig[]>([]);

const dialogVisible = ref(false);
const dialogTitle = ref('');
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();

const resultDialogVisible = ref(false);
const resultContent = ref('');

const defaultForm = (): CreateReviewTaskDTO => ({
  name: '',
  repo_id: 0,
  llm_config_id: 0,
  target_branch: '',
  file_patterns: '',
});

const form = reactive<CreateReviewTaskDTO>(defaultForm());

const rules = {
  name: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  repo_id: [{ required: true, message: '请选择仓库', trigger: 'change', type: 'number', min: 1 }],
  llm_config_id: [
    { required: true, message: '请选择 LLM 配置', trigger: 'change', type: 'number', min: 1 },
  ],
};

const statusMap: Record<string, { label: string; type: string }> = {
  pending: { label: '待执行', type: 'info' },
  running: { label: '执行中', type: 'warning' },
  completed: { label: '已完成', type: 'success' },
  failed: { label: '失败', type: 'danger' },
};

async function fetchData() {
  loading.value = true;
  try {
    const res = await reviewTaskApi.getPage(page.value, pageSize.value);
    tableData.value = res.data.items;
    total.value = res.data.total;
  } finally {
    loading.value = false;
  }
}

async function fetchOptions() {
  const [repoRes, configRes] = await Promise.all([gitRepoApi.getAll(), llmConfigApi.getAll()]);
  repos.value = repoRes.data;
  llmConfigs.value = configRes.data;
}

function handleAdd() {
  editingId.value = null;
  dialogTitle.value = '新增评审任务';
  Object.assign(form, defaultForm());
  dialogVisible.value = true;
}

function handleEdit(row: ReviewTaskWithRelations) {
  editingId.value = row.id;
  dialogTitle.value = '编辑评审任务';
  Object.assign(form, {
    name: row.name,
    repo_id: row.repo_id,
    llm_config_id: row.llm_config_id,
    target_branch: row.target_branch ?? '',
    file_patterns: row.file_patterns ?? '',
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate();

  const dto: CreateReviewTaskDTO = {
    name: form.name,
    repo_id: form.repo_id,
    llm_config_id: form.llm_config_id,
  };
  if (form.target_branch) dto.target_branch = form.target_branch;
  if (form.file_patterns) dto.file_patterns = form.file_patterns;

  if (editingId.value) {
    await reviewTaskApi.update(editingId.value, dto);
    ElMessage.success('更新成功');
  } else {
    await reviewTaskApi.create(dto);
    ElMessage.success('创建成功');
  }
  dialogVisible.value = false;
  fetchData();
}

async function handleDelete(row: ReviewTaskWithRelations) {
  await ElMessageBox.confirm(`确定删除任务「${row.name}」？`, '确认删除', { type: 'warning' });
  await reviewTaskApi.remove(row.id);
  ElMessage.success('删除成功');
  fetchData();
}

function handleViewResult(row: ReviewTaskWithRelations) {
  resultContent.value = row.result ?? '暂无执行结果';
  resultDialogVisible.value = true;
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

onMounted(() => {
  fetchData();
  fetchOptions();
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>评审任务管理</h2>
      <el-button type="primary" @click="handleAdd">新增任务</el-button>
    </div>

    <el-table v-loading="loading" :data="tableData" stripe border>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="任务名称" min-width="140" />
      <el-table-column prop="repo_name" label="关联仓库" min-width="120" />
      <el-table-column prop="llm_config_name" label="LLM 配置" min-width="120" />
      <el-table-column prop="target_branch" label="目标分支" width="100" />
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="(statusMap[row.status]?.type as any) ?? 'info'" size="small">
            {{ statusMap[row.status]?.label ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="170" />
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleViewResult(row)">结果</el-button>
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
        <el-form-item label="任务名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入任务名称" />
        </el-form-item>
        <el-form-item label="关联仓库" prop="repo_id">
          <el-select v-model="form.repo_id" placeholder="请选择仓库" style="width: 100%">
            <el-option
              v-for="r in repos"
              :key="r.id"
              :label="r.name"
              :value="r.id"
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
        <el-form-item label="文件过滤">
          <el-input v-model="form.file_patterns" placeholder="可选，如: *.ts,*.vue" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resultDialogVisible" title="执行结果" width="650px">
      <pre class="result-content">{{ resultContent }}</pre>
      <template #footer>
        <el-button @click="resultDialogVisible = false">关闭</el-button>
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

.result-content {
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
}
</style>
