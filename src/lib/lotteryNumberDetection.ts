export type NumberStats = {
  /** Always 2 digits: "00".."99" */
  value: string;
  count: number;
};

// Extract lottery-like numbers from free-form chat text.
// We intentionally keep this heuristic simple and "safe":
// - Only digits 0..99
// - Ignore longer digit sequences (years, phone numbers, IDs)
// - Normalize to 2-digit strings ("5" -> "05")
export function extractLotteryNumbers00to99(text: string): string[] {
  if (!text) return [];

  // Split by any non-digit; this captures formats like:
  // "12 25 54", "12+25+54", "12-25-54", "12/25/54"
  const parts = String(text)
    .replace(/\u00a0/g, ' ')
    .split(/[^0-9]+/g)
    .filter(Boolean);

  const out: string[] = [];
  for (const raw of parts) {
    // Ignore long sequences like "2026", "71314515", etc.
    if (raw.length > 2) continue;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) continue;
    if (n < 0 || n > 99) continue;
    out.push(String(n).padStart(2, '0'));
  }
  return out;
}

export function countNumbers(numbers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of numbers) {
    map.set(n, (map.get(n) ?? 0) + 1);
  }
  return map;
}

export function topNumbers(map: Map<string, number>, limit: number): NumberStats[] {
  return Array.from(map.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

export function computeDeltas(current: Map<string, number>, previous: Map<string, number>): Array<{ value: string; current: number; previous: number; delta: number }> {
  const keys = new Set<string>();
  for (const k of current.keys()) keys.add(k);
  for (const k of previous.keys()) keys.add(k);

  const rows: Array<{ value: string; current: number; previous: number; delta: number }> = [];
  keys.forEach((value) => {
    const c = current.get(value) ?? 0;
    const p = previous.get(value) ?? 0;
    const delta = c - p;
    rows.push({ value, current: c, previous: p, delta });
  });

  return rows;
}

