import { describe, expect, it } from "vitest";
import { tokenizePython } from "./pythonHighlight";

describe("tokenizePython", () => {
  it("highlights keywords, strings, and comments", () => {
    const tokens = tokenizePython('import pandas as pd  # load\nprint("hi")');
    expect(tokens.some((token) => token.kind === "keyword" && token.text === "import")).toBe(
      true,
    );
    expect(tokens.some((token) => token.kind === "string" && token.text === '"hi"')).toBe(
      true,
    );
    expect(tokens.some((token) => token.kind === "comment")).toBe(true);
  });

  it("marks call sites as functions", () => {
    const tokens = tokenizePython("pd.read_csv(path)");
    expect(tokens.some((token) => token.kind === "function" && token.text === "read_csv")).toBe(
      true,
    );
  });
});
