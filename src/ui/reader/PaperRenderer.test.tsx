import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PaperIR } from "@/core/ir";
import { TRANSLATION_DEBUG_META_KEY } from "@/core/transformer";
import { PaperRenderer } from "./PaperRenderer";

function createFixturePaper(): PaperIR {
  return {
    arxivId: "2401.12345",
    version: "v1",
    title: "Fixture Paper",
    abstract: "Abstract",
    abstractBlocks: [],
    authors: ["Alice"],
    createdAt: 0,
    modelUsed: "test",
    references: [],
    blocks: [
      {
        id: "h-translated",
        type: "heading",
        level: 2,
        content: "Methods",
        translation: "方法",
      },
      {
        id: "h-untranslated",
        type: "heading",
        level: 2,
        content: "Results",
      },
      {
        id: "p-translated",
        type: "paragraph",
        content: "Original paragraph.",
        translation: "译文段落。",
      },
      {
        id: "p-untranslated",
        type: "paragraph",
        content: "Pending paragraph.",
      },
      {
        id: "m1",
        type: "math",
        content: "",
        math: { tex: "E=mc^2", display: true },
      },
      {
        id: "c1",
        type: "codeblock",
        content: "console.log('hi')",
      },
      {
        id: "t1",
        type: "table",
        content: "<table><tr><td>Cell</td></tr></table>",
      },
    ],
  };
}

describe("PaperRenderer view modes", () => {
  it("original mode renders block.content only", () => {
    const paper = createFixturePaper();
    render(<PaperRenderer paper={paper} viewMode="original" />);

    expect(screen.getByText("Methods")).toBeInTheDocument();
    expect(screen.getByText("Original paragraph.")).toBeInTheDocument();
    expect(screen.queryByText("译文段落。")).not.toBeInTheDocument();
    expect(screen.queryByText("方法")).not.toBeInTheDocument();
    expect(screen.queryByText("未翻译")).not.toBeInTheDocument();
  });

  it("translation mode without started translation shows original without marker", () => {
    const paper = createFixturePaper();
    render(<PaperRenderer paper={paper} viewMode="translation" />);

    expect(screen.getByText("方法")).toBeInTheDocument();
    expect(screen.getByText("Results")).toBeInTheDocument();
    expect(screen.getByText("Pending paragraph.")).toBeInTheDocument();
    expect(screen.queryByText("未翻译")).not.toBeInTheDocument();
  });

  it("translation mode renders translations and falls back with marker when started", () => {
    const paper = createFixturePaper();
    render(
      <PaperRenderer paper={paper} viewMode="translation" translationStarted />,
    );

    expect(screen.getByText("方法")).toBeInTheDocument();
    expect(screen.getByText("译文段落。")).toBeInTheDocument();
    expect(screen.queryByText("Methods")).not.toBeInTheDocument();
    expect(screen.queryByText("Original paragraph.")).not.toBeInTheDocument();

    const untranslatedHeading = screen.getByText("Results").closest("[data-block-id]") as HTMLElement;
    expect(untranslatedHeading).toHaveAttribute("data-block-id", "h-untranslated");
    expect(within(untranslatedHeading).getByText("未翻译")).toBeInTheDocument();

    const untranslatedParagraph = screen.getByText("Pending paragraph.").closest("[data-block-id]") as HTMLElement;
    expect(untranslatedParagraph).toHaveAttribute("data-block-id", "p-untranslated");
    expect(within(untranslatedParagraph).getByText("未翻译")).toBeInTheDocument();
  });

  it("translation mode shows placeholders while translation is pending", () => {
    const paper = createFixturePaper();
    const { container } = render(
      <PaperRenderer paper={paper} viewMode="translation" translationPending />,
    );

    expect(screen.getByText("方法")).toBeInTheDocument();
    expect(screen.getByText("译文段落。")).toBeInTheDocument();
    expect(screen.queryByText("Results")).not.toBeInTheDocument();
    expect(screen.queryByText("Pending paragraph.")).not.toBeInTheDocument();

    const placeholders = screen.getAllByTestId("translation-placeholder");
    expect(placeholders).toHaveLength(2);

    const pendingHeading = container.querySelector('[data-block-id="h-untranslated"]');
    expect(pendingHeading).not.toBeNull();
    expect(within(pendingHeading as HTMLElement).getByTestId("translation-placeholder")).toBeInTheDocument();
  });

  it("bilingual mode shows side-by-side text and does not duplicate non-text blocks", () => {
    const paper = createFixturePaper();
    const { container } = render(
      <PaperRenderer paper={paper} viewMode="bilingual" translationStarted />,
    );

    expect(screen.getByText("Original paragraph.")).toBeInTheDocument();
    expect(screen.getByText("译文段落。")).toBeInTheDocument();
    expect(screen.getByText("Pending paragraph.")).toBeInTheDocument();

    const translatedOriginal = container.querySelector('[data-block-id="p-translated"]');
    expect(translatedOriginal).not.toBeNull();
    expect(translatedOriginal!.textContent).toContain("Original paragraph.");

    const untranslatedOriginal = container.querySelector('[data-block-id="p-untranslated"]');
    expect(untranslatedOriginal).not.toBeNull();
    expect(untranslatedOriginal!.textContent).toContain("Pending paragraph.");
    expect(screen.getAllByText("未翻译").length).toBeGreaterThanOrEqual(1);

    const mathBlock = container.querySelector('[data-block-id="m1"]');
    expect(mathBlock).not.toBeNull();
    expect(mathBlock!.querySelectorAll(".katex")).toHaveLength(1);

    const codeBlock = container.querySelector('[data-block-id="c1"]');
    expect(codeBlock).not.toBeNull();
    expect(within(codeBlock as HTMLElement).getAllByText("console.log('hi')")).toHaveLength(1);

    const tableBlock = container.querySelector('[data-block-id="t1"]');
    expect(tableBlock).not.toBeNull();
    expect(tableBlock!.querySelectorAll("table")).toHaveLength(1);
  });

  it("strips x-tex annotations from inline MathML so raw TeX is not duplicated", () => {
    const paper = createFixturePaper();
    paper.blocks = [
      {
        id: "p-mathml",
        type: "paragraph",
        content:
          'the observation <span class="ltx_text"><math display="inline"><semantics><mrow><msub><mi>o</mi><mi>k</mi></msub></mrow><annotation encoding="application/x-tex">o_k</annotation></semantics></math></span> is serialized',
      },
    ];

    const { container } = render(<PaperRenderer paper={paper} />);
    const block = container.querySelector('[data-block-id="p-mathml"]');

    expect(block).not.toBeNull();
    expect(block!.querySelector("annotation")).toBeNull();
    expect(block!.textContent).not.toContain("o_k");
    expect(block!.querySelector("math")).not.toBeNull();
  });

  it("preserves data-block-id on every block container", () => {
    const paper = createFixturePaper();
    const { container } = render(<PaperRenderer paper={paper} viewMode="bilingual" />);

    for (const block of paper.blocks) {
      expect(container.querySelector(`[data-block-id="${block.id}"]`)).not.toBeNull();
    }
  });

  it("streamingDisplays shows partial text in primary color for in-flight blocks", () => {
    const paper = createFixturePaper();
    // p-untranslated has no block.translation, but has a streaming partial
    const streamingDisplays: Record<string, string> = { "p-untranslated": "流式中..." };
    render(
      <PaperRenderer
        paper={paper}
        viewMode="translation"
        translationStarted
        streamingDisplays={streamingDisplays}
      />,
    );

    // The partial text is visible
    const streamingEl = screen.getByText("流式中...");
    expect(streamingEl).toBeInTheDocument();

    // The streaming element itself (or its direct parent) carries the primary color class
    const hasPrimaryColor =
      (streamingEl as HTMLElement).className.includes("rb-primary") ||
      (streamingEl.parentElement?.className ?? "").includes("rb-primary");
    expect(hasPrimaryColor).toBe(true);
  });

  it("streamingDisplays: complete block.translation renders without primary color", () => {
    const paper = createFixturePaper();
    // p-translated already has block.translation set — no streaming display
    render(
      <PaperRenderer paper={paper} viewMode="translation" translationStarted />,
    );

    const completedEl = screen.getByText("译文段落。");
    expect(completedEl).toBeInTheDocument();

    // Complete translation must NOT carry primary color on the span or its parent
    const hasPrimaryColor =
      (completedEl as HTMLElement).className.includes("rb-primary") ||
      (completedEl.parentElement?.className ?? "").includes("rb-primary");
    expect(hasPrimaryColor).toBe(false);
  });

  it("shows collapsed debug details after translated blocks in debug mode", () => {
    const paper = createFixturePaper();
    paper.blocks[2] = {
      ...paper.blocks[2]!,
      meta: {
        [TRANSLATION_DEBUG_META_KEY]: {
          providerId: "mock",
          modelLabel: "test-model",
          targetLang: "zh",
          batchIndex: 0,
          blockId: "p-translated",
          inputChars: 120,
          outputChars: 5,
          estimatedInputTokens: 30,
          estimatedOutputTokens: 2,
          estimatedTotalTokens: 32,
          batchInputTokens: 100,
          firstTokenLatencyMs: 42,
          firstTranslationLatencyMs: 55,
          totalLatencyMs: 180,
          averageTokenSpeed: 12.5,
          streamed: true,
          attempt: 1,
        },
      },
    };

    render(<PaperRenderer paper={paper} viewMode="translation" debugMode />);

    const details = screen.getByText("Debug 信息（1 block）").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(within(details as HTMLElement).getByText("42.0 ms")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText(/32 total/)).toBeInTheDocument();
  });

  it("aggregates debug details for flowed paragraph groups", () => {
    const paper: PaperIR = {
      arxivId: "2401.12345",
      version: "v1",
      title: "Flow Debug Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [],
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          content: "First.",
          translation: "第一。",
          meta: {
            [TRANSLATION_DEBUG_META_KEY]: {
              providerId: "mock",
              modelLabel: "test-model",
              targetLang: "zh",
              batchIndex: 0,
              blockId: "p1",
              inputChars: 100,
              outputChars: 3,
              estimatedInputTokens: 25,
              estimatedOutputTokens: 1,
              estimatedTotalTokens: 26,
              batchInputTokens: 80,
              firstTokenLatencyMs: 40,
              firstTranslationLatencyMs: 50,
              totalLatencyMs: 150,
              averageTokenSpeed: 10,
              streamed: true,
              attempt: 1,
            },
          },
        },
        {
          id: "p2",
          type: "paragraph",
          content: "Second.",
          translation: "第二。",
          meta: {
            [TRANSLATION_DEBUG_META_KEY]: {
              providerId: "mock",
              modelLabel: "test-model",
              targetLang: "zh",
              batchIndex: 0,
              blockId: "p2",
              inputChars: 120,
              outputChars: 3,
              estimatedInputTokens: 30,
              estimatedOutputTokens: 1,
              estimatedTotalTokens: 31,
              batchInputTokens: 80,
              firstTokenLatencyMs: 40,
              firstTranslationLatencyMs: 60,
              totalLatencyMs: 180,
              averageTokenSpeed: 8,
              streamed: true,
              attempt: 1,
            },
          },
        },
      ],
    };

    render(<PaperRenderer paper={paper} viewMode="translation" debugMode />);

    expect(screen.getAllByText(/Debug 信息/)).toHaveLength(1);
    expect(screen.getByText("Debug 信息（2 blocks）")).toBeInTheDocument();
    expect(screen.getByText(/57 total/)).toBeInTheDocument();
  });

  it("flows inline math with paragraphs in bilingual mode", () => {
    const paper: PaperIR = {
      arxivId: "2401.12345",
      version: "v1",
      title: "Flow Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [],
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          content: "We define ",
          translation: "我们定义 ",
        },
        {
          id: "m1",
          type: "math",
          content: "",
          math: { tex: "x^2", display: false },
        },
        {
          id: "p2",
          type: "paragraph",
          content: " as the input.",
          translation: "为输入。",
        },
      ],
    };

    const { container } = render(<PaperRenderer paper={paper} viewMode="bilingual" />);

    const flowGroup = container.querySelector(".flow-group");
    expect(flowGroup).not.toBeNull();

    const originalLine = flowGroup!.querySelector(
      '.flow-line.leading-relaxed:not([class*="rb-translation"])',
    );
    expect(originalLine).not.toBeNull();
    expect(originalLine!.textContent).toContain("We define");
    expect(originalLine!.textContent).toContain("as the input.");
    expect(originalLine!.querySelectorAll(".katex")).toHaveLength(1);

    const translationLine = flowGroup!.querySelector('.flow-line[class*="rb-translation"]');
    expect(translationLine).not.toBeNull();
    expect(translationLine!.textContent).toContain("我们定义");
    expect(translationLine!.textContent).toContain("为输入。");
    expect(translationLine!.querySelectorAll(".katex")).toHaveLength(1);
  });

  it("hides inline math in bilingual translation row before translation starts", () => {
    const paper: PaperIR = {
      arxivId: "2401.12345",
      version: "v1",
      title: "Flow Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [],
      blocks: [
        {
          id: "p1",
          type: "paragraph",
          content: "We define ",
        },
        {
          id: "m1",
          type: "math",
          content: "",
          math: { tex: "x^2", display: false },
        },
        {
          id: "p2",
          type: "paragraph",
          content: " as the input.",
        },
      ],
    };

    const { container } = render(<PaperRenderer paper={paper} viewMode="bilingual" />);

    const flowGroup = container.querySelector(".flow-group");
    expect(flowGroup).not.toBeNull();

    const originalLine = flowGroup!.querySelector(
      '.flow-line.leading-relaxed:not([class*="rb-translation"])',
    );
    expect(originalLine!.querySelectorAll(".katex")).toHaveLength(1);

    const translationLine = flowGroup!.querySelector('.flow-line[class*="rb-translation"]');
    expect(translationLine).not.toBeNull();
    expect(translationLine!.querySelectorAll(".katex")).toHaveLength(0);
    expect(translationLine!.textContent?.trim()).toBe("");
  });
});

describe("PaperRenderer figure captions", () => {
  function figurePaper(figureBlock: PaperIR["blocks"][number]): PaperIR {
    return {
      arxivId: "2401.12345",
      version: "v1",
      title: "Figure Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [],
      blocks: [figureBlock],
    };
  }

  const translatedFigure = {
    id: "f1",
    type: "figure" as const,
    content: '<figure><img src="x1.png" alt="diagram" /><figcaption>Figure 1: A diagram.</figcaption></figure>',
    caption: "Figure 1: A diagram.",
    translation: "图 1：一张示意图。",
  };

  it("always renders the figure image, even in translation mode", () => {
    const { container } = render(
      <PaperRenderer paper={figurePaper(translatedFigure)} viewMode="translation" />,
    );

    expect(
      container.querySelector('img[src="https://arxiv.org/html/2401.12345v1/x1.png"]'),
    ).not.toBeNull();
  });

  it("renders the translated caption in translation mode", () => {
    render(<PaperRenderer paper={figurePaper(translatedFigure)} viewMode="translation" />);

    expect(screen.getByText("图 1：一张示意图。")).toBeInTheDocument();
  });

  it("shows original and translated caption in bilingual mode", () => {
    const { container } = render(
      <PaperRenderer paper={figurePaper(translatedFigure)} viewMode="bilingual" />,
    );

    expect(container.textContent).toContain("Figure 1: A diagram.");
    expect(screen.getByText("图 1：一张示意图。")).toBeInTheDocument();
  });

  it("does not render a caption translation slot in original mode", () => {
    render(<PaperRenderer paper={figurePaper(translatedFigure)} viewMode="original" />);

    expect(screen.queryByText("图 1：一张示意图。")).not.toBeInTheDocument();
  });

  it("marks an untranslated caption while pending and missing", () => {
    const pendingFigure = {
      id: "f1",
      type: "figure" as const,
      content: '<figure><img src="x1.png" /><figcaption>Figure 1: A diagram.</figcaption></figure>',
      caption: "Figure 1: A diagram.",
    };

    const { rerender } = render(
      <PaperRenderer paper={figurePaper(pendingFigure)} viewMode="translation" translationPending />,
    );
    expect(screen.getByTestId("translation-placeholder")).toBeInTheDocument();

    rerender(
      <PaperRenderer
        paper={figurePaper(pendingFigure)}
        viewMode="translation"
        translationStarted
      />,
    );
    expect(screen.getByText("未翻译")).toBeInTheDocument();
  });

  it("renders no caption slot for a figure without a caption", () => {
    const noCaptionFigure = {
      id: "f1",
      type: "figure" as const,
      content: '<figure><img src="x1.png" /></figure>',
    };

    const { container } = render(
      <PaperRenderer paper={figurePaper(noCaptionFigure)} viewMode="bilingual" />,
    );

    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.queryByText("未翻译")).not.toBeInTheDocument();
    expect(screen.queryByTestId("translation-placeholder")).not.toBeInTheDocument();
  });
});

describe("PaperRenderer display math spotlight", () => {
  function mathPaper(block: PaperIR["blocks"][number]): PaperIR {
    return {
      arxivId: "2401.12345",
      version: "v1",
      title: "Math Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [],
      blocks: [block],
    };
  }

  it("opens spotlight for short standalone display math blocks", () => {
    render(
      <PaperRenderer
        paper={mathPaper({
          id: "m-display",
          type: "math",
          content: "E=mc^2",
          math: { tex: "E=mc^2", display: true },
        })}
      />,
    );

    expect(screen.queryByTestId("math-spotlight")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "放大查看公式" }));
    expect(screen.getByTestId("math-spotlight")).toBeInTheDocument();
  });

  it("opens spotlight for a single-line display formula flowed between paragraphs", () => {
    const paper: PaperIR = {
      arxivId: "2401.12345",
      version: "v1",
      title: "Flowed Display Math Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [],
      blocks: [
        { id: "p1", type: "paragraph", content: "We have " },
        { id: "m1", type: "math", content: "", math: { tex: "E=mc^2", display: true } },
        { id: "p2", type: "paragraph", content: " by definition." },
      ],
    };

    const { container } = render(<PaperRenderer paper={paper} viewMode="original" />);

    // The display formula is flowed inline, not rendered as a standalone block.
    expect(container.querySelector(".flow-group")).not.toBeNull();
    expect(container.querySelector(".rb-display-math")).toBeNull();

    expect(screen.queryByTestId("math-spotlight")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "放大查看公式" }));
    expect(screen.getByTestId("math-spotlight")).toBeInTheDocument();
  });

  it("does not make a truly inline formula clickable", () => {
    const paper: PaperIR = {
      arxivId: "2401.12345",
      version: "v1",
      title: "Inline Math Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [],
      blocks: [
        { id: "p1", type: "paragraph", content: "We have " },
        { id: "m1", type: "math", content: "", math: { tex: "x^2", display: false } },
        { id: "p2", type: "paragraph", content: " here." },
      ],
    };

    render(<PaperRenderer paper={paper} viewMode="original" />);

    expect(screen.queryByRole("button", { name: "放大查看公式" })).not.toBeInTheDocument();
  });
});

describe("PaperRenderer figure image URLs", () => {
  it("repairs corrupted cached image URLs at render time", () => {
    const paper: PaperIR = {
      arxivId: "2401.12345",
      version: "v2",
      title: "Figure Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [],
      blocks: [
        {
          id: "f1",
          type: "figure",
          content:
            '<figure><img src="https://arxiv.org/html/x1.png" alt="Refer to caption" /></figure>',
        },
      ],
    };

    const { container } = render(<PaperRenderer paper={paper} />);

    expect(
      container.querySelector('img[src="https://arxiv.org/html/2401.12345v2/x1.png"]'),
    ).not.toBeNull();
  });

  it("repairs version-prefixed malformed cached image URLs at render time", () => {
    const paper: PaperIR = {
      arxivId: "2602.19128",
      version: "latest",
      title: "Figure Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [],
      blocks: [
        {
          id: "f1",
          type: "figure",
          content:
            '<figure><img src="https://arxiv.org/html/2602.19128/2602.19128v2/x1.png" alt="Refer to caption" /></figure>',
        },
      ],
    };

    const { container } = render(<PaperRenderer paper={paper} />);

    expect(
      container.querySelector('img[src="https://arxiv.org/html/2602.19128v2/x1.png"]'),
    ).not.toBeNull();
  });
});

describe("PaperRenderer citation popover", () => {
  const paperWithCite: PaperIR = {
    arxivId: "2401.12345",
    version: "v1",
    title: "Citation Fixture",
    abstract: "Abstract",
    abstractBlocks: [],
    authors: ["Alice"],
    createdAt: 0,
    modelUsed: "test",
    references: [
      {
        id: "bib.bib1",
        label: "[1]",
        text: "Smith et al. (2020). Important paper.",
      },
      {
        id: "bib.bib2",
        label: "[2]",
        text: "Jones (2021). Another paper.",
      },
    ],
    blocks: [
      {
        id: "p-cite",
        type: "paragraph",
        content:
          '<p>Prior work <cite class="ltx_cite" data-ref="bib.bib1"><a href="#bib.bib1">[1]</a></cite> and <cite class="ltx_cite" data-ref="bib.bib2"><a href="#bib.bib2">[2]</a></cite>.</p>',
      },
    ],
  };

  it("opens a popover with the matching reference when a cite is clicked", () => {
    render(<PaperRenderer paper={paperWithCite} viewMode="original" />);

    expect(screen.queryByTestId("citation-popover")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "[1]" }));

    const popover = screen.getByTestId("citation-popover");
    expect(within(popover).getByText("[1]")).toBeInTheDocument();
    expect(within(popover).getByText("Smith et al. (2020). Important paper.")).toBeInTheDocument();
    expect(within(popover).queryByText("Jones (2021). Another paper.")).not.toBeInTheDocument();
  });

  it("closes the popover when clicking outside", () => {
    render(
      <div>
        <button type="button">outside</button>
        <PaperRenderer paper={paperWithCite} viewMode="original" />
      </div>,
    );

    fireEvent.click(screen.getByRole("link", { name: "[2]" }));
    expect(screen.getByTestId("citation-popover")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByTestId("citation-popover")).not.toBeInTheDocument();
  });

  it("renders inline HTML inside translations and keeps translated cites clickable", () => {
    const paper: PaperIR = {
      arxivId: "2401.12345",
      version: "v1",
      title: "Translated Citation Fixture",
      abstract: "Abstract",
      abstractBlocks: [],
      authors: ["Alice"],
      createdAt: 0,
      modelUsed: "test",
      references: [
        { id: "bib.bib1", label: "[1]", text: "Smith et al. (2020). Important paper." },
      ],
      blocks: [
        {
          id: "p-cite-translated",
          type: "paragraph",
          content:
            'Prior work <cite class="ltx_cite" data-ref="bib.bib1"><a href="#bib.bib1">[1]</a></cite>.',
          translation:
            '先前工作 <cite class="ltx_cite" data-ref="bib.bib1"><a href="#bib.bib1">[1]</a></cite>。',
        },
      ],
    };

    const { container } = render(<PaperRenderer paper={paper} viewMode="translation" />);

    expect(container.textContent).not.toContain("<cite");
    expect(container.querySelector("cite[data-ref='bib.bib1']")).not.toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "[1]" }));
    const popover = screen.getByTestId("citation-popover");
    expect(within(popover).getByText("Smith et al. (2020). Important paper.")).toBeInTheDocument();
  });

  it("closes the popover when Escape is pressed", () => {
    render(<PaperRenderer paper={paperWithCite} viewMode="original" />);

    fireEvent.click(screen.getByRole("link", { name: "[1]" }));
    expect(screen.getByTestId("citation-popover")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("citation-popover")).not.toBeInTheDocument();
  });
});
