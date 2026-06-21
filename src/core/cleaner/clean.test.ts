import { describe, it, expect } from "vitest";
import { cleanArxivHtml } from "./clean";

const ARXIV_HTML = `<!DOCTYPE html>
<html>
<body>
<article class="ltx_document">
  <nav class="ltx_page_navbar">Navigation menu</nav>
  <script>alert('evil')</script>
  <h1 class="ltx_title ltx_title_document">Quantum Test Paper</h1>
  <div class="ltx_authors">
    <span class="ltx_personname">Alice Author</span>
    <span class="ltx_personname">Bob Author</span>
  </div>
  <div class="ltx_abstract">
    <p class="ltx_p">We study quantum effects in minimal systems.</p>
  </div>
  <section id="S1" class="ltx_section">
    <h2 id="S1.H1" class="ltx_title ltx_title_section">Introduction</h2>
    <p class="ltx_p">Energy relation
      <math id="M1" class="ltx_Math" display="inline">
        <semantics>
          <mrow><msup><mi>x</mi><mn>2</mn></msup></mrow>
          <annotation encoding="application/x-tex">x^2</annotation>
        </semantics>
      </math>
      appears inline.</p>
    <div class="ltx_equation ltx_eqn_table">
      <math id="E1" display="block">
        <semantics>
          <mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow>
          <annotation encoding="application/x-tex">E = mc^2</annotation>
        </semantics>
      </math>
    </div>
  </section>
</article>
</body>
</html>`;

const AR5IV_HTML = `<!DOCTYPE html>
<html>
<body>
<article class="ltx_document">
  <div id="ar5iv-banners" class="ar5iv-banner">
    <p>HTML converted by LaTeXML — experimental</p>
  </div>
  <h1 class="ltx_title ltx_title_document">Ar5iv Sample Paper</h1>
  <div class="ltx_authors">Carol Researcher</div>
  <div class="ltx_abstract"><p class="ltx_p">An ar5iv abstract.</p></div>
  <section class="ltx_section">
    <h2 class="ltx_title ltx_title_section">Methods</h2>
    <p class="ltx_p">Body text without banner noise.</p>
  </section>
</article>
</body>
</html>`;

const REFERENCES_HTML = `<!DOCTYPE html>
<html>
<body>
<article class="ltx_document">
  <h1 class="ltx_title ltx_title_document">Citation Paper</h1>
  <div class="ltx_authors">Dan Writer</div>
  <div class="ltx_abstract"><p class="ltx_p">About citations.</p></div>
  <section class="ltx_section">
    <p class="ltx_p">Prior work
      <cite class="ltx_cite"><a href="#bib.bib1" title="">[1]</a></cite>
      and also
      <cite class="ltx_cite"><a href="#bib.bib2" title="">[2]</a></cite>
      are cited.</p>
  </section>
  <section class="ltx_bibliography">
    <h2 class="ltx_title ltx_title_bibliography">References</h2>
    <ol class="ltx_biblist">
      <li id="bib.bib1" class="ltx_bibitem">
        <span class="ltx_tag_bibitem">[1]</span>
        Smith et al. (2020). Important paper.
      </li>
      <li id="bib.bib2" class="ltx_bibitem">
        <span class="ltx_tag_bibitem">[2]</span>
        Jones (2021). Another paper.
      </li>
    </ol>
  </section>
</article>
</body>
</html>`;

describe("cleanArxivHtml", () => {
  it("removes nav/script, extracts headings and math with TeX", () => {
    const result = cleanArxivHtml(ARXIV_HTML, "arxiv");

    expect(result.title).toBe("Quantum Test Paper");
    expect(result.authors).toEqual(["Alice Author", "Bob Author"]);
    expect(result.abstract).toBe("We study quantum effects in minimal systems.");

    const allContent = result.blocks.map((b) => b.content).join(" ");
    expect(allContent).not.toContain("Navigation menu");
    expect(allContent).not.toContain("alert");
    expect(allContent).not.toContain("<script");

    const heading = result.blocks.find((b) => b.type === "heading");
    expect(heading).toMatchObject({ level: 2, content: "Introduction", id: "S1.H1" });

    const inlineMath = result.blocks.find((b) => b.type === "math" && b.math?.display === false);
    expect(inlineMath).toMatchObject({
      id: "M1",
      math: { tex: "x^2", display: false },
    });

    const displayMath = result.blocks.find((b) => b.type === "math" && b.math?.display === true);
    expect(displayMath).toMatchObject({
      id: "E1",
      math: { tex: "E = mc^2", display: true },
    });
  });

  it("removes ar5iv banner and keeps body content", () => {
    const result = cleanArxivHtml(AR5IV_HTML, "ar5iv");

    const allContent = [
      result.title,
      result.abstract,
      ...result.blocks.map((b) => b.content),
    ].join(" ");

    expect(allContent).not.toContain("HTML converted by LaTeXML");
    expect(allContent).not.toContain("ar5iv-banners");
    expect(result.title).toBe("Ar5iv Sample Paper");

    const heading = result.blocks.find((b) => b.type === "heading");
    expect(heading).toMatchObject({ level: 2, content: "Methods" });

    const paragraph = result.blocks.find((b) => b.type === "paragraph");
    expect(paragraph?.content).toContain("Body text without banner noise");
  });

  it("parses references and links cite targets via data-ref", () => {
    const result = cleanArxivHtml(REFERENCES_HTML, "arxiv");

    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toMatchObject({
      id: "bib.bib1",
      label: "[1]",
      text: "Smith et al. (2020). Important paper.",
    });
    expect(result.references[1]).toMatchObject({
      id: "bib.bib2",
      label: "[2]",
      text: "Jones (2021). Another paper.",
    });

    const paragraph = result.blocks.find((b) => b.type === "paragraph");
    expect(paragraph?.content).toContain('data-ref="bib.bib1"');
    expect(paragraph?.content).toContain('data-ref="bib.bib2"');
  });

  it("drops LaTeXML error nodes and stray front-matter before the title", () => {
    const html = `<!DOCTYPE html>
<html><body>
<article class="ltx_document">
  <div id="p1" class="ltx_para"><p id="p1.1" class="ltx_p">]UC Berkeley</p></div>
  <h1 class="ltx_title ltx_title_document">Front Matter Paper</h1>
  <div class="ltx_authors"><span class="ltx_personname">Eve Author</span></div>
  <div class="ltx_abstract"><p class="ltx_p">Abstract body.</p></div>
  <div id="p2" class="ltx_para">
    <span class="ltx_ERROR undefined">\\metadata</span>
    <p id="p2.2" class="ltx_p">Real body paragraph.</p>
  </div>
</article>
</body></html>`;

    const result = cleanArxivHtml(html, "arxiv");
    const allContent = result.blocks.map((b) => b.content).join(" ");

    expect(result.title).toBe("Front Matter Paper");
    expect(allContent).not.toContain("UC Berkeley");
    expect(allContent).not.toContain("metadata");
    expect(allContent).toContain("Real body paragraph.");
  });

  it("produces deterministic block ids for the same input", () => {
    const first = cleanArxivHtml(ARXIV_HTML, "arxiv");
    const second = cleanArxivHtml(ARXIV_HTML, "arxiv");

    expect(first.blocks.map((b) => b.id)).toEqual(second.blocks.map((b) => b.id));
    expect(first.references.map((r) => r.id)).toEqual(second.references.map((r) => r.id));
  });

  it("normalizes siunitx micro units and preserves spacing after inline math", () => {
    const html = `<!DOCTYPE html>
<html><body>
<article class="ltx_document">
  <h1 class="ltx_title ltx_title_document">Units Paper</h1>
  <div class="ltx_authors"><span class="ltx_personname">Unit Author</span></div>
  <div class="ltx_abstract"><p class="ltx_p">Abstract.</p></div>
  <p class="ltx_p">and it achieves state-of-the-art performance (1030
    <math id="M2" class="ltx_Math" display="inline">
      <semantics>
        <mrow><mn>1030</mn><mtext> </mtext><mi mathvariant="normal">µ</mi><mi mathvariant="normal">s</mi></mrow>
        <annotation encoding="application/x-tex">1030\\text{\\,}\\mathrm{\\SIUnitSymbolMicro s}</annotation>
      </semantics>
    </math> on H100)</p>
</article>
</body></html>`;

    const result = cleanArxivHtml(html, "arxiv");
    const math = result.blocks.find((b) => b.type === "math");
    const paragraphs = result.blocks.filter((b) => b.type === "paragraph");

    expect(math?.math?.tex).toBe(String.raw`1030\text{\,}\mathrm{\mu s}`);
    expect(paragraphs.some((p) => p.content.startsWith(" on H100"))).toBe(true);
  });

  it("rewrites relative figure image src/srcset to absolute arxiv URLs", () => {
    const html = `<!DOCTYPE html>
<html><body>
<article class="ltx_document">
  <h1 class="ltx_title ltx_title_document">Figure Paper</h1>
  <div class="ltx_authors"><span class="ltx_personname">Fig Author</span></div>
  <div class="ltx_abstract"><p class="ltx_p">Abstract.</p></div>
  <figure id="F1" class="ltx_figure">
    <img class="ltx_graphics" src="x1.png" srcset="x1.png 1x, x1-hi.png 2x" alt="Refer to caption" />
    <figcaption class="ltx_caption">Figure 1: A diagram.</figcaption>
  </figure>
  <p class="ltx_p">Inline <img src="/html/2401.12345v2/inline.png" alt="Refer to caption" /> image.</p>
</article>
</body></html>`;

    const result = cleanArxivHtml(html, "arxiv", "https://arxiv.org/html/2401.12345v2/");

    const figure = result.blocks.find((b) => b.type === "figure");
    expect(figure?.content).toContain('src="https://arxiv.org/html/2401.12345v2/x1.png"');
    expect(figure?.content).toContain(
      "https://arxiv.org/html/2401.12345v2/x1.png 1x, https://arxiv.org/html/2401.12345v2/x1-hi.png 2x",
    );
    expect(figure?.content).not.toContain('src="x1.png"');

    const inline = result.blocks.find(
      (b) => b.type === "paragraph" && b.content.includes("inline.png"),
    );
    expect(inline?.content).toContain('src="https://arxiv.org/html/2401.12345v2/inline.png"');
  });

  it("leaves image src untouched when no pageUrl is provided", () => {
    const html = `<!DOCTYPE html>
<html><body>
<article class="ltx_document">
  <h1 class="ltx_title ltx_title_document">Figure Paper</h1>
  <div class="ltx_authors"><span class="ltx_personname">Fig Author</span></div>
  <div class="ltx_abstract"><p class="ltx_p">Abstract.</p></div>
  <figure id="F1" class="ltx_figure"><img src="x1.png" alt="Refer to caption" /></figure>
</article>
</body></html>`;

    const result = cleanArxivHtml(html, "arxiv");
    const figure = result.blocks.find((b) => b.type === "figure");
    expect(figure?.content).toContain('src="x1.png"');
  });

  it("extracts the figure caption into block.caption", () => {
    const html = `<!DOCTYPE html>
<html><body>
<article class="ltx_document">
  <h1 class="ltx_title ltx_title_document">Figure Paper</h1>
  <div class="ltx_authors"><span class="ltx_personname">Fig Author</span></div>
  <div class="ltx_abstract"><p class="ltx_p">Abstract.</p></div>
  <figure id="F1" class="ltx_figure">
    <img src="x1.png" alt="Refer to caption" />
    <figcaption class="ltx_caption"><span class="ltx_tag">Figure 1: </span>A <em>diagram</em>.</figcaption>
  </figure>
</article>
</body></html>`;

    const result = cleanArxivHtml(html, "arxiv");
    const figure = result.blocks.find((b) => b.type === "figure");

    expect(figure?.caption).toContain("A <em>diagram</em>.");
    expect(figure?.caption).toContain("Figure 1:");
    expect(figure?.content).toContain("<figcaption");
  });

  it("leaves caption undefined for figures without a figcaption", () => {
    const html = `<!DOCTYPE html>
<html><body>
<article class="ltx_document">
  <h1 class="ltx_title ltx_title_document">Figure Paper</h1>
  <div class="ltx_authors"><span class="ltx_personname">Fig Author</span></div>
  <div class="ltx_abstract"><p class="ltx_p">Abstract.</p></div>
  <figure id="F1" class="ltx_figure"><img src="x1.png" alt="Refer to caption" /></figure>
</article>
</body></html>`;

    const result = cleanArxivHtml(html, "arxiv");
    const figure = result.blocks.find((b) => b.type === "figure");

    expect(figure?.caption).toBeUndefined();
  });

  it("extracts abstract blocks without duplicating math annotations in plain text", () => {
    const html = `<!DOCTYPE html>
<html><body>
<article class="ltx_document">
  <h1 class="ltx_title ltx_title_document">Units Paper</h1>
  <div class="ltx_authors"><span class="ltx_personname">Unit Author</span></div>
  <div class="ltx_abstract">
    <p class="ltx_p">K-Search reaches 1030
      <math id="A1" class="ltx_Math" display="inline">
        <semantics>
          <mrow><mn>1030</mn><mtext> </mtext><mi mathvariant="normal">µ</mi><mi mathvariant="normal">s</mi></mrow>
          <annotation encoding="application/x-tex">1030\\text{\\,}\\mathrm{\\SIUnitSymbolMicro s}</annotation>
        </semantics>
      </math> on H100.</p>
  </div>
</article>
</body></html>`;

    const result = cleanArxivHtml(html, "arxiv");

    expect(result.abstract).toBe("K-Search reaches 1030 µs on H100.");
    expect(result.abstractBlocks.some((block) => block.type === "math")).toBe(true);
    expect(result.abstractBlocks.find((block) => block.type === "math")?.math?.tex).toBe(
      String.raw`1030\text{\,}\mathrm{\mu s}`,
    );
    expect(result.blocks.some((block) => block.content.includes("K-Search reaches"))).toBe(false);
  });
});
