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
  /** 記事本文を取得できたか。取得できなかった記事は箇条書きを出さず、その旨を明示する */
  bodyFetched: boolean;
  /** 本文から作った要約。本文を取得できなかった場合や要約に失敗した場合は undefined */
  summary?: ArticleSummary;
  /** 本文を取得できなかった記事について、抜粋から作った日本語の一言紹介 */
  excerptTldr?: string;
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
  /** GitHub 上の Markdown 版の URL */
  archiveUrl?: string;
}

/** フッターに載せる Claude Code の使用量の説明 */
export function formatUsage(usage: DigestUsage): string {
  const models = usage.models.length > 0 ? `${usage.models.join(", ")}・` : "";
  return `Claude Code 使用量: ${models}${usage.calls} 回呼び出し・API 換算で約 $${usage.costUsd.toFixed(2)}`;
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

/** 要約付きで紹介できなかった記事に添える注記。正常に要約できた記事は undefined */
export function entryNotice(entry: DigestEntry): string | undefined {
  if (!entry.bodyFetched) return "⚠️ 本文を取得できなかったため、抜粋をもとにした紹介です";
  if (!entry.summary) return "⚠️ 要約を生成できなかったため、抜粋のみ掲載しています";
  return undefined;
}

/** 要約がない記事に載せる一文(抜粋からの日本語紹介、なければ抜粋そのもの) */
export function fallbackText(entry: DigestEntry): string | undefined {
  return entry.excerptTldr ?? (entry.excerpt || undefined);
}

export function buildEntryBlocks(entry: DigestEntry, index: number): Block[] {
  const { summary } = entry;
  const lines = [`*${index + 1}. ${link(entry.url, entry.title)}*`];
  if (summary) {
    // Slack には短い版(一言要約 + 見出し語付きの3点)だけを載せ、詳しい版は GitHub の Markdown に残す
    lines.push(escapeMrkdwn(summary.tldr));
    lines.push(...summary.highlights.map((h) => `• *${escapeMrkdwn(h.label)}*: ${escapeMrkdwn(h.text)}`));
  } else {
    const text = fallbackText(entry);
    if (text) lines.push(escapeMrkdwn(text));
  }
  const notice = entryNotice(entry);
  if (notice) lines.push(`_${escapeMrkdwn(notice)}_`);

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
  const footer: string[] = [];
  if (digest.archiveUrl) footer.push(`📝 ${link(digest.archiveUrl, "GitHub で読む")}`);
  if (digest.usage) footer.push(`🤖 ${escapeMrkdwn(formatUsage(digest.usage))}`);
  if (footer.length > 0) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: footer.join("  |  ") }] });
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
