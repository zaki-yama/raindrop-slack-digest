import { isValidDate } from "./dates.js";

export interface Config {
  raindropToken: string;
  slackWebhookUrl: string;
  collectionId: number;
  tag: string | undefined;
  /** 対象日(日本時間, YYYY-MM-DD)。未指定なら実行日の前日 */
  digestDate: string | undefined;
  maxArticles: number;
  dryRun: boolean;
  /** 対象日の Markdown がすでにあれば(= 配信済みなら)何もしない */
  skipIfExists: boolean;
}

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

function integer(name: string, env: NodeJS.ProcessEnv, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`環境変数 ${name} は整数で指定してください: ${raw}`);
  return value;
}

function optionalDate(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const raw = env[name];
  if (!raw) return undefined;
  if (!isValidDate(raw)) throw new Error(`環境変数 ${name} は YYYY-MM-DD 形式で指定してください: ${raw}`);
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dryRun = env.DRY_RUN === "1" || env.DRY_RUN === "true";
  if (env.ANTHROPIC_API_KEY) {
    // Claude Code は ANTHROPIC_API_KEY があるとサブスクリプションより優先して使い、API の従量課金になる
    console.warn("ANTHROPIC_API_KEY が設定されているため、Claude Code は API キー(従量課金)で動きます");
  }
  return {
    raindropToken: required("RAINDROP_TOKEN", env),
    slackWebhookUrl: dryRun ? (env.SLACK_WEBHOOK_URL ?? "") : required("SLACK_WEBHOOK_URL", env),
    collectionId: integer("RAINDROP_COLLECTION_ID", env, 0),
    tag: env.RAINDROP_TAG || undefined,
    digestDate: optionalDate("DIGEST_DATE", env),
    maxArticles: integer("MAX_ARTICLES", env, 20),
    dryRun,
    skipIfExists: env.SKIP_IF_EXISTS === "1" || env.SKIP_IF_EXISTS === "true",
  };
}
