import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import ProgressChart, { ChartPoint } from '../src/components/ProgressChart';
import RecordsCard from '../src/components/RecordsCard';
import GroupLeaderboard from '../src/components/GroupLeaderboard';
import { formatSeconds, getPerformanceColor, parseDate, shortDate } from '../src/utils/vma';
import { computeRecords } from '../src/utils/records';
import { Group, Runner, RunnerSession } from '../src/types/session';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type Metric = 'speed' | 'time';

const longDate = (iso: string) =>
  parseDate(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

export default function HistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ firstName?: string; lastName?: string }>();
  const [firstName, setFirstName] = useState(params.firstName ?? '');
  const [lastName, setLastName] = useState(params.lastName ?? '');
  const [runnerLabel, setRunnerLabel] = useState('');
  const [sessions, setSessions] = useState<RunnerSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [selectedDistance, setSelectedDistance] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>('speed');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [leaderboardKey, setLeaderboardKey] = useState(0);

  const fetchRunners = useCallback(async () => {
    try {
      const [runnersRes, groupsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/runners`),
        fetch(`${BACKEND_URL}/api/groups`),
      ]);
      if (runnersRes.ok) setRunners(await runnersRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
      setLeaderboardKey((k) => k + 1);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchRunners();
    }, [fetchRunners])
  );

  const fetchSessions = useCallback(async (fn: string, ln: string, isRefresh = false) => {
    if (!fn.trim() || !ln.trim()) {
      setError('Entrez le prénom et le nom du coureur');
      return;
    }
    setError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const qs = `first_name=${encodeURIComponent(fn.trim())}&last_name=${encodeURIComponent(ln.trim())}`;
      const res = await fetch(`${BACKEND_URL}/api/sessions?${qs}`);
      if (!res.ok) throw new Error('fetch failed');
      const data: RunnerSession[] = await res.json();
      setSessions(data);
      setRunnerLabel(`${fn.trim()} ${ln.trim()}`);
      setSearched(true);
    } catch (err) {
      console.error(err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (params.firstName && params.lastName) {
      fetchSessions(params.firstName, params.lastName);
    }
  }, [params.firstName, params.lastName, fetchSessions]);

  // Distances available, most frequent first
  const distances = useMemo(() => {
    const counts = new Map<number, number>();
    sessions.forEach((s) => {
      new Set(s.performances.map((p) => p.distance)).forEach((d) => counts.set(d, (counts.get(d) ?? 0) + 1));
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([d]) => d);
  }, [sessions]);

  useEffect(() => {
    if (selectedDistance === null || !distances.includes(selectedDistance)) {
      setSelectedDistance(distances[0] ?? null);
    }
  }, [distances, selectedDistance]);

  // Best performance at the selected distance for each session, oldest first
  const chartPoints: ChartPoint[] = useMemo(() => {
    if (selectedDistance === null) return [];
    return [...sessions]
      .sort((a, b) => parseDate(a.created_at).getTime() - parseDate(b.created_at).getTime())
      .flatMap((s) => {
        const runs = s.performances.filter((p) => p.distance === selectedDistance);
        if (runs.length === 0) return [];
        const best = runs.reduce((acc, p) => (p.speed > acc.speed ? p : acc));
        return [{ label: shortDate(s.created_at), value: metric === 'speed' ? best.speed : best.time_seconds }];
      });
  }, [sessions, selectedDistance, metric]);

  const formatValue = (v: number) => (metric === 'speed' ? `${v.toFixed(1)}` : formatSeconds(v));

  const progress = useMemo(() => {
    if (chartPoints.length < 2) return null;
    const delta = chartPoints[chartPoints.length - 1].value - chartPoints[0].value;
    const improved = metric === 'speed' ? delta > 0 : delta < 0;
    const text =
      metric === 'speed'
        ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} km/h`
        : `${delta <= 0 ? '-' : '+'}${formatSeconds(Math.abs(delta))}`;
    return { text, improved, flat: delta === 0 };
  }, [chartPoints, metric]);

  const bestValue = useMemo(() => {
    if (chartPoints.length === 0) return null;
    const vals = chartPoints.map((p) => p.value);
    return metric === 'speed' ? Math.max(...vals) : Math.min(...vals);
  }, [chartPoints, metric]);

  const filteredRunners = useMemo(
    () => (groupFilter ? runners.filter((r) => r.group_id === groupFilter) : runners),
    [runners, groupFilter]
  );
  const selectedGroup = groups.find((g) => g.id === groupFilter);

  // Reset the filter if its group was deleted
  useEffect(() => {
    if (groupFilter && !groups.some((g) => g.id === groupFilter)) setGroupFilter(null);
  }, [groups, groupFilter]);

  const records = useMemo(() => computeRecords(sessions), [sessions]);
  const recordKeys = useMemo(() => new Set(records.map((r) => `${r.sessionId}-${r.index}`)), [records]);

  const selectRunner = (fn: string, ln: string) => {
    setFirstName(fn);
    setLastName(ln);
    setDropdownOpen(false);
    fetchSessions(fn, ln);
  };

  const deleteSession = async (id: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setSessions((prev) => prev.filter((s) => s.id !== id));
      fetchRunners();
    } catch (err) {
      console.error(err);
      setError('Impossible de supprimer la séance');
    } finally {
      setPendingDeleteId(null);
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <View style={styles.topBarSide}>
          <TouchableOpacity testID="history-back-button" onPress={goBack} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={26} color="#FFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.topBarTitle}>Historique</Text>
        <View style={[styles.topBarSide, styles.topBarSideRight]}>
          <TouchableOpacity
            testID="manage-groups-button"
            style={styles.manageButton}
            onPress={() => router.push('/groups')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.8}
          >
            <Ionicons name="people" size={16} color="#FF6B35" />
            <Text style={styles.manageButtonText}>Groupes</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                fetchRunners();
                fetchSessions(firstName, lastName, true);
              }}
              tintColor="#FF6B35"
            />
          }
        >
          {/* Runner search */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="person" size={20} color="#FF6B35" />
              <Text style={styles.cardTitle}>Coureur</Text>
            </View>

            {groups.length > 0 && (
              <>
                <Text style={styles.label}>Groupe</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  <TouchableOpacity
                    testID="group-filter-all"
                    style={[styles.chip, !groupFilter && styles.chipActive]}
                    onPress={() => setGroupFilter(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, !groupFilter && styles.chipTextActive]}>Tous</Text>
                  </TouchableOpacity>
                  {groups.map((g) => {
                    const active = g.id === groupFilter;
                    return (
                      <TouchableOpacity
                        key={g.id}
                        testID={`group-filter-${g.name}`}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setGroupFilter(g.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{g.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* All runners dropdown */}
            <Text style={styles.label}>{selectedGroup ? `Coureurs – ${selectedGroup.name}` : 'Tous les coureurs'}</Text>
            <TouchableOpacity
              testID="runner-dropdown"
              style={[styles.dropdown, dropdownOpen && styles.dropdownOpen]}
              onPress={() => setDropdownOpen((o) => !o)}
              activeOpacity={0.8}
            >
              <Ionicons name="people" size={18} color="#FF6B35" />
              <Text style={[styles.dropdownText, !runnerLabel && styles.dropdownPlaceholder]} numberOfLines={1}>
                {runnerLabel ||
                  (filteredRunners.length > 0 ? `Choisir un coureur (${filteredRunners.length})` : 'Aucun coureur enregistré')}
              </Text>
              <Ionicons name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#888" />
            </TouchableOpacity>
            {dropdownOpen && (
              <View style={styles.dropdownList} testID="runner-dropdown-list">
                {filteredRunners.length === 0 ? (
                  <Text style={styles.dropdownEmpty}>
                    {selectedGroup ? 'Aucun coureur dans ce groupe' : 'Aucun coureur enregistré pour le moment'}
                  </Text>
                ) : (
                  <ScrollView nestedScrollEnabled style={styles.dropdownScroll} keyboardShouldPersistTaps="handled">
                    {filteredRunners.map((r) => {
                      const label = `${r.first_name} ${r.last_name}`;
                      const active = label.toLowerCase() === runnerLabel.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={label.toLowerCase()}
                          testID={`runner-option-${r.first_name}-${r.last_name}`}
                          style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                          onPress={() => selectRunner(r.first_name, r.last_name)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                              {`${r.first_name[0] ?? ''}${r.last_name[0] ?? ''}`.toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.dropdownItemName} numberOfLines={1}>{label}</Text>
                            <Text style={styles.dropdownItemMeta}>
                              {r.group_name ? `${r.group_name} · ` : ''}
                              {r.session_count} séance{r.session_count > 1 ? 's' : ''} · dernière le {shortDate(r.last_session)}
                            </Text>
                          </View>
                          {active && <Ionicons name="checkmark" size={20} color="#FF6B35" />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou rechercher</Text>
              <View style={styles.dividerLine} />
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.label}>Prénom</Text>
                <TextInput
                  testID="history-firstname-input"
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Jean"
                  placeholderTextColor="#666"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>Nom</Text>
                <TextInput
                  testID="history-lastname-input"
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Dupont"
                  placeholderTextColor="#666"
                  returnKeyType="search"
                  onSubmitEditing={() => fetchSessions(firstName, lastName)}
                />
              </View>
            </View>
            {error && <Text style={styles.errorText}>{error}</Text>}
            <TouchableOpacity
              testID="history-search-button"
              style={[styles.primaryButton, loading && styles.disabled]}
              onPress={() => fetchSessions(firstName, lastName)}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="search" size={20} color="#FFF" />
                  <Text style={styles.primaryButtonText}>Voir l&apos;historique</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {selectedGroup && (
            <GroupLeaderboard
              groupId={selectedGroup.id}
              groupName={selectedGroup.name}
              refreshKey={leaderboardKey}
              onSelectRunner={selectRunner}
            />
          )}

          {searched && sessions.length === 0 && !loading && (
            <View style={styles.emptyState} testID="history-empty">
              <Ionicons name="calendar-outline" size={44} color="#555" />
              <Text style={styles.emptyTitle}>Aucune séance pour {runnerLabel}</Text>
              <Text style={styles.emptyText}>
                Ajoutez vos courses puis appuyez sur « Enregistrer la séance » depuis l&apos;écran principal.
              </Text>
            </View>
          )}

          {sessions.length > 0 && (
            <>
              {/* Progress chart */}
              <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="trending-up" size={20} color="#FF6B35" />
                  <Text style={styles.cardTitle}>Progression – {runnerLabel}</Text>
                </View>

                <Text style={styles.label}>Distance</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {distances.map((d) => {
                    const active = d === selectedDistance;
                    return (
                      <TouchableOpacity
                        key={d}
                        testID={`distance-chip-${d}`}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setSelectedDistance(d)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{d} m</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.segment}>
                  {(['speed', 'time'] as Metric[]).map((m) => (
                    <TouchableOpacity
                      key={m}
                      testID={`metric-${m}`}
                      style={[styles.segmentItem, metric === m && styles.segmentItemActive]}
                      onPress={() => setMetric(m)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segmentText, metric === m && styles.segmentTextActive]}>
                        {m === 'speed' ? 'Vitesse (km/h)' : 'Temps'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <ProgressChart points={chartPoints} formatValue={formatValue} />

                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Séances</Text>
                    <Text style={styles.statValue}>{chartPoints.length}</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Meilleur</Text>
                    <Text style={styles.statValue} testID="best-value">
                      {bestValue !== null ? `${formatValue(bestValue)}${metric === 'speed' ? ' km/h' : ''}` : '--'}
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Progression</Text>
                    <Text
                      testID="progress-value"
                      style={[
                        styles.statValue,
                        progress && !progress.flat && { color: progress.improved ? '#4CAF50' : '#FF5252' },
                      ]}
                    >
                      {progress ? progress.text : '--'}
                    </Text>
                  </View>
                </View>
                {chartPoints.length < 2 && (
                  <Text style={styles.hintText}>
                    Enregistrez au moins 2 séances sur cette distance pour voir votre progression.
                  </Text>
                )}
              </View>

              <RecordsCard records={records} />

              {/* Sessions list */}
              <Text style={styles.sectionTitle}>Séances ({sessions.length})</Text>
              {sessions.map((s) => {
                const avg = Math.round(s.performances.reduce((sum, p) => sum + p.percentage, 0) / s.performances.length);
                const total = s.performances.reduce((sum, p) => sum + p.distance, 0);
                return (
                  <View key={s.id} style={styles.sessionCard} testID={`session-card-${s.id}`}>
                    <View style={styles.sessionHeader}>
                      <View style={styles.flex}>
                        <Text style={styles.sessionDate}>{longDate(s.created_at)}</Text>
                        <Text style={styles.sessionMeta}>
                          VMA {s.vma_value} km/h · {s.performances.length} course{s.performances.length > 1 ? 's' : ''} · {total} m
                        </Text>
                      </View>
                      <View style={styles.avgPill}>
                        <Text style={styles.avgPillText}>{avg}%</Text>
                      </View>
                      <TouchableOpacity
                        testID={`delete-session-${s.id}`}
                        onPress={() => setPendingDeleteId(s.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.iconButton}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={20} color="#FF5252" />
                      </TouchableOpacity>
                    </View>

                    {s.performances.map((p, i) => (
                      <View key={i} style={styles.perfRow}>
                        <View style={[styles.perfDot, { backgroundColor: getPerformanceColor(p.zone_index) }]} />
                        <Text style={styles.perfDistance}>{p.distance} m</Text>
                        <Text style={styles.perfDetail}>{p.time}</Text>
                        <Text style={styles.perfDetail}>{p.speed} km/h</Text>
                        {recordKeys.has(`${s.id}-${i}`) ? (
                          <Ionicons name="trophy" size={14} color="#FFD700" testID={`record-icon-${s.id}-${i}`} />
                        ) : (
                          <View style={styles.trophySpacer} />
                        )}
                        <Text style={[styles.perfPercent, { color: getPerformanceColor(p.zone_index) }]}>
                          {p.percentage}%
                        </Text>
                      </View>
                    ))}

                    {pendingDeleteId === s.id && (
                      <View style={styles.confirmRow}>
                        <Text style={styles.confirmText}>Supprimer cette séance ?</Text>
                        <TouchableOpacity onPress={() => setPendingDeleteId(null)} style={styles.confirmCancel} activeOpacity={0.7}>
                          <Text style={styles.confirmCancelText}>Annuler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID={`confirm-delete-${s.id}`}
                          onPress={() => deleteSession(s.id)}
                          style={styles.confirmDelete}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.confirmDeleteText}>Supprimer</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#FFF', textAlign: 'center' },
  topBarSide: { width: 110 },
  topBarSideRight: { alignItems: 'flex-end', paddingRight: 8 },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  manageButtonText: { color: '#FF6B35', fontSize: 13, fontWeight: '600' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFF', flexShrink: 1 },
  row: { flexDirection: 'row', gap: 12 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  dropdownOpen: { borderColor: '#FF6B35' },
  dropdownText: { flex: 1, fontSize: 16, color: '#FFF', fontWeight: '600' },
  dropdownPlaceholder: { color: '#888', fontWeight: '400' },
  dropdownList: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    marginTop: 6,
    overflow: 'hidden',
  },
  dropdownScroll: { maxHeight: 280 },
  dropdownEmpty: { color: '#888', fontSize: 14, padding: 16, textAlign: 'center' },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    minHeight: 56,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3A',
  },
  dropdownItemActive: { backgroundColor: 'rgba(255,107,53,0.12)' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  dropdownItemName: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  dropdownItemMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#444' },
  dividerText: { fontSize: 12, color: '#888' },
  label: { fontSize: 12, color: '#888', marginBottom: 6 },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 16,
    color: '#FFF',
  },
  errorText: { color: '#FF5252', fontSize: 14, marginTop: 12, textAlign: 'center' },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    height: 48,
    gap: 8,
    marginTop: 16,
  },
  primaryButtonText: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
  disabled: { opacity: 0.7 },
  emptyState: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFF', marginTop: 12, textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#888', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  chipsRow: { gap: 8, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#FF6B35' },
  chipText: { fontSize: 14, color: '#BBB', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  segment: { flexDirection: 'row', backgroundColor: '#2A2A2A', borderRadius: 10, padding: 4, marginBottom: 8 },
  segmentItem: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentItemActive: { backgroundColor: '#121212' },
  segmentText: { fontSize: 13, color: '#888', fontWeight: '600' },
  segmentTextActive: { color: '#FFF' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 12, color: '#888' },
  statValue: { fontSize: 16, fontWeight: 'bold', color: '#FFF', marginTop: 4 },
  hintText: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF', marginBottom: 12, marginTop: 8 },
  sessionCard: { backgroundColor: '#1E1E1E', borderRadius: 12, padding: 14, marginBottom: 10 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sessionDate: { fontSize: 15, fontWeight: 'bold', color: '#FFF', textTransform: 'capitalize' },
  sessionMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  avgPill: { backgroundColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#FFD700' },
  avgPillText: { color: '#FFD700', fontWeight: 'bold', fontSize: 13 },
  iconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
    gap: 10,
  },
  perfDot: { width: 8, height: 8, borderRadius: 4 },
  perfDistance: { fontSize: 14, fontWeight: '600', color: '#FFF', width: 70 },
  perfDetail: { fontSize: 13, color: '#BBB', flex: 1 },
  perfPercent: { fontSize: 14, fontWeight: 'bold', width: 48, textAlign: 'right' },
  trophySpacer: { width: 14 },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  confirmText: { flex: 1, color: '#FFF', fontSize: 13 },
  confirmCancel: { paddingHorizontal: 12, height: 36, justifyContent: 'center' },
  confirmCancelText: { color: '#888', fontWeight: '600' },
  confirmDelete: { backgroundColor: '#FF5252', borderRadius: 8, paddingHorizontal: 12, height: 36, justifyContent: 'center' },
  confirmDeleteText: { color: '#FFF', fontWeight: 'bold' },
});
