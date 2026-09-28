import { describe, expect, it } from "vitest";
import { clip, htmlToArticleText, MAX_CONTENT_CHARS } from "../src/extract.js";

describe("htmlToArticleText", () => {
  it("ナビゲーション等を除いた本文を抽出する", () => {
    const paragraph = "TypeScript 7 では型チェッカーがネイティブ実装になり、大規模プロジェクトでのビルド時間が大きく短縮されました。".repeat(5);
    const html = `<html><head><title>T</title></head><body>
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <article><h1>TypeScript 7 の紹介</h1><p>${paragraph}</p><p>${paragraph}</p></article>
      <footer>© example</footer></body></html>`;
    const text = htmlToArticleText(html);
    expect(text).toContain("ネイティブ実装");
    expect(text).not.toContain("About");
  });
});

describe("clip", () => {
  it("上限を超える本文を切り詰めて truncated を立てる", () => {
    const result = clip("a".repeat(MAX_CONTENT_CHARS + 10));
    expect(result.text).toHaveLength(MAX_CONTENT_CHARS);
    expect(result.truncated).toBe(true);
  });
});
