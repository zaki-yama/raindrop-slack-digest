import { describe, expect, it } from "vitest";
import { selectInRange, type Raindrop } from "../src/raindrop.js";

const item = (id: number, created: string): Raindrop => ({
  _id: id, title: `t${id}`, excerpt: "", note: "", link: `https://example.com/${id}`,
  domain: "example.com", tags: [], created,
});

describe("selectInRange", () => {
  const since = new Date("2026-09-26T15:00:00Z"); // 2026-09-27 00:00 JST
  const until = new Date("2026-09-27T15:00:00Z"); // 2026-09-28 00:00 JST

  it("範囲内の記事だけを返し、since より古い記事に達したら打ち切る", () => {
    const items = [
      item(1, "2026-09-27T15:00:00Z"), // until ちょうど → 対象外(翌日分)
      item(2, "2026-09-27T14:59:59Z"),
      item(3, "2026-09-26T15:00:00Z"), // since ちょうど → 対象
      item(4, "2026-09-26T14:59:59Z"),
      item(5, "2026-09-27T00:00:00Z"), // 打ち切り後なので見ない
    ];
    const { fresh, reachedOlder } = selectInRange(items, since, until);
    expect(fresh.map((i) => i._id)).toEqual([2, 3]);
    expect(reachedOlder).toBe(true);
  });

  it("since より古い記事がなければ reachedOlder は false", () => {
    const { fresh, reachedOlder } = selectInRange([item(1, "2026-09-28T00:00:00Z"), item(2, "2026-09-27T00:00:00Z")], since, until);
    expect(fresh.map((i) => i._id)).toEqual([2]);
    expect(reachedOlder).toBe(false);
  });
});
