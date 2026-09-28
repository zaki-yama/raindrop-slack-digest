import { describe, expect, it } from "vitest";
import { buildDigestMarkdown, digestFilePath } from "../src/markdown.js";

describe("buildDigestMarkdown", () => {
  const markdown = buildDigestMarkdown({
    date: "2026-09-27",
    intro: "今日は TypeScript の話題です。\n2行目",
    entries: [
      {
        title: "Original [Title]", url: "https://example.com/a_(b)", domain: "example.com", tags: ["ts"], excerpt: "",
        summary: { headline: "見出し [1]", summary: "要約です。", key_points: ["ポイント1", "ポイント2"], recommended_for: "TS 使い" },
      },
      { title: "No Summary", url: "https://example.com/b", domain: "example.com", tags: [], excerpt: "抜粋です" },
    ],
  });

  it("タイトルと導入文を出力する", () => {
    expect(markdown).toMatch(/^# 📚 Tech Digest 2026\/09\/27\n/);
    expect(markdown).toContain("記事 2 本");
    expect(markdown).toContain("> 今日は TypeScript の話題です。\n> 2行目");
  });

  it("要約付きの記事を見出し・要約・箇条書きで出力する", () => {
    expect(markdown).toContain("## 1. [見出し \\[1\\]](<https://example.com/a_(b)>)");
    expect(markdown).toContain("*Original [Title]* — example.com");
    expect(markdown).toContain("- ポイント1\n- ポイント2");
    expect(markdown).toContain("**🎯 こんな人におすすめ:** TS 使い");
    expect(markdown).toContain("**🏷️ タグ:** `#ts`");
  });

  it("要約がない記事は元タイトルと抜粋を出力する", () => {
    expect(markdown).toContain("## 2. [No Summary](<https://example.com/b>)\n\nexample.com\n\n抜粋です");
    expect(markdown.endsWith("抜粋です\n")).toBe(true);
  });
});

describe("digestFilePath", () => {
  it("年ごとのディレクトリに日付ファイル名で置く", () => {
    expect(digestFilePath("digests", "2026-09-27")).toBe("digests/2026/2026-09-27.md");
  });
});
