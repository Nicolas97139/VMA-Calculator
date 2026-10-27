import React, { useCallback, useState } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import GroupRow from '../src/components/GroupRow';
import RunnerGroupRow from '../src/components/RunnerGroupRow';
import { Group, Runner } from '../src/types/session';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default function GroupsScreen() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRunner, setExpandedRunner] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [groupsRes, runnersRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/groups`),
        fetch(`${BACKEND_URL}/api/runners`),
      ]);
      if (!groupsRes.ok || !runnersRes.ok) throw new Error('load failed');
      setGroups(await groupsRes.json());
      setRunners(await runnersRes.json());
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const createGroup = async () => {
    if (!newName.trim()) {
      setError('Entrez un nom de groupe');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/groups`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error('create failed');
      setNewName('');
      await load();
    } catch (err) {
      console.error(err);
      setError('Impossible de créer le groupe');
    } finally {
      setCreating(false);
    }
  };

  const renameGroup = async (id: string, name: string): Promise<string | null> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/groups/${id}`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ name }),
      });
      if (res.status === 409) return 'Un groupe porte déjà ce nom';
      if (!res.ok) return 'Impossible de renommer le groupe';
      await load();
      return null;
    } catch (err) {
      console.error(err);
      return 'Erreur de connexion au serveur';
    }
  };

  const deleteGroup = async (id: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/groups/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      await load();
    } catch (err) {
      console.error(err);
      setError('Impossible de supprimer le groupe');
    }
  };

  const moveRunner = async (runner: Runner, groupId: string | null) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/runners/group`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ first_name: runner.first_name, last_name: runner.last_name, group_id: groupId }),
      });
      if (!res.ok) throw new Error('move failed');
      await load();
      setExpandedRunner(null);
    } catch (err) {
      console.error(err);
      setError('Impossible de changer le groupe du coureur');
    }
  };

  const deleteRunner = async (runner: Runner) => {
    try {
      const qs = `first_name=${encodeURIComponent(runner.first_name)}&last_name=${encodeURIComponent(runner.last_name)}`;
      const res = await fetch(`${BACKEND_URL}/api/runners?${qs}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setExpandedRunner(null);
      await load();
    } catch (err) {
      console.error(err);
      setError('Impossible de supprimer le coureur');
    }
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/history'));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <TouchableOpacity testID="groups-back-button" onPress={goBack} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Gérer les groupes</Text>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#FF6B35" />}
        >
          {/* Create group */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nouveau groupe</Text>
            <View style={styles.createRow}>
              <TextInput
                testID="groups-new-input"
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="Ex : Groupe du mardi"
                placeholderTextColor="#666"
                maxLength={50}
                returnKeyType="done"
                onSubmitEditing={createGroup}
              />
              <TouchableOpacity
                testID="groups-create-button"
                style={[styles.createButton, creating && styles.disabled]}
                onPress={createGroup}
                disabled={creating}
                activeOpacity={0.8}
              >
                {creating ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="add" size={20} color="#FFF" />
                    <Text style={styles.createButtonText}>Créer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            {error && <Text style={styles.error} testID="groups-error">{error}</Text>}
          </View>

          {loading ? (
            <ActivityIndicator color="#FF6B35" style={styles.loader} />
          ) : (
            <>
              <Text style={styles.sectionTitle}>Groupes ({groups.length})</Text>
              {groups.length === 0 ? (
                <Text style={styles.empty}>Aucun groupe pour le moment.</Text>
              ) : (
                groups.map((g) => <GroupRow key={g.id} group={g} onRename={renameGroup} onDelete={deleteGroup} />)
              )}

              <Text style={styles.sectionTitle}>Coureurs ({runners.length})</Text>
              {runners.length === 0 ? (
                <Text style={styles.empty}>
                  Les coureurs apparaissent ici après leur première séance enregistrée.
                </Text>
              ) : (
                <>
                  <Text style={styles.hint}>Touchez un coureur pour changer son groupe, ou la corbeille pour le supprimer.</Text>
                  {runners.map((r) => {
                    const key = `${r.first_name}|${r.last_name}`.toLowerCase();
                    return (
                      <RunnerGroupRow
                        key={key}
                        runner={r}
                        groups={groups}
                        expanded={expandedRunner === key}
                        onToggle={() => setExpandedRunner((cur) => (cur === key ? null : key))}
                        onMove={(groupId) => moveRunner(r, groupId)}
                        onDelete={() => deleteRunner(r)}
                      />
                    );
                  })}
                </>
              )}
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
  topBarTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  card: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFF', marginBottom: 12 },
  createRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#FFF',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#FF6B35',
    minWidth: 96,
  },
  createButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  disabled: { opacity: 0.7 },
  error: { color: '#FF5252', fontSize: 14, marginTop: 10, textAlign: 'center' },
  loader: { marginTop: 32 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF', marginTop: 8, marginBottom: 12 },
  empty: { color: '#888', fontSize: 14, marginBottom: 16 },
  hint: { color: '#888', fontSize: 13, marginBottom: 10 },
});
