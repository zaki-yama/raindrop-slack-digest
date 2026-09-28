import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "./config.js";
import { dayRangeJst, previousDateJst } from "./dates.js";
import { clip, extractArticle } from "./extract.js";
import { buildDigestMarkdown, writeDigestMarkdown } from "./markdown.js";
import { fetchRecentRaindrops, type Raindrop } from "./raindrop.js";
import { buildDigestBlocks, buildFallbackText, postToSlack, splitIntoMessages, type DigestEntry } from "./slack.js";
import { Summarizer } from "./summarize.js";

const CONCURRENCY = 3;
const OUTPUT_DIR = "digests";

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 認証エラーやクレジット不足など、リクエストを変えても解消しない API エラーか。
 * これらは全記事で同じように失敗するので、抜粋だけの不完全なダイジェストを配信せずに処理を止める。
 * (429 や 5xx は SDK が自動でリトライし、それでも失敗した記事だけ抜粋にフォールバックする)
 */
function isFatalApiError(error: unknown): boolean {
  return (
    error instanceof Anthropic.APIError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

async function buildEntry(summarizer: Summarizer, item: Raindrop): Promise<DigestEntry> {
  const entry: DigestEntry = {
    title: item.title,
    url: item.link,
    domain: item.domain,
    tags: item.tags,
    excerpt: item.excerpt,
  };

  const extracted = await extractArticle(item.link);
  const fallbackBody = [item.excerpt, item.note].filter(Boolean).join("\n\n");
  if (!extracted && !fallbackBody) {
    console.warn(`本文も抜粋も取得できなかったため要約をスキップ: ${item.link}`);
    return entry;
  }
  if (extracted?.truncated) {
    console.warn(`本文が長いため先頭 ${extracted.text.length} 文字のみ要約に使用: ${item.link}`);
  }

  try {
    const summary = await summarizer.summarizeArticle({
      title: item.title,
      url: item.link,
      domain: item.domain,
      tags: item.tags,
      note: item.note,
      body: extracted?.text ?? clip(fallbackBody).text,
      bodyIsExcerptOnly: !extracted,
    });
    if (summary) entry.summary = summary;
    else console.warn(`要約を生成できませんでした(抜粋を掲載します): ${item.link}`);
  } catch (error) {
    if (isFatalApiError(error)) throw error;
    console.warn(`要約中にエラーが発生しました(抜粋を掲載します): ${item.link}`, error);
  }
  return entry;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const date = config.digestDate ?? previousDateJst(new Date());
  const { since, until } = dayRangeJst(date);

  const raindrops = await fetchRecentRaindrops({
    token: config.raindropToken,
    collectionId: config.collectionId,
    since,
    until,
    tag: config.tag,
    limit: config.maxArticles,
  });
  console.log(`${date}(JST)のブックマーク: ${raindrops.length} 件`);

  if (raindrops.length === 0) {
    console.log("紹介する記事がないため投稿をスキップします");
    return;
  }

  const summarizer = new Summarizer(new Anthropic(), config.model);
  const entries = await mapWithConcurrency(raindrops, CONCURRENCY, (item) => buildEntry(summarizer, item));

  let intro: string | null = null;
  try {
    intro = await summarizer.writeIntro(
      entries.map((e) => ({ title: e.title, headline: e.summary?.headline ?? e.title })),
    );
  } catch (error) {
    if (isFatalApiError(error)) throw error;
    console.warn("導入文の生成に失敗しました(導入文なしで投稿します)", error);
  }

  const digest = { date, intro, entries };
  const messages = splitIntoMessages(buildDigestBlocks(digest));

  if (config.dryRun) {
    console.log(buildDigestMarkdown(digest));
    console.log(JSON.stringify(messages, null, 2));
    return;
  }

  // Slack への投稿が失敗してもアーカイブは残るよう、先にファイルへ書き出す
  const filePath = await writeDigestMarkdown(OUTPUT_DIR, digest);
  console.log(`Markdown を書き出しました: ${filePath}`);

  await postToSlack(config.slackWebhookUrl, buildFallbackText(digest), messages);
  console.log(`Slack に投稿しました(${messages.length} メッセージ)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
