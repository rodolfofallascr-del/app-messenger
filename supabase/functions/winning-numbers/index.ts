// Supabase Edge Function: winning-numbers
// Purpose:
// - Fetch public lottery results HTML from an external website (e.g. www.santanitacr.com)
// - Extract 2-digit numbers (00..99) and return "most frequent" as a proxy for "más ganadores"
//
// Notes:
// - This is heuristic scraping (HTML changes can break it).
// - We keep it read-only and do not touch the database.

type WinningNumbersRequest = {
  url?: string;
  limit?: number;
};

type WinningNumbersResponse = {
  sourceUrl: string;
  fetchedAt: string;
  totalCandidates: number;
  top: Array<{ value: string; count: number }>;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
}

function extract00to99FromHtml(html: string): string[] {
  // Pull any 1-2 digit tokens surrounded by non-digits.
  // Example matches: "07", "7", in tables/lists.
  const out: string[] = [];
  const re = /(?:^|[^\d])(\d{1,2})(?=$|[^\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1];
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) continue;
    if (n < 0 || n > 99) continue;
    out.push(String(n).padStart(2, '0'));
  }
  return out;
}

function topCounts(values: string[], limit: number) {
  const freq = new Map<string, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  return Array.from(freq.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return json(204, {});
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload: WinningNumbersRequest = {};
  try {
    payload = (await req.json()) as WinningNumbersRequest;
  } catch {
    payload = {};
  }

  const sourceUrl =
    payload.url?.trim() ||
    Deno.env.get('WINNING_NUMBERS_SOURCE_URL') ||
    'https://www.santanitacr.com/';
  const limit = Math.max(5, Math.min(50, payload.limit ?? 20));

  try {
    const res = await fetch(sourceUrl, {
      headers: {
        // Some sites block requests without a UA.
        'user-agent': 'ChatSantanitaReportsBot/1.0 (+https://reportes.chatsantanita.com)',
        'accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      return json(502, { error: 'Failed to fetch source', status: res.status, statusText: res.statusText, sourceUrl });
    }

    const html = await res.text();
    const candidates = extract00to99FromHtml(html);
    const top = topCounts(candidates, limit);

    const out: WinningNumbersResponse = {
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      totalCandidates: candidates.length,
      top,
    };
    return json(200, out);
  } catch (e) {
    return json(500, { error: 'Unexpected error', message: e instanceof Error ? e.message : String(e), sourceUrl });
  }
}

