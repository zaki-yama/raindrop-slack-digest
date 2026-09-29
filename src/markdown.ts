import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatDate, formatUsage, type Digest, type DigestEntry } from "./slack.js";

/** リンクテキスト内で Markdown の構文として解釈される角括弧をエスケープする */
function escapeLinkText(text: string): string {
  return text.replace(/([\[\]\\])/g, "\\$1");
}

/** 1行に収めたいテキスト(タイトルなど)の改行を空白にする */
function singleLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

function renderEntry(entry: DigestEntry, index: number): string {
  const { summary } = entry;
  const lines = [`## ${index + 1}. [${escapeLinkText(singleLine(entry.title))}](<${entry.url}>)`, "", entry.domain, ""];

  if (summary) {
    lines.push(summary.summary, "");
    if (summary.key_points.length > 0) {
      lines.push(...summary.key_points.map((p) => `- ${singleLine(p)}`), "");
    }
  } else if (entry.excerpt) {
    lines.push(entry.excerpt, "");
  }
  if (entry.tags.length > 0) lines.push(`**🏷️ タグ:** ${entry.tags.map((t) => `\`#${t}\``).join(" ")}`);

  return lines.join("\n").trimEnd();
}

export function buildDigestMarkdown(digest: Digest): string {
  const parts = [
    `# 📚 Tech Digest ${formatDate(digest.date)}`,
    `${formatDate(digest.date)} に Raindrop へストックした記事 ${digest.entries.length} 本`,
  ];
  if (digest.intro) parts.push(digest.intro.split("\n").map((line) => `> ${line}`).join("\n"));
  parts.push(...digest.entries.map(renderEntry));
  if (digest.usage) parts.push("---", `*🤖 ${formatUsage(digest.usage)}*`);
  return `${parts.join("\n\n")}\n`;
}

/** digests/YYYY/YYYY-MM-DD.md */
export function digestFilePath(outputDir: string, date: string): string {
  return path.join(outputDir, date.slice(0, 4), `${date}.md`);
}

export async function writeDigestMarkdown(outputDir: string, digest: Digest): Promise<string> {
  const filePath = digestFilePath(outputDir, digest.date);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buildDigestMarkdown(digest), "utf8");
  return filePath;
}
