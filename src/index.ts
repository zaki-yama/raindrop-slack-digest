import { loadConfig } from "./config.js";
import { dayRangeJst, previousDateJst } from "./dates.js";
import { clip, extractArticle } from "./extract.js";
import { buildDigestMarkdown, digestFilePath, githubFileUrl, writeDigestMarkdown } from "./markdown.js";
import { fetchRecentRaindrops, type Raindrop } from "./raindrop.js";
import { buildDigestBlocks, buildFallbackText, postToSlack, splitIntoMessages, type Digest, type DigestEntry } from "./slack.js";
import { ClaudeUsage, summarizeArticle, writeIntro } from "./summarize.js";

/** 同時に動かす Claude Code の数。サブスクリプションの利用上限に配慮して控えめにする */
const CONCURRENCY = 2;
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

async function buildEntry(item: Raindrop, usage: ClaudeUsage): Promise<DigestEntry> {
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

  // Claude Code 自体の失敗(認証エラー・利用上限など)は全記事で起きうるので、
  // 抜粋だけの不完全なダイジェストを配信しないよう、ここでは捕まえずに処理全体を止める
  const summary = await summarizeArticle({
    title: item.title,
    url: item.link,
    domain: item.domain,
    tags: item.tags,
    note: item.note,
    body: extracted?.text ?? clip(fallbackBody).text,
    bodyIsExcerptOnly: !extracted,
  }, usage);
  if (summary) entry.summary = summary;
  else console.warn(`要約を生成できませんでした(抜粋を掲載します): ${item.link}`);
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

  const usage = new ClaudeUsage();
  const entries = await mapWithConcurrency(raindrops, CONCURRENCY, (item) => buildEntry(item, usage));
  const intro = await writeIntro(entries.map((e) => ({ title: e.title, summary: e.summary?.summary })), usage);

  const filePath = digestFilePath(OUTPUT_DIR, date);
  const digest: Digest = {
    date,
    intro,
    entries,
    usage: { calls: usage.calls, costUsd: usage.costUsd, models: [...usage.models] },
    archiveUrl: githubFileUrl(filePath),
  };
  const messages = splitIntoMessages(buildDigestBlocks(digest));

  if (config.dryRun) {
    console.log(buildDigestMarkdown(digest));
    console.log(JSON.stringify(messages, null, 2));
    return;
  }

  // Slack への投稿が失敗してもアーカイブは残るよう、先にファイルへ書き出す
  await writeDigestMarkdown(filePath, digest);
  console.log(`Markdown を書き出しました: ${filePath}`);

  await postToSlack(config.slackWebhookUrl, buildFallbackText(digest), messages);
  console.log(`Slack に投稿しました(${messages.length} メッセージ)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
