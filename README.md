# raindrop-slack-digest

[Raindrop.io](https://raindrop.io) にストックした技術記事を Claude で要約し、ニュースレター形式で Slack に投稿する Bot です。
毎朝 7:00 JST に前日分を GitHub Actions で配信するので、サーバーは不要です(起動には無料の外部定期実行サービスを使います)。
配信した内容は Markdown としてこのリポジトリの [`digests/`](digests/) にもコミットされ、あとから読み返せます。

## 仕組み

1. Raindrop API から前日(日本時間の 0:00〜24:00)に追加したブックマークを取得(コレクション・タグで絞り込み可)
2. 各記事の URL から本文を取得し、[Readability](https://github.com/mozilla/readability) で本文テキストを抽出
   - 取得できなかった場合は Raindrop の抜粋(excerpt)・メモを使用
3. Claude Code(`claude -p`)で記事ごとに、Slack 用の短い版(一言要約＋見出し語付きの3点)と Markdown 用の詳しい版(概要＋3〜5点のポイント)を日本語で生成(JSON Schema による構造化出力)
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
1. Bun v1.3 Release Notes            ← 記事の原題(リンク)
   一言要約(1文)
   • *見出し語*: ポイント1
   • *見出し語*: ポイント2
   • *見出し語*: ポイント3
🔗 bun.sh | 🏷️ #javascript
────────────
…
📝 GitHub で読む  |  🤖 Claude Code 使用量: claude-sonnet-5・4 回呼び出し・API 換算で約 $0.35
```

## セットアップ

### 1. 各種トークンを用意する

| 名前 | 取得方法 |
| --- | --- |
| `RAINDROP_TOKEN` | Raindrop の [Integrations 設定](https://app.raindrop.io/settings/integrations) でアプリを作成し、「Test token」を発行 |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code をインストールしたマシンで `claude setup-token` を実行して発行(Claude の Pro / Max プランが必要) |
| `SLACK_WEBHOOK_URL` | Slack App を作成して [Incoming Webhooks](https://api.slack.com/messaging/webhooks) を有効化し、投稿先チャンネルの Webhook URL を発行 |

### 2. GitHub リポジトリに登録する

- **Settings → Secrets and variables → Actions → Secrets** に `RAINDROP_TOKEN` / `CLAUDE_CODE_OAUTH_TOKEN` / `SLACK_WEBHOOK_URL` を登録
- 必要に応じて **Variables** に以下を登録(未設定ならデフォルト値)

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `RAINDROP_COLLECTION_ID` | `0` | 対象コレクション ID。`0` は全コレクション(ゴミ箱を除く)。コレクションを開いたときの URL 末尾の数字 |
| `RAINDROP_TAG` | なし | 指定したタグが付いた記事だけを対象にする(例: `tech`) |
| `MAX_ARTICLES` | `20` | 1 回に紹介する最大件数 |
| `ANTHROPIC_MODEL` | Claude Code の既定 | 要約に使うモデル(`sonnet` / `opus` などのエイリアスも可)。利用枠を節約したい場合は `sonnet` |

### 3. 動作確認

Actions タブの **Raindrop Slack Digest** → **Run workflow** から手動実行できます。

- `date`: 対象日を `YYYY-MM-DD`(日本時間)で指定します。空なら前日です。配信に失敗した日の再実行や、過去分の作成に使えます
- `dry_run`: Slack への投稿も Markdown のコミットもせず、生成した Markdown と Block Kit JSON をログに出力します
  (JSON を [Block Kit Builder](https://app.slack.com/block-kit-builder) に貼るとプレビューできます)

### 4. 毎朝 7:00 に配信する

GitHub Actions の定期実行(`schedule`)は、混雑すると数時間遅れることがあります(実際に 7:00 指定で 9〜10 時台に起動していました)。
そこで、無料の外部定期実行サービス [cron-job.org](https://cron-job.org/) から毎朝 7:00 にワークフローを起動します。

ワークフローの `schedule`(9:13 JST)は、外部サービスが止まったときの保険として残しています。
その日のダイジェストがすでに配信済み(`digests/` に Markdown がある)なら何もしないので、二重に投稿されることはありません。

#### 4-1. GitHub のトークンを発行する

1. GitHub の [Fine-grained personal access tokens](https://github.com/settings/personal-access-tokens/new) を開く
2. 次のように設定して発行する
   - **Token name**: `raindrop-slack-digest trigger` など
   - **Expiration**: 任意(最長 1 年。期限が切れると配信が止まるので、カレンダー等で更新を忘れないように)
   - **Repository access**: *Only select repositories* → `raindrop-slack-digest`
   - **Permissions** → **Repository permissions** → **Actions**: *Read and write*(他は不要)
3. 表示されたトークン(`github_pat_...`)を控える

#### 4-2. cron-job.org にジョブを登録する

1. [cron-job.org](https://cron-job.org/) に無料登録し、**CREATE CRONJOB** を開く
2. **COMMON** タブ
   - **URL**: `https://api.github.com/repos/zaki-yama/raindrop-slack-digest/actions/workflows/digest.yml/dispatches`
   - **Execution schedule**: *Every day at* `7:00`
   - タイムゾーンが `Asia/Tokyo` になっていることを確認(右上のアカウント設定、またはジョブの **ADVANCED** タブ)
3. **ADVANCED** タブ
   - **Request method**: `POST`
   - **Headers**:
     | Key | Value |
     | --- | --- |
     | `Authorization` | `Bearer <4-1 のトークン>` |
     | `Accept` | `application/vnd.github+json` |
     | `X-GitHub-Api-Version` | `2022-11-28` |
   - **Request body**: `{"ref":"main"}`
4. 保存後、**TEST RUN** を実行して、レスポンスが `204 No Content` になり、GitHub の Actions タブにワークフローの実行が現れることを確認する

> TEST RUN は実際に前日分を配信します。試すだけなら、Request body を一時的に `{"ref":"main","inputs":{"dry_run":"true"}}` にすると Slack への投稿とコミットをしません(確認後に元に戻してください)。

### 補足

- 配信時刻は、外部の定期実行サービス側の設定で変えられます(上記「4. 毎朝 7:00 に配信する」)
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

- 記事本文を取得できなかった場合は、Raindrop の抜粋をもとに日本語で一言だけ紹介し、箇条書きは付けずに「⚠️ 本文を取得できなかったため、抜粋をもとにした紹介です」と注記します
- 本文は取得できたが要約に失敗した場合(モデルの拒否など)は、抜粋を載せて「⚠️ 要約を生成できなかったため、抜粋のみ掲載しています」と注記します
- ただし Claude Code の認証エラーや利用上限など、Claude Code 自体が失敗したときは抜粋だけの不完全なダイジェストを配信せず、ジョブを失敗させます(Slack 投稿・Markdown のコミットもしません)
- 要約は Claude API ではなく Claude Code の CLI で行うので、API の従量課金はかからず、Claude のサブスクリプションの利用枠を消費します(普段の Claude / Claude Code の利用と枠を共有します)
- `ANTHROPIC_API_KEY` が設定されていると Claude Code はそちらを優先して従量課金になるので、Secrets には登録しないでください
- 記事本文には外部の文章が含まれるため、Claude Code はツールをすべて無効にした状態で実行しています
- 本文が非常に長い記事は先頭 60,000 文字だけを要約に使います
- 投稿の最後の使用量は Claude Code が報告する API 定価での換算額です。サブスクリプションで動かしている場合、実際には請求されません
