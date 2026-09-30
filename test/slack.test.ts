import { describe, expect, it } from "vitest";
import { buildDigestBlocks, buildEntryBlocks, escapeMrkdwn, formatUsage, splitIntoMessages, type DigestEntry } from "../src/slack.js";

const entry = (n: number, withSummary = true): DigestEntry => ({
  title: `Original <Title>|${n}`,
  url: `https://example.com/${n}`,
  domain: "example.com",
  tags: ["typescript"],
  excerpt: "excerpt",
  bodyFetched: withSummary,
  summary: withSummary
    ? {
        tldr: "一言 & 要約",
        highlights: [
          { label: "価格", text: "20% 安い" },
          { label: "仕組み", text: "<キャッシュ>" },
          { label: "使い分け", text: "medium 基本" },
        ],
        summary: "詳しい概要",
        key_points: ["詳しいポイント"],
      }
    : undefined,
});

const textOf = (block: unknown) => (block as { text: { text: string } }).text.text;

describe("escapeMrkdwn", () => {
  it("&, <, > をエスケープする", () => {
    expect(escapeMrkdwn("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });
});

describe("buildEntryBlocks", () => {
  it("原題のリンク・一言要約・見出し語付きの3点を section/context/divider にする", () => {
    const blocks = buildEntryBlocks(entry(1), 0);
    expect(blocks.map((b) => b.type)).toEqual(["section", "context", "divider"]);
    expect(textOf(blocks[0])).toBe(
      "*1. <https://example.com/1|Original &lt;Title&gt;│1>*\n一言 &amp; 要約\n• *価格*: 20% 安い\n• *仕組み*: &lt;キャッシュ&gt;\n• *使い分け*: medium 基本",
    );
    // 詳しい版は Slack には載せない
    expect(textOf(blocks[0])).not.toContain("詳しい");
    const context = JSON.stringify(blocks[1]);
    expect(context).toContain("example.com");
    expect(context).toContain("#typescript");
    expect(context).not.toContain("🎯");
  });

  it("本文を取得できなかった記事は、抜粋からの一言紹介と注記だけにして箇条書きを出さない", () => {
    const e = { ...entry(2, false), excerptTldr: "抜粋からの紹介" };
    expect(textOf(buildEntryBlocks(e, 1)[0])).toBe(
      "*2. <https://example.com/2|Original &lt;Title&gt;│2>*\n抜粋からの紹介\n_⚠️ 本文を取得できなかったため、抜粋をもとにした紹介です_",
    );
  });

  it("抜粋からの紹介も作れなかった場合は抜粋そのものを載せる", () => {
    expect(textOf(buildEntryBlocks(entry(2, false), 1)[0])).toBe(
      "*2. <https://example.com/2|Original &lt;Title&gt;│2>*\nexcerpt\n_⚠️ 本文を取得できなかったため、抜粋をもとにした紹介です_",
    );
  });

  it("本文は取得できたが要約に失敗した場合は、その旨を注記する", () => {
    const e = { ...entry(3, false), bodyFetched: true };
    expect(textOf(buildEntryBlocks(e, 2)[0])).toContain("_⚠️ 要約を生成できなかったため、抜粋のみ掲載しています_");
  });

  it("正常に要約できた記事には注記を付けない", () => {
    expect(textOf(buildEntryBlocks(entry(1), 0)[0])).not.toContain("⚠️");
  });

  it("長すぎる本文は 3000 文字に切り詰める", () => {
    const e = entry(3);
    e.summary!.tldr = "あ".repeat(5000);
    expect(textOf(buildEntryBlocks(e, 0)[0]).length).toBe(3000);
  });
});

describe("buildDigestBlocks", () => {
  it("Markdown へのリンクと使用量を最後のフッターに載せる", () => {
    const blocks = buildDigestBlocks({
      date: "2026-09-27", intro: null, entries: [entry(1)],
      usage: { calls: 3, costUsd: 0.1234, models: ["claude-sonnet-5"] },
      archiveUrl: "https://github.com/o/r/blob/main/digests/2026/2026-09-27.md",
    });
    expect(blocks.at(-1)).toEqual({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: "📝 <https://github.com/o/r/blob/main/digests/2026/2026-09-27.md|GitHub で読む>  |  🤖 Claude Code 使用量: claude-sonnet-5・3 回呼び出し・API 換算で約 $0.12",
      }],
    });
  });
});

describe("formatUsage", () => {
  it("モデル名がなければ省く", () => {
    expect(formatUsage({ calls: 1, costUsd: 0, models: [] })).toMatch(/^Claude Code 使用量: 1 回呼び出し・API 換算で約 \$0\.00/);
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

  it("フッターは最後のメッセージに含める", () => {
    const blocks = buildDigestBlocks({
      date: "2026-09-27", intro: null, entries: Array.from({ length: 20 }, (_, i) => entry(i)),
      usage: { calls: 21, costUsd: 1, models: [] },
    });
    const messages = splitIntoMessages(blocks);
    expect(messages.flat()).toEqual(blocks);
    expect(JSON.stringify(messages.at(-1)!.at(-1))).toContain("Claude Code 使用量");
  });
});
