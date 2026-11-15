import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text, Appbar, Button, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/context/theme';
import { generateInsights, getApiKey, type Insight, type InsightType } from '../../src/services/aiInsights';
import { getBusinessInfo, getSetting, setSetting } from '../../src/db/settings';

const TYPE_META: Record<InsightType, { icon: string; color: string; label: string }> = {
  highlight:      { icon: 'chart-line',         color: '#22c55e', label: 'Highlight'      },
  trend:          { icon: 'trending-up',         color: '#1db8a0', label: 'Trend'          },
  alert:          { icon: 'alert-circle-outline',color: '#e53935', label: 'Alert'          },
  recommendation: { icon: 'lightbulb-outline',   color: '#8b5cf6', label: 'Recommendation' },
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
      <Text style={[styles.cardBody, { color: C.muted }]}>{insight.insight}</Text>
    </View>
  );
}

export default function AiInsightsScreen() {
  const { colors: C } = useTheme();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const { data: bizInfo } = useQuery({ queryKey: ['biz-info'], queryFn: getBusinessInfo });

  // Load persisted insights on mount
  useEffect(() => {
    (async () => {
      const key = await getApiKey();
      setHasKey(!!key?.trim());
      const cached = await getSetting('ai_insights_cache');
      if (cached) {
        try {
          const { data, ts } = JSON.parse(cached);
          setInsights(data);
          setGeneratedAt(ts);
        } catch {}
      }
    })();
  }, []);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateInsights(bizInfo?.name ?? '');
      const ts = dayjs().toISOString();
      setInsights(result);
      setGeneratedAt(ts);
      await setSetting('ai_insights_cache', JSON.stringify({ data: result, ts }));
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [bizInfo?.name]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
      <Appbar.Header style={{ backgroundColor: C.surface }}>
        <Appbar.BackAction onPress={() => router.back()} color={C.text} />
        <Appbar.Content title="AI Insights" titleStyle={{ color: C.text, fontWeight: '800' }} />
        {insights && !loading && (
          <Appbar.Action icon="refresh" color={C.accent} onPress={handleGenerate} />
        )}
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* No API key state */}
        {hasKey === false && (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: C.elevated }]}>
              <MaterialCommunityIcons name="key-outline" size={40} color={C.muted} />
            </View>
            <Text style={[styles.emptyTitle, { color: C.text }]}>API Key Required</Text>
            <Text style={[styles.emptyBody, { color: C.muted }]}>
              Add your Anthropic API key in Settings to use AI-powered business insights.
            </Text>
            <Button
              mode="contained"
              buttonColor={C.accent}
              onPress={() => router.push('/(app)/(tabs)/settings')}
              style={{ marginTop: 20, borderRadius: 12 }}
            >
              Open Settings
            </Button>
          </View>
        )}

        {/* Loading state */}
        {loading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={[styles.loadingText, { color: C.muted }]}>Analyzing your business data…</Text>
            <Text style={[styles.loadingSubtext, { color: C.muted + '88' }]}>This takes a few seconds</Text>
          </View>
        )}

        {/* Error state */}
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
            {generatedAt && (
              <Text style={[styles.timestamp, { color: C.muted }]}>
                Generated {dayjs(generatedAt).format('D MMM YYYY [at] h:mm A')}
              </Text>
            )}
          </>
        )}

        {/* CTA — first time, key is set, no insights yet */}
        {hasKey === true && !loading && !insights && (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: C.accent + '18' }]}>
              <MaterialCommunityIcons name="brain" size={40} color={C.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: C.text }]}>AI Business Insights</Text>
            <Text style={[styles.emptyBody, { color: C.muted }]}>
              Get instant analysis of your sales trends, top products, inventory health, and actionable recommendations powered by Claude AI.
            </Text>
            <Button
              mode="contained"
              buttonColor={C.accent}
              onPress={handleGenerate}
              style={{ marginTop: 20, borderRadius: 12 }}
              icon="brain"
            >
              Generate Insights
            </Button>
          </View>
        )}

        {/* Generate button when insights already exist (bottom CTA) */}
        {hasKey === true && !loading && insights && (
          <Button
            mode="outlined"
            onPress={handleGenerate}
            style={[styles.regenBtn, { borderColor: C.accent }]}
            textColor={C.accent}
            icon="refresh"
          >
            Regenerate
          </Button>
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
  emptyWrap:    { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon:    { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  emptyBody:    { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  loadingWrap:  { alignItems: 'center', paddingVertical: 60, gap: 16 },
  loadingText:  { fontSize: 16, fontWeight: '600' },
  loadingSubtext:{ fontSize: 13 },
  errorCard:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  errorText:    { flex: 1, fontSize: 14, lineHeight: 20 },
  timestamp:    { fontSize: 11, textAlign: 'center', marginTop: 4 },
  regenBtn:     { marginTop: 4, borderRadius: 12 },
});
