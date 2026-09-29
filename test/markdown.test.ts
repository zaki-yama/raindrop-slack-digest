import { describe, expect, it } from "vitest";
import { buildDigestMarkdown, digestFilePath } from "../src/markdown.js";

describe("buildDigestMarkdown", () => {
  const markdown = buildDigestMarkdown({
    date: "2026-09-27",
    intro: "今日は TypeScript の話題です。\n2行目",
    entries: [
      {
        title: "Original [Title]", url: "https://example.com/a_(b)", domain: "example.com", tags: ["ts"], excerpt: "",
        summary: { summary: "要約です。", key_points: ["ポイント1", "ポイント2"] },
      },
      { title: "No Summary", url: "https://example.com/b", domain: "example.com", tags: [], excerpt: "抜粋です" },
    ],
    usage: { calls: 3, costUsd: 0.5, models: ["claude-sonnet-5"] },
  });

  it("タイトルと導入文を出力する", () => {
    expect(markdown).toMatch(/^# 📚 Tech Digest 2026\/09\/27\n/);
    expect(markdown).toContain("記事 2 本");
    expect(markdown).toContain("> 今日は TypeScript の話題です。\n> 2行目");
  });

  it("要約付きの記事を原題・概要・箇条書きで出力する", () => {
    expect(markdown).toContain(
      "## 1. [Original \\[Title\\]](<https://example.com/a_(b)>)\n\nexample.com\n\n要約です。\n\n- ポイント1\n- ポイント2\n\n**🏷️ タグ:** `#ts`",
    );
    expect(markdown).not.toContain("🎯");
  });

  it("要約がない記事は抜粋を出力する", () => {
    expect(markdown).toContain("## 2. [No Summary](<https://example.com/b>)\n\nexample.com\n\n抜粋です");
  });

  it("最後に使用量を出力する", () => {
    expect(markdown.endsWith("---\n\n*🤖 Claude Code 使用量: claude-sonnet-5・3 回呼び出し・API 換算で約 $0.50(サブスクリプションの枠内のため実際の請求はありません)*\n")).toBe(true);
  });
});

describe("digestFilePath", () => {
  it("年ごとのディレクトリに日付ファイル名で置く", () => {
    expect(digestFilePath("digests", "2026-09-27")).toBe("digests/2026/2026-09-27.md");
  });
});
