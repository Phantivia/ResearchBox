import DOMPurify from "dompurify";
import { absolutizeImageUrlsInDocument } from "@/core/media";
import { normalizeTex } from "@/core/math/normalizeTex";
import { stripMathmlSourceAnnotations } from "@/core/math/sanitizeMathml";

/** 对齐 IR Block，不含 translation / meta */
export type CleanBlock = {
  id: string;
  type:
    | "heading"
    | "paragraph"
    | "math"
    | "figure"
    | "table"
    | "list"
    | "codeblock"
    | "reference";
  level?: number;
  content: string;
  caption?: string;
  math?: { tex: string; display: boolean };
};

export type CleanReference = {
  id: string;
  label: string;
  text: string;
};

export type CleanResult = {
  title: string;
  authors: string[];
  abstract: string;
  abstractBlocks: CleanBlock[];
  blocks: CleanBlock[];
  references: CleanReference[];
};

type WalkContext = {
  source: "arxiv" | "ar5iv";
  counters: Map<string, number>;
  usedIds: Set<string>;
  referenceIds: Set<string>;
};

const BOILERPLATE_SELECTORS = [
  "nav",
  "header",
  "footer",
  ".ltx_page_navbar",
  ".ltx_page_header",
  ".ltx_page_footer",
  ".ltx_navigation",
  "#ar5iv-banners",
  ".ar5iv-banner",
  ".ar5iv-banners",
  ".ar5iv-message",
  ".ar5iv-footer",
  ".ltx_ERROR",
  "script",
  "style",
];

const METADATA_SELECTORS = {
  title: "h1.ltx_title_document, h1.ltx_title, article h1",
  authors: ".ltx_authors",
  abstract: ".ltx_abstract",
};

function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function sanitizeDomId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[^\w.-]/g, "-");
}

function allocateBlockId(
  el: Element,
  type: string,
  contentHint: string,
  ctx: WalkContext,
): string {
  const domId = sanitizeDomId(el.id);
  if (domId && !ctx.usedIds.has(domId)) {
    ctx.usedIds.add(domId);
    return domId;
  }

  const count = (ctx.counters.get(type) ?? 0) + 1;
  ctx.counters.set(type, count);
  const seqId = `${type}-${count}`;
  if (!ctx.usedIds.has(seqId)) {
    ctx.usedIds.add(seqId);
    return seqId;
  }

  const hashId = `${type}-${stableHash(contentHint)}`;
  ctx.usedIds.add(hashId);
  return hashId;
}

function createPurifier() {
  const purify = DOMPurify(window);
  stripMathmlSourceAnnotations(purify);
  return purify;
}

const FRAGMENT_SANITIZE_OPTIONS: Parameters<ReturnType<typeof createPurifier>["sanitize"]>[1] = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_ATTR: ["encoding", "display", "alttext", "data-ref", "href", "class", "id"],
};

function sanitizeFragment(html: string): string {
  return createPurifier().sanitize(html, FRAGMENT_SANITIZE_OPTIONS);
}

function removeUnsafeNodes(doc: Document): void {
  doc.querySelectorAll("script").forEach((el) => el.remove());
  doc.querySelectorAll("style").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
      if (name === "style") {
        el.removeAttribute(attr.name);
      }
    }
  });
}

function parseDocument(rawHtml: string): Document {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  removeUnsafeNodes(doc);
  return doc;
}

function removeBoilerplate(doc: Document): void {
  for (const selector of BOILERPLATE_SELECTORS) {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  }
}

function findMainRoot(doc: Document): Element {
  return (
    doc.querySelector("article.ltx_document") ??
    doc.querySelector(".ltx_page_content") ??
    doc.querySelector("main") ??
    doc.body
  );
}

function textContent(el: Element | null): string {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function elementPlainText(el: Element | null): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone
    .querySelectorAll('annotation[encoding="application/x-tex"], annotation-xml[encoding="application/x-tex"]')
    .forEach((node) => node.remove());
  return textContent(clone);
}

function extractMetadata(root: Element): {
  title: string;
  authors: string[];
  abstract: string;
  titleEl: Element | null;
  authorsEl: Element | null;
  abstractEl: Element | null;
} {
  const titleEl = root.querySelector(METADATA_SELECTORS.title);
  const authorsEl = root.querySelector(METADATA_SELECTORS.authors);
  const abstractEl = root.querySelector(METADATA_SELECTORS.abstract);

  const title = textContent(titleEl);

  const authors: string[] = [];
  if (authorsEl) {
    const names = authorsEl.querySelectorAll(".ltx_personname");
    if (names.length > 0) {
      names.forEach((n) => {
        const name = textContent(n);
        if (name) authors.push(name);
      });
    } else {
      const raw = textContent(authorsEl);
      if (raw) {
        raw.split(/\s+and\s+|,\s*/).forEach((part) => {
          const name = part.trim();
          if (name) authors.push(name);
        });
      }
    }
  }

  const abstractParagraph = abstractEl?.querySelector(".ltx_p, p") ?? abstractEl;
  const abstract = elementPlainText(abstractParagraph);

  return { title, authors, abstract, titleEl, authorsEl, abstractEl };
}

function mathTexToPlainUnit(tex: string): string {
  let unit = tex.replace(/^[\d.,]+\s*(?:\\text\{\\,\}|\\,)?/u, "");
  unit = unit.replace(/\\mathrm\{([^}]+)\}/g, "$1");
  unit = unit.replace(/\\mu/g, "µ");
  unit = unit.replace(/\\[a-zA-Z]+\*?(\{[^}]*\})?/g, "");
  return unit.replace(/\s+/g, "");
}

function blocksToPlainAbstract(blocks: CleanBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const doc = new DOMParser().parseFromString(block.content, "text/html");
      const text = doc.body.textContent?.trim();
      if (text) parts.push(text);
      continue;
    }
    if (block.type === "math" && block.math) {
      const unit = mathTexToPlainUnit(block.math.tex);
      if (unit) parts.push(unit);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extractAbstractBlocks(
  abstractEl: Element | null,
  ctx: WalkContext,
): CleanBlock[] {
  if (!abstractEl) return [];

  const paragraphs = abstractEl.querySelectorAll(":scope .ltx_p, :scope p");
  const blocks: CleanBlock[] = [];

  if (paragraphs.length > 0) {
    paragraphs.forEach((paragraph) => {
      blocks.push(...processParagraph(paragraph, ctx));
    });
    return blocks;
  }

  blocks.push(...processParagraph(abstractEl, ctx));
  return blocks.filter((block) => block.content.trim().length > 0);
}

function extractReferenceLabel(item: Element): string {
  const tag = item.querySelector(".ltx_tag_bibitem");
  if (tag) return textContent(tag);
  const id = item.id;
  const match = id.match(/(\d+)$/);
  if (match?.[1]) return `[${match[1]}]`;
  return "";
}

function extractReferenceText(item: Element): string {
  const clone = item.cloneNode(true) as Element;
  clone.querySelector(".ltx_tag_bibitem")?.remove();
  return textContent(clone);
}

function extractReferences(root: Element, ctx: WalkContext): CleanReference[] {
  const items = root.querySelectorAll(
    "section.ltx_bibliography li.ltx_bibitem, .ltx_bibliography li.ltx_bibitem, section.ltx_bibliography ol > li, .ltx_bibliography ol > li",
  );

  const references: CleanReference[] = [];
  items.forEach((item, index) => {
    const text = extractReferenceText(item);
    const label = extractReferenceLabel(item) || `[${index + 1}]`;
    const contentHint = `${label}:${text}`;
    const id = allocateBlockId(item, "ref", contentHint, ctx);
    ctx.referenceIds.add(id);
    references.push({ id, label, text });
  });

  return references;
}

function extractTexFromMath(mathEl: Element): string | null {
  const selectors = [
    'annotation[encoding="application/x-tex"]',
    'annotation-xml[encoding="application/x-tex"]',
  ];
  for (const selector of selectors) {
    const ann = mathEl.querySelector(selector);
    const tex = ann?.textContent?.trim();
    if (tex) return normalizeTex(tex);
  }
  return null;
}

function isDisplayMath(mathEl: Element): boolean {
  const display = mathEl.getAttribute("display");
  if (display === "block") return true;
  if (display === "inline") return false;
  if (mathEl.closest(".ltx_equation, .ltx_equationgroup, .ltx_eqn_table")) {
    return true;
  }
  return false;
}

function serializeMathFallback(mathEl: Element): string {
  return mathEl.outerHTML;
}

function annotateCiteRefs(root: Element, referenceIds: Set<string>): void {
  // cite↔reference 关联写入 data-ref，渲染层可直接读取，无需额外映射表
  root.querySelectorAll('cite a[href^="#"]').forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) return;
    const targetId = sanitizeDomId(href.slice(1));
    if (!referenceIds.has(targetId)) return;
    const cite = anchor.closest("cite");
    cite?.setAttribute("data-ref", targetId);
  });
}

function isMetadataElement(el: Element, meta: ReturnType<typeof extractMetadata>): boolean {
  return (
    el === meta.titleEl ||
    el === meta.authorsEl ||
    el === meta.abstractEl ||
    !!el.closest(".ltx_abstract") ||
    !!el.closest(".ltx_authors") ||
    el.classList.contains("ltx_title_document")
  );
}

function isBibliographyElement(el: Element): boolean {
  return !!el.closest("section.ltx_bibliography, .ltx_bibliography");
}

/**
 * 文档标题之前的节点是 LaTeXML 转换残留的前置元数据（作者/单位宏未正确转换，
 * 例如残缺的 `]UC Berkeley`），不属于正文，跳过以免污染 IR。
 */
function precedesTitle(el: Element, titleEl: Element | null): boolean {
  if (!titleEl || el === titleEl) return false;
  const pos = titleEl.compareDocumentPosition(el);
  return (
    (pos & Node.DOCUMENT_POSITION_PRECEDING) !== 0 &&
    (pos & Node.DOCUMENT_POSITION_CONTAINS) === 0
  );
}

function shouldSkipElement(el: Element, meta: ReturnType<typeof extractMetadata>): boolean {
  if (isMetadataElement(el, meta)) return true;
  if (isBibliographyElement(el)) return true;
  if (precedesTitle(el, meta.titleEl)) return true;
  if (el.matches(BOILERPLATE_SELECTORS.join(", "))) return true;
  return false;
}

function makeMathBlock(mathEl: Element, ctx: WalkContext): CleanBlock {
  const tex = extractTexFromMath(mathEl);
  const display = isDisplayMath(mathEl);
  const content = tex ?? sanitizeFragment(serializeMathFallback(mathEl));
  const id = allocateBlockId(mathEl, "math", content, ctx);
  const block: CleanBlock = {
    id,
    type: "math",
    content,
  };
  if (tex) {
    block.math = { tex, display };
  }
  return block;
}

function makeHeadingBlock(el: Element, ctx: WalkContext): CleanBlock {
  const level = Number.parseInt(el.tagName[1] ?? "1", 10);
  const content = textContent(el);
  return {
    id: allocateBlockId(el, "heading", content, ctx),
    type: "heading",
    level,
    content,
  };
}

function makeParagraphFromHtml(
  html: string,
  ctx: WalkContext,
  hintEl?: Element,
  options?: { trim?: boolean },
): CleanBlock {
  const content = sanitizeFragment(options?.trim === false ? html : html.trim());
  return {
    id: allocateBlockId(hintEl ?? document.createElement("p"), "paragraph", content, ctx),
    type: "paragraph",
    content,
  };
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    return (node as Element).outerHTML;
  }
  return "";
}

function processParagraph(el: Element, ctx: WalkContext): CleanBlock[] {
  const blocks: CleanBlock[] = [];
  let buffer = "";

  for (const child of el.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE && isMathElement(child as Element)) {
      if (buffer.trim()) {
        blocks.push(makeParagraphFromHtml(buffer, ctx, el, { trim: false }));
        buffer = "";
      }
      blocks.push(makeMathBlock(child as Element, ctx));
      continue;
    }
    buffer += serializeNode(child);
  }

  if (buffer.trim()) {
    blocks.push(makeParagraphFromHtml(buffer, ctx, el, { trim: false }));
  }

  if (blocks.length === 0) {
    blocks.push(makeParagraphFromHtml(textContent(el), ctx, el));
  }

  return blocks;
}

function isMathElement(el: Element): boolean {
  return el.localName.toLowerCase() === "math";
}

function makeListBlock(el: Element, ctx: WalkContext): CleanBlock {
  const content = sanitizeFragment(el.outerHTML);
  return {
    id: allocateBlockId(el, "list", content, ctx),
    type: "list",
    content,
  };
}

function extractFigureCaption(el: Element): string | undefined {
  // 主图注是 figure 的直接子 figcaption；子图（subfigure）的图注在嵌套 figure 内，不取。
  const captionEl =
    el.querySelector(":scope > figcaption") ?? el.querySelector("figcaption");
  if (!captionEl) return undefined;
  const caption = sanitizeFragment(captionEl.innerHTML).trim();
  return caption.length > 0 ? caption : undefined;
}

function makeFigureBlock(el: Element, ctx: WalkContext): CleanBlock {
  const content = sanitizeFragment(el.outerHTML);
  const caption = extractFigureCaption(el);
  const block: CleanBlock = {
    id: allocateBlockId(el, "figure", content, ctx),
    type: "figure",
    content,
  };
  if (caption) {
    block.caption = caption;
  }
  return block;
}

function makeTableBlock(el: Element, ctx: WalkContext): CleanBlock {
  const content = sanitizeFragment(el.outerHTML);
  return {
    id: allocateBlockId(el, "table", content, ctx),
    type: "table",
    content,
  };
}

function makeCodeBlock(el: Element, ctx: WalkContext): CleanBlock {
  const content = el.textContent ?? "";
  return {
    id: allocateBlockId(el, "codeblock", content, ctx),
    type: "codeblock",
    content,
  };
}

function walkElement(el: Element, blocks: CleanBlock[], ctx: WalkContext, meta: ReturnType<typeof extractMetadata>): void {
  if (shouldSkipElement(el, meta)) return;

  const tag = el.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    if (!isMetadataElement(el, meta)) {
      blocks.push(makeHeadingBlock(el, ctx));
    }
    return;
  }

  if (tag === "p" || el.classList.contains("ltx_p")) {
    blocks.push(...processParagraph(el, ctx));
    return;
  }

  if (tag === "ul" || tag === "ol") {
    blocks.push(makeListBlock(el, ctx));
    return;
  }

  if (tag === "figure") {
    blocks.push(makeFigureBlock(el, ctx));
    return;
  }

  if (tag === "table") {
    blocks.push(makeTableBlock(el, ctx));
    return;
  }

  if (tag === "pre" || (tag === "code" && el.parentElement?.tagName.toLowerCase() !== "pre")) {
    if (tag === "code" && el.parentElement?.tagName.toLowerCase() === "pre") return;
    blocks.push(makeCodeBlock(el, ctx));
    return;
  }

  if (isMathElement(el)) {
    blocks.push(makeMathBlock(el, ctx));
    return;
  }

  if (tag === "div" && el.querySelector(":scope math")) {
    const directMath = [...el.children].filter((child) => isMathElement(child));
    if (directMath.length === 1 && textContent(el).length < 500) {
      blocks.push(makeMathBlock(directMath[0]!, ctx));
      return;
    }
  }

  if (tag === "section" || tag === "article" || tag === "div") {
    for (const child of el.children) {
      walkElement(child, blocks, ctx, meta);
    }
    return;
  }

  for (const child of el.children) {
    walkElement(child, blocks, ctx, meta);
  }
}

function extractBlocks(root: Element, ctx: WalkContext, meta: ReturnType<typeof extractMetadata>): CleanBlock[] {
  const blocks: CleanBlock[] = [];
  annotateCiteRefs(root, ctx.referenceIds);
  walkElement(root, blocks, ctx, meta);
  return blocks;
}

export function cleanArxivHtml(
  rawHtml: string,
  source: "arxiv" | "ar5iv",
  pageUrl?: string,
): CleanResult {
  const doc = parseDocument(rawHtml);
  removeBoilerplate(doc);
  if (pageUrl) absolutizeImageUrlsInDocument(doc, pageUrl);

  const root = findMainRoot(doc);
  const ctx: WalkContext = {
    source,
    counters: new Map(),
    usedIds: new Set(),
    referenceIds: new Set(),
  };

  const meta = extractMetadata(root);
  const abstractBlocks = extractAbstractBlocks(meta.abstractEl, ctx);
  const references = extractReferences(root, ctx);
  const blocks = extractBlocks(root, ctx, meta);
  const abstract =
    abstractBlocks.length > 0 ? blocksToPlainAbstract(abstractBlocks) : meta.abstract;

  return {
    title: meta.title,
    authors: meta.authors,
    abstract,
    abstractBlocks,
    blocks,
    references,
  };
}
