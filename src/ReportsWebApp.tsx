import { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchAdminUsers } from './lib/adminService';
import { getSupabaseClient } from './lib/supabase';
import { detectPaymentFromText } from './lib/paymentDetection';
import { computeDeltas, countNumbers, extractLotteryNumbers00to99, topNumbers } from './lib/lotteryNumberDetection';
import { adminThemes, AdminThemeMode, palette } from './theme/palette';
import { ProfileRecord } from './types/chat';

type ReportsSnapshot = {
  totalUsers: number;
  pendingUsers: number;
  approvedUsers: number;
  blockedUsers: number;
};

type IncomeRow = {
  userId: string;
  label: string;
  crc: number;
  usd: number;
  payments: number;
};

type PlayedNumberRow = { value: string; count: number };
type TrendRow = { value: string; current: number; previous: number; delta: number };
type WinnerRow = { value: string; count: number };

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label} (${Math.round(timeoutMs / 1000)}s)`)), timeoutMs);
    Promise.resolve(promise as any)
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

export function ReportsWebApp({ session, profile }: { session: Session; profile: ProfileRecord }) {
  const [themeMode, setThemeMode] = useState<AdminThemeMode>('dark');
  const theme = adminThemes[themeMode];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReportsSnapshot | null>(null);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [incomeRangeDays, setIncomeRangeDays] = useState(7);
  const [incomeSummary, setIncomeSummary] = useState<{ crc: number; usd: number; payments: number } | null>(null);
  const [numbersRangeDays, setNumbersRangeDays] = useState(7);
  const [playedTop, setPlayedTop] = useState<PlayedNumberRow[]>([]);
  const [trendTop, setTrendTop] = useState<TrendRow[]>([]);
  const [winnersTop, setWinnersTop] = useState<WinnerRow[]>([]);
  const [winnersMeta, setWinnersMeta] = useState<{ sourceUrl: string; fetchedAt: string; totalCandidates: number } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const stored = window.localStorage.getItem('chat-santanita-reports-theme');
    if (stored === 'light' || stored === 'dark') setThemeMode(stored);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    window.localStorage.setItem('chat-santanita-reports-theme', themeMode);
  }, [themeMode]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const users = await withTimeout(fetchAdminUsers(), 15000, 'Cargar usuarios (admin)');
      const totalUsers = users.length;
      const pendingUsers = users.filter((u) => u.status === 'pending').length;
      const blockedUsers = users.filter((u) => u.status === 'blocked').length;
      const approvedUsers = users.filter((u) => u.status === 'approved').length;
      setSnapshot({ totalUsers, pendingUsers, approvedUsers, blockedUsers });

      const supabase = getSupabaseClient();
      const since = new Date(Date.now() - incomeRangeDays * 24 * 60 * 60 * 1000).toISOString();
      const msgRes = await withTimeout<any>(
        supabase
          .from('messages')
          .select('id, sender_id, body, created_at, message_type')
          .eq('message_type', 'text')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(2000) as any,
        20000,
        'Cargar mensajes (ingresos)'
      );
      const { data: messages, error: msgError } = msgRes as { data: any[] | null; error: any | null };

      if (msgError) {
        throw msgError;
      }

      const detected = (messages ?? [])
        .map((m: any) => ({
          senderId: String(m.sender_id),
          createdAt: String(m.created_at),
          body: String(m.body ?? ''),
          payment: detectPaymentFromText(String(m.body ?? '')),
        }))
        .filter((m) => m.payment && m.payment.confidence >= 0.55);

      const ids = Array.from(new Set(detected.map((d) => d.senderId)));
      const profilesById = new Map<string, { full_name?: string | null; email?: string | null; admin_alias?: string | null }>();
      if (ids.length > 0) {
        const profRes = await withTimeout<any>(
          supabase.from('profiles').select('id, full_name, email, admin_alias').in('id', ids) as any,
          15000,
          'Cargar perfiles (ingresos)'
        );
        const { data: profs, error: profErr } = profRes as { data: any[] | null; error: any | null };
        if (profErr) throw profErr;
        (profs ?? []).forEach((p: any) => {
          profilesById.set(String(p.id), { full_name: p.full_name ?? null, email: p.email ?? null, admin_alias: p.admin_alias ?? null });
        });
      }

      const totals = { crc: 0, usd: 0, payments: 0 };
      const byUser = new Map<string, IncomeRow>();
      for (const d of detected) {
        const p = d.payment!;
        totals.payments += 1;
        if (p.currency === 'CRC') totals.crc += p.amount;
        if (p.currency === 'USD') totals.usd += p.amount;

        const meta = profilesById.get(d.senderId);
        const label =
          meta?.admin_alias?.trim() ||
          meta?.full_name?.trim() ||
          meta?.email?.trim() ||
          d.senderId.slice(0, 8);

        const current = byUser.get(d.senderId) ?? { userId: d.senderId, label, crc: 0, usd: 0, payments: 0 };
        current.payments += 1;
        if (p.currency === 'CRC') current.crc += p.amount;
        if (p.currency === 'USD') current.usd += p.amount;
        byUser.set(d.senderId, current);
      }

      const rows = Array.from(byUser.values()).sort((a, b) => b.crc + b.usd * 550 - (a.crc + a.usd * 550));
      setIncomeRows(rows.slice(0, 25));
      setIncomeSummary(totals);

      // Module 2: Números más jugados y tendencias (heurística).
      // Compare selected range against the previous same-length range.
      const rangeMs = numbersRangeDays * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const currentStart = new Date(now - rangeMs).toISOString();
      const prevStart = new Date(now - rangeMs * 2).toISOString();
      const prevEnd = currentStart;

      const fetchNumberMessages = async (startIso: string, endIso?: string) => {
        let q = supabase
          .from('messages')
          .select('body, created_at, message_type')
          .eq('message_type', 'text')
          .gte('created_at', startIso);

        if (endIso) q = q.lt('created_at', endIso);
        const res = await withTimeout<any>(q.order('created_at', { ascending: false }).limit(5000) as any, 20000, 'Cargar mensajes (numeros)');
        const { data, error: e } = res as { data: any[] | null; error: any | null };
        if (e) throw e;
        return (data ?? []) as Array<{ body: string | null; created_at: string; message_type: string }>;
      };

      const [currentMsgs, prevMsgs] = await Promise.all([fetchNumberMessages(currentStart), fetchNumberMessages(prevStart, prevEnd)]);

      const currentNums = currentMsgs.flatMap((m) => extractLotteryNumbers00to99(String(m.body ?? '')));
      const prevNums = prevMsgs.flatMap((m) => extractLotteryNumbers00to99(String(m.body ?? '')));

      const currentMap = countNumbers(currentNums);
      const prevMap = countNumbers(prevNums);

      setPlayedTop(topNumbers(currentMap, 20));

      const deltas = computeDeltas(currentMap, prevMap)
        .filter((r) => r.current > 0 || r.previous > 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.current - a.current || a.value.localeCompare(b.value))
        .slice(0, 20);
      setTrendTop(deltas);

      // External "más ganadores": scraped via Supabase Edge Function (avoids browser CORS).
      // If the source site changes, this may fail gracefully.
      const { data: winners, error: winnersErr } = await withTimeout(
        supabase.functions.invoke('winning-numbers', {
          body: { limit: 20 },
        }),
        20000,
        'Cargar ganadores (scraping)'
      );
      if (winnersErr) {
        // Keep the rest of report working even if scraping fails.
        setWinnersTop([]);
        setWinnersMeta(null);
      } else if (winners) {
        setWinnersTop(((winners as any).top ?? []) as WinnerRow[]);
        setWinnersMeta({
          sourceUrl: String((winners as any).sourceUrl ?? ''),
          fetchedAt: String((winners as any).fetchedAt ?? ''),
          totalCandidates: Number((winners as any).totalCandidates ?? 0),
        });
      }
    } catch (err) {
      setSnapshot(null);
      setIncomeRows([]);
      setIncomeSummary(null);
      setPlayedTop([]);
      setTrendTop([]);
      setWinnersTop([]);
      setWinnersMeta(null);
      const msg = err instanceof Error ? err.message : 'No fue posible cargar reportes.';
      setError(
        `${msg}\n\nTip: en Vercel, EXPO_PUBLIC_SUPABASE_URL debe ser exactamente "https://unheokgkwybhzyvgzcbi.supabase.co" (sin /rest/v1).`
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id]);

  const title = useMemo(() => {
    const email = profile.email?.trim() || 'Admin';
    return `Reportes Santanita · ${email}`;
  }, [profile.email]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.topBar, { backgroundColor: theme.panel, borderColor: theme.border }]}>
        <View style={styles.topLeft}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>Panel de reportes</Text>
          <Text style={[styles.title, { color: theme.title }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.subTitle, { color: theme.text }]}>
            Módulo separado del CRM. Aquí vamos a agregar ingresos, números más jugados y métricas automáticas.
          </Text>
        </View>
        <View style={styles.topRight}>
          <Pressable
            onPress={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
            style={[styles.button, { backgroundColor: theme.input, borderColor: theme.border }]}
          >
            <Text style={[styles.buttonText, { color: theme.title }]}>{themeMode === 'dark' ? 'Modo claro' : 'Modo oscuro'}</Text>
          </Pressable>
          <Pressable
            onPress={() => getSupabaseClient().auth.signOut().catch(() => undefined)}
            style={[styles.button, { backgroundColor: theme.accent, borderColor: theme.accent }]}
          >
            <Text style={[styles.buttonText, { color: theme.buttonText }]}>Salir</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.title }]}>Estado general</Text>
            <Pressable
              onPress={() => void reload()}
              disabled={loading}
              style={[styles.smallButton, { backgroundColor: theme.input, borderColor: theme.border }, loading && styles.disabled]}
            >
              <Text style={[styles.smallButtonText, { color: theme.title }]}>{loading ? 'Cargando…' : 'Recargar'}</Text>
            </Pressable>
          </View>

          {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.accent} />
              <Text style={[styles.loadingText, { color: theme.muted }]}>Cargando datos…</Text>
            </View>
          ) : snapshot ? (
            <View style={styles.metricsGrid}>
              <Metric label="Usuarios" value={String(snapshot.totalUsers)} themeMode={themeMode} />
              <Metric label="Pendientes" value={String(snapshot.pendingUsers)} themeMode={themeMode} />
              <Metric label="Aprobados" value={String(snapshot.approvedUsers)} themeMode={themeMode} />
              <Metric label="Bloqueados" value={String(snapshot.blockedUsers)} themeMode={themeMode} />
            </View>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.title }]}>Ingresos automáticos (beta)</Text>
            <View style={styles.rangeRow}>
              <Pressable
                onPress={() => {
                  setIncomeRangeDays(1);
                  void reload();
                }}
                style={[styles.rangeChip, { backgroundColor: incomeRangeDays === 1 ? theme.accent : theme.input, borderColor: incomeRangeDays === 1 ? theme.accent : theme.border }]}
              >
                <Text style={[styles.rangeChipText, { color: incomeRangeDays === 1 ? theme.buttonText : theme.title }]}>1 día</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIncomeRangeDays(7);
                  void reload();
                }}
                style={[styles.rangeChip, { backgroundColor: incomeRangeDays === 7 ? theme.accent : theme.input, borderColor: incomeRangeDays === 7 ? theme.accent : theme.border }]}
              >
                <Text style={[styles.rangeChipText, { color: incomeRangeDays === 7 ? theme.buttonText : theme.title }]}>7 días</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setIncomeRangeDays(30);
                  void reload();
                }}
                style={[styles.rangeChip, { backgroundColor: incomeRangeDays === 30 ? theme.accent : theme.input, borderColor: incomeRangeDays === 30 ? theme.accent : theme.border }]}
              >
                <Text style={[styles.rangeChipText, { color: incomeRangeDays === 30 ? theme.buttonText : theme.title }]}>30 días</Text>
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.accent} />
              <Text style={[styles.loadingText, { color: theme.muted }]}>Analizando mensajes…</Text>
            </View>
          ) : incomeSummary ? (
            <>
              <View style={styles.metricsGrid}>
                <Metric label="Pagos detectados" value={String(incomeSummary.payments)} themeMode={themeMode} />
                <Metric label="CRC detectado" value={`₡${Math.round(incomeSummary.crc).toLocaleString('es-CR')}`} themeMode={themeMode} />
                <Metric label="USD detectado" value={`$${Math.round(incomeSummary.usd * 100) / 100}`} themeMode={themeMode} />
              </View>
              <Text style={[styles.helper, { color: theme.muted }]}>
                Se detecta automático desde mensajes de texto (SINPE/transfer/depósito, ₡ y $). No guarda tablas nuevas: recalcula en vivo.
              </Text>
              <View style={styles.incomeTable}>
                <View style={[styles.incomeHeaderRow, { borderColor: theme.border }]}>
                  <Text style={[styles.incomeHeader, { color: theme.muted }]}>Cliente</Text>
                  <Text style={[styles.incomeHeader, { color: theme.muted }]}>Pagos</Text>
                  <Text style={[styles.incomeHeader, { color: theme.muted }]}>₡</Text>
                  <Text style={[styles.incomeHeader, { color: theme.muted }]}>$</Text>
                </View>
                {incomeRows.length === 0 ? (
                  <Text style={[styles.paragraph, { color: theme.text }]}>
                    No se detectaron pagos en los últimos {incomeRangeDays} días. Si escriben “SINPE ₡15000” o “Pagado $25”, aquí aparece.
                  </Text>
                ) : (
                  incomeRows.map((row) => (
                    <View key={row.userId} style={[styles.incomeRow, { borderColor: theme.border }]}>
                      <Text style={[styles.incomeCell, { color: theme.title }]} numberOfLines={1}>
                        {row.label}
                      </Text>
                      <Text style={[styles.incomeCellRight, { color: theme.text }]}>{row.payments}</Text>
                      <Text style={[styles.incomeCellRight, { color: theme.text }]}>{row.crc ? `₡${Math.round(row.crc).toLocaleString('es-CR')}` : '-'}</Text>
                      <Text style={[styles.incomeCellRight, { color: theme.text }]}>{row.usd ? `$${Math.round(row.usd * 100) / 100}` : '-'}</Text>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: theme.title }]}>Números más jugados y tendencias (beta)</Text>
            <View style={styles.rangeRow}>
              <Pressable
                onPress={() => {
                  setNumbersRangeDays(7);
                  void reload();
                }}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: numbersRangeDays === 7 ? theme.accent : theme.input,
                    borderColor: numbersRangeDays === 7 ? theme.accent : theme.border,
                  },
                ]}
              >
                <Text style={[styles.rangeChipText, { color: numbersRangeDays === 7 ? theme.buttonText : theme.title }]}>7 días</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setNumbersRangeDays(30);
                  void reload();
                }}
                style={[
                  styles.rangeChip,
                  {
                    backgroundColor: numbersRangeDays === 30 ? theme.accent : theme.input,
                    borderColor: numbersRangeDays === 30 ? theme.accent : theme.border,
                  },
                ]}
              >
                <Text style={[styles.rangeChipText, { color: numbersRangeDays === 30 ? theme.buttonText : theme.title }]}>30 días</Text>
              </Pressable>
            </View>
          </View>

          <Text style={[styles.helper, { color: theme.muted }]}>
            Se extraen automáticamente números 00-99 de los mensajes (ej: “12 25 54” o “12+25+54”). Tendencias compara contra el rango anterior (mismos días).
          </Text>

          {loading ? null : (
            <View style={{ gap: 14 }}>
              <View>
                <Text style={[styles.metricLabel, { color: theme.muted, marginBottom: 6 }]}>Más jugados</Text>
                {playedTop.length === 0 ? (
                  <Text style={[styles.paragraph, { color: theme.text }]}>No se detectaron números en los últimos {numbersRangeDays} días.</Text>
                ) : (
                  <View style={[styles.incomeTable, { gap: 6 }]}>
                    <View style={[styles.incomeHeaderRow, { borderColor: theme.border }]}>
                      <Text style={[styles.incomeHeader, { color: theme.muted }]}>Número</Text>
                      <Text style={[styles.incomeHeader, { color: theme.muted, textAlign: 'right' }]}>Veces</Text>
                    </View>
                    {playedTop.map((row) => (
                      <View key={row.value} style={[styles.incomeRow, { borderColor: theme.border }]}>
                        <Text style={[styles.incomeCell, { color: theme.title }]}>{row.value}</Text>
                        <Text style={[styles.incomeCellRight, { color: theme.text }]}>{row.count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View>
                <Text style={[styles.metricLabel, { color: theme.muted, marginBottom: 6 }]}>Tendencias (vs rango anterior)</Text>
                {trendTop.length === 0 ? (
                  <Text style={[styles.paragraph, { color: theme.text }]}>Sin suficientes datos para tendencias.</Text>
                ) : (
                  <View style={[styles.incomeTable, { gap: 6 }]}>
                    <View style={[styles.incomeHeaderRow, { borderColor: theme.border }]}>
                      <Text style={[styles.incomeHeader, { color: theme.muted }]}>Número</Text>
                      <Text style={[styles.incomeHeader, { color: theme.muted, textAlign: 'right' }]}>Ahora</Text>
                      <Text style={[styles.incomeHeader, { color: theme.muted, textAlign: 'right' }]}>Antes</Text>
                      <Text style={[styles.incomeHeader, { color: theme.muted, textAlign: 'right' }]}>Δ</Text>
                    </View>
                    {trendTop.map((row) => (
                      <View key={row.value} style={[styles.incomeRow, { borderColor: theme.border }]}>
                        <Text style={[styles.incomeCell, { color: theme.title }]}>{row.value}</Text>
                        <Text style={[styles.incomeCellRight, { color: theme.text }]}>{row.current}</Text>
                        <Text style={[styles.incomeCellRight, { color: theme.text }]}>{row.previous}</Text>
                        <Text
                          style={[
                            styles.incomeCellRight,
                            { color: row.delta > 0 ? theme.accent : row.delta < 0 ? theme.danger : theme.muted },
                          ]}
                        >
                          {row.delta > 0 ? `+${row.delta}` : String(row.delta)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View>
                <Text style={[styles.metricLabel, { color: theme.muted, marginBottom: 6 }]}>Más ganadores (scraping)</Text>
                {winnersMeta ? (
                  <Text style={[styles.helper, { color: theme.muted }]}>
                    Fuente: {winnersMeta.sourceUrl || 'externa'} · actualizado {new Date(winnersMeta.fetchedAt).toLocaleString('es-CR')} · muestras {winnersMeta.totalCandidates}
                  </Text>
                ) : (
                  <Text style={[styles.helper, { color: theme.muted }]}>
                    Si no aparece, es porque la web cambió o bloqueó el scraping. El resto del panel sigue funcionando.
                  </Text>
                )}
                {winnersTop.length === 0 ? null : (
                  <View style={[styles.incomeTable, { gap: 6 }]}>
                    <View style={[styles.incomeHeaderRow, { borderColor: theme.border }]}>
                      <Text style={[styles.incomeHeader, { color: theme.muted }]}>Número</Text>
                      <Text style={[styles.incomeHeader, { color: theme.muted, textAlign: 'right' }]}>Apariciones</Text>
                    </View>
                    {winnersTop.map((row) => (
                      <View key={row.value} style={[styles.incomeRow, { borderColor: theme.border }]}>
                        <Text style={[styles.incomeCell, { color: theme.title }]}>{row.value}</Text>
                        <Text style={[styles.incomeCellRight, { color: theme.text }]}>{row.count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.title }]}>Próximos módulos</Text>
          <Text style={[styles.paragraph, { color: theme.text }]}>
            1) Ingresos automáticos por chat (IA detecta pagos y montos).{'\n'}
            2) Números más jugados, más ganadores y tendencias.{'\n'}
            3) Reporte por día y por cliente, exportable.
          </Text>
          <Text style={[styles.helper, { color: theme.muted }]}>
            Estos reportes se mostrarán aquí sin tocar el CRM ni la app móvil.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, themeMode }: { label: string; value: string; themeMode: AdminThemeMode }) {
  const theme = adminThemes[themeMode];
  return (
    <View style={[styles.metric, { backgroundColor: theme.cardAlt, borderColor: theme.border }]}>
      <Text style={[styles.metricValue, { color: theme.title }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    borderBottomWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 18,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topLeft: { flex: 1, minWidth: 260, gap: 6 },
  topRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  eyebrow: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '900' },
  subTitle: { fontSize: 13, lineHeight: 18 },
  button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  buttonText: { fontWeight: '800', fontSize: 13 },
  content: { padding: 22, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '900' },
  smallButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  smallButtonText: { fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  error: { fontSize: 13, fontWeight: '700' },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  loadingText: { fontSize: 13, fontWeight: '700' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { borderWidth: 1, borderRadius: 16, padding: 14, minWidth: 160, flexGrow: 1 },
  metricValue: { fontSize: 20, fontWeight: '900' },
  metricLabel: { marginTop: 2, fontSize: 12, fontWeight: '700' },
  paragraph: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  helper: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  rangeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rangeChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  rangeChipText: { fontSize: 12, fontWeight: '900' },
  incomeTable: { marginTop: 6, gap: 8 },
  incomeHeaderRow: { flexDirection: 'row', gap: 10, paddingBottom: 8, borderBottomWidth: 1 },
  incomeHeader: { flex: 1, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  incomeRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  incomeCell: { flex: 1, fontSize: 13, fontWeight: '800' },
  incomeCellRight: { flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
});
