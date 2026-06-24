import type { AgentMessage } from "./types";

const CORE_IN_BOX_RULE =
  "回答必须绝对优先使用盒内论文内容，并以 paperId#blockId 形式引用。仅当盒内确实没有相关依据时，才可援引此前检索阶段获得的盒外信息；一旦援引盒外内容，必须明确标注「此点来自盒外、尚未正式纳入盒子」，以便用户判断是否需要将相关文献正式纳入。";

/** 系统提示常驻引用的盒内优先规则（P7-2）。 */
export const IN_BOX_PRIORITY_RULE = `盒子关闭后，${CORE_IN_BOX_RULE}`;

export const BOUNDARY_MARKER_PREFIX = "【盒子已关闭】";

export function buildBoundaryMarker(): AgentMessage {
  return {
    role: "user",
    content: [{ type: "text", text: `${BOUNDARY_MARKER_PREFIX}从此标记起，${CORE_IN_BOX_RULE}` }],
  };
}

export function isBoundaryMarker(message: AgentMessage): boolean {
  if (message.role !== "user") {
    return false;
  }
  const textBlock = message.content.find(
    (block): block is Extract<(typeof message.content)[number], { type: "text" }> =>
      block.type === "text",
  );
  return textBlock?.text.startsWith(BOUNDARY_MARKER_PREFIX) ?? false;
}
