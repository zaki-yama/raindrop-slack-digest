import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { entryNotice, fallbackText, formatDate, formatUsage, type Digest, type DigestEntry } from "./slack.js";

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
  } else {
    const text = fallbackText(entry);
    if (text) lines.push(text, "");
  }
  const notice = entryNotice(entry);
  if (notice) lines.push(`*${notice}*`, "");
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

/**
 * GitHub Actions 上で実行している場合、コミットされる Markdown の GitHub 上の URL を返す。
 * ワークフローは実行したブランチ(通常はデフォルトブランチ)にコミットする。
 */
export function githubFileUrl(filePath: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_REF_NAME } = env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_REF_NAME) return undefined;
  const encodedPath = filePath.split(path.sep).map(encodeURIComponent).join("/");
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/blob/${encodeURIComponent(GITHUB_REF_NAME)}/${encodedPath}`;
}

export async function writeDigestMarkdown(filePath: string, digest: Digest): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buildDigestMarkdown(digest), "utf8");
}
