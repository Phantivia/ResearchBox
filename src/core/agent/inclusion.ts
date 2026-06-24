// 纳入论文复用 PaperBox 的 arxiv-html 导入接口。当前仅支持以 arxiv id 引入有 arxiv HTML 页面的论文。
// 将来 PaperBox 支持新的引入方式（如 PDF / DOI / 手动上传）后，需同步修改：本函数、academic_search 工具
// description、Agent 系统提示中关于「可纳入什么」的措辞。

import { parseArxivId } from "@/core/fetcher";
import { resolvePaperEntryStatus } from "@/core/paper";
import { loadPaperForDisplay } from "@/core/pipeline/loadPaper";
import { usePaperStore } from "@/store";

export type InclusionFailureReason = "invalid_arxiv_id";

export class InclusionError extends Error {
  readonly reason: InclusionFailureReason;

  constructor(reason: InclusionFailureReason, message: string) {
    super(message);
    this.name = "InclusionError";
    this.reason = reason;
  }
}

export function routeIdForSearchHit(arxivId: string): string {
  const parsed = parseArxivId(arxivId);
  if (!parsed) {
    return arxivId;
  }
  return parsed.version ? `${parsed.id}${parsed.version}` : parsed.id;
}

function resolveInclusionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// IR 抓取依赖点：PaperBox 导入后 navigate 到 Reader，Reader.runDisplayLoad 调用
// recordProcessing → loadPaperForDisplay → recordPaper（失败时 recordError）。
// 纳入不跳转页面，此处后台调用同一 store 动作与 loadPaperForDisplay 管线。
async function prefetchPaperIr(projectId: string, routeId: string): Promise<void> {
  const { recordProcessing, recordPaper, recordError } = usePaperStore.getState();
  await recordProcessing(projectId, routeId);
  try {
    const result = await loadPaperForDisplay(routeId);
    await recordPaper(
      projectId,
      routeId,
      result.ir,
      resolvePaperEntryStatus(result.ir),
    );
  } catch (error) {
    await recordError(projectId, routeId, resolveInclusionErrorMessage(error));
    throw error;
  }
}

export async function includePaperFromSearch(opts: {
  projectId: string;
  arxivId: string;
}): Promise<{ routeId: string }> {
  const { projectId, arxivId } = opts;
  const routeId = await usePaperStore.getState().addInput(projectId, arxivId);
  if (!routeId) {
    throw new InclusionError("invalid_arxiv_id", `Invalid arXiv ID: ${arxivId}`);
  }

  await prefetchPaperIr(projectId, routeId);
  return { routeId };
}
