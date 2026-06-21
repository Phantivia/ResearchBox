const DISPLAY_ENV_PATTERN =
  /\\begin\{(align\*?|aligned|equation\*?|gather\*?|multline|split|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array)\}/;

export function shouldFlowInlineMath(tex: string, display: boolean): boolean {
  if (!display) return true;

  const normalized = tex.trim();
  if (normalized.length === 0) return true;
  if (DISPLAY_ENV_PATTERN.test(normalized)) return false;
  if (/\\\\/.test(normalized)) return false;

  return normalized.length <= 48;
}

export function mathDisplayMode(tex: string, display: boolean): boolean {
  if (!display) return false;
  return !shouldFlowInlineMath(tex, display);
}

const RELATION_COMMANDS = new Set([
  "leq", "geq", "le", "ge", "neq", "ne", "approx", "equiv", "sim", "simeq",
  "cong", "propto", "to", "rightarrow", "Rightarrow", "longrightarrow",
  "leftrightarrow", "Leftrightarrow", "mapsto", "in", "subseteq", "supseteq",
  "subset", "supset", "gg", "ll", "doteq", "triangleq", "asymp", "prec",
  "succ", "preceq", "succeq", "models", "vdash",
]);
const RELATION_CHARS = new Set(["=", "<", ">"]);
const ADDITIVE_COMMANDS = new Set(["pm", "mp", "oplus", "ominus", "cup", "cap"]);
const ADDITIVE_CHARS = new Set(["+", "-"]);

// 只对足够长的单行公式尝试换行；短式交给渲染层的等比缩放。
const MIN_BREAK_LENGTH = 56;
const RHS_CONTINUATION_LENGTH = 40;

interface OpToken {
  start: number;
  end: number;
  op: string;
}

const LETTER = /[a-zA-Z]/;

// 扫描 brace 深度与 \left..\right 深度均为 0 的「顶层」算符位置。
// 谓词分别判定单字符算符与反斜杠命令算符。
function scanTopLevelOps(
  tex: string,
  isCharOp: (ch: string) => boolean,
  isCmdOp: (cmd: string) => boolean,
): OpToken[] {
  const ops: OpToken[] = [];
  const n = tex.length;
  let brace = 0;
  let leftRight = 0;
  let i = 0;

  while (i < n) {
    const ch = tex[i]!;

    if (ch === "\\") {
      let j = i + 1;
      if (j < n && LETTER.test(tex[j]!)) {
        while (j < n && LETTER.test(tex[j]!)) j += 1;
        const cmd = tex.slice(i + 1, j);
        if (cmd === "left") {
          leftRight += 1;
        } else if (cmd === "right") {
          leftRight = Math.max(0, leftRight - 1);
        } else if (brace === 0 && leftRight === 0 && isCmdOp(cmd)) {
          ops.push({ start: i, end: j, op: `\\${cmd}` });
        }
        i = j;
        continue;
      }
      // 转义字符（\{ \} \\ \, …）整体跳过，避免把 \\ 当成关系符。
      i += 2;
      continue;
    }

    if (ch === "{") {
      brace += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      brace = Math.max(0, brace - 1);
      i += 1;
      continue;
    }

    if (brace === 0 && leftRight === 0 && isCharOp(ch)) {
      ops.push({ start: i, end: i + 1, op: ch });
    }
    i += 1;
  }

  return ops;
}

function aligned(lines: string[]): string {
  return `\\begin{aligned}\n${lines.join(" \\\\\n")}\n\\end{aligned}`;
}

function buildRelationChain(tex: string, relations: OpToken[]): string {
  const lhs = tex.slice(0, relations[0]!.start).trim();
  const lines = relations.map((rel, k) => {
    const bodyEnd = k + 1 < relations.length ? relations[k + 1]!.start : tex.length;
    const body = tex.slice(rel.end, bodyEnd).trim();
    return k === 0 ? `${lhs} &${rel.op} ${body}` : `&${rel.op} ${body}`;
  });
  return aligned(lines);
}

function buildSingleRelation(tex: string, rel: OpToken): string {
  const lhs = tex.slice(0, rel.start).trim();
  const rhs = tex.slice(rel.end).trim();
  if (rhs.length <= RHS_CONTINUATION_LENGTH) {
    return tex;
  }

  // 忽略 RHS 开头的一元符号，只在真正的二元 +/- 处断行。
  const additive = scanTopLevelOps(
    rhs,
    (c) => ADDITIVE_CHARS.has(c),
    (c) => ADDITIVE_COMMANDS.has(c),
  ).filter((op) => op.start > 0);

  if (additive.length === 0) {
    return aligned([`&${lhs} ${rel.op}`, `&\\quad ${rhs}`]);
  }

  const firstChunk = rhs.slice(0, additive[0]!.start).trim();
  const lines = [`${lhs} &${rel.op} ${firstChunk}`];
  additive.forEach((op, k) => {
    const end = k + 1 < additive.length ? additive[k + 1]!.start : rhs.length;
    lines.push(`&\\quad ${rhs.slice(op.start, end).trim()}`);
  });
  return aligned(lines);
}

/**
 * 把过长的单行展示公式在顶层关系符（=、≤、→…）前换行重排为 aligned 环境，
 * 让多步推导逐行对齐；仅含单个关系符且右侧很长时，再在右侧顶层 +/- 处续行。
 * 已含手动换行 / 对齐符 / 环境的公式原样返回，渲染层据此再做等比缩放。
 */
export function breakDisplayEquation(tex: string): string {
  const trimmed = tex.trim();
  if (trimmed.length < MIN_BREAK_LENGTH) return tex;
  if (/\\\\/.test(trimmed)) return tex;
  if (trimmed.includes("&")) return tex;
  if (DISPLAY_ENV_PATTERN.test(trimmed)) return tex;

  const relations = scanTopLevelOps(
    trimmed,
    (c) => RELATION_CHARS.has(c),
    (c) => RELATION_COMMANDS.has(c),
  );
  if (relations.length === 0) return tex;
  if (relations.length >= 2) return buildRelationChain(trimmed, relations);
  return buildSingleRelation(trimmed, relations[0]!);
}
