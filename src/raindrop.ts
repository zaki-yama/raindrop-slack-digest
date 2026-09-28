const API_BASE = "https://api.raindrop.io/rest/v1";
const PER_PAGE = 50;
const MAX_PAGES = 20;

export interface Raindrop {
  _id: number;
  title: string;
  excerpt: string;
  note: string;
  link: string;
  domain: string;
  tags: string[];
  created: string;
  cover?: string;
}

interface RaindropsResponse {
  result: boolean;
  items: Raindrop[];
  count: number;
}

export interface FetchOptions {
  token: string;
  collectionId: number;
  since: Date;
  tag?: string;
  limit: number;
}

/**
 * 指定日時以降に作成されたブックマークを新しい順に取得する。
 * `sort=-created` で取得し、`since` より古いものが出てきた時点でページングを打ち切る。
 */
export async function fetchRecentRaindrops(opts: FetchOptions): Promise<Raindrop[]> {
  const collected: Raindrop[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API_BASE}/raindrops/${opts.collectionId}`);
    url.searchParams.set("sort", "-created");
    url.searchParams.set("perpage", String(PER_PAGE));
    url.searchParams.set("page", String(page));
    if (opts.tag) url.searchParams.set("search", `#${opts.tag}`);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${opts.token}` } });
    if (!res.ok) {
      throw new Error(`Raindrop API エラー: ${res.status} ${res.statusText} - ${await res.text()}`);
    }
    const body = (await res.json()) as RaindropsResponse;

    const { fresh, reachedOlder } = takeSince(body.items, opts.since);
    collected.push(...fresh);

    if (collected.length >= opts.limit) return collected.slice(0, opts.limit);
    if (reachedOlder || body.items.length < PER_PAGE) break;
  }

  return collected;
}

/** 新しい順に並んだ items から `since` 以降のものを取り出し、それより古いものに達したかを返す */
export function takeSince(items: Raindrop[], since: Date): { fresh: Raindrop[]; reachedOlder: boolean } {
  const fresh: Raindrop[] = [];
  for (const item of items) {
    if (new Date(item.created) < since) return { fresh, reachedOlder: true };
    fresh.push(item);
  }
  return { fresh, reachedOlder: false };
}
