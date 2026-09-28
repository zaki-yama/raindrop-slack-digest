export interface Config {
  raindropToken: string;
  slackWebhookUrl: string;
  collectionId: number;
  tag: string | undefined;
  digestDays: number;
  maxArticles: number;
  model: string;
  dryRun: boolean;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dryRun = env.DRY_RUN === "1" || env.DRY_RUN === "true";
  // ANTHROPIC_API_KEY は SDK が環境変数から直接読むので、ここでは存在チェックだけ行う
  required("ANTHROPIC_API_KEY", env);
  return {
    raindropToken: required("RAINDROP_TOKEN", env),
    slackWebhookUrl: dryRun ? (env.SLACK_WEBHOOK_URL ?? "") : required("SLACK_WEBHOOK_URL", env),
    collectionId: integer("RAINDROP_COLLECTION_ID", env, 0),
    tag: env.RAINDROP_TAG || undefined,
    digestDays: integer("DIGEST_DAYS", env, 7),
    maxArticles: integer("MAX_ARTICLES", env, 20),
    model: env.ANTHROPIC_MODEL || "claude-opus-5",
    dryRun,
  };
}
