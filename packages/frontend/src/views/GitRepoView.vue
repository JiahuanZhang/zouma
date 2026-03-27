<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, FolderOpened } from '@element-plus/icons-vue';
import type { FormInstance } from 'element-plus';
import type { GitRepo, CreateGitRepoDTO } from '@zouma/common';
import { gitRepoApi } from '@/api/gitRepo';
import { systemApi } from '@/api/system';

const loading = ref(false);
const tableData = ref<GitRepo[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const dialogVisible = ref(false);
const dialogTitle = ref('');
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();

type RepoMode = 'remote' | 'local';
type RepoStatus = 'downloading' | 'ready' | 'error';
const repoMode = ref<RepoMode>('remote');
const localPath = ref('');
const detecting = ref(false);
const detected = ref(false);

const dirBrowserVisible = ref(false);
const dirBrowserLoading = ref(false);
const dirBrowserCurrent = ref('');
const dirBrowserEntries = ref<{ name: string; path: string }[]>([]);

const form = reactive<CreateGitRepoDTO>({
  name: '',
  url: '',
  branch: 'main',
  access_token: '',
  local_path: '',
  description: '',
});

const isLocal = computed(() => repoMode.value === 'local');

const repoStatusLabelMap: Record<RepoStatus, string> = {
  downloading: '下载中',
  ready: '正常',
  error: '异常',
};

const repoStatusTagTypeMap: Record<RepoStatus, 'warning' | 'success' | 'danger'> = {
  downloading: 'warning',
  ready: 'success',
  error: 'danger',
};

const rules = computed(() => ({
  name: [{ required: true, message: '请输入仓库名称', trigger: 'blur' }],
  url: [{ required: !isLocal.value, message: '请输入仓库地址', trigger: 'blur' }],
}));

async function fetchData() {
  loading.value = true;
  try {
    const res = await gitRepoApi.getPage(page.value, pageSize.value);
    tableData.value = res.data.items;
    total.value = res.data.total;
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, {
    name: '',
    url: '',
    branch: 'main',
    access_token: '',
    local_path: '',
    description: '',
  });
  localPath.value = '';
  detected.value = false;
}

function handleAddRemote() {
  editingId.value = null;
  repoMode.value = 'remote';
  dialogTitle.value = '新增远程仓库';
  resetForm();
  dialogVisible.value = true;
}

function handleAddLocal() {
  editingId.value = null;
  repoMode.value = 'local';
  dialogTitle.value = '新增本地仓库';
  resetForm();
  dialogVisible.value = true;
}

function handleEdit(row: GitRepo) {
  editingId.value = row.id;
  repoMode.value = row.local_path ? 'local' : 'remote';
  dialogTitle.value = '编辑仓库';
  Object.assign(form, {
    name: row.name,
    url: row.url,
    branch: row.branch,
    access_token: row.access_token ?? '',
    local_path: row.local_path ?? '',
    description: row.description ?? '',
  });
  localPath.value = row.local_path ?? '';
  detected.value = !!row.local_path;
  dialogVisible.value = true;
}

async function openDirBrowser() {
  dirBrowserVisible.value = true;
  await browseTo('');
}

async function browseTo(dirPath: string) {
  dirBrowserLoading.value = true;
  try {
    const res = await systemApi.browseDirs(dirPath || undefined);
    dirBrowserCurrent.value = res.data.current;
    dirBrowserEntries.value = res.data.entries;
  } catch {
    ElMessage.error('无法读取目录');
  } finally {
    dirBrowserLoading.value = false;
  }
}

function browseToParent() {
  if (!dirBrowserCurrent.value) return;
  const parent = dirBrowserCurrent.value.replace(/[\\/][^\\/]+[\\/]?$/, '');
  if (parent === dirBrowserCurrent.value) {
    browseTo('');
  } else {
    browseTo(parent || '');
  }
}

async function confirmDirSelection() {
  const selectedPath = dirBrowserCurrent.value;
  if (!selectedPath) {
    ElMessage.warning('请先进入一个目录');
    return;
  }
  dirBrowserVisible.value = false;
  localPath.value = selectedPath;

  detecting.value = true;
  try {
    const res = await gitRepoApi.detectLocal(selectedPath);
    const info = res.data;
    Object.assign(form, {
      name: info.name,
      url: info.url,
      branch: info.branch,
      local_path: info.local_path,
    });
    detected.value = true;
    ElMessage.success('识别成功');
  } catch (err: unknown) {
    detected.value = false;
    form.local_path = selectedPath;
    const msg =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response: { data: { message: string } } }).response?.data?.message
        : '该目录不是有效的 Git 仓库';
    ElMessage.error(msg || '该目录不是有效的 Git 仓库');
  } finally {
    detecting.value = false;
  }
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate();

  const dto = { ...form };
  if (!dto.access_token) delete dto.access_token;
  if (!dto.description) delete dto.description;
  if (!dto.local_path) delete dto.local_path;

  if (editingId.value) {
    await gitRepoApi.update(editingId.value, dto);
    ElMessage.success('更新成功');
  } else {
    const created = await gitRepoApi.create(dto);
    const status = normalizeRepoStatus(created.data);
    if (status === 'downloading') {
      ElMessage.success('创建成功，后台下载中');
    } else {
      ElMessage.success('创建成功');
    }
  }
  dialogVisible.value = false;
  fetchData();
}

async function handleDelete(row: GitRepo) {
  await ElMessageBox.confirm(`确定删除仓库「${row.name}」？`, '确认删除', { type: 'warning' });
  let deleteLocal = false;
  if (row.local_path) {
    try {
      await ElMessageBox.confirm(
        `是否同时删除本地项目目录？\n${row.local_path}`,
        '删除本地目录',
        {
          type: 'warning',
          confirmButtonText: '删除本地并删除记录',
          cancelButtonText: '仅删除记录',
          distinguishCancelAndClose: true,
          closeOnClickModal: false,
          closeOnPressEscape: false,
        }
      );
      deleteLocal = true;
    } catch (action) {
      if (action !== 'cancel') return;
    }
  }
  await gitRepoApi.remove(row.id, deleteLocal);
  ElMessage.success(deleteLocal ? '删除成功（含本地目录）' : '删除成功');
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

function handleDropdownCommand(cmd: string) {
  if (cmd === 'remote') handleAddRemote();
  else if (cmd === 'local') handleAddLocal();
}

function normalizeRepoStatus(repo: GitRepo): RepoStatus {
  if (repo.status === 'downloading' || repo.status === 'ready' || repo.status === 'error') {
    return repo.status;
  }
  return repo.local_path ? 'ready' : 'error';
}

function getRepoStatusLabel(repo: GitRepo): string {
  return repoStatusLabelMap[normalizeRepoStatus(repo)];
}

function getRepoStatusTagType(repo: GitRepo): 'warning' | 'success' | 'danger' {
  return repoStatusTagTypeMap[normalizeRepoStatus(repo)];
}

onMounted(fetchData);
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2>Git 仓库管理</h2>
      <el-dropdown @command="handleDropdownCommand" trigger="click">
        <el-button type="primary">
          新增仓库 <el-icon class="el-icon--right"><arrow-down /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="remote">远程仓库</el-dropdown-item>
            <el-dropdown-item command="local">本地仓库</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <el-table v-loading="loading" :data="tableData" stripe border>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="仓库名称" min-width="120" />
      <el-table-column prop="url" label="仓库地址" min-width="200" show-overflow-tooltip />
      <el-table-column prop="branch" label="默认分支" width="100" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag :type="row.local_path ? 'success' : 'primary'" size="small">
            {{ row.local_path ? '本地' : '远程' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tooltip
            v-if="normalizeRepoStatus(row) === 'error' && row.status_message"
            :content="row.status_message"
            placement="top"
          >
            <el-tag :type="getRepoStatusTagType(row)" size="small">
              {{ getRepoStatusLabel(row) }}
            </el-tag>
          </el-tooltip>
          <el-tag v-else :type="getRepoStatusTagType(row)" size="small">
            {{ getRepoStatusLabel(row) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="local_path" label="本地路径" min-width="180" show-overflow-tooltip />
      <el-table-column prop="description" label="描述" min-width="120" show-overflow-tooltip />
      <el-table-column prop="created_at" label="创建时间" width="170" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
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
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <!-- 本地仓库模式：先输入路径并识别 -->
        <template v-if="isLocal">
          <el-form-item label="本地路径">
            <div style="display: flex; gap: 8px; width: 100%">
              <el-input
                v-model="localPath"
                placeholder="点击右侧按钮选择目录"
                readonly
                style="flex: 1"
              />
              <el-button
                type="primary"
                :loading="detecting"
                :disabled="!!editingId"
                :icon="FolderOpened"
                @click="openDirBrowser"
              >
                选择
              </el-button>
            </div>
          </el-form-item>

          <el-alert
            v-if="detected"
            type="success"
            :closable="false"
            title="识别成功，以下信息已自动填充"
            style="margin-bottom: 16px"
          />
        </template>

        <el-form-item label="仓库名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入仓库名称" />
        </el-form-item>
        <el-form-item label="仓库地址" prop="url">
          <el-input
            v-model="form.url"
            :disabled="!!editingId"
            :placeholder="
              isLocal ? '自动识别（无远程地址可留空）' : 'https://github.com/user/repo.git'
            "
          />
        </el-form-item>
        <el-form-item label="默认分支">
          <el-input v-model="form.branch" placeholder="main" />
        </el-form-item>
        <el-form-item v-if="!isLocal" label="访问令牌">
          <el-input
            v-model="form.access_token"
            type="password"
            show-password
            placeholder="私有仓库填写"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dirBrowserVisible" title="选择目录" width="600px" destroy-on-close>
      <div class="dir-browser">
        <div class="dir-browser-toolbar">
          <el-button size="small" :disabled="!dirBrowserCurrent" @click="browseToParent">
            上级目录
          </el-button>
          <span class="dir-browser-path" :title="dirBrowserCurrent">
            {{ dirBrowserCurrent || '我的电脑' }}
          </span>
        </div>
        <div v-loading="dirBrowserLoading" class="dir-browser-list">
          <div
            v-for="entry in dirBrowserEntries"
            :key="entry.path"
            class="dir-browser-item"
            @dblclick="browseTo(entry.path)"
          >
            <el-icon><FolderOpened /></el-icon>
            <span>{{ entry.name }}</span>
          </div>
          <div
            v-if="!dirBrowserLoading && dirBrowserEntries.length === 0"
            class="dir-browser-empty"
          >
            无子目录
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="dirBrowserVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!dirBrowserCurrent" @click="confirmDirSelection">
          选择此目录
        </el-button>
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

.dir-browser-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.dir-browser-path {
  flex: 1;
  font-size: 13px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-browser-list {
  height: 320px;
  overflow-y: auto;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}

.dir-browser-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 14px;
  user-select: none;
  transition: background 0.15s;
}

.dir-browser-item:hover {
  background: #f5f7fa;
}

.dir-browser-item .el-icon {
  color: #e6a23c;
  font-size: 18px;
}

.dir-browser-empty {
  text-align: center;
  padding: 40px;
  color: #909399;
  font-size: 14px;
}
</style>
