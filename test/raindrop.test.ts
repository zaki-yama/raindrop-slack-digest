import { describe, expect, it } from "vitest";
import { takeSince, type Raindrop } from "../src/raindrop.js";

const item = (id: number, created: string): Raindrop => ({
  _id: id, title: `t${id}`, excerpt: "", note: "", link: `https://example.com/${id}`,
  domain: "example.com", tags: [], created,
});

describe("takeSince", () => {
  const since = new Date("2026-09-21T00:00:00Z");

  it("since 以降の記事だけを返し、古い記事に達したら打ち切る", () => {
    const items = [item(1, "2026-09-27T00:00:00Z"), item(2, "2026-09-21T00:00:00Z"), item(3, "2026-09-20T23:59:59Z"), item(4, "2026-09-25T00:00:00Z")];
    const { fresh, reachedOlder } = takeSince(items, since);
    expect(fresh.map((i) => i._id)).toEqual([1, 2]);
    expect(reachedOlder).toBe(true);
  });

  it("すべて新しければ reachedOlder は false", () => {
    const { fresh, reachedOlder } = takeSince([item(1, "2026-09-27T00:00:00Z")], since);
    expect(fresh).toHaveLength(1);
    expect(reachedOlder).toBe(false);
  });
});
