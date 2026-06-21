import { describe, expect, it, vi, afterEach } from "vitest";
import {
  diagnoseConnectionHints,
  testProviderConnection,
} from "./testConnection";

const CONFIG = {
  id: "openai",
  apiKey: "test-key",
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4o",
};

describe("diagnoseConnectionHints", () => {
  it("suggests invalid_api_key for 401 responses", () => {
    expect(
      diagnoseConnectionHints({
        error: "HTTP 401: unauthorized",
        status: 401,
        config: CONFIG,
      }),
    ).toContain("invalid_api_key");
  });

  it("suggests model_not_found when the body mentions an unknown model", () => {
    expect(
      diagnoseConnectionHints({
        error: "HTTP 400: bad request",
        status: 400,
        body: '{"error":{"message":"The model `foo` does not exist"}}',
        config: CONFIG,
      }),
    ).toContain("model_not_found");
  });

  it("suggests cors_or_network for browser fetch failures", () => {
    expect(
      diagnoseConnectionHints({
        error: "Failed to fetch",
        config: CONFIG,
      }),
    ).toContain("cors_or_network");
  });
});

describe("testProviderConnection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns latency metrics on success", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(742.6);

    const fetchFn = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: "ok" } }],
      }),
    );

    const result = await testProviderConnection(CONFIG, { fetchFn });

    expect(result).toEqual({
      ok: true,
      latencyMs: 642.6,
      responseChars: 2,
      responsePreview: "ok",
    });
  });

  it("returns hints when the API responds with 401", async () => {
    const fetchFn = vi.fn(async () => new Response("invalid key", { status: 401 }));

    const result = await testProviderConnection(
      { ...CONFIG, apiKey: "bad-key" },
      { fetchFn },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.status).toBe(401);
    expect(result.error).toContain("HTTP 401");
    expect(result.hints).toContain("invalid_api_key");
  });

  it("returns missing field hints when config is incomplete", async () => {
    const result = await testProviderConnection({
      ...CONFIG,
      apiKey: "",
      model: "",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.hints).toEqual(["missing_api_key", "missing_model"]);
  });

  it("returns unexpected_response when the model ignores the ping instruction", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10);

    const fetchFn = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: "hello there" } }],
      }),
    );

    const result = await testProviderConnection(CONFIG, { fetchFn });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatch(/Unexpected response/);
    expect(result.hints).toContain("unexpected_response");
  });
});
