import { describe, expect, it } from "vitest";
import { toTaskToken } from "../merge/merger-task-token.js";

describe("toTaskToken", () => {
  it("normalizes case and separators", () => {
    expect(toTaskToken("fn-5000")).toBe("FN5000");
    expect(toTaskToken("FN_5000")).toBe("FN5000");
  });

  it("drops non-alphanumeric task-id punctuation", () => {
    expect(toTaskToken(" fn:5000 ")).toBe("FN5000");
  });
});
