import { describe, expect, it } from "vitest";
import { buildDigestBlocks, buildEntryBlocks, escapeMrkdwn, splitIntoMessages, type DigestEntry } from "../src/slack.js";

const entry = (n: number, withSummary = true): DigestEntry => ({
  title: `Original <Title> ${n}`,
  url: `https://example.com/${n}`,
  domain: "example.com",
  tags: ["typescript"],
  excerpt: "excerpt",
  summary: withSummary
    ? { headline: `見出し|${n}`, summary: "要約 & 説明", key_points: ["ポイント1", "ポイント2"], recommended_for: "TS 使い" }
    : undefined,
});

describe("escapeMrkdwn", () => {
  it("&, <, > をエスケープする", () => {
    expect(escapeMrkdwn("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });
});

describe("buildEntryBlocks", () => {
  it("要約付きの記事を section/context/divider にする", () => {
    const blocks = buildEntryBlocks(entry(1), 0);
    expect(blocks.map((b) => b.type)).toEqual(["section", "context", "divider"]);
    const text = (blocks[0] as { text: { text: string } }).text.text;
    expect(text).toContain("<https://example.com/1|見出し│1>");
    expect(text).toContain("Original &lt;Title&gt; 1");
    expect(text).toContain("要約 &amp; 説明");
    expect(text).toContain("• ポイント1");
  });

  it("要約がない場合は元タイトルと抜粋を載せる", () => {
    const text = (buildEntryBlocks(entry(2, false), 1)[0] as { text: { text: string } }).text.text;
    expect(text).toContain("*2. <https://example.com/2|Original &lt;Title&gt; 2>*");
    expect(text).toContain("excerpt");
  });

  it("長すぎる本文は 3000 文字に切り詰める", () => {
    const e = entry(3);
    e.summary!.summary = "あ".repeat(5000);
    const text = (buildEntryBlocks(e, 0)[0] as { text: { text: string } }).text.text;
    expect(text.length).toBe(3000);
  });
});

describe("splitIntoMessages", () => {
  it("50 ブロックを超えないように記事の区切りで分割する", () => {
    const blocks = buildDigestBlocks({
      date: "2026-09-27", intro: "導入",
      entries: Array.from({ length: 30 }, (_, i) => entry(i)),
    });
    const messages = splitIntoMessages(blocks);
    expect(messages.flat()).toEqual(blocks);
    for (const m of messages) {
      expect(m.length).toBeLessThanOrEqual(50);
      expect(m.at(-1)!.type).toBe("divider");
    }
    expect(messages.length).toBeGreaterThan(1);
  });
});
