import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { PersonalRecord } from '../utils/records';
import { shortDate } from '../utils/vma';

export default function RecordsCard({ records }: { records: PersonalRecord[] }) {
  if (records.length === 0) return null;
  return (
    <View style={styles.card} testID="records-card">
      <View style={styles.titleRow}>
        <Ionicons name="trophy" size={20} color="#FFD700" />
        <Text style={styles.title}>Records personnels</Text>
      </View>
      {records.map((r) => (
        <View key={r.distance} style={styles.row} testID={`record-${r.distance}`}>
          <View style={styles.distancePill}>
            <Text style={styles.distanceText}>{r.distance} m</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.time}>{r.time}</Text>
            <Text style={styles.meta}>
              {r.speed} km/h · le {shortDate(r.date)}
            </Text>
          </View>
          <Ionicons name="medal" size={22} color="#FFD700" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#FFD700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  distancePill: {
    minWidth: 76,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
  },
  distanceText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  flex: { flex: 1 },
  time: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  meta: { color: '#888', fontSize: 12, marginTop: 2 },
});
