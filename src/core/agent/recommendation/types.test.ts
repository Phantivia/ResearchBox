import { describe, it, expect } from "vitest";
import { parsePaperRecommendations } from "./types";

describe("parsePaperRecommendations", () => {
  it("parses valid recommendation arrays", () => {
    expect(
      parsePaperRecommendations(
        JSON.stringify([
          { arxivId: "2401.12345", abstract: "Abs", reason: "Relevant" },
        ]),
      ),
    ).toEqual([{ arxivId: "2401.12345", abstract: "Abs", reason: "Relevant" }]);
  });

  it("returns null for invalid shapes", () => {
    expect(parsePaperRecommendations('{"arxivId":"x"}')).toBeNull();
    expect(parsePaperRecommendations("[{}]")).toBeNull();
  });

  it("returns empty array for empty JSON array", () => {
    expect(parsePaperRecommendations("[]")).toEqual([]);
  });
});
