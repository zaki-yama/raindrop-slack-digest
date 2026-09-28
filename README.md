# raindrop-slack-digest

[Raindrop.io](https://raindrop.io) にストックした技術記事を Claude で要約し、ニュースレター形式で Slack に投稿する Bot です。
GitHub Actions で毎日 9:00 JST に前日分を配信するので、サーバーは不要です。
配信した内容は Markdown としてこのリポジトリの [`digests/`](digests/) にもコミットされ、あとから読み返せます。

## 仕組み

1. Raindrop API から前日(日本時間の 0:00〜24:00)に追加したブックマークを取得(コレクション・タグで絞り込み可)
2. 各記事の URL から本文を取得し、[Readability](https://github.com/mozilla/readability) で本文テキストを抽出
   - 取得できなかった場合は Raindrop の抜粋(excerpt)・メモを使用
3. Claude API で記事ごとに「見出し・要約・ポイント・おすすめ読者」を日本語で生成(Structured Outputs)
4. 今号全体の導入文を生成
5. `digests/YYYY/YYYY-MM-DD.md` に Markdown 版を書き出す
6. Slack Incoming Webhook に Block Kit で投稿(50 ブロックを超える場合は記事の区切りで分割)
7. ワークフローが Markdown をデフォルトブランチにコミット・push

前日にストックした記事がない日は、投稿もコミットもしません。

投稿イメージ:

```
📚 Tech Digest 2026/09/27
2026/09/27 に Raindrop へストックした記事 3 本を紹介します
今日はランタイムと型システムの話題が中心です。…
────────────
1. Bun 1.3 で何が変わったか            ← 記事へのリンク
   _Original Article Title_
   記事の要約(3〜4文)
   • ポイント1
   • ポイント2
🔗 example.com | 🎯 Node.js からの移行を検討している人 | 🏷️ #javascript
────────────
…
```

## セットアップ

### 1. 各種トークンを用意する

| 名前 | 取得方法 |
| --- | --- |
| `RAINDROP_TOKEN` | Raindrop の [Integrations 設定](https://app.raindrop.io/settings/integrations) でアプリを作成し、「Test token」を発行 |
| `ANTHROPIC_API_KEY` | [Claude Console](https://console.anthropic.com/) で API キーを発行 |
| `SLACK_WEBHOOK_URL` | Slack App を作成して [Incoming Webhooks](https://api.slack.com/messaging/webhooks) を有効化し、投稿先チャンネルの Webhook URL を発行 |

### 2. GitHub リポジトリに登録する

- **Settings → Secrets and variables → Actions → Secrets** に `RAINDROP_TOKEN` / `ANTHROPIC_API_KEY` / `SLACK_WEBHOOK_URL` を登録
- 必要に応じて **Variables** に以下を登録(未設定ならデフォルト値)

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `RAINDROP_COLLECTION_ID` | `0` | 対象コレクション ID。`0` は全コレクション(ゴミ箱を除く)。コレクションを開いたときの URL 末尾の数字 |
| `RAINDROP_TAG` | なし | 指定したタグが付いた記事だけを対象にする(例: `tech`) |
| `MAX_ARTICLES` | `20` | 1 回に紹介する最大件数 |
| `ANTHROPIC_MODEL` | `claude-opus-5` | 要約に使うモデル。コストを抑えたい場合は `claude-sonnet-5` など |

### 3. 動作確認

Actions タブの **Raindrop Slack Digest** → **Run workflow** から手動実行できます。

- `date`: 対象日を `YYYY-MM-DD`(日本時間)で指定します。空なら前日です。配信に失敗した日の再実行や、過去分の作成に使えます
- `dry_run`: Slack への投稿も Markdown のコミットもせず、生成した Markdown と Block Kit JSON をログに出力します
  (JSON を [Block Kit Builder](https://app.slack.com/block-kit-builder) に貼るとプレビューできます)

### 補足

- 配信時刻を変えたい場合は `.github/workflows/digest.yml` の `cron` を編集してください(UTC 表記)。GitHub Actions の定期実行は混雑時に数分〜数十分遅れることがあります
- Markdown はワークフローがデフォルトブランチへ直接 push します(`permissions: contents: write`)。ブランチ保護で直接 push を禁止している場合は、`github-actions[bot]` を許可するなどの設定が必要です
- Slack への投稿に失敗した場合も、書き出せた Markdown はコミットされます(ジョブは失敗扱いになります)

## ローカルで実行する

```sh
npm install
cp .env.example .env   # 値を埋める
node --env-file=.env --import tsx src/index.ts            # digests/ に書き出して Slack に投稿
DRY_RUN=1 node --env-file=.env --import tsx src/index.ts  # 投稿・書き出しをせず結果を出力
```

## 開発

```sh
npm run typecheck
npm test
```

## メモ

- 記事の要約に失敗した場合(本文取得失敗・モデルの拒否など)も、その記事は Raindrop の抜粋付きで掲載されます
- ただし API キーの誤りやクレジット不足など、全記事で失敗するエラーのときは抜粋だけの不完全なダイジェストを配信せず、ジョブを失敗させます(Slack 投稿・Markdown のコミットもしません)
- Claude の安全性フィルタで要約が拒否された場合に備えて、サーバー側フォールバック(`fallbacks: "default"`、beta)を有効にしています
- 本文が非常に長い記事は先頭 60,000 文字だけを要約に使います
