import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Appbar, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useTheme } from '../../src/context/theme';
import { computeInsights, type Insight, type InsightType } from '../../src/services/localInsights';

const TYPE_META: Record<InsightType, { icon: string; color: string; label: string }> = {
  highlight:      { icon: 'chart-line',          color: '#22c55e', label: 'Highlight'      },
  trend:          { icon: 'trending-up',          color: '#1db8a0', label: 'Trend'          },
  alert:          { icon: 'alert-circle-outline', color: '#e53935', label: 'Alert'          },
  warning:        { icon: 'alert-outline',        color: '#f59e0b', label: 'Warning'        },
  recommendation: { icon: 'lightbulb-outline',    color: '#8b5cf6', label: 'Recommendation' },
};

function InsightCard({ insight, C }: { insight: Insight; C: any }) {
  const meta = TYPE_META[insight.type] ?? TYPE_META.recommendation;
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: meta.color + '44' }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconDot, { backgroundColor: meta.color + '22' }]}>
          <MaterialCommunityIcons name={meta.icon as any} size={18} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardType, { color: meta.color }]}>{meta.label}</Text>
          <Text style={[styles.cardTitle, { color: C.text }]}>{insight.title}</Text>
        </View>
      </View>
      <Text style={[styles.cardBody, { color: C.muted }]}>{insight.body}</Text>
    </View>
  );
}

export default function AiInsightsScreen() {
  const { colors: C } = useTheme();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await computeInsights();
      setInsights(result);
      setScannedAt(dayjs().toISOString());
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
      <Appbar.Header style={{ backgroundColor: C.surface }}>
        <Appbar.BackAction onPress={() => router.back()} color={C.text} />
        <Appbar.Content title="Smart Insights" titleStyle={{ color: C.text, fontWeight: '800' }} />
        {!loading && (
          <Appbar.Action icon="refresh" color={C.accent} onPress={scan} />
        )}
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={scan} colors={[C.accent]} />}
      >
        {/* Loading */}
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={[styles.loadingText, { color: C.muted }]}>Analysing your business data…</Text>
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={[styles.errorCard, { backgroundColor: '#e5393514', borderColor: '#e5393540' }]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#e53935" />
            <Text style={[styles.errorText, { color: '#e53935' }]}>{error}</Text>
          </View>
        )}

        {/* Insights */}
        {!loading && insights && insights.length > 0 && (
          <>
            {insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} C={C} />
            ))}
          </>
        )}

        {/* Empty state — data exists but no noteworthy signals */}
        {!loading && !error && insights && insights.length === 0 && (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: C.accent + '18' }]}>
              <MaterialCommunityIcons name="check-circle-outline" size={40} color={C.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: C.text }]}>All Looking Good</Text>
            <Text style={[styles.emptyBody, { color: C.muted }]}>
              No major signals right now. Check back after more sales data has been recorded.
            </Text>
          </View>
        )}

        {/* Timestamp + badge */}
        {!loading && scannedAt && (
          <View style={styles.footerRow}>
            <View style={[styles.localBadge, { backgroundColor: C.elevated }]}>
              <MaterialCommunityIcons name="lightning-bolt" size={12} color={C.accent} />
              <Text style={[styles.badgeText, { color: C.muted }]}>On-device · instant · free</Text>
            </View>
            <Text style={[styles.timestamp, { color: C.muted }]}>
              Scanned {dayjs(scannedAt).format('h:mm A')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: 16, gap: 14, paddingBottom: 40 },
  card:         { borderRadius: 14, padding: 16, borderWidth: 1.5 },
  cardHeader:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  iconDot:      { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  cardType:     { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  cardTitle:    { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardBody:     { fontSize: 14, lineHeight: 21 },
  loadingWrap:  { alignItems: 'center', paddingVertical: 60, gap: 16 },
  loadingText:  { fontSize: 15, fontWeight: '500' },
  errorCard:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  errorText:    { flex: 1, fontSize: 14, lineHeight: 20 },
  emptyWrap:    { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon:    { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  emptyBody:    { fontSize: 14, textAlign: 'center', lineHeight: 22, color: '#888' },
  footerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 2 },
  localBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText:    { fontSize: 11 },
  timestamp:    { fontSize: 11 },
});
