import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface LeaderboardEntry {
  first_name: string;
  last_name: string;
  time: string;
  time_seconds: number;
  speed: number;
  date: string;
}

interface DistanceLeaderboard {
  distance: number;
  entries: LeaderboardEntry[];
}

interface Props {
  groupId: string;
  groupName: string;
  refreshKey: number;
  onSelectRunner: (firstName: string, lastName: string) => void;
}

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function GroupLeaderboard({ groupId, groupName, refreshKey, onSelectRunner }: Props) {
  const [boards, setBoards] = useState<DistanceLeaderboard[]>([]);
  const [distance, setDistance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${BACKEND_URL}/api/groups/${groupId}/leaderboard`);
        if (!res.ok) throw new Error('leaderboard failed');
        const data: DistanceLeaderboard[] = await res.json();
        if (cancelled) return;
        setBoards(data);
        setDistance((prev) => (data.some((b) => b.distance === prev) ? prev : data[0]?.distance ?? null));
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('Impossible de charger le classement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [groupId, refreshKey]);

  const board = boards.find((b) => b.distance === distance);

  return (
    <View style={styles.card} testID="group-leaderboard">
      <View style={styles.titleRow}>
        <Ionicons name="podium" size={20} color="#FF6B35" />
        <Text style={styles.title} numberOfLines={1}>
          Classement – {groupName}
        </Text>
      </View>

      {loading && <ActivityIndicator color="#FF6B35" style={styles.loader} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && !error && boards.length === 0 && (
        <Text style={styles.empty}>Aucune séance enregistrée pour ce groupe.</Text>
      )}

      {!loading && boards.length > 0 && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {boards.map((b) => {
              const active = b.distance === distance;
              return (
                <TouchableOpacity
                  key={b.distance}
                  testID={`leaderboard-distance-${b.distance}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setDistance(b.distance)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{b.distance} m</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {board?.entries.map((e, i) => (
            <TouchableOpacity
              key={`${e.first_name}-${e.last_name}`}
              testID={`leaderboard-row-${i + 1}`}
              style={styles.row}
              onPress={() => onSelectRunner(e.first_name, e.last_name)}
              activeOpacity={0.7}
            >
              <View style={[styles.rank, i < 3 && { backgroundColor: MEDAL_COLORS[i] }]}>
                <Text style={[styles.rankText, i < 3 && styles.rankTextMedal]}>{i + 1}</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {e.first_name} {e.last_name}
              </Text>
              <View style={styles.result}>
                <Text style={styles.time}>{e.time}</Text>
                <Text style={styles.speed}>{e.speed} km/h</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 16, marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#FFF', flexShrink: 1 },
  loader: { marginVertical: 16 },
  error: { color: '#FF5252', textAlign: 'center', marginVertical: 8 },
  empty: { color: '#888', textAlign: 'center', marginVertical: 8 },
  chipsRow: { gap: 8, paddingBottom: 12 },
  chip: { paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: '#2A2A2A', justifyContent: 'center' },
  chipActive: { backgroundColor: '#FF6B35' },
  chipText: { fontSize: 14, color: '#BBB', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  rank: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  rankTextMedal: { color: '#121212' },
  name: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '600' },
  result: { alignItems: 'flex-end' },
  time: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  speed: { color: '#888', fontSize: 12 },
});
