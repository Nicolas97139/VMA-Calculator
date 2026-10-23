import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { exportCsv, exportPdf, RunnerExportData } from '../utils/runnerExport';

type Format = 'pdf' | 'csv';

export default function RunnerExportCard({ data }: { data: RunnerExportData }) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (format: Format) => {
    setBusy(format);
    setError(null);
    try {
      await (format === 'pdf' ? exportPdf(data) : exportCsv(data));
    } catch (err) {
      console.error('Runner export error:', err);
      setError('Impossible d\'exporter les données');
    } finally {
      setBusy(null);
    }
  };

  const buttons: { format: Format; label: string; icon: 'document-text' | 'grid' }[] = [
    { format: 'pdf', label: 'Fiche PDF', icon: 'document-text' },
    { format: 'csv', label: 'Excel (CSV)', icon: 'grid' },
  ];

  return (
    <View style={styles.card} testID="runner-export-card">
      <View style={styles.titleRow}>
        <Ionicons name="share-outline" size={20} color="#FF6B35" />
        <Text style={styles.title} numberOfLines={1}>
          Exporter – {data.firstName} {data.lastName}
        </Text>
      </View>
      <Text style={styles.subtitle}>Infos coureur, records et détail de toutes les séances</Text>
      <View style={styles.row}>
        {buttons.map((b) => (
          <TouchableOpacity
            key={b.format}
            testID={`export-${b.format}-button`}
            style={[styles.button, b.format === 'pdf' ? styles.pdf : styles.csv, busy !== null && styles.disabled]}
            onPress={() => run(b.format)}
            disabled={busy !== null}
            activeOpacity={0.8}
          >
            {busy === b.format ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name={b.icon} size={20} color="#FFF" />
                <Text style={styles.buttonText}>{b.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1E1E1E', borderRadius: 16, padding: 16, marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#FFF', flexShrink: 1 },
  subtitle: { fontSize: 12, color: '#888', marginTop: 4, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 10,
  },
  pdf: { backgroundColor: '#E53935' },
  csv: { backgroundColor: '#2E7D32' },
  disabled: { opacity: 0.7 },
  buttonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  error: { color: '#FF5252', fontSize: 13, textAlign: 'center', marginTop: 10 },
});
