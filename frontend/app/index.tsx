import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

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
  speed: number;
  pace: string;
  percentage: number;
  zone: TrainingZone | null;
  zoneIndex: number;
}

const getZoneColor = (index: number): string => {
  const colors = [
    '#4CAF50', // Récupération - Vert
    '#8BC34A', // Endurance fondamentale - Vert clair
    '#CDDC39', // Endurance active - Lime
    '#FFEB3B', // Seuil anaérobie - Jaune
    '#FFC107', // VMA longue - Ambre
    '#FF9800', // VMA - Orange
    '#FF5722', // VMA courte - Orange foncé
    '#F44336', // Vitesse - Rouge
  ];
  return colors[index] || '#9E9E9E';
};

export default function Index() {
  const [vmaInput, setVmaInput] = useState('');
  const [result, setResult] = useState<VMAResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Performance analysis states
  const [distanceInput, setDistanceInput] = useState('');
  const [timeMinutes, setTimeMinutes] = useState('');
  const [timeSeconds, setTimeSeconds] = useState('');
  const [performances, setPerformances] = useState<PerformanceAnalysis[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

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
            <Text style={styles.subtitle}>Calcul des zones d'entraînement</Text>
            <Text style={styles.authorText}>by M.DURAND</Text>
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
                  <Ionicons name="search" size={20} color="#FFF" />
                  <Text style={styles.analyzeButtonText}>Analyser</Text>
                </TouchableOpacity>

                {/* Performance Result */}
                {performanceAnalysis && (
                  <View style={styles.performanceResult}>
                    <View style={styles.performanceHeader}>
                      <Ionicons name="trophy" size={24} color="#FFD700" />
                      <Text style={styles.performanceTitle}>Votre performance</Text>
                    </View>
                    
                    <View style={styles.performanceStats}>
                      <View style={styles.performanceStat}>
                        <Text style={styles.performanceStatLabel}>Distance</Text>
                        <Text style={styles.performanceStatValue}>{performanceAnalysis.distance} m</Text>
                      </View>
                      <View style={styles.performanceStat}>
                        <Text style={styles.performanceStatLabel}>Temps</Text>
                        <Text style={styles.performanceStatValue}>{performanceAnalysis.time}</Text>
                      </View>
                      <View style={styles.performanceStat}>
                        <Text style={styles.performanceStatLabel}>Vitesse</Text>
                        <Text style={styles.performanceStatValue}>{performanceAnalysis.speed} km/h</Text>
                      </View>
                      <View style={styles.performanceStat}>
                        <Text style={styles.performanceStatLabel}>Allure</Text>
                        <Text style={styles.performanceStatValue}>{performanceAnalysis.pace} /km</Text>
                      </View>
                    </View>

                    <View style={[
                      styles.intensityResult,
                      { backgroundColor: performanceAnalysis.zoneIndex >= 0 && performanceAnalysis.zoneIndex < 8 
                        ? getZoneColor(performanceAnalysis.zoneIndex) 
                        : performanceAnalysis.zoneIndex === -1 ? '#4CAF50' : '#F44336'
                      }
                    ]}>
                      <Text style={styles.intensityPercentage}>{performanceAnalysis.percentage}% VMA</Text>
                      {performanceAnalysis.zoneIndex === -1 && (
                        <Text style={styles.intensityZoneName}>En dessous des zones</Text>
                      )}
                      {performanceAnalysis.zoneIndex >= 0 && performanceAnalysis.zoneIndex < 8 && performanceAnalysis.zone && (
                        <Text style={styles.intensityZoneName}>{performanceAnalysis.zone.name}</Text>
                      )}
                      {performanceAnalysis.zoneIndex >= 8 && (
                        <Text style={styles.intensityZoneName}>Au-dessus de la VMA max</Text>
                      )}
                    </View>
                  </View>
                )}
              </View>

              <Text style={styles.zonesTitle}>Zones d'entraînement</Text>
              
              {result.zones.map((zone, index) => (
                <View 
                  key={index} 
                  style={[
                    styles.zoneCard,
                    performanceAnalysis && performanceAnalysis.zoneIndex === index && styles.zoneCardHighlighted
                  ]}
                >
                  <View style={[styles.zoneColorBar, { backgroundColor: getZoneColor(index) }]} />
                  <View style={styles.zoneContent}>
                    <View style={styles.zoneHeader}>
                      <View style={styles.zoneNameRow}>
                        <Text style={styles.zoneName}>{zone.name}</Text>
                        {performanceAnalysis && performanceAnalysis.zoneIndex === index && (
                          <Ionicons name="checkmark-circle" size={18} color="#FFD700" style={{ marginLeft: 8 }} />
                        )}
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
              <Text style={styles.infoTitle}>Qu'est-ce que la VMA ?</Text>
              <Text style={styles.infoText}>
                La Vitesse Maximale Aérobie (VMA) est la vitesse de course à partir de laquelle 
                votre consommation d'oxygène est maximale. C'est un indicateur clé pour 
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
});
