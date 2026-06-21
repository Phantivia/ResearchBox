import type { Block } from "@/core/ir";
import { shouldFlowInlineMath } from "@/core/math/layout";

export type PaperRenderUnit =
  | { kind: "single"; block: Block }
  | { kind: "flow"; blocks: Block[] };

function isFlowEligibleBlock(block: Block): boolean {
  if (block.type === "paragraph") return true;

  if (block.type === "math" && block.math) {
    return shouldFlowInlineMath(block.math.tex, block.math.display);
  }

  return false;
}

export function groupPaperBlocks(blocks: Block[]): PaperRenderUnit[] {
  const units: PaperRenderUnit[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index]!;

    if (!isFlowEligibleBlock(block)) {
      units.push({ kind: "single", block });
      index += 1;
      continue;
    }

    const group: Block[] = [block];
    index += 1;

    while (index < blocks.length && isFlowEligibleBlock(blocks[index]!)) {
      group.push(blocks[index]!);
      index += 1;
    }

    units.push(group.length === 1 ? { kind: "single", block: group[0]! } : { kind: "flow", blocks: group });
  }

  return units;
}
