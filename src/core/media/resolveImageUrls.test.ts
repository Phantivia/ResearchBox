import { describe, expect, it } from "vitest";
import {
  buildArxivPaperPageUrl,
  resolveImageUrlsInHtml,
} from "./resolveImageUrls";

describe("buildArxivPaperPageUrl", () => {
  it("includes version when known", () => {
    expect(buildArxivPaperPageUrl("2401.12345", "v2")).toBe(
      "https://arxiv.org/html/2401.12345v2/",
    );
  });

  it("omits version suffix for latest", () => {
    expect(buildArxivPaperPageUrl("2401.12345", "latest")).toBe(
      "https://arxiv.org/html/2401.12345/",
    );
  });
});

describe("resolveImageUrlsInHtml", () => {
  const pageUrl = "https://arxiv.org/html/2401.12345v2/";

  it("rewrites relative and root-relative image src", () => {
    const html = `
      <figure>
        <img src="x1.png" alt="Refer to caption" />
        <img src="/html/2401.12345v2/inline.png" alt="Refer to caption" />
      </figure>
    `;

    const resolved = resolveImageUrlsInHtml(html, pageUrl);

    expect(resolved).toContain('src="https://arxiv.org/html/2401.12345v2/x1.png"');
    expect(resolved).toContain('src="https://arxiv.org/html/2401.12345v2/inline.png"');
  });

  it("fixes corrupted absolute URLs missing the arxiv id segment", () => {
    const html = '<img src="https://arxiv.org/html/x1.png" alt="Refer to caption" />';

    const resolved = resolveImageUrlsInHtml(html, pageUrl);

    expect(resolved).toContain('src="https://arxiv.org/html/2401.12345v2/x1.png"');
    expect(resolved).not.toContain('src="https://arxiv.org/html/x1.png"');
  });

  it("rewrites srcset candidates", () => {
    const html = '<img srcset="x1.png 1x, x1-hi.png 2x" />';

    const resolved = resolveImageUrlsInHtml(html, pageUrl);

    expect(resolved).toContain(
      "https://arxiv.org/html/2401.12345v2/x1.png 1x, https://arxiv.org/html/2401.12345v2/x1-hi.png 2x",
    );
  });

  it("leaves already-correct absolute URLs untouched", () => {
    const html =
      '<img src="https://arxiv.org/html/2401.12345v2/x1.png" alt="diagram" />';

    expect(resolveImageUrlsInHtml(html, pageUrl)).toContain(
      'src="https://arxiv.org/html/2401.12345v2/x1.png"',
    );
  });

  it("returns html unchanged when no images are present", () => {
    const html = "<p>No images here.</p>";
    expect(resolveImageUrlsInHtml(html, pageUrl)).toBe(html);
  });
});
