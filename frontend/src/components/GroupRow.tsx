import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Group } from '../types/session';

interface Props {
  group: Group;
  onRename: (id: string, name: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<void>;
}

type Mode = 'view' | 'edit' | 'confirm';

export default function GroupRow({ group, onRename, onDelete }: Props) {
  const [mode, setMode] = useState<Mode>('view');
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setName(group.name);
    setError(null);
    setMode('edit');
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Entrez un nom de groupe');
      return;
    }
    if (name.trim() === group.name) {
      setMode('view');
      return;
    }
    setBusy(true);
    const err = await onRename(group.id, name.trim());
    setBusy(false);
    if (err) setError(err);
    else setMode('view');
  };

  const remove = async () => {
    setBusy(true);
    await onDelete(group.id);
    setBusy(false);
  };

  return (
    <View style={styles.card} testID={`group-row-${group.name}`}>
      {mode === 'edit' ? (
        <View style={styles.editRow}>
          <TextInput
            testID={`rename-input-${group.name}`}
            style={styles.input}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={50}
            returnKeyType="done"
            onSubmitEditing={save}
            placeholder="Nom du groupe"
            placeholderTextColor="#666"
          />
          <TouchableOpacity
            testID={`save-rename-${group.name}`}
            style={[styles.saveButton, busy && styles.disabled]}
            onPress={save}
            disabled={busy}
            activeOpacity={0.8}
          >
            {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Ionicons name="checkmark" size={22} color="#FFF" />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => setMode('view')} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color="#888" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.viewRow}>
          <View style={styles.groupIcon}>
            <Ionicons name="people" size={18} color="#FFF" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>{group.name}</Text>
            <Text style={styles.meta}>
              {group.member_count} coureur{group.member_count > 1 ? 's' : ''}
            </Text>
          </View>
          <TouchableOpacity
            testID={`rename-group-${group.name}`}
            style={styles.iconButton}
            onPress={startEdit}
            activeOpacity={0.7}
          >
            <Ionicons name="pencil" size={20} color="#FF6B35" />
          </TouchableOpacity>
          <TouchableOpacity
            testID={`delete-group-${group.name}`}
            style={styles.iconButton}
            onPress={() => setMode('confirm')}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color="#FF5252" />
          </TouchableOpacity>
        </View>
      )}

      {error && mode === 'edit' && <Text style={styles.error}>{error}</Text>}

      {mode === 'confirm' && (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            Supprimer « {group.name} » ? Les coureurs et leurs séances sont conservés.
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setMode('view')} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`confirm-delete-group-${group.name}`}
              style={[styles.deleteButton, busy && styles.disabled]}
              onPress={remove}
              disabled={busy}
              activeOpacity={0.8}
            >
              {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.deleteText}>Supprimer</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1E1E1E', borderRadius: 12, padding: 12, marginBottom: 10 },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  name: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  meta: { color: '#888', fontSize: 12, marginTop: 2 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#FFF',
  },
  saveButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.7 },
  error: { color: '#FF5252', fontSize: 13, marginTop: 8 },
  confirm: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#333' },
  confirmText: { color: '#FFF', fontSize: 14, lineHeight: 20 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  cancelButton: { height: 40, paddingHorizontal: 14, justifyContent: 'center' },
  cancelText: { color: '#888', fontWeight: '600' },
  deleteButton: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#FF5252',
    justifyContent: 'center',
    minWidth: 96,
    alignItems: 'center',
  },
  deleteText: { color: '#FFF', fontWeight: 'bold' },
});
