<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import type {
  TaskProgressSummary,
  PhaseProgressItem,
  BatchProgressItem,
  AgentProgressItem,
  ToolCallItem,
  ProgressPhase,
  ReviewTaskWithRelations,
} from '@zouma/common';
import { reviewTaskApi } from '@/api/reviewTask';

const props = defineProps<{ id: string }>();
const router = useRouter();

const loading = ref(true);
const summary = ref<TaskProgressSummary | null>(null);
const taskInfo = ref<ReviewTaskWithRelations | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const taskId = computed(() => Number(props.id));

const PHASE_LABEL: Record<string, string> = {
  collect_files: '收集文件',
  analyze_deps: '依赖分析',
  project_summary: '项目摘要',
  quick_scan: '快速扫描',
  deep_review: '深度评审',
  merge: '合并报告',
};

const AGENT_LABEL: Record<string, string> = {};

const AGENT_COLOR: Record<string, string> = {};

const SMART_PHASES: ProgressPhase[] = [
  'collect_files',
  'analyze_deps',
  'project_summary',
  'quick_scan',
  'deep_review',
  'merge',
];
const SIMPLE_PHASES: ProgressPhase[] = ['collect_files', 'deep_review', 'merge'];

type TagType = '' | 'info' | 'success' | 'warning' | 'danger';
const STATUS_CFG: Record<string, { label: string; type: TagType }> = {
  pending: { label: '待执行', type: 'info' },
  running: { label: '执行中', type: 'warning' },
  completed: { label: '已完成', type: 'success' },
  failed: { label: '失败', type: 'danger' },
};

// ── Computed ──

const phaseOrder = computed(() =>
  summary.value?.strategy === 'simple' ? SIMPLE_PHASES : SMART_PHASES
);

const phaseSteps = computed(() => {
  if (!summary.value) return [];
  const map = new Map(summary.value.phases.map((p) => [p.phase, p]));
  return phaseOrder.value.map((phase) => ({
    phase,
    label: PHASE_LABEL[phase] ?? phase,
    data: map.get(phase) ?? null,
  }));
});

const activeStepIndex = computed(() => {
  if (!summary.value) return 0;
  for (let i = phaseOrder.value.length - 1; i >= 0; i--) {
    const p = summary.value.phases.find((pp) => pp.phase === phaseOrder.value[i]);
    if (p) return p.status === 'running' ? i : i + 1;
  }
  return 0;
});

const overallPercent = computed(() => {
  const s = summary.value;
  if (!s || s.totalBatches === 0) return 0;
  return Math.round((s.completedBatches / s.totalBatches) * 100);
});

const overallBarStatus = computed<'' | 'success' | 'exception'>(() => {
  if (summary.value?.overallStatus === 'completed') return 'success';
  if (summary.value?.overallStatus === 'failed') return 'exception';
  return '';
});

const activePanels = ref<string[]>([]);
const showFileList = ref(false);

// ── Helpers ──

function batchesOf(phase: string): BatchProgressItem[] {
  return summary.value?.batches.filter((b) => b.phase === phase) ?? [];
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

function fmtTokens(n: number): string {
  return n.toLocaleString();
}

function stepStatusOverride(data: PhaseProgressItem | null): string | undefined {
  if (data?.status === 'failed') return 'error';
  return undefined;
}

function batchPercent(b: BatchProgressItem): number {
  if (b.status === 'completed' || b.status === 'failed') return 100;
  if (b.status === 'running') return 50;
  return 0;
}

function batchBarStatus(b: BatchProgressItem): '' | 'success' | 'exception' {
  if (b.status === 'completed') return 'success';
  if (b.status === 'failed') return 'exception';
  return '';
}

function agentBarWidth(batch: BatchProgressItem, agent: AgentProgressItem): string {
  const maxMs = Math.max(...batch.agents.map((a) => a.durationMs ?? 0), 1);
  const pct = ((agent.durationMs ?? 0) / maxMs) * 100;
  return `${Math.max(pct, 8)}%`;
}

function toolSummary(calls: ToolCallItem[]): string {
  if (!calls.length) return '';
  const counts = new Map<string, number>();
  for (const c of calls) counts.set(c.toolName, (counts.get(c.toolName) ?? 0) + 1);
  return [...counts].map(([n, c]) => `${n} x${c}`).join(', ');
}

function phaseFiles(step: { phase: string; data: PhaseProgressItem | null }): string[] {
  const d = step.data?.detail;
  if (!d) return [];
  if (step.phase === 'collect_files') {
    return Array.isArray(d.files) ? (d.files as string[]) : [];
  }
  if (step.phase === 'project_summary') {
    return Array.isArray(d.files) ? (d.files as { file: string }[]).map((f) => f.file) : [];
  }
  return [];
}

function phaseGroups(step: {
  phase: string;
  data: PhaseProgressItem | null;
}): { index: number; files: string[] }[] {
  if (step.phase !== 'analyze_deps') return [];
  const d = step.data?.detail;
  if (!d || !Array.isArray(d.groups)) return [];
  return d.groups as { index: number; files: string[] }[];
}

// ── Data ──

async function fetchProgress() {
  try {
    const [pRes, tRes] = await Promise.all([
      reviewTaskApi.getProgress(taskId.value),
      taskInfo.value ? Promise.resolve(null) : reviewTaskApi.getById(taskId.value),
    ]);
    summary.value = pRes.data;
    if (tRes) taskInfo.value = tRes.data;

    if (activePanels.value.length === 0 && summary.value.phases.length > 0) {
      const running = summary.value.phases.find((p) => p.status === 'running');
      const last = [...summary.value.phases].reverse().find((p) => p.status === 'completed');
      activePanels.value = [(running ?? last)?.phase ?? summary.value.phases[0].phase];
    }
  } catch {
    ElMessage.error('获取进展数据失败');
  } finally {
    loading.value = false;
  }
}

function startPoll() {
  stopPoll();
  pollTimer = setInterval(() => {
    if (summary.value?.overallStatus === 'running') fetchProgress();
    else stopPoll();
  }, 5000);
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function goBack() {
  router.push({ name: 'ReviewTasks' });
}

function goToIssues() {
  router.push({ name: 'TaskIssues', params: { id: props.id } });
}

onMounted(async () => {
  await fetchProgress();
  if (summary.value?.overallStatus === 'running') startPoll();
});

onUnmounted(stopPoll);

watch(
  () => summary.value?.overallStatus,
  (s) => {
    if (s === 'running') startPoll();
    else stopPoll();
  }
);
</script>

<template>
  <div class="progress-page">
    <!-- Header -->
    <div class="progress-header">
      <div class="header-left">
        <el-button plain size="small" @click="goBack">&larr; 返回列表</el-button>
        <h2>{{ taskInfo?.name ?? `任务 #${id}` }}</h2>
      </div>
      <div v-if="summary" class="header-right">
        <span v-if="summary.overallStatus === 'running'" class="pulse-dot" />
        <el-tag :type="STATUS_CFG[summary.overallStatus]?.type ?? 'info'" size="large">
          {{ STATUS_CFG[summary.overallStatus]?.label ?? summary.overallStatus }}
        </el-tag>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" v-loading="true" class="loading-box" />

    <!-- Pending / No data -->
    <el-empty
      v-else-if="!summary || summary.phases.length === 0"
      description="任务尚未启动，暂无进展数据"
    />

    <!-- Main content -->
    <template v-else>
      <!-- ── Summary cards ── -->
      <el-row :gutter="16" class="summary-row">
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat-card">
            <div class="stat-label">策略</div>
            <div class="stat-value">{{ summary.strategy === 'smart' ? '智能' : '简单' }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat-card">
            <div class="stat-label">模式</div>
            <div class="stat-value">{{ summary.mode === 'incremental' ? '增量' : '全量' }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div
            class="stat-card"
            :class="{ clickable: summary.fileList.length > 0 }"
            @click="summary.fileList.length > 0 && (showFileList = true)"
          >
            <div class="stat-label">文件数</div>
            <div class="stat-value accent">{{ summary.totalFiles }}</div>
            <div v-if="summary.fileList.length > 0" class="stat-hint">点击查看列表 &rarr;</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div
            class="stat-card"
            :class="{ 'clickable clickable-danger': summary.totalIssues > 0 }"
            @click="summary.totalIssues > 0 && goToIssues()"
          >
            <div class="stat-label">发现问题</div>
            <div class="stat-value" :class="{ danger: summary.totalIssues > 0 }">
              {{ summary.totalIssues }}
            </div>
            <div v-if="summary.totalIssues > 0" class="stat-hint">点击查看详情 &rarr;</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat-card">
            <div class="stat-label">Token</div>
            <div class="stat-value small">{{ fmtTokens(summary.totalTokens) }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="stat-card">
            <div class="stat-label">总耗时</div>
            <div class="stat-value">{{ formatDuration(summary.totalDurationMs) }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- ── Phase stepper ── -->
      <el-card shadow="never" class="section-card">
        <template #header><span class="section-title">阶段流程</span></template>
        <el-steps :active="activeStepIndex" finish-status="success" align-center>
          <el-step
            v-for="step in phaseSteps"
            :key="step.phase"
            :title="step.label"
            :status="stepStatusOverride(step.data)"
            :description="step.data?.durationMs != null ? formatDuration(step.data.durationMs) : ''"
          />
        </el-steps>
      </el-card>

      <!-- ── Overall batch progress ── -->
      <el-card v-if="summary.totalBatches > 0" shadow="never" class="section-card">
        <template #header>
          <div class="section-header-row">
            <span class="section-title">批次进度</span>
            <span class="section-sub">
              {{ summary.completedBatches }} / {{ summary.totalBatches }} 完成
              <template v-if="summary.failedBatches > 0">
                ，{{ summary.failedBatches }} 失败
              </template>
            </span>
          </div>
        </template>
        <el-progress
          :percentage="overallPercent"
          :status="overallBarStatus"
          :stroke-width="20"
          text-inside
        />
      </el-card>

      <!-- ── Phase details ── -->
      <el-card shadow="never" class="section-card">
        <template #header><span class="section-title">阶段详情</span></template>
        <el-collapse v-model="activePanels">
          <el-collapse-item
            v-for="step in phaseSteps"
            :key="step.phase"
            :name="step.phase"
            :disabled="!step.data"
          >
            <template #title>
              <div class="phase-header">
                <span class="phase-name">{{ step.label }}</span>
                <el-tag
                  v-if="step.data"
                  :type="STATUS_CFG[step.data.status]?.type ?? 'info'"
                  size="small"
                  >{{ STATUS_CFG[step.data.status]?.label ?? step.data.status }}</el-tag
                >
                <span v-if="step.data" class="phase-meta">
                  <template v-if="step.data.durationMs != null">
                    {{ formatDuration(step.data.durationMs) }}
                  </template>
                  <template v-if="step.data.batchCount > 0">
                    &middot; {{ step.data.completedBatches }}/{{ step.data.batchCount }} 批次
                  </template>
                  <template v-if="step.data.issueCount > 0">
                    &middot; {{ step.data.issueCount }} 问题
                  </template>
                </span>
                <span v-if="!step.data" class="phase-meta muted">待执行</span>
              </div>
            </template>

            <!-- Batches -->
            <div v-if="batchesOf(step.phase).length > 0" class="batch-list">
              <div
                v-for="batch in batchesOf(step.phase)"
                :key="`${batch.phase}-${batch.batchIndex}`"
                class="batch-card"
              >
                <div class="batch-header">
                  <span class="batch-title"
                    >批次 {{ batch.batchIndex }} / {{ batch.batchTotal }}</span
                  >
                  <el-tag :type="STATUS_CFG[batch.status]?.type ?? 'info'" size="small">
                    {{ STATUS_CFG[batch.status]?.label ?? batch.status }}
                  </el-tag>
                </div>
                <el-progress
                  :percentage="batchPercent(batch)"
                  :status="batchBarStatus(batch)"
                  :stroke-width="12"
                  text-inside
                  class="batch-progress"
                />
                <div class="batch-stats">
                  <span>{{ batch.fileCount }} 文件</span>
                  <span>{{ batch.issueCount }} 问题</span>
                  <span>{{ fmtTokens(batch.tokensUsed) }} tokens</span>
                  <span>{{ formatDuration(batch.durationMs) }}</span>
                </div>

                <!-- Batch file list -->
                <div v-if="batch.fileList.length > 0" class="batch-file-section">
                  <div class="phase-file-list">
                    <div v-for="f in batch.fileList" :key="f" class="phase-file-item">{{ f }}</div>
                  </div>
                </div>

                <!-- Agents -->
                <div v-if="batch.agents.length > 0" class="agent-section">
                  <div class="agent-section-title">Agent 执行详情</div>
                  <div v-for="agent in batch.agents" :key="agent.agentName" class="agent-row">
                    <div class="agent-info">
                      <span
                        class="agent-dot"
                        :style="{ background: AGENT_COLOR[agent.agentName] ?? '#909399' }"
                      />
                      <span class="agent-name">
                        {{ AGENT_LABEL[agent.agentName] ?? agent.agentName }}
                      </span>
                      <el-tag
                        :type="STATUS_CFG[agent.status]?.type ?? 'info'"
                        size="small"
                        class="agent-tag"
                        >{{ STATUS_CFG[agent.status]?.label ?? agent.status }}</el-tag
                      >
                      <span class="agent-meta">
                        {{ formatDuration(agent.durationMs) }}
                        &middot; {{ fmtTokens(agent.tokensUsed) }} tk
                      </span>
                    </div>
                    <div class="agent-bar-track">
                      <div
                        class="agent-bar"
                        :style="{
                          width: agentBarWidth(batch, agent),
                          background: AGENT_COLOR[agent.agentName] ?? '#909399',
                        }"
                      />
                    </div>
                    <div v-if="agent.toolCalls.length > 0" class="tool-summary">
                      {{ toolSummary(agent.toolCalls) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Simple phase (no batches) -->
            <div v-else-if="step.data" class="phase-simple">
              <div>
                耗时 {{ formatDuration(step.data.durationMs) }}
                <template v-if="step.data.issueCount > 0">
                  &middot; 发现 {{ step.data.issueCount }} 个问题
                </template>
              </div>

              <!-- collect_files / project_summary: file list -->
              <div v-if="phaseFiles(step).length > 0" class="phase-file-section">
                <div class="phase-file-header">
                  <span class="phase-file-count">{{ phaseFiles(step).length }} 个文件</span>
                </div>
                <div class="phase-file-list">
                  <div v-for="f in phaseFiles(step)" :key="f" class="phase-file-item">{{ f }}</div>
                </div>
              </div>

              <!-- analyze_deps: groups -->
              <div v-if="phaseGroups(step).length > 0" class="phase-file-section">
                <div class="phase-file-header">
                  <span class="phase-file-count">{{ phaseGroups(step).length }} 个模块组</span>
                </div>
                <div v-for="g in phaseGroups(step)" :key="g.index" class="dep-group">
                  <div class="dep-group-title">组 {{ g.index }} ({{ g.files.length }} 文件)</div>
                  <div class="phase-file-list">
                    <div v-for="f in g.files" :key="f" class="phase-file-item">{{ f }}</div>
                  </div>
                </div>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </template>

    <!-- File list dialog -->
    <el-dialog
      v-model="showFileList"
      title="评审文件列表"
      width="600px"
      :close-on-click-modal="true"
    >
      <el-table
        v-if="summary"
        :data="summary.fileList.map((f, i) => ({ index: i + 1, path: f }))"
        max-height="450"
        size="small"
        stripe
      >
        <el-table-column prop="index" label="#" width="50" align="center" />
        <el-table-column prop="path" label="文件路径" show-overflow-tooltip />
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.progress-page {
  max-width: 1000px;
  margin: 0 auto;
}

/* ── Header ── */
.progress-header {
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

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e6a23c;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.75);
  }
}

/* ── Summary cards ── */
.summary-row {
  margin-bottom: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  border: 1px solid #ebeef5;
  height: 100%;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
}

.stat-value.small {
  font-size: 15px;
}

.stat-value.accent {
  color: #409eff;
}

.stat-value.danger {
  color: #f56c6c;
}

.stat-card.clickable {
  cursor: pointer;
  transition:
    box-shadow 0.2s,
    border-color 0.2s;
}

.stat-card.clickable:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}

.stat-card.clickable-danger:hover {
  border-color: #f56c6c;
  box-shadow: 0 2px 8px rgba(245, 108, 108, 0.15);
}

.stat-hint {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 4px;
}

/* ── Section cards ── */
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

/* ── Phase collapse ── */
.phase-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.phase-name {
  font-weight: 500;
  white-space: nowrap;
}

.phase-meta {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
  padding-right: 8px;
  white-space: nowrap;
}

.phase-meta.muted {
  color: #c0c4cc;
}

.phase-simple {
  padding: 8px 0;
  color: #606266;
  font-size: 13px;
}

/* ── Batch ── */
.batch-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.batch-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 14px;
  background: #fafbfc;
}

.batch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.batch-title {
  font-weight: 500;
  font-size: 14px;
}

.batch-progress {
  margin-bottom: 10px;
}

.batch-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12px;
  color: #909399;
}

/* ── Agent ── */
.agent-section {
  margin-top: 14px;
  border-top: 1px dashed #dcdfe6;
  padding-top: 12px;
}

.agent-section-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 10px;
  font-weight: 500;
}

.agent-row {
  margin-bottom: 12px;
}

.agent-row:last-child {
  margin-bottom: 0;
}

.agent-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.agent-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.agent-name {
  font-size: 13px;
  font-weight: 500;
}

.agent-tag {
  flex-shrink: 0;
}

.agent-meta {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
  white-space: nowrap;
}

.agent-bar-track {
  height: 8px;
  background: #f0f2f5;
  border-radius: 4px;
  overflow: hidden;
}

.agent-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
  min-width: 4px;
}

.tool-summary {
  font-size: 11px;
  color: #a8abb2;
  margin-top: 4px;
  padding-left: 14px;
}

/* ── Phase file list ── */
.phase-file-section {
  margin-top: 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fafbfc;
}

.phase-file-header {
  margin-bottom: 6px;
}

.phase-file-count {
  font-size: 12px;
  color: #606266;
  font-weight: 500;
}

.phase-file-list {
  max-height: 200px;
  overflow-y: auto;
}

.phase-file-item {
  font-size: 12px;
  color: #606266;
  padding: 2px 0;
  font-family: 'Menlo', 'Consolas', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dep-group {
  margin-bottom: 8px;
}

.dep-group:last-child {
  margin-bottom: 0;
}

.dep-group-title {
  font-size: 12px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}

.batch-file-section {
  margin-top: 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 12px;
  background: #fff;
}

/* ── Misc ── */
.loading-box {
  min-height: 300px;
}
</style>
