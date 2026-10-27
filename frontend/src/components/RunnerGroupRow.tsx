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
  onDelete: () => Promise<void>;
}

export default function RunnerGroupRow({ runner, groups, expanded, onToggle, onMove, onDelete }: Props) {
  const [busyId, setBusyId] = useState<string | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const testName = `${runner.first_name}-${runner.last_name}`;

  const remove = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  const move = async (groupId: string | null) => {
    if (groupId === runner.group_id) return;
    setBusyId(groupId);
    await onMove(groupId);
    setBusyId(undefined);
  };

  const options: { id: string | null; name: string }[] = [{ id: null, name: 'Aucun' }, ...groups];

  return (
    <View style={styles.card}>
      <View style={styles.rowWrapper}>
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
        <TouchableOpacity
          testID={`delete-runner-${testName}`}
          style={styles.deleteIcon}
          onPress={() => setConfirmDelete(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color="#FF5252" />
        </TouchableOpacity>
      </View>

      {confirmDelete && (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            Supprimer {runner.first_name} {runner.last_name} et ses {runner.session_count} séance
            {runner.session_count > 1 ? 's' : ''} ? Cette action est définitive.
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setConfirmDelete(false)} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`confirm-delete-runner-${testName}`}
              style={[styles.deleteButton, deleting && styles.disabled]}
              onPress={remove}
              disabled={deleting}
              activeOpacity={0.8}
            >
              {deleting ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.deleteText}>Supprimer</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

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
  rowWrapper: { flexDirection: 'row', alignItems: 'center' },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, minHeight: 60 },
  deleteIcon: { width: 48, height: 60, alignItems: 'center', justifyContent: 'center' },
  confirm: { marginHorizontal: 12, marginBottom: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#333' },
  confirmText: { color: '#FFF', fontSize: 14, lineHeight: 20 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  cancelButton: { height: 40, paddingHorizontal: 14, justifyContent: 'center' },
  cancelText: { color: '#888', fontWeight: '600' },
  deleteButton: {
    height: 40,
    minWidth: 96,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#FF5252',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: '#FFF', fontWeight: 'bold' },
  disabled: { opacity: 0.7 },
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
