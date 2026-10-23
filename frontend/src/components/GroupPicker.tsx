import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Group } from '../types/session';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Props {
  value: string | null;
  onChange: (groupId: string | null) => void;
}

export default function GroupPicker({ value, onChange }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/groups`);
      if (res.ok) setGroups(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const selected = groups.find((g) => g.id === value);

  const toggle = () => {
    if (!open) loadGroups();
    setOpen((o) => !o);
    setCreating(false);
    setError(null);
  };

  const select = (id: string | null) => {
    onChange(id);
    setOpen(false);
  };

  const createGroup = async () => {
    if (!newName.trim()) {
      setError('Entrez un nom de groupe');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error('create failed');
      const group: Group = await res.json();
      setGroups((prev) =>
        prev.some((g) => g.id === group.id)
          ? prev
          : [...prev, group].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      );
      setNewName('');
      setCreating(false);
      select(group.id);
    } catch (err) {
      console.error(err);
      setError('Impossible de créer le groupe');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.label}>Groupe d&apos;entraînement</Text>
      <TouchableOpacity
        testID="group-picker"
        style={[styles.dropdown, open && styles.dropdownOpen]}
        onPress={toggle}
        activeOpacity={0.8}
      >
        <Ionicons name="people" size={18} color="#FF6B35" />
        <Text style={[styles.dropdownText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.name : 'Aucun groupe'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#888" />
      </TouchableOpacity>

      {open && (
        <View style={styles.list} testID="group-picker-list">
          <TouchableOpacity testID="group-option-none" style={styles.item} onPress={() => select(null)} activeOpacity={0.7}>
            <Text style={[styles.itemText, styles.placeholder]}>Aucun groupe</Text>
            {!value && <Ionicons name="checkmark" size={20} color="#FF6B35" />}
          </TouchableOpacity>

          {groups.map((g) => (
            <TouchableOpacity
              key={g.id}
              testID={`group-option-${g.name}`}
              style={[styles.item, g.id === value && styles.itemActive]}
              onPress={() => select(g.id)}
              activeOpacity={0.7}
            >
              <View style={styles.flex}>
                <Text style={styles.itemText} numberOfLines={1}>{g.name}</Text>
                <Text style={styles.itemMeta}>
                  {g.member_count} coureur{g.member_count > 1 ? 's' : ''}
                </Text>
              </View>
              {g.id === value && <Ionicons name="checkmark" size={20} color="#FF6B35" />}
            </TouchableOpacity>
          ))}

          {creating ? (
            <View style={styles.createRow}>
              <TextInput
                testID="new-group-input"
                style={styles.createInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Nom du groupe"
                placeholderTextColor="#666"
                autoFocus
                maxLength={50}
                returnKeyType="done"
                onSubmitEditing={createGroup}
              />
              <TouchableOpacity
                testID="create-group-button"
                style={[styles.createButton, busy && styles.disabled]}
                onPress={createGroup}
                disabled={busy}
                activeOpacity={0.8}
              >
                {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.createButtonText}>Créer</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity testID="new-group-option" style={styles.item} onPress={() => setCreating(true)} activeOpacity={0.7}>
              <Ionicons name="add-circle" size={20} color="#FF6B35" />
              <Text style={[styles.itemText, styles.newGroupText]}>Nouveau groupe</Text>
            </TouchableOpacity>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: '#888', marginBottom: 6 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  dropdownOpen: { borderColor: '#FF6B35' },
  dropdownText: { flex: 1, fontSize: 16, color: '#FFF' },
  placeholder: { color: '#888' },
  list: { backgroundColor: '#2A2A2A', borderRadius: 8, marginTop: 6, overflow: 'hidden' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 48,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3A',
  },
  itemActive: { backgroundColor: 'rgba(255,107,53,0.12)' },
  flex: { flex: 1 },
  itemText: { fontSize: 15, color: '#FFF', fontWeight: '600', flexShrink: 1 },
  itemMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  newGroupText: { color: '#FF6B35' },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  createInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#FFF',
  },
  createButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  disabled: { opacity: 0.7 },
  error: { color: '#FF5252', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
});
