import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Group, Runner } from '../types/session';

interface Props {
  runner: Runner;
  groups: Group[];
  expanded: boolean;
  onToggle: () => void;
  onMove: (groupId: string | null) => Promise<void>;
}

export default function RunnerGroupRow({ runner, groups, expanded, onToggle, onMove }: Props) {
  const [busyId, setBusyId] = useState<string | null | undefined>(undefined);
  const testName = `${runner.first_name}-${runner.last_name}`;

  const move = async (groupId: string | null) => {
    if (groupId === runner.group_id) return;
    setBusyId(groupId);
    await onMove(groupId);
    setBusyId(undefined);
  };

  const options: { id: string | null; name: string }[] = [{ id: null, name: 'Aucun' }, ...groups];

  return (
    <View style={styles.card}>
      <TouchableOpacity testID={`runner-row-${testName}`} style={styles.row} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {`${runner.first_name[0] ?? ''}${runner.last_name[0] ?? ''}`.toUpperCase()}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {runner.first_name} {runner.last_name}
          </Text>
          <Text style={[styles.group, !runner.group_name && styles.noGroup]} numberOfLines={1}>
            {runner.group_name ?? 'Sans groupe'}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'swap-horizontal'} size={20} color="#888" />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.options}>
          <Text style={styles.optionsLabel}>Déplacer vers :</Text>
          <View style={styles.chips}>
            {options.map((o) => {
              const active = o.id === runner.group_id;
              return (
                <TouchableOpacity
                  key={o.id ?? 'none'}
                  testID={`move-${testName}-${o.id ? o.name : 'none'}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => move(o.id)}
                  disabled={busyId !== undefined}
                  activeOpacity={0.8}
                >
                  {busyId === o.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.name}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1E1E1E', borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, minHeight: 60 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FF6B35', fontWeight: 'bold', fontSize: 13 },
  flex: { flex: 1 },
  name: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  group: { color: '#FF6B35', fontSize: 12, marginTop: 2, fontWeight: '600' },
  noGroup: { color: '#888', fontWeight: '400' },
  options: { paddingHorizontal: 12, paddingBottom: 12 },
  optionsLabel: { color: '#888', fontSize: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 64,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#FF6B35' },
  chipText: { color: '#BBB', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
});
