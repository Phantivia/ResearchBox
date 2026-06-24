import { z } from "zod";
import {
  getPyodideClient,
  type PyOutput,
} from "../python/workerClient";
import type { Tool } from "../types";

export const pythonInputSchema = z.strictObject({
  code: z.string(),
  purpose: z.string(),
});

export type PythonInput = z.infer<typeof pythonInputSchema>;

export type PythonProgress = {
  stage: "loading" | "running";
};

export const PYTHON_OUTPUT_MAX_CHARS = 30_000;

function formatPyOutput(output: PyOutput): string {
  const sections: string[] = [];
  if (output.stdout) {
    sections.push(`stdout:\n${output.stdout}`);
  }
  if (output.result) {
    sections.push(`result:\n${output.result}`);
  }
  return sections.length > 0 ? sections.join("\n\n") : "(no output)";
}

function truncateIfNeeded(text: string): string {
  if (text.length <= PYTHON_OUTPUT_MAX_CHARS) {
    return text;
  }
  const preview = text.slice(0, PYTHON_OUTPUT_MAX_CHARS);
  return `${preview}\n\n[输出过大，已截断：共 ${text.length} 字符，仅显示前 ${PYTHON_OUTPUT_MAX_CHARS} 字符]`;
}

function classifyRunError(error: unknown, signal: AbortSignal): Error {
  if (
    signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return new Error("Python 执行被中止");
  }
  if (error instanceof Error) {
    return new Error(`Python 执行失败: ${error.message}`);
  }
  return new Error(`Python 执行失败: ${String(error)}`);
}

function formatPythonError(output: PyOutput): string {
  const parts = [`Python 异常: ${output.error}`];
  if (output.stdout) {
    parts.push(`stdout:\n${output.stdout}`);
  }
  return parts.join("\n\n");
}

export const pythonTool: Tool<
  typeof pythonInputSchema,
  string,
  PythonProgress
> = {
  name: "python",
  description: `Execute Python in a WASM sandbox (Pyodide in a Web Worker) for data processing, analysis, or lightweight visualization. Not read-only; runs serially in a single worker. High-risk — requires user approval before execution.

IMPORTANT:
- Use for numeric/data tasks (pandas-style workflows when packages are available), not system shell access.
- Large stdout/result may be truncated in the tool result; full output persistence is handled by the result budget layer.
- If execution fails or is aborted, the tool returns an explicit error — do not invent output.

中文：在 WASM 沙盒（Web Worker 内 Pyodide）执行 Python，用于数据处理/分析/轻量可视化。非只读；单 Worker 串行执行。高危操作，执行前需用户审批。
大输出可能在工具结果中被截断；完整落盘由结果预算层处理。
执行失败或中止时会返回明确错误，勿编造输出。`,
  inputSchema: pythonInputSchema,
  isReadOnly: () => false,
  isConcurrencySafe: () => false,
  checkPermissions: async (input) => ({
    behavior: "ask",
    reason: `执行 Python: ${input.purpose}`,
    risk: "high",
  }),
  call: async function* (input, deps) {
    yield { stage: "loading" };

    const client = getPyodideClient();

    yield { stage: "running" };

    let output: PyOutput;
    try {
      output = await client.run(input.code, deps.signal);
    } catch (error) {
      throw classifyRunError(error, deps.signal);
    }

    if (output.error) {
      throw new Error(formatPythonError(output));
    }

    return {
      data: truncateIfNeeded(formatPyOutput(output)),
    };
  },
};
