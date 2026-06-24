export interface ResearchSkill {
  name: string;
  description: string;
  load(): Promise<string>;
}

export const skills: ResearchSkill[] = [
  {
    name: "lit-review",
    description: "生成结构化文献综述，含 paperId#blockId 引用",
    load: () =>
      import("./templates/litReview.md?raw").then((m) => m.default),
  },
  {
    name: "compare-table",
    description: "生成论文对比表（Markdown 表格 + 引用）",
    load: () =>
      import("./templates/compare.md?raw").then((m) => m.default),
  },
  {
    name: "outline",
    description: "生成论文或主题研究大纲",
    load: () => import("./templates/outline.md?raw").then((m) => m.default),
  },
];

export function listSkillMenu(): { name: string; description: string }[] {
  return skills.map(({ name, description }) => ({ name, description }));
}
