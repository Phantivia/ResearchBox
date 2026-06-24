import { describe, expect, it } from "vitest";
import { extractStreamingPythonCode } from "./streamingToolInput";

describe("extractStreamingPythonCode", () => {
  it("returns empty string before the code field starts", () => {
    expect(extractStreamingPythonCode('{"')).toBe("");
    expect(extractStreamingPythonCode('{"purpose":"plot"}')).toBe("");
  });

  it("extracts partial python code while the JSON string is still open", () => {
    expect(extractStreamingPythonCode('{"code":"import pandas as pd\nprint(')).toBe(
      "import pandas as pd\nprint(",
    );
  });

  it("extracts complete python code from finished JSON", () => {
    expect(
      extractStreamingPythonCode(
        '{"code":"print(\\"hi\\")\\n","purpose":"demo"}',
      ),
    ).toBe('print("hi")\n');
  });

  it("decodes common JSON escape sequences", () => {
    expect(extractStreamingPythonCode('{"code":"line1\\nline2\\t\\"q\\""')).toBe(
      'line1\nline2\t"q"',
    );
  });
});
