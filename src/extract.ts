import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const FETCH_TIMEOUT_MS = 20_000;
/** 要約に渡す本文の上限文字数。長大なページでもコストが跳ねないようにする */
export const MAX_CONTENT_CHARS = 60_000;

export interface ExtractedArticle {
  text: string;
  truncated: boolean;
}

/**
 * 記事 URL を取得して本文テキストを抽出する。
 * 取得や抽出に失敗した場合は null を返し、呼び出し側で Raindrop の抜粋にフォールバックする。
 */
export async function extractArticle(url: string): Promise<ExtractedArticle | null> {
  let html: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; raindrop-slack-digest/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const text = htmlToArticleText(html);
  if (!text) return null;
  return clip(text);
}

export function htmlToArticleText(html: string): string | null {
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    const text = normalizeWhitespace(article?.textContent ?? "");
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clip(text: string): ExtractedArticle {
  if (text.length <= MAX_CONTENT_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_CONTENT_CHARS), truncated: true };
}
