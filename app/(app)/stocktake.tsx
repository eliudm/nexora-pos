import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Alert, TextInput as RNInput } from 'react-native';
import { Text, Button, Appbar, Card, Portal, Dialog, Chip, Divider, Badge } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { stocktakeQueries, StocktakeItem } from '../../src/db/stocktake';
import { useSession } from '../../src/context/session';
import { useTheme } from '../../src/context/theme';

export default function StocktakeScreen() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { colors: C } = useTheme();
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [applyAdjustments, setApplyAdjustments] = useState(true);
  const [counts, setCounts] = useState<Record<number, string>>({});

  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ['stocktake-session'],
    queryFn: stocktakeQueries.getOpenSession,
  });

  const startMutation = useMutation({
    mutationFn: () => stocktakeQueries.startSession(user?.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stocktake-session'] }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ itemId, qty }: { itemId: number; qty: number }) =>
      stocktakeQueries.updateCount(itemId, qty),
  });

  const completeMutation = useMutation({
    mutationFn: () => stocktakeQueries.complete(session!.id, applyAdjustments, user?.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocktake-session'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setCompleteDialogOpen(false);
      Alert.alert('Complete', 'Stocktake completed successfully!');
    },
  });

  const handleCount = (item: StocktakeItem, value: string) => {
    setCounts((c) => ({ ...c, [item.id]: value }));
    const qty = parseFloat(value);
    if (!isNaN(qty) && qty >= 0) {
      updateMutation.mutate({ itemId: item.id, qty });
    }
  };

  const countedItems = session?.items?.filter((i) => i.counted_qty !== null).length ?? 0;
  const totalItems = session?.items?.length ?? 0;
  const varianceItems = session?.items?.filter((i) => i.variance !== null && i.variance !== 0).length ?? 0;
  const styles = makeStyles(C);

  return (
    <SafeAreaView style={styles.safe}>
      <Appbar.Header style={styles.header}>
        <Appbar.Content title="Stock Count" titleStyle={styles.headerTitle} />
        {session && (
          <Appbar.Action
            icon="check-circle"
            color="#fff"
            onPress={() => setCompleteDialogOpen(true)}
          />
        )}
      </Appbar.Header>

      {!session ? (
        <View style={styles.noSession}>
          <MaterialCommunityIcons name="clipboard-list-outline" size={64} color="#ccc" />
          <Text style={styles.noSessionText}>No active stocktake</Text>
          <Text style={styles.noSessionSub}>Start a new stock count to compare physical inventory against system quantities.</Text>
          <Button
            mode="contained"
            icon="play"
            onPress={() => startMutation.mutate()}
            loading={startMutation.isPending}
            style={styles.startBtn}
          >
            Start Stock Count
          </Button>
        </View>
      ) : (
        <>
          <View style={styles.progressBar}>
            <View style={styles.progressStats}>
              <View style={styles.progressStat}>
                <Text style={styles.progressNum}>{countedItems}</Text>
                <Text style={styles.progressLabel}>Counted</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={styles.progressNum}>{totalItems - countedItems}</Text>
                <Text style={styles.progressLabel}>Remaining</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={[styles.progressNum, { color: varianceItems > 0 ? '#e53935' : '#22c55e' }]}>{varianceItems}</Text>
                <Text style={styles.progressLabel}>Variances</Text>
              </View>
            </View>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: totalItems > 0 ? `${(countedItems / totalItems) * 100}%` : '0%' }]} />
            </View>
          </View>

          <FlatList
            data={session.items ?? []}
            keyExtractor={(i) => String(i.id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const variance = item.variance;
              const isCounted = item.counted_qty !== null;
              return (
                <View style={[styles.itemRow, isCounted && styles.itemRowCounted]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.product_name}</Text>
                    <Text style={styles.itemExpected}>System: {item.expected_qty}</Text>
                  </View>
                  <RNInput
                    value={counts[item.id] ?? (isCounted ? String(item.counted_qty) : '')}
                    onChangeText={(v) => handleCount(item, v)}
                    keyboardType="decimal-pad"
                    placeholder="Count"
                    style={styles.countInput}
                    placeholderTextColor="#bbb"
                  />
                  {isCounted && (
                    <View style={[styles.varianceBadge, { backgroundColor: variance === 0 ? '#f0fdf4' : variance! > 0 ? '#eff6ff' : '#fef2f2' }]}>
                      <Text style={[styles.varianceText, { color: variance === 0 ? '#16a34a' : variance! > 0 ? '#2563eb' : '#dc2626' }]}>
                        {variance! > 0 ? '+' : ''}{variance}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        </>
      )}

      <Portal>
        <Dialog visible={completeDialogOpen} onDismiss={() => setCompleteDialogOpen(false)}>
          <Dialog.Title>Complete Stocktake</Dialog.Title>
          <Dialog.Content>
            <Text style={{ color: '#555', marginBottom: 12 }}>
              {varianceItems} product(s) have variances. Apply adjustments to update system stock quantities?
            </Text>
            <View style={styles.applyRow}>
              <Chip
                selected={applyAdjustments}
                onPress={() => setApplyAdjustments(true)}
                style={applyAdjustments ? styles.applyChipActive : styles.applyChip}
              >
                Apply Adjustments
              </Chip>
              <Chip
                selected={!applyAdjustments}
                onPress={() => setApplyAdjustments(false)}
                style={!applyAdjustments ? styles.applyChipActive : styles.applyChip}
              >
                Report Only
              </Chip>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCompleteDialogOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={() => completeMutation.mutate()} loading={completeMutation.isPending}>
              Complete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { backgroundColor: C.accent },
    headerTitle: { color: '#fff', fontWeight: '700' },
    noSession: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    noSessionText: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 16 },
    noSessionSub: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    startBtn: { marginTop: 24, backgroundColor: C.accent },
    progressBar: { backgroundColor: C.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border },
    progressStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
    progressStat: { alignItems: 'center' },
    progressNum: { fontSize: 20, fontWeight: '800', color: C.accent },
    progressLabel: { fontSize: 11, color: C.muted, marginTop: 2 },
    barBg: { height: 8, backgroundColor: C.elevated, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', backgroundColor: C.accent, borderRadius: 4 },
    list: { padding: 8, paddingBottom: 20 },
    itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 8, padding: 12, marginBottom: 6, elevation: 1 },
    itemRowCounted: { borderLeftWidth: 3, borderLeftColor: C.accent },
    itemName: { fontSize: 13, fontWeight: '600', color: C.text },
    itemExpected: { fontSize: 11, color: C.muted, marginTop: 2 },
    countInput: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 8, width: 70, textAlign: 'center', fontSize: 16, fontWeight: '700', marginHorizontal: 8 },
    varianceBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 44, alignItems: 'center' },
    varianceText: { fontSize: 13, fontWeight: '700' },
    applyRow: { flexDirection: 'row', gap: 8 },
    applyChip: { flex: 1, backgroundColor: C.elevated },
    applyChipActive: { flex: 1, backgroundColor: C.accent },
  });
}
