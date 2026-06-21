import { describe, expect, it } from "vitest";
import { BRAND_CREDITS } from "./credits";

describe("BRAND_CREDITS", () => {
  it("exposes studio attribution fields", () => {
    expect(BRAND_CREDITS.studio).toBe("PhantAIStudio");
    expect(BRAND_CREDITS.author).toBe("Phantivia");
    expect(BRAND_CREDITS.contactEmail).toBe("phantivia@gmail.com");
  });
});
