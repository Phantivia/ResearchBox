import type DOMPurify from "dompurify";

type Purifier = Pick<typeof DOMPurify, "addHook">;

const SOURCE_ANNOTATION_TAGS = new Set(["annotation", "annotation-xml"]);

/**
 * LaTeXML 的 `<math>` 在 `<semantics>` 里塞了 `<annotation encoding="application/x-tex">`
 * 携带 TeX 源码。正确实现 MathML 的浏览器只渲染首个 presentation 子节点、隐藏 annotation；
 * 但 Firefox mobile 会把 annotation 的纯文本一起画出来，于是公式下方多出一遍裸 TeX。
 * 我们的可见公式一律走 KaTeX（从抽出的 tex 渲染），HTML 片段里残留的 annotation 是纯冗余，
 * 直接整节点删除，避免在任何引擎上泄漏成重复文本。
 */
export function stripMathmlSourceAnnotations(purify: Purifier): void {
  // 在 uponSanitizeElement（许可判定之前）清空内容：DOMPurify 默认 KEEP_CONTENT，
  // annotation 标签被剥离时会把里面的 TeX 解包成裸文本节点留下；这里先把内容清掉，
  // 解包后就什么都不剩。不能在此直接 remove 节点，否则迭代器会处理到已脱离的节点而报错。
  purify.addHook("uponSanitizeElement", (node, data) => {
    if (SOURCE_ANNOTATION_TAGS.has(data.tagName)) {
      node.textContent = "";
    }
  });
}
