<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance } from 'element-plus';
import type { FileFilter, CreateFileFilterDTO } from '@zouma/common';
import { fileFilterApi } from '@/api/fileFilter';

const loading = ref(false);
const tableData = ref<FileFilter[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const dialogVisible = ref(false);
const dialogTitle = ref('');
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();

interface FilterForm {
  name: string;
  include_extensions: string;
  exclude_patterns: string;
  description: string;
}

const defaultForm = (): FilterForm => ({
  name: '',
  include_extensions: '',
  exclude_patterns: '',
  description: '',
});

const form = reactive<FilterForm>(defaultForm());

const rules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  include_extensions: [{ required: true, message: '请输入包含的文件扩展名', trigger: 'blur' }],
};

async function fetchData() {
  loading.value = true;
  try {
    const res = await fileFilterApi.getPage(page.value, pageSize.value);
    tableData.value = res.data.items;
    total.value = res.data.total;
  } finally {
    loading.value = false;
  }
}

function handleAdd() {
  editingId.value = null;
  dialogTitle.value = '新增筛选模式';
  Object.assign(form, defaultForm());
  dialogVisible.value = true;
}

function handleEdit(row: FileFilter) {
  editingId.value = row.id;
  dialogTitle.value = '编辑筛选模式';
  Object.assign(form, {
    name: row.name,
    include_extensions: row.include_extensions,
    exclude_patterns: row.exclude_patterns ?? '',
    description: row.description ?? '',
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate();

  const dto: CreateFileFilterDTO = {
    name: form.name,
    include_extensions: form.include_extensions,
  };
  if (form.exclude_patterns) dto.exclude_patterns = form.exclude_patterns;
  if (form.description) dto.description = form.description;

  if (editingId.value) {
    await fileFilterApi.update(editingId.value, dto);
    ElMessage.success('更新成功');
  } else {
    await fileFilterApi.create(dto);
    ElMessage.success('创建成功');
  }
  dialogVisible.value = false;
  fetchData();
}

async function handleDelete(row: FileFilter) {
  if (row.is_builtin) {
    ElMessage.warning('内置筛选模式不可删除');
    return;
  }
  await ElMessageBox.confirm(`确定删除筛选模式「${row.name}」？`, '确认删除', { type: 'warning' });
  await fileFilterApi.remove(row.id);
  ElMessage.success('删除成功');
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

onMounted(() => {
  fetchData();
});
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>文件筛选模式</h2>
      <el-button type="primary" @click="handleAdd">新增模式</el-button>
    </div>

    <el-table v-loading="loading" :data="tableData" stripe border>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="名称" min-width="120">
        <template #default="{ row }">
          {{ row.name }}
          <el-tag v-if="row.is_builtin" size="small" type="info" style="margin-left: 6px">
            内置
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="include_extensions"
        label="包含扩展名"
        min-width="220"
        show-overflow-tooltip
      />
      <el-table-column
        prop="exclude_patterns"
        label="排除目录"
        min-width="220"
        show-overflow-tooltip
      />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button
            size="small"
            type="danger"
            :disabled="!!row.is_builtin"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
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
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如: Unity 项目" />
        </el-form-item>
        <el-form-item label="包含扩展名" prop="include_extensions">
          <el-input
            v-model="form.include_extensions"
            placeholder="逗号分隔，如: .cs,.ts,.lua,.cpp"
          />
          <div class="form-tip">以点号开头的扩展名列表，逗号分隔</div>
        </el-form-item>
        <el-form-item label="排除目录">
          <el-input
            v-model="form.exclude_patterns"
            placeholder="可选，如: **/Library/**,**/Temp/**"
          />
          <div class="form-tip">glob 模式，逗号分隔（默认已排除 node_modules/dist/.git 等）</div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="可选，对该筛选模式的简要说明"
          />
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

.form-tip {
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
  margin-top: 4px;
}
</style>
