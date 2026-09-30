import { describe, expect, it } from "vitest";
import { dayRangeJst, isValidDate, previousDateJst } from "../src/dates.js";

describe("previousDateJst", () => {
  it("JST 9:00 に実行すると前日を返す", () => {
    expect(previousDateJst(new Date("2026-09-28T00:00:00Z"))).toBe("2026-09-27");
  });

  it("定期実行の JST 7:00(前日 22:00 UTC)に実行すると、JST での前日を返す", () => {
    expect(previousDateJst(new Date("2026-09-29T22:00:00Z"))).toBe("2026-09-29");
  });

  it("UTC では前日でも JST で日付が変わっていればその前日を返す", () => {
    // 2026-09-28 00:30 JST
    expect(previousDateJst(new Date("2026-09-27T15:30:00Z"))).toBe("2026-09-27");
    // 2026-09-27 23:30 JST
    expect(previousDateJst(new Date("2026-09-27T14:30:00Z"))).toBe("2026-09-26");
  });

  it("月・年をまたぐ", () => {
    expect(previousDateJst(new Date("2027-01-01T00:00:00Z"))).toBe("2026-12-31");
  });
});

describe("dayRangeJst", () => {
  it("JST の 0:00 から 24 時間の範囲を返す", () => {
    const { since, until } = dayRangeJst("2026-09-27");
    expect(since.toISOString()).toBe("2026-09-26T15:00:00.000Z");
    expect(until.toISOString()).toBe("2026-09-27T15:00:00.000Z");
  });
});

describe("isValidDate", () => {
  it.each([["2026-09-27", true], ["2026-02-30", false], ["2026/09/27", false], ["20260927", false]])("%s → %s", (input, expected) => {
    expect(isValidDate(input)).toBe(expected);
  });
});
