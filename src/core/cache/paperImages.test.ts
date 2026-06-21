import { describe, it, expect, vi } from "vitest";
import {
  cachePaperImages,
  deletePaperImages,
  extractPaperImageUrls,
} from "./paperImages";

describe("extractPaperImageUrls", () => {
  it("collects absolute and relative image URLs from arxiv hosts", () => {
    const html = `
      <article>
        <img src="https://arxiv.org/html/2401.12345/x1.png" />
        <img src="/html/2401.12345/x2.jpg" />
        <img src="https://example.com/other.png" />
      </article>
    `;

    const urls = extractPaperImageUrls(
      html,
      "https://arxiv.org/html/2401.12345",
    );

    expect(urls).toEqual([
      "https://arxiv.org/html/2401.12345/x1.png",
      "https://arxiv.org/html/2401.12345/x2.jpg",
    ]);
  });

  it("parses srcset candidates", () => {
    const html = `<img srcset="/html/x1.png 1x, /html/x2.png 2x" />`;
    const urls = extractPaperImageUrls(html, "https://ar5iv.org/html/2401.12345");

    expect(urls).toEqual([
      "https://ar5iv.org/html/x1.png",
      "https://ar5iv.org/html/x2.png",
    ]);
  });
});

describe("cachePaperImages", () => {
  it("stores fetched images in Cache API", async () => {
    const stored = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (url: string) => stored.get(url) ?? undefined),
      put: vi.fn(async (url: string, response: Response) => {
        stored.set(url, response);
      }),
      keys: vi.fn(async () => [...stored.keys()].map((url) => new Request(url))),
      delete: vi.fn(async (request: Request) => stored.delete(request.url)),
    };

    const caches = {
      open: vi.fn(async () => cache),
    } as unknown as CacheStorage;

    const fetchFn = vi.fn(async (_input: RequestInfo | URL) =>
      Response.json({ ok: true }, { status: 200, headers: { "Content-Type": "application/json" } }),
    );

    const html = `<img src="https://arxiv.org/html/2401.12345/fig1.png" />`;
    const count = await cachePaperImages(html, "https://arxiv.org/html/2401.12345", {
      caches,
      fetchFn,
    });

    expect(count).toBe(1);
    expect(fetchFn).toHaveBeenCalledWith("https://arxiv.org/html/2401.12345/fig1.png");
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it("returns 0 when Cache API is unavailable", async () => {
    const count = await cachePaperImages("<img />", "https://arxiv.org/html/x", {
      caches: undefined,
    });
    expect(count).toBe(0);
  });
});

describe("deletePaperImages", () => {
  it("deletes only the cache entries whose URL contains the arxivId", async () => {
    const stored = new Map<string, Response>([
      ["https://arxiv.org/html/2401.12345/x1.png", new Response("a")],
      ["https://arxiv.org/html/2401.12345/x2.png", new Response("b")],
      ["https://arxiv.org/html/2312.99999/y1.png", new Response("c")],
    ]);
    const cache = {
      keys: vi.fn(async () => [...stored.keys()].map((url) => new Request(url))),
      delete: vi.fn(async (request: Request) => stored.delete(request.url)),
    };
    const caches = {
      open: vi.fn(async () => cache),
    } as unknown as CacheStorage;

    const count = await deletePaperImages("2401.12345", { caches });

    expect(count).toBe(2);
    expect([...stored.keys()]).toEqual([
      "https://arxiv.org/html/2312.99999/y1.png",
    ]);
  });

  it("returns 0 when Cache API is unavailable", async () => {
    expect(await deletePaperImages("2401.12345", { caches: undefined })).toBe(0);
  });
});
