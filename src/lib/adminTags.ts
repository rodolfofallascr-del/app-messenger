const TAG_PRESETS = [
  { value: 'VIP', symbol: '⭐', color: '#a855f7' },
  { value: 'Pendiente', symbol: '⏳', color: '#f59e0b' },
  { value: 'SINPE', symbol: '💸', color: '#0ea5e9' },
  { value: 'Pago', symbol: '✅', color: '#22c55e' },
  { value: 'Favor', symbol: '💚', color: '#10b981' },
  { value: 'No pago', symbol: '❌', color: '#ef4444' },
  { value: 'Promo', symbol: '🎉', color: '#f97316' },
  { value: 'Codigo', symbol: '🏷️', color: '#3b82f6' },
] as const;

export const ADMIN_TAG_PRESETS = TAG_PRESETS;

const KEYWORD_STYLES: Array<{ match: RegExp; symbol: string; color: string }> = [
  { match: /vip|premium|top/i, symbol: '⭐', color: '#a855f7' },
  { match: /pend|espera|revis/i, symbol: '⏳', color: '#f59e0b' },
  { match: /sinpe|transfer|pago/i, symbol: '💸', color: '#0ea5e9' },
  { match: /favor|saldo/i, symbol: '💚', color: '#10b981' },
  { match: /no pago|bloq|mora|deuda/i, symbol: '❌', color: '#ef4444' },
  { match: /promo|ganador|sorteo/i, symbol: '🎉', color: '#f97316' },
  { match: /codigo|ticket|boleta/i, symbol: '🏷️', color: '#3b82f6' },
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
    symbol: '🏷️',
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
