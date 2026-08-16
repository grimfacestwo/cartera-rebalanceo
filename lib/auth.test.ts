import { describe, expect, it } from "vitest";
import { safeEqual, sha256Hex } from "./auth";

describe("auth", () => {
  it("calcula el hash sha256 correcto", async () => {
    expect(await sha256Hex("test")).toBe(
      "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    );
  });

  it("safeEqual compara correctamente", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});