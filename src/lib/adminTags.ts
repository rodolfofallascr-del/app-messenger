export const ADMIN_TAG_PRESETS = [
  { value: 'VIP', symbol: '\u2B50', color: '#a855f7' },
  { value: 'Pendiente', symbol: '\u23F3', color: '#f59e0b' },
  { value: 'SINPE', symbol: '\uD83D\uDCB8', color: '#0ea5e9' },
  { value: 'Pago', symbol: '\u2705', color: '#22c55e' },
  { value: 'No pago', symbol: '\u274C', color: '#ef4444' },
] as const;

export const ADMIN_TAG_SYMBOL_PRESETS = [
  { value: '\uD83C\uDFF7\uFE0F', color: '#3b82f6' },
  { value: '\uD83D\uDFE2', color: '#22c55e' },
  { value: '\uD83D\uDD34', color: '#ef4444' },
  { value: '\uD83D\uDFE1', color: '#f59e0b' },
  { value: '\uD83D\uDD35', color: '#3b82f6' },
  { value: '\uD83D\uDFE3', color: '#a855f7' },
  { value: '\uD83D\uDFE0', color: '#f97316' },
  { value: '\uD83D\uDCCC', color: '#14b8a6' },
  { value: '\u2B50', color: '#eab308' },
  { value: '\u2705', color: '#16a34a' },
  { value: '\u274C', color: '#dc2626' },
] as const;

const KEYWORD_STYLES: Array<{ match: RegExp; symbol: string; color: string }> = [
  { match: /vip|premium|top/i, symbol: '\u2B50', color: '#a855f7' },
  { match: /pend|espera|revis/i, symbol: '\u23F3', color: '#f59e0b' },
  { match: /sinpe|transfer|pago/i, symbol: '\uD83D\uDCB8', color: '#0ea5e9' },
  { match: /favor|saldo/i, symbol: '\uD83D\uDC9A', color: '#10b981' },
  { match: /no pago|bloq|mora|deuda/i, symbol: '\u274C', color: '#ef4444' },
  { match: /promo|ganador|sorteo/i, symbol: '\uD83C\uDF89', color: '#f97316' },
  { match: /codigo|ticket|boleta/i, symbol: '\uD83C\uDFF7\uFE0F', color: '#3b82f6' },
];

const FALLBACK_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6'];

export function getAdminTagPresentation(tag: string) {
  const normalized = tag.trim();

  for (const style of KEYWORD_STYLES) {
    if (style.match.test(normalized)) {
      return style;
    }
  }

  return {
    symbol: '\uD83C\uDFF7\uFE0F',
    color: FALLBACK_COLORS[Math.abs(hashTag(normalized)) % FALLBACK_COLORS.length],
  };
}

function hashTag(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}
