import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatDate, type Digest, type DigestEntry } from "./slack.js";

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
  const heading = singleLine(summary?.headline ?? entry.title);
  const lines = [`## ${index + 1}. [${escapeLinkText(heading)}](<${entry.url}>)`, ""];

  if (summary) {
    lines.push(`*${singleLine(entry.title)}* — ${entry.domain}`, "", summary.summary, "");
    if (summary.key_points.length > 0) {
      lines.push(...summary.key_points.map((p) => `- ${singleLine(p)}`), "");
    }
    if (summary.recommended_for) lines.push(`**🎯 こんな人におすすめ:** ${singleLine(summary.recommended_for)}  `);
  } else {
    lines.push(entry.domain, "");
    if (entry.excerpt) lines.push(entry.excerpt, "");
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
