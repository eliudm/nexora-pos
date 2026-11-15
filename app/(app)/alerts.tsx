import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text, Appbar, TextInput, Button, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useTheme } from '../../src/context/theme';
import { productQueries } from '../../src/db/products';
import { salesQueries } from '../../src/db/sales';
import { getBusinessInfo, setSetting } from '../../src/db/settings';

export default function AlertsScreen() {
  const { colors: C } = useTheme();
  const qc = useQueryClient();
  const [targetInput, setTargetInput] = useState('');
  const [editingTarget, setEditingTarget] = useState(false);
  const todayStr = dayjs().format('YYYY-MM-DD');

  const { data: outOfStock = [] } = useQuery({ queryKey: ['alerts-oos'], queryFn: productQueries.getOutOfStock });
  const { data: lowStock = [] } = useQuery({ queryKey: ['alerts-low'], queryFn: productQueries.getLowStock });
  const { data: expiring = [] } = useQuery({ queryKey: ['alerts-expiry'], queryFn: () => productQueries.getExpiring(30) });
  const { data: summary } = useQuery({ queryKey: ['daily-summary', todayStr], queryFn: () => salesQueries.getDailySummary(todayStr) });
  const { data: bizInfo } = useQuery({ queryKey: ['biz-info'], queryFn: getBusinessInfo });

  const saveTargetMutation = useMutation({
    mutationFn: (val: string) => setSetting('daily_sales_target', val),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['biz-info'] }); setEditingTarget(false); },
  });

  const target = bizInfo?.dailySalesTarget ?? 0;
  const revenue = summary?.total_revenue ?? 0;
  const targetPct = target > 0 ? Math.min((revenue / target) * 100, 100) : 0;
  const targetMet = target > 0 && revenue >= target;

  const todayExpired = expiring.filter(p => p.expiry_date && p.expiry_date < todayStr);
  const expiringSoon = expiring.filter(p => p.expiry_date && p.expiry_date >= todayStr);

  const totalAlerts = outOfStock.length + lowStock.length + todayExpired.length + expiringSoon.length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]}>
      <Appbar.Header style={{ backgroundColor: C.surface }}>
        <Appbar.BackAction onPress={() => router.back()} color={C.text} />
        <Appbar.Content title="Alerts" titleStyle={{ color: C.text, fontWeight: '800' }} />
        {totalAlerts > 0 && (
          <View style={[styles.headerBadge, { backgroundColor: '#e53935' }]}>
            <Text style={styles.headerBadgeText}>{totalAlerts}</Text>
          </View>
        )}
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* Daily Target */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconDot, { backgroundColor: (target > 0 ? (targetMet ? '#22c55e' : '#f59e0b') : C.muted) + '22' }]}>
              <MaterialCommunityIcons name="target" size={18} color={target > 0 ? (targetMet ? '#22c55e' : '#f59e0b') : C.muted} />
            </View>
            <Text style={[styles.cardTitle, { color: C.text }]}>Daily Sales Target</Text>
            <Pressable onPress={() => { setTargetInput(target > 0 ? target.toString() : ''); setEditingTarget(true); }}>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={C.accent} />
            </Pressable>
          </View>

          {editingTarget ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput
                mode="outlined"
                label="Target (KES)"
                value={targetInput}
                onChangeText={setTargetInput}
                keyboardType="numeric"
                style={{ flex: 1 }}
                dense
              />
              <Button mode="contained" buttonColor={C.accent} textColor="#fff" onPress={() => saveTargetMutation.mutate(targetInput)} loading={saveTargetMutation.isPending}>Save</Button>
              <Button textColor={C.muted} onPress={() => setEditingTarget(false)}>Cancel</Button>
            </View>
          ) : target === 0 ? (
            <Text style={[styles.noAlertText, { color: C.muted }]}>No target set. Tap the pencil to set a daily revenue goal.</Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: C.muted, fontSize: 13 }}>KES {revenue.toLocaleString('en-KE', { minimumFractionDigits: 0 })} / KES {target.toLocaleString('en-KE', { minimumFractionDigits: 0 })}</Text>
                <Text style={{ color: targetMet ? '#22c55e' : '#f59e0b', fontWeight: '700', fontSize: 13 }}>{targetPct.toFixed(0)}%</Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: C.elevated }]}>
                <View style={[styles.progressFill, { width: `${targetPct}%` as any, backgroundColor: targetMet ? '#22c55e' : '#f59e0b' }]} />
              </View>
              <Text style={{ color: targetMet ? '#22c55e' : C.muted, fontSize: 12, marginTop: 4 }}>
                {targetMet ? 'Target reached!' : `KES ${(target - revenue).toLocaleString('en-KE', { minimumFractionDigits: 0 })} remaining`}
              </Text>
            </View>
          )}
        </View>

        {/* Out of Stock */}
        <AlertSection
          icon="package-variant-remove"
          iconColor="#e53935"
          title="Out of Stock"
          count={outOfStock.length}
          emptyText="No products are out of stock."
          C={C}
        >
          {outOfStock.map((p) => (
            <Pressable key={p.id} style={[styles.alertRow, { borderBottomColor: C.border }]} onPress={() => router.push('/(app)/(tabs)/products' as any)}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.alertName, { color: C.text }]}>{p.name}</Text>
                {p.category_name && <Text style={[styles.alertSub, { color: C.muted }]}>{p.category_name}</Text>}
              </View>
              <View style={[styles.qtyBadge, { backgroundColor: '#e5393522' }]}>
                <Text style={{ color: '#e53935', fontWeight: '800', fontSize: 12 }}>0 in stock</Text>
              </View>
            </Pressable>
          ))}
        </AlertSection>

        {/* Low Stock */}
        <AlertSection
          icon="package-variant-minus"
          iconColor="#f59e0b"
          title="Low Stock"
          count={lowStock.length}
          emptyText="No products are running low."
          C={C}
        >
          {lowStock.map((p) => (
            <Pressable key={p.id} style={[styles.alertRow, { borderBottomColor: C.border }]} onPress={() => router.push('/(app)/(tabs)/products' as any)}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.alertName, { color: C.text }]}>{p.name}</Text>
                {p.category_name && <Text style={[styles.alertSub, { color: C.muted }]}>{p.category_name}</Text>}
              </View>
              <View style={[styles.qtyBadge, { backgroundColor: '#f59e0b22' }]}>
                <Text style={{ color: '#f59e0b', fontWeight: '800', fontSize: 12 }}>{p.stock_qty} left</Text>
              </View>
            </Pressable>
          ))}
        </AlertSection>

        {/* Expired */}
        {todayExpired.length > 0 && (
          <AlertSection
            icon="calendar-remove"
            iconColor="#e53935"
            title="Expired"
            count={todayExpired.length}
            emptyText=""
            C={C}
          >
            {todayExpired.map((p) => (
              <Pressable key={p.id} style={[styles.alertRow, { borderBottomColor: C.border }]} onPress={() => router.push('/(app)/(tabs)/products' as any)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertName, { color: C.text }]}>{p.name}</Text>
                  {p.category_name && <Text style={[styles.alertSub, { color: C.muted }]}>{p.category_name}</Text>}
                </View>
                <View style={[styles.qtyBadge, { backgroundColor: '#e5393522' }]}>
                  <Text style={{ color: '#e53935', fontWeight: '800', fontSize: 12 }}>{dayjs(p.expiry_date).format('D MMM YYYY')}</Text>
                </View>
              </Pressable>
            ))}
          </AlertSection>
        )}

        {/* Expiring Soon */}
        <AlertSection
          icon="calendar-clock"
          iconColor="#ff7043"
          title="Expiring Soon"
          count={expiringSoon.length}
          emptyText="No products expiring within 30 days."
          C={C}
        >
          {expiringSoon.map((p) => {
            const daysLeft = dayjs(p.expiry_date).diff(dayjs(), 'day');
            return (
              <Pressable key={p.id} style={[styles.alertRow, { borderBottomColor: C.border }]} onPress={() => router.push('/(app)/(tabs)/products' as any)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertName, { color: C.text }]}>{p.name}</Text>
                  {p.category_name && <Text style={[styles.alertSub, { color: C.muted }]}>{p.category_name}</Text>}
                </View>
                <View style={[styles.qtyBadge, { backgroundColor: '#ff704322' }]}>
                  <Text style={{ color: '#ff7043', fontWeight: '800', fontSize: 12 }}>
                    {daysLeft === 0 ? 'Today' : daysLeft === 1 ? '1 day' : `${daysLeft} days`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </AlertSection>

      </ScrollView>
    </SafeAreaView>
  );
}

function AlertSection({
  icon, iconColor, title, count, emptyText, children, C,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  title: string;
  count: number;
  emptyText: string;
  children?: React.ReactNode;
  C: any;
}) {
  return (
    <View style={[styles.card, { backgroundColor: C.surface, borderColor: count > 0 ? iconColor + '44' : C.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconDot, { backgroundColor: iconColor + '22' }]}>
          <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={[styles.cardTitle, { color: C.text }]}>{title}</Text>
        {count > 0 && (
          <View style={[styles.countBadge, { backgroundColor: iconColor }]}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
      </View>
      <Divider style={{ marginVertical: 8, backgroundColor: C.border }} />
      {count === 0 ? (
        <Text style={[styles.noAlertText, { color: C.muted }]}>{emptyText}</Text>
      ) : children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  card: { borderRadius: 12, padding: 14, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  iconDot: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  headerBadge: { marginRight: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  headerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  noAlertText: { fontSize: 13, marginTop: 2 },
  alertRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  alertName: { fontSize: 14, fontWeight: '600' },
  alertSub: { fontSize: 12, marginTop: 1 },
  qtyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
});
