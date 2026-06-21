import { describe, expect, it } from "vitest";
import DOMPurify from "dompurify";
import { stripMathmlSourceAnnotations } from "./sanitizeMathml";

const MATHML = `<p>obs <math display="inline"><semantics><mrow><msub><mi>o</mi><mi>k</mi></msub></mrow><annotation encoding="application/x-tex">o_k</annotation></semantics></math> end</p>`;

function makePurifier() {
  const purify = DOMPurify(window);
  stripMathmlSourceAnnotations(purify);
  return purify;
}

const SANITIZE_OPTIONS = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_ATTR: ["encoding", "display"],
};

describe("stripMathmlSourceAnnotations", () => {
  it("removes the x-tex annotation node entirely", () => {
    const clean = makePurifier().sanitize(MATHML, SANITIZE_OPTIONS);
    expect(clean).not.toContain("annotation");
    expect(clean).not.toContain("o_k");
  });

  it("keeps the presentation MathML so the formula still renders", () => {
    const clean = makePurifier().sanitize(MATHML, SANITIZE_OPTIONS);
    expect(clean).toContain("<math");
    expect(clean).toContain("<msub>");
    expect(clean).toContain("end");
  });

  it("handles annotation-xml the same way", () => {
    const input = `<math><semantics><mrow><mi>x</mi></mrow><annotation-xml encoding="MathML-Content"><ci>x</ci></annotation-xml></semantics></math>`;
    const clean = makePurifier().sanitize(input, SANITIZE_OPTIONS);
    expect(clean).not.toContain("annotation-xml");
    expect(clean).toContain("<mi>x</mi>");
  });
});
