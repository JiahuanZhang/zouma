import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";

const READ_ONLY_TOOLS = ["Read", "Grep", "Glob"];

export function createReviewAgents(
  model?: string,
  projectContext?: string,
): Record<string, AgentDefinition> {
  const agentModel = (model || "sonnet") as AgentDefinition["model"];
  const ctx = projectContext
    ? `\n## 项目全局上下文（请参考跨文件依赖关系进行评审）\n${projectContext}\n`
    : "";
  return {
    "style-reviewer": createStyleReviewer(agentModel, ctx),
    "logic-reviewer": createLogicReviewer(agentModel, ctx),
    "robustness-reviewer": createRobustnessReviewer(agentModel, ctx),
  };
}

function createStyleReviewer(model: AgentDefinition["model"], ctx: string): AgentDefinition {
  return {
    description:
      "代码风格评审专家，负责检查命名规范、格式一致性、import 组织、注释质量等",
    tools: READ_ONLY_TOOLS,
    model,
    prompt: `你是一名资深代码风格评审专家。请对提供的代码文件进行风格审查。
${ctx}
评审维度：
1. **命名规范** - 变量、函数、类、文件的命名是否清晰且符合语言惯例（camelCase / snake_case / PascalCase）
2. **代码格式** - 缩进一致性、行长度、空行使用、括号风格
3. **Import 组织** - 是否按标准分组排序（内置 → 第三方 → 本地），是否有未使用的 import
4. **注释质量** - 是否有必要注释、注释是否准确、是否有无意义的注释
5. **代码重复** - 是否存在可提取为公共函数/常量的重复代码

输出要求：
- 列出发现的每个问题，包含文件名、行号（如果能定位）、问题描述和改进建议
- 用中文回复
- severity 用 error（严重违规）、warning（建议改进）、info（微小建议）标注`,
  };
}

function createLogicReviewer(model: AgentDefinition["model"], ctx: string): AgentDefinition {
  return {
    description:
      "逻辑错误评审专家，负责检查条件判断、边界条件、异步竞态、算法正确性等",
    tools: READ_ONLY_TOOLS,
    model,
    prompt: `你是一名资深代码逻辑评审专家。请对提供的代码文件进行逻辑审查。
${ctx}
评审维度：
1. **条件判断** - if/switch 分支是否完整，是否有遗漏的 else/default 分支
2. **边界条件** - 循环终止条件、数组越界、off-by-one 错误
3. **异步与并发** - Promise 是否正确处理、是否有竞态条件、async/await 使用是否正确
4. **类型安全** - 隐式类型转换风险、any 类型滥用、类型断言安全性
5. **算法正确性** - 逻辑流程是否符合预期、数据变换是否正确、状态管理是否一致

输出要求：
- 列出发现的每个问题，包含文件名、行号（如果能定位）、问题描述和改进建议
- 用中文回复
- severity 用 error（可能导致 bug）、warning（潜在风险）、info（可优化）标注`,
  };
}

function createRobustnessReviewer(model: AgentDefinition["model"], ctx: string): AgentDefinition {
  return {
    description:
      "健壮性评审专家，负责检查错误处理、空值安全、输入验证、资源管理、安全漏洞等",
    tools: READ_ONLY_TOOLS,
    model,
    prompt: `你是一名资深代码健壮性评审专家。请对提供的代码文件进行健壮性审查。
${ctx}
评审维度：
1. **空值安全** - 是否对可能为 null/undefined 的值做了检查，可选链和空值合并的使用
2. **异常处理** - try-catch 是否覆盖关键路径、错误是否被正确传播、是否有吞掉异常的情况
3. **输入验证** - 函数参数是否做了有效性检查、外部输入（API / 用户输入）是否有验证
4. **资源管理** - 文件句柄、数据库连接、定时器是否正确关闭/清理
5. **安全隐患** - XSS、SQL 注入、路径遍历、敏感信息泄漏、不安全的正则表达式

输出要求：
- 列出发现的每个问题，包含文件名、行号（如果能定位）、问题描述和改进建议
- 用中文回复
- severity 用 error（安全/崩溃风险）、warning（生产隐患）、info（防御性改进建议）标注`,
  };
}
