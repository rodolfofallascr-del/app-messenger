export const palette = {
  // App default (shared by mobile + web). Kept intentionally neutral.
  background: '#060A14',
  panel: '#0E1627',
  card: '#101B2F',
  cardActive: '#14213A',
  input: '#16233C',
  border: 'rgba(148,163,184,0.18)',
  accent: '#22C55E',
  accentSoft: '#86EFAC',
  primaryText: '#F8FAFC',
  secondaryText: 'rgba(226,232,240,0.82)',
  mutedText: 'rgba(148,163,184,0.85)',
  buttonText: '#04150A',
} as const;

export type AdminThemeMode = 'dark' | 'light';

export const adminThemes = {
  dark: {
    // CRM 2026 (Mac-like) dark
    background: '#060A14',
    panel: 'rgba(14,22,39,0.78)',
    card: 'rgba(16,27,47,0.70)',
    cardAlt: 'rgba(18,32,56,0.62)',
    cardSoft: 'rgba(22,38,66,0.52)',
    input: 'rgba(255,255,255,0.06)',
    border: 'rgba(148,163,184,0.18)',
    borderSoft: 'rgba(148,163,184,0.12)',
    title: '#F8FAFC',
    text: 'rgba(226,232,240,0.84)',
    muted: 'rgba(148,163,184,0.86)',
    accent: '#22C55E',
    accentSoft: '#86EFAC',
    buttonText: '#04150A',
    chipText: 'rgba(226,232,240,0.92)',
    warning: '#FDE68A',
    danger: '#FCA5A5',
    previewBg: 'rgba(18,32,56,0.52)',
    dropBg: 'rgba(34,197,94,0.10)',
  },
  light: {
    // CRM 2026 (Mac-like) light
    background: '#F6F7FB',
    panel: 'rgba(255,255,255,0.82)',
    card: 'rgba(255,255,255,0.72)',
    cardAlt: 'rgba(248,250,252,0.72)',
    cardSoft: 'rgba(241,245,249,0.62)',
    input: 'rgba(15,23,42,0.06)',
    border: 'rgba(15,23,42,0.10)',
    borderSoft: 'rgba(15,23,42,0.08)',
    title: '#0B1220',
    text: 'rgba(15,23,42,0.82)',
    muted: 'rgba(71,85,105,0.82)',
    accent: '#16A34A',
    accentSoft: '#166534',
    buttonText: '#FFFFFF',
    chipText: 'rgba(15,23,42,0.90)',
    warning: '#B45309',
    danger: '#B91C1C',
    previewBg: 'rgba(241,245,249,0.70)',
    dropBg: 'rgba(22,163,74,0.10)',
  },
} as const;
