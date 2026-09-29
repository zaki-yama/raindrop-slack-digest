import type { ArticleSummary } from "./summarize.js";

/** Slack の1メッセージあたりのブロック数上限 */
const MAX_BLOCKS_PER_MESSAGE = 50;
/** section ブロックの text の上限 */
const MAX_SECTION_TEXT = 3000;

export type Block = Record<string, unknown>;

export interface DigestEntry {
  title: string;
  url: string;
  domain: string;
  tags: string[];
  /** 要約に失敗した場合は undefined(抜粋だけ載せる) */
  summary?: ArticleSummary;
  excerpt: string;
}

export interface DigestUsage {
  /** Claude Code の呼び出し回数 */
  calls: number;
  /** API の定価で換算したコスト(USD)。サブスクリプション利用時は実際には請求されない */
  costUsd: number;
  models: string[];
}

export interface Digest {
  /** 対象日(日本時間, YYYY-MM-DD) */
  date: string;
  intro: string | null;
  entries: DigestEntry[];
  usage?: DigestUsage;
}

/** フッターに載せる Claude Code の使用量の説明 */
export function formatUsage(usage: DigestUsage): string {
  const models = usage.models.length > 0 ? `${usage.models.join(", ")}・` : "";
  return `Claude Code 使用量: ${models}${usage.calls} 回呼び出し・API 換算で約 $${usage.costUsd.toFixed(2)}(サブスクリプションの枠内のため実際の請求はありません)`;
}

/** Slack mrkdwn の制御文字をエスケープする */
export function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function link(url: string, label: string): string {
  // リンクラベル内の "|" は区切り文字として解釈されるので置き換える
  return `<${url}|${escapeMrkdwn(label).replace(/\|/g, "│")}>`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** YYYY-MM-DD を YYYY/MM/DD にする */
export function formatDate(date: string): string {
  return date.replaceAll("-", "/");
}

export function buildEntryBlocks(entry: DigestEntry, index: number): Block[] {
  const { summary } = entry;
  const lines = [`*${index + 1}. ${link(entry.url, entry.title)}*`];
  if (summary) {
    lines.push(escapeMrkdwn(summary.summary));
    if (summary.key_points.length > 0) {
      lines.push("", ...summary.key_points.map((p) => `• ${escapeMrkdwn(p)}`));
    }
  } else if (entry.excerpt) {
    lines.push(escapeMrkdwn(entry.excerpt));
  }

  const context: string[] = [`🔗 ${escapeMrkdwn(entry.domain)}`];
  if (entry.tags.length > 0) context.push(`🏷️ ${entry.tags.map((t) => `#${escapeMrkdwn(t)}`).join(" ")}`);

  return [
    { type: "section", text: { type: "mrkdwn", text: truncate(lines.join("\n"), MAX_SECTION_TEXT) } },
    { type: "context", elements: [{ type: "mrkdwn", text: truncate(context.join("  |  "), MAX_SECTION_TEXT) }] },
    { type: "divider" },
  ];
}

export function buildDigestBlocks(digest: Digest): Block[] {
  const blocks: Block[] = [
    { type: "header", text: { type: "plain_text", text: `📚 Tech Digest ${formatDate(digest.date)}`, emoji: true } },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${formatDate(digest.date)} に Raindrop へストックした記事 ${digest.entries.length} 本を紹介します`,
        },
      ],
    },
  ];
  if (digest.intro) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(escapeMrkdwn(digest.intro), MAX_SECTION_TEXT) } });
  }
  blocks.push({ type: "divider" });
  digest.entries.forEach((entry, i) => blocks.push(...buildEntryBlocks(entry, i)));
  if (digest.usage) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `🤖 ${escapeMrkdwn(formatUsage(digest.usage))}` }] });
  }
  return blocks;
}

/**
 * ブロック上限を超えないようにメッセージを分割する。
 * 記事単位(section + context + divider)が途中で切れないよう、記事の区切りで分ける。
 */
export function splitIntoMessages(blocks: Block[]): Block[][] {
  const messages: Block[][] = [];
  let current: Block[] = [];
  let pending: Block[] = [];

  const flushPending = () => {
    if (current.length + pending.length > MAX_BLOCKS_PER_MESSAGE) {
      messages.push(current);
      current = [];
    }
    current.push(...pending);
    pending = [];
  };

  for (const block of blocks) {
    pending.push(block);
    if (block.type === "divider") flushPending();
  }
  if (pending.length > 0) flushPending();
  if (current.length > 0) messages.push(current);
  return messages;
}

export function buildFallbackText(digest: Digest): string {
  return `📚 Tech Digest ${formatDate(digest.date)}: ${digest.entries.length} 本の記事`;
}

export async function postToSlack(webhookUrl: string, text: string, messages: Block[][]): Promise<void> {
  for (const blocks of messages) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks, unfurl_links: false, unfurl_media: false }),
    });
    if (!res.ok) {
      throw new Error(`Slack への投稿に失敗しました: ${res.status} ${await res.text()}`);
    }
  }
}
