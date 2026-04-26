export type CurrencyCode = 'CRC' | 'USD';

export type DetectedPayment = {
  currency: CurrencyCode;
  amount: number;
  confidence: number; // 0..1 heuristic confidence
  method?: 'sinpe' | 'transfer' | 'cash' | 'unknown';
  raw: string;
};

const KEYWORDS = {
  sinpe: ['sinpe', 's i n p e', 'movil', 'móvil'],
  transfer: ['transfer', 'transferencia', 'deposit', 'depósito', 'deposito'],
  cash: ['efectivo', 'cash'],
  paid: ['pague', 'pagó', 'pago', 'pagado', 'pagada', 'cancelado', 'cancelada', 'ya pague', 'ya pagó'],
  receipt: ['comprobante', 'recibo', 'voucher'],
};

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

function parseNumericAmount(raw: string) {
  const cleaned = raw
    .replace(/[^\d.,]/g, '')
    .replace(/\s+/g, '');

  if (!cleaned) return null;

  // Handle thousands separators and decimals (very permissive).
  // Examples:
  //  "12,500" => 12500
  //  "12.500" => 12500
  //  "12,500.25" => 12500.25
  //  "12.500,25" => 12500.25
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : '';

  let normalized = cleaned;
  if (decimalSep) {
    const parts = cleaned.split(decimalSep);
    const integer = parts.slice(0, -1).join(decimalSep).replace(/[.,]/g, '');
    const decimals = parts[parts.length - 1];
    normalized = `${integer}.${decimals}`;
  } else {
    normalized = cleaned.replace(/[.,]/g, '');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function detectPaymentFromText(input: string): DetectedPayment | null {
  const raw = input ?? '';
  const text = normalize(raw);
  if (!text) return null;

  const looksLikePayment =
    hasAny(text, KEYWORDS.paid) || hasAny(text, KEYWORDS.receipt) || hasAny(text, KEYWORDS.sinpe) || hasAny(text, KEYWORDS.transfer);

  // Currency hints
  const hasCRC = /₡|crc|colones|colon(es)?/.test(raw) || /\b(c|¢)\b/.test(text);
  const hasUSD = /\$|usd|dolar(es)?|dólar(es)?/.test(raw);

  const method: DetectedPayment['method'] =
    hasAny(text, KEYWORDS.sinpe) ? 'sinpe' : hasAny(text, KEYWORDS.transfer) ? 'transfer' : hasAny(text, KEYWORDS.cash) ? 'cash' : 'unknown';

  // Amount patterns:
  // - ₡12,500
  // - $ 25
  // - 12 500
  // - 12500 colones
  const candidates: string[] = [];
  const symbolMatches = raw.match(/(?:₡|\$)\s*[\d][\d\s.,]{0,18}/g);
  if (symbolMatches) candidates.push(...symbolMatches);

  const wordMatches = raw.match(/[\d][\d\s.,]{0,18}\s*(?:colones|crc|usd|dolares|dólares)/gi);
  if (wordMatches) candidates.push(...wordMatches);

  // Fallback: plain big-ish number if message looks like payment.
  if (looksLikePayment) {
    const plainMatches = raw.match(/[\d][\d\s.,]{2,18}/g);
    if (plainMatches) candidates.push(...plainMatches);
  }

  const parsed = candidates
    .map((c) => ({ raw: c, value: parseNumericAmount(c) }))
    .filter((c): c is { raw: string; value: number } => typeof c.value === 'number')
    // Avoid very small numbers that are likely ticket numbers.
    .filter((c) => c.value >= 100 || /\$/.test(c.raw) || /usd/i.test(c.raw));

  if (parsed.length === 0) return null;

  // Pick the largest amount (usually the payment).
  const best = parsed.sort((a, b) => b.value - a.value)[0];
  const currency: CurrencyCode = hasUSD || /\$/.test(best.raw) || /usd/i.test(best.raw) ? 'USD' : 'CRC';

  let confidence = 0.45;
  if (looksLikePayment) confidence += 0.25;
  if (method !== 'unknown') confidence += 0.15;
  if (currency === 'USD' ? hasUSD : hasCRC) confidence += 0.05;
  confidence = Math.min(0.98, confidence);

  return { currency, amount: best.value, confidence, method, raw: raw };
}

