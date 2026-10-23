import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@react-native-vector-icons/ionicons';
import * as MediaLibrary from 'expo-media-library';
import ViewShot from 'react-native-view-shot';
import { useRouter } from 'expo-router';
import { formatSeconds, getZoneColor } from '../src/utils/vma';
import GroupPicker from '../src/components/GroupPicker';
import { NewRecord } from '../src/types/session';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface TrainingZone {
  name: string;
  percentage_min: number;
  percentage_max: number;
  description: string;
  speed_min: number;
  speed_max: number;
  pace_min: string;
  pace_max: string;
}

interface VMAResult {
  vma_value: number;
  zones: TrainingZone[];
}

interface PerformanceAnalysis {
  id: string;
  distance: number;
  time: string;
  timeSeconds: number;
  speed: number;
  pace: string;
  percentage: number;
  zone: TrainingZone | null;
  zoneIndex: number;
}

export default function Index() {
  const router = useRouter();
  const [vmaInput, setVmaInput] = useState('');
  const [result, setResult] = useState<VMAResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Runner info
  const [runnerFirstName, setRunnerFirstName] = useState('');
  const [runnerLastName, setRunnerLastName] = useState('');
  const [runnerGroupId, setRunnerGroupId] = useState<string | null>(null);
  
  // Performance analysis states
  const [distanceInput, setDistanceInput] = useState('');
  const [timeMinutes, setTimeMinutes] = useState('');
  const [timeSeconds, setTimeSeconds] = useState('');
  const [performances, setPerformances] = useState<PerformanceAnalysis[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  // Export states
  const [exporting, setExporting] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

  // Session saving states
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; message: string; records?: NewRecord[] } | null>(null);

  // Any change in races invalidates the "saved" status
  useEffect(() => {
    setSaveStatus(null);
  }, [performances]);

  const openHistory = () => {
    router.push({
      pathname: '/history',
      params: { firstName: runnerFirstName.trim(), lastName: runnerLastName.trim() },
    });
  };

  // Prefill the group of a known runner once both names are entered
  const loadRunnerProfile = async () => {
    if (!runnerFirstName.trim() || !runnerLastName.trim()) return;
    try {
      const qs = `first_name=${encodeURIComponent(runnerFirstName.trim())}&last_name=${encodeURIComponent(runnerLastName.trim())}`;
      const res = await fetch(`${BACKEND_URL}/api/runners/profile?${qs}`);
      if (!res.ok) return;
      const profile: { group_id: string | null } = await res.json();
      if (profile.group_id) setRunnerGroupId(profile.group_id);
    } catch (err) {
      console.error(err);
    }
  };

  const saveSession = async () => {
    if (!result || performances.length === 0) return;
    if (!runnerFirstName.trim() || !runnerLastName.trim()) {
      setSaveStatus({ ok: false, message: 'Entrez le prénom et le nom du coureur pour enregistrer la séance' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: runnerFirstName.trim(),
          last_name: runnerLastName.trim(),
          vma_value: result.vma_value,
          group_id: runnerGroupId,
          // Chronological order (list is displayed newest first)
          performances: [...performances].reverse().map((p) => ({
            distance: p.distance,
            time: p.time,
            time_seconds: p.timeSeconds,
            speed: p.speed,
            pace: p.pace,
            percentage: p.percentage,
            zone_name: p.zone?.name ?? null,
            zone_index: p.zoneIndex,
          })),
        }),
      });
      if (!response.ok) throw new Error('save failed');
      const saved: { new_records: NewRecord[] } = await response.json();
      setSaveStatus({ ok: true, message: 'Séance enregistrée dans l\'historique', records: saved.new_records });
    } catch (err) {
      console.error('Save session error:', err);
      setSaveStatus({ ok: false, message: 'Impossible d\'enregistrer la séance' });
    } finally {
      setSaving(false);
    }
  };

  const calculateVMA = useCallback(async () => {
    const vmaValue = parseFloat(vmaInput.replace(',', '.'));
    
    if (isNaN(vmaValue) || vmaValue <= 0) {
      setError('Veuillez entrer une VMA valide');
      return;
    }
    
    if (vmaValue > 30) {
      setError('La VMA doit être inférieure à 30 km/h');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/calculate?vma_value=${vmaValue}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Erreur lors du calcul');
      }

      const data: VMAResult = await response.json();
      setResult(data);

      // Save to history
      await fetch(`${BACKEND_URL}/api/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vma_value: vmaValue }),
      });
    } catch (err) {
      setError('Erreur de connexion au serveur');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [vmaInput]);

  const resetCalculation = () => {
    setVmaInput('');
    setResult(null);
    setError(null);
    setPerformances([]);
    setDistanceInput('');
    setTimeMinutes('');
    setTimeSeconds('');
    setAnalysisError(null);
    setRunnerFirstName('');
    setRunnerLastName('');
    setRunnerGroupId(null);
  };

  const exportToGallery = async () => {
    if (performances.length === 0) {
      Alert.alert('Erreur', 'Ajoutez au moins une course pour exporter');
      return;
    }

    if (!runnerFirstName.trim() || !runnerLastName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer votre nom et prénom');
      return;
    }

    setExporting(true);

    try {
      // Check then request write-only permission
      let perm = await MediaLibrary.getPermissionsAsync(true);
      if (perm.status !== 'granted' && perm.canAskAgain) {
        perm = await MediaLibrary.requestPermissionsAsync(true);
      }
      if (perm.status !== 'granted') {
        Alert.alert(
          'Accès à la pellicule',
          'Autorisez l\'accès à la pellicule pour y enregistrer votre récapitulatif.',
          perm.canAskAgain
            ? [{ text: 'OK' }]
            : [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Ouvrir les réglages', onPress: () => Linking.openSettings() },
              ]
        );
        return;
      }

      // Capture the view
      if (viewShotRef.current) {
        const uri = await viewShotRef.current.capture?.();
        if (uri) {
          // Save to gallery
          await MediaLibrary.Asset.create(uri);
          Alert.alert('Succès', 'Récapitulatif exporté dans votre pellicule !');
        }
      }
    } catch (err) {
      console.error('Export error:', err);
      Alert.alert('Erreur', 'Impossible d\'exporter le récapitulatif');
    } finally {
      setExporting(false);
    }
  };

  const analyzePerformance = useCallback(() => {
    if (!result) {
      setAnalysisError('Calculez d\'abord votre VMA');
      return;
    }

    const distanceMeters = parseFloat(distanceInput.replace(',', '.'));
    const minutes = parseInt(timeMinutes) || 0;
    const seconds = parseInt(timeSeconds) || 0;
    const totalTimeMinutes = minutes + seconds / 60;

    if (isNaN(distanceMeters) || distanceMeters <= 0) {
      setAnalysisError('Veuillez entrer une distance valide');
      return;
    }

    if (totalTimeMinutes <= 0) {
      setAnalysisError('Veuillez entrer un temps valide');
      return;
    }

    setAnalysisError(null);

    // Convert distance from meters to km
    const distanceKm = distanceMeters / 1000;

    // Calculate speed in km/h
    const timeInHours = totalTimeMinutes / 60;
    const speed = distanceKm / timeInHours;
    
    // Calculate pace (min:sec per km)
    const paceMinutes = totalTimeMinutes / distanceKm;
    const paceMin = Math.floor(paceMinutes);
    const paceSec = Math.round((paceMinutes - paceMin) * 60);
    const paceStr = `${paceMin}:${paceSec.toString().padStart(2, '0')}`;

    // Calculate percentage of VMA
    const percentage = (speed / result.vma_value) * 100;

    // Find which zone this falls into
    let matchingZone: TrainingZone | null = null;
    let zoneIndex = -1;

    for (let i = 0; i < result.zones.length; i++) {
      const zone = result.zones[i];
      if (percentage >= zone.percentage_min && percentage <= zone.percentage_max) {
        matchingZone = zone;
        zoneIndex = i;
        break;
      }
    }

    // Handle edge cases
    if (!matchingZone) {
      if (percentage < 50) {
        matchingZone = result.zones[0]; // Below recovery
        zoneIndex = -1; // Special case: below zones
      } else if (percentage > 110) {
        matchingZone = result.zones[result.zones.length - 1]; // Above max
        zoneIndex = result.zones.length; // Special case: above zones
      }
    }

    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const newPerformance: PerformanceAnalysis = {
      id: Date.now().toString(),
      distance: distanceMeters,
      time: timeStr,
      timeSeconds: minutes * 60 + seconds,
      speed: Math.round(speed * 10) / 10,
      pace: paceStr,
      percentage: Math.round(percentage),
      zone: matchingZone,
      zoneIndex,
    };

    setPerformances(prev => [newPerformance, ...prev]);
    
    // Reset inputs for next entry
    setDistanceInput('');
    setTimeMinutes('');
    setTimeSeconds('');
  }, [result, distanceInput, timeMinutes, timeSeconds]);

  const removePerformance = (id: string) => {
    setPerformances(prev => prev.filter(p => p.id !== id));
  };

  const clearAllPerformances = () => {
    setPerformances([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="fitness" size={48} color="#FF6B35" />
            <Text style={styles.title}>Calculateur VMA</Text>
            <Text style={styles.subtitle}>Calcul des zones d&apos;entraînement</Text>
            <Text style={styles.authorText}>by M.DURAND</Text>
            <TouchableOpacity
              testID="open-history-button"
              style={styles.historyButton}
              onPress={openHistory}
              activeOpacity={0.8}
            >
              <Ionicons name="time-outline" size={18} color="#FF6B35" />
              <Text style={styles.historyButtonText}>Historique</Text>
            </TouchableOpacity>
          </View>

          {/* Input Section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Votre VMA (km/h)</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={vmaInput}
                onChangeText={setVmaInput}
                placeholder="Ex: 15.5"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={calculateVMA}
              />
              <Text style={styles.inputUnit}>km/h</Text>
            </View>
            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}
            
            <TouchableOpacity
              style={[styles.calculateButton, loading && styles.buttonDisabled]}
              onPress={calculateVMA}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="calculator" size={24} color="#FFF" />
                  <Text style={styles.buttonText}>Calculer</Text>
                </>
              )}
            </TouchableOpacity>

            {result && (
              <TouchableOpacity
                style={styles.resetButton}
                onPress={resetCalculation}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={20} color="#FF6B35" />
                <Text style={styles.resetButtonText}>Nouveau calcul</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Results Section */}
          {result && (
            <View style={styles.resultsSection}>
              <View style={styles.vmaDisplayContainer}>
                <Text style={styles.vmaDisplayLabel}>VMA</Text>
                <Text style={styles.vmaDisplayValue}>{result.vma_value} km/h</Text>
              </View>

              {/* Runner Info Section */}
              <View style={styles.runnerInfoSection}>
                <View style={styles.runnerInfoTitleRow}>
                  <Ionicons name="person" size={20} color="#FF6B35" />
                  <Text style={styles.runnerInfoTitle}>Informations coureur</Text>
                </View>
                <View style={styles.runnerInputsRow}>
                  <View style={styles.runnerInputGroup}>
                    <Text style={styles.runnerInputLabel}>Prénom</Text>
                    <TextInput
                      style={styles.runnerInput}
                      value={runnerFirstName}
                      onChangeText={setRunnerFirstName}
                      onBlur={loadRunnerProfile}
                      placeholder="Jean"
                      placeholderTextColor="#666"
                    />
                  </View>
                  <View style={styles.runnerInputGroup}>
                    <Text style={styles.runnerInputLabel}>Nom</Text>
                    <TextInput
                      style={styles.runnerInput}
                      value={runnerLastName}
                      onChangeText={setRunnerLastName}
                      onBlur={loadRunnerProfile}
                      placeholder="Dupont"
                      placeholderTextColor="#666"
                    />
                  </View>
                </View>
                <View style={styles.groupPickerWrapper}>
                  <GroupPicker value={runnerGroupId} onChange={setRunnerGroupId} />
                </View>
              </View>

              {/* Performance Analysis Section */}
              <View style={styles.analysisSection}>
                <View style={styles.analysisTitleRow}>
                  <Ionicons name="analytics" size={22} color="#FF6B35" />
                  <Text style={styles.analysisTitle}>Analyser une performance</Text>
                </View>
                <Text style={styles.analysisSubtitle}>
                  Entrez une distance et un temps pour situer votre intensité
                </Text>

                <View style={styles.analysisInputRow}>
                  <View style={styles.analysisInputGroup}>
                    <Text style={styles.analysisInputLabel}>Distance</Text>
                    <View style={styles.analysisInputContainer}>
                      <TextInput
                        style={styles.analysisInput}
                        value={distanceInput}
                        onChangeText={setDistanceInput}
                        placeholder="1000"
                        placeholderTextColor="#666"
                        keyboardType="decimal-pad"
                      />
                      <Text style={styles.analysisInputUnit}>m</Text>
                    </View>
                  </View>

                  <View style={styles.analysisInputGroup}>
                    <Text style={styles.analysisInputLabel}>Temps</Text>
                    <View style={styles.timeInputRow}>
                      <View style={styles.analysisInputContainer}>
                        <TextInput
                          style={styles.analysisInput}
                          value={timeMinutes}
                          onChangeText={setTimeMinutes}
                          placeholder="25"
                          placeholderTextColor="#666"
                          keyboardType="number-pad"
                          maxLength={3}
                        />
                        <Text style={styles.analysisInputUnit}>min</Text>
                      </View>
                      <View style={styles.analysisInputContainer}>
                        <TextInput
                          style={styles.analysisInput}
                          value={timeSeconds}
                          onChangeText={setTimeSeconds}
                          placeholder="30"
                          placeholderTextColor="#666"
                          keyboardType="number-pad"
                          maxLength={2}
                        />
                        <Text style={styles.analysisInputUnit}>sec</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {analysisError && (
                  <Text style={styles.errorText}>{analysisError}</Text>
                )}

                <TouchableOpacity
                  style={styles.analyzeButton}
                  onPress={analyzePerformance}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add-circle" size={20} color="#FFF" />
                  <Text style={styles.analyzeButtonText}>Ajouter la course</Text>
                </TouchableOpacity>
              </View>

              {/* Performances List */}
              {performances.length > 0 && (
                <View style={styles.performancesListSection}>
                  <View style={styles.performancesHeader}>
                    <View style={styles.performancesTitleRow}>
                      <Ionicons name="list" size={22} color="#FF6B35" />
                      <Text style={styles.performancesTitle}>Mes courses ({performances.length})</Text>
                    </View>
                    <TouchableOpacity onPress={clearAllPerformances} activeOpacity={0.7}>
                      <Text style={styles.clearAllText}>Tout effacer</Text>
                    </TouchableOpacity>
                  </View>

                  {performances.map((perf) => (
                    <View key={perf.id} style={styles.performanceCard}>
                      <View style={[
                        styles.performanceCardColorBar,
                        { backgroundColor: perf.zoneIndex >= 0 && perf.zoneIndex < 8 
                          ? getZoneColor(perf.zoneIndex) 
                          : perf.zoneIndex === -1 ? '#4CAF50' : '#F44336'
                        }
                      ]} />
                      <View style={styles.performanceCardContent}>
                        <View style={styles.performanceCardHeader}>
                          <View style={styles.performanceCardMainInfo}>
                            <Text style={styles.performanceCardDistance}>{perf.distance} m</Text>
                            <Text style={styles.performanceCardTime}>en {perf.time}</Text>
                          </View>
                          <TouchableOpacity 
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            onPress={() => removePerformance(perf.id)}
                            style={styles.removeButton}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="close-circle" size={24} color="#FF5252" />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.performanceCardStats}>
                          <View style={styles.performanceCardStat}>
                            <Text style={styles.performanceCardStatLabel}>Vitesse</Text>
                            <Text style={styles.performanceCardStatValue}>{perf.speed} km/h</Text>
                          </View>
                          <View style={styles.performanceCardStat}>
                            <Text style={styles.performanceCardStatLabel}>Allure</Text>
                            <Text style={styles.performanceCardStatValue}>{perf.pace} /km</Text>
                          </View>
                          <View style={[
                            styles.performanceCardIntensity,
                            { backgroundColor: perf.zoneIndex >= 0 && perf.zoneIndex < 8 
                              ? getZoneColor(perf.zoneIndex) 
                              : perf.zoneIndex === -1 ? '#4CAF50' : '#F44336'
                            }
                          ]}>
                            <Text style={styles.performanceCardPercentage}>{perf.percentage}%</Text>
                            <Text style={styles.performanceCardZone}>
                              {perf.zone ? perf.zone.name : (perf.zoneIndex === -1 ? 'Sous zones' : 'Au-dessus')}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}

                  {/* Average Intensity Section */}
                  {performances.length >= 1 && (
                    <View style={styles.averageSection}>
                      <View style={styles.averageHeader}>
                        <Ionicons name="stats-chart" size={22} color="#FFD700" />
                        <Text style={styles.averageTitle}>Moyenne des intensités</Text>
                      </View>
                      <View style={styles.averageContent}>
                        <View style={styles.averageMainStat}>
                          <Text style={styles.averagePercentage}>
                            {Math.round(performances.reduce((sum, p) => sum + p.percentage, 0) / performances.length)}%
                          </Text>
                          <Text style={styles.averageLabel}>VMA moyenne</Text>
                        </View>
                        <View style={styles.averageDetails}>
                          <View style={styles.averageDetailItem}>
                            <Text style={styles.averageDetailLabel}>Vitesse moy.</Text>
                            <Text style={styles.averageDetailValue}>
                              {(performances.reduce((sum, p) => sum + p.speed, 0) / performances.length).toFixed(1)} km/h
                            </Text>
                          </View>
                          <View style={styles.averageDetailItem}>
                            <Text style={styles.averageDetailLabel}>Distance totale</Text>
                            <Text style={styles.averageDetailValue}>
                              {performances.reduce((sum, p) => sum + p.distance, 0)} m
                            </Text>
                          </View>
                          <View style={styles.averageDetailItem}>
                            <Text style={styles.averageDetailLabel}>Nb courses</Text>
                            <Text style={styles.averageDetailValue}>{performances.length}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Export Button */}
                  {performances.length >= 1 && (
                    <TouchableOpacity
                      style={[styles.exportButton, exporting && styles.buttonDisabled]}
                      onPress={exportToGallery}
                      disabled={exporting}
                      activeOpacity={0.8}
                    >
                      {exporting ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <>
                          <Ionicons name="download" size={20} color="#FFF" />
                          <Text style={styles.exportButtonText}>Exporter dans la pellicule</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {/* Save Session Button */}
                  <TouchableOpacity
                    testID="save-session-button"
                    style={[styles.saveSessionButton, (saving || saveStatus?.ok) && styles.buttonDisabled]}
                    onPress={saveSession}
                    disabled={saving || saveStatus?.ok}
                    activeOpacity={0.8}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name={saveStatus?.ok ? 'checkmark-circle' : 'save'} size={20} color="#FFF" />
                        <Text style={styles.exportButtonText}>
                          {saveStatus?.ok ? 'Séance enregistrée' : 'Enregistrer la séance'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {saveStatus && (
                    <View style={styles.saveStatusRow}>
                      {saveStatus.records && saveStatus.records.length > 0 && (
                        <View style={styles.recordBadge} testID="new-record-badge">
                          <View style={styles.recordBadgeHeader}>
                            <Ionicons name="trophy" size={22} color="#121212" />
                            <Text style={styles.recordBadgeTitle}>Nouveau record !</Text>
                          </View>
                          {saveStatus.records.map((r) => (
                            <Text key={r.distance} style={styles.recordBadgeLine}>
                              {r.distance} m en {r.time}
                              {r.improvement_seconds !== null
                                ? `  (−${formatSeconds(r.improvement_seconds)})`
                                : '  · premier temps'}
                            </Text>
                          ))}
                        </View>
                      )}
                      <Text
                        testID="save-status-text"
                        style={[styles.saveStatusText, { color: saveStatus.ok ? '#4CAF50' : '#FF5252' }]}
                      >
                        {saveStatus.message}
                      </Text>
                      {saveStatus.ok && (
                        <TouchableOpacity testID="save-status-history-link" onPress={openHistory} activeOpacity={0.7}>
                          <Text style={styles.saveStatusLink}>Voir l&apos;historique</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Hidden ViewShot for export */}
              {performances.length >= 1 && (
                <ViewShot
                  ref={viewShotRef}
                  options={{ format: 'png', quality: 1 }}
                  style={styles.exportContainer}
                >
                  <View style={styles.exportContent}>
                    <View style={styles.exportHeader}>
                      <Ionicons name="fitness" size={32} color="#FF6B35" />
                      <Text style={styles.exportTitle}>Récapitulatif VMA</Text>
                      <Text style={styles.exportAuthor}>by M.DURAND</Text>
                    </View>

                    <View style={styles.exportRunnerInfo}>
                      <Text style={styles.exportRunnerName}>
                        {runnerFirstName} {runnerLastName}
                      </Text>
                      <Text style={styles.exportVMA}>VMA: {result?.vma_value} km/h</Text>
                    </View>

                    <View style={styles.exportCoursesHeader}>
                      <Text style={styles.exportCoursesTitle}>Courses réalisées</Text>
                    </View>

                    {performances.map((perf, index) => (
                      <View key={perf.id} style={styles.exportCourseItem}>
                        <View style={[
                          styles.exportCourseColorBar,
                          { backgroundColor: perf.zoneIndex >= 0 && perf.zoneIndex < 8 
                            ? getZoneColor(perf.zoneIndex) 
                            : perf.zoneIndex === -1 ? '#4CAF50' : '#F44336'
                          }
                        ]} />
                        <Text style={styles.exportCourseNumber}>{index + 1}</Text>
                        <View style={styles.exportCourseDetails}>
                          <Text style={styles.exportCourseDistance}>{perf.distance} m</Text>
                          <Text style={styles.exportCourseTime}>en {perf.time}</Text>
                        </View>
                        <View style={styles.exportCourseStats}>
                          <Text style={styles.exportCourseSpeed}>{perf.speed} km/h</Text>
                          <Text style={styles.exportCoursePace}>{perf.pace}/km</Text>
                        </View>
                        <View style={[
                          styles.exportCourseIntensity,
                          { backgroundColor: perf.zoneIndex >= 0 && perf.zoneIndex < 8 
                            ? getZoneColor(perf.zoneIndex) 
                            : perf.zoneIndex === -1 ? '#4CAF50' : '#F44336'
                          }
                        ]}>
                          <Text style={styles.exportCoursePercentage}>{perf.percentage}%</Text>
                        </View>
                      </View>
                    ))}

                    <View style={styles.exportSummary}>
                      <View style={styles.exportSummaryItem}>
                        <Text style={styles.exportSummaryLabel}>Moyenne</Text>
                        <Text style={styles.exportSummaryValue}>
                          {Math.round(performances.reduce((sum, p) => sum + p.percentage, 0) / performances.length)}% VMA
                        </Text>
                      </View>
                      <View style={styles.exportSummaryItem}>
                        <Text style={styles.exportSummaryLabel}>Distance totale</Text>
                        <Text style={styles.exportSummaryValue}>
                          {performances.reduce((sum, p) => sum + p.distance, 0)} m
                        </Text>
                      </View>
                      <View style={styles.exportSummaryItem}>
                        <Text style={styles.exportSummaryLabel}>Nb courses</Text>
                        <Text style={styles.exportSummaryValue}>{performances.length}</Text>
                      </View>
                    </View>

                    <Text style={styles.exportDate}>
                      {new Date().toLocaleDateString('fr-FR', { 
                        day: 'numeric', 
                        month: 'long', 
                        year: 'numeric' 
                      })}
                    </Text>
                  </View>
                </ViewShot>
              )}

              <Text style={styles.zonesTitle}>Zones d&apos;entraînement</Text>
              
              {result.zones.map((zone, index) => (
                <View 
                  key={index} 
                  style={styles.zoneCard}
                >
                  <View style={[styles.zoneColorBar, { backgroundColor: getZoneColor(index) }]} />
                  <View style={styles.zoneContent}>
                    <View style={styles.zoneHeader}>
                      <View style={styles.zoneNameRow}>
                        <Text style={styles.zoneName}>{zone.name}</Text>
                      </View>
                      <Text style={styles.zonePercentage}>
                        {zone.percentage_min}-{zone.percentage_max}%
                      </Text>
                    </View>
                    <Text style={styles.zoneDescription}>{zone.description}</Text>
                    <View style={styles.zoneData}>
                      <View style={styles.dataItem}>
                        <Ionicons name="speedometer" size={16} color="#FF6B35" />
                        <Text style={styles.dataLabel}>Vitesse</Text>
                        <Text style={styles.dataValue}>
                          {zone.speed_min} - {zone.speed_max} km/h
                        </Text>
                      </View>
                      <View style={styles.dataItem}>
                        <Ionicons name="time" size={16} color="#FF6B35" />
                        <Text style={styles.dataLabel}>Allure</Text>
                        <Text style={styles.dataValue}>
                          {zone.pace_min} - {zone.pace_max} /km
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Info Section */}
          {!result && (
            <View style={styles.infoSection}>
              <Ionicons name="information-circle" size={24} color="#FF6B35" />
              <Text style={styles.infoTitle}>Qu&apos;est-ce que la VMA ?</Text>
              <Text style={styles.infoText}>
                La Vitesse Maximale Aérobie (VMA) est la vitesse de course à partir de laquelle 
                votre consommation d&apos;oxygène est maximale. C&apos;est un indicateur clé pour 
                planifier vos entraînements de course à pied.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 4,
  },
  authorText: {
    fontSize: 13,
    color: '#FF6B35',
    marginTop: 8,
    fontStyle: 'italic',
  },
  inputSection: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  inputUnit: {
    fontSize: 18,
    color: '#888',
    marginLeft: 8,
  },
  errorText: {
    color: '#FF5252',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  calculateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 12,
    gap: 6,
  },
  resetButtonText: {
    fontSize: 16,
    color: '#FF6B35',
  },
  resultsSection: {
    marginTop: 8,
  },
  vmaDisplayContainer: {
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  vmaDisplayLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  vmaDisplayValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 4,
  },
  zonesTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  zoneCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  zoneColorBar: {
    width: 6,
  },
  zoneContent: {
    flex: 1,
    padding: 16,
  },
  zoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  zonePercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  zoneDescription: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
  },
  zoneData: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dataLabel: {
    fontSize: 12,
    color: '#888',
  },
  dataValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  infoSection: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 12,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  // Performance Analysis Styles
  analysisSection: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  analysisTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  analysisSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
  },
  analysisInputRow: {
    gap: 16,
  },
  analysisInputGroup: {
    marginBottom: 12,
  },
  analysisInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  analysisInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 12,
    flex: 1,
  },
  analysisInput: {
    flex: 1,
    height: 48,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  analysisInputUnit: {
    fontSize: 14,
    color: '#888',
    marginLeft: 6,
  },
  timeInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  analyzeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  performanceResult: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  performanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  performanceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  performanceStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  performanceStat: {
    width: '48%',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  performanceStatLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  performanceStatValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  intensityResult: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  intensityPercentage: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  intensityZoneName: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  zoneCardHighlighted: {
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  zoneNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Performances List Styles
  performancesListSection: {
    marginBottom: 24,
  },
  performancesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  performancesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  performancesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  clearAllText: {
    fontSize: 14,
    color: '#FF5252',
    fontWeight: '600',
  },
  performanceCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  performanceCardColorBar: {
    width: 5,
  },
  performanceCardContent: {
    flex: 1,
    padding: 14,
  },
  performanceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  performanceCardMainInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  performanceCardDistance: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  performanceCardTime: {
    fontSize: 14,
    color: '#888',
  },
  removeButton: {
    padding: 4,
  },
  performanceCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  performanceCardStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  performanceCardStatLabel: {
    fontSize: 12,
    color: '#888',
  },
  performanceCardStatValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  performanceCardIntensity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  performanceCardPercentage: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  performanceCardZone: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  // Average Section Styles
  averageSection: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  averageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  averageTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  averageContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  averageMainStat: {
    alignItems: 'center',
    paddingRight: 20,
    borderRightWidth: 1,
    borderRightColor: '#444',
  },
  averagePercentage: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  averageLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  averageDetails: {
    flex: 1,
    paddingLeft: 20,
    gap: 8,
  },
  averageDetailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  averageDetailLabel: {
    fontSize: 13,
    color: '#888',
  },
  averageDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Runner Info Styles
  runnerInfoSection: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  runnerInfoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  runnerInfoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  runnerInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  runnerInputGroup: {
    flex: 1,
  },
  runnerInputLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  runnerInput: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#FFFFFF',
  },
  // Export Button Styles
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
    marginTop: 16,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  saveSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
    marginTop: 12,
  },
  saveStatusRow: {
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  groupPickerWrapper: {
    marginTop: 12,
  },
  recordBadge: {
    alignSelf: 'stretch',
    backgroundColor: '#FFD700',
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  recordBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  recordBadgeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#121212',
  },
  recordBadgeLine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#121212',
    marginTop: 2,
  },
  saveStatusText: {
    fontSize: 14,
    textAlign: 'center',
  },
  saveStatusLink: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF6B35',
    textDecorationLine: 'underline',
    paddingVertical: 6,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  historyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  // Export View Styles (for screenshot)
  exportContainer: {
    position: 'absolute',
    left: -1000,
    top: 0,
    width: 400,
  },
  exportContent: {
    backgroundColor: '#121212',
    padding: 24,
    borderRadius: 16,
  },
  exportHeader: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  exportTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  exportAuthor: {
    fontSize: 12,
    color: '#FF6B35',
    fontStyle: 'italic',
    marginTop: 4,
  },
  exportRunnerInfo: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  exportRunnerName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  exportVMA: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  exportCoursesHeader: {
    marginBottom: 12,
  },
  exportCoursesTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  exportCourseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  exportCourseColorBar: {
    width: 4,
    height: '100%',
  },
  exportCourseNumber: {
    width: 28,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#888',
    textAlign: 'center',
  },
  exportCourseDetails: {
    flex: 1,
    paddingVertical: 10,
  },
  exportCourseDistance: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  exportCourseTime: {
    fontSize: 12,
    color: '#888',
  },
  exportCourseStats: {
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  exportCourseSpeed: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  exportCoursePace: {
    fontSize: 11,
    color: '#888',
  },
  exportCourseIntensity: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  exportCoursePercentage: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  exportSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  exportSummaryItem: {
    alignItems: 'center',
  },
  exportSummaryLabel: {
    fontSize: 11,
    color: '#888',
  },
  exportSummaryValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 4,
  },
  exportDate: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },
});
