const ZONE_COLORS = [
  '#4CAF50', // Récupération - Vert
  '#8BC34A', // Endurance fondamentale - Vert clair
  '#CDDC39', // Endurance active - Lime
  '#FFEB3B', // Seuil anaérobie - Jaune
  '#FFC107', // VMA longue - Ambre
  '#FF9800', // VMA - Orange
  '#FF5722', // VMA courte - Orange foncé
  '#F44336', // Vitesse - Rouge
];

export const getZoneColor = (index: number): string => ZONE_COLORS[index] || '#9E9E9E';

// Color for a performance zone index (-1 = below zones, 8 = above zones)
export const getPerformanceColor = (zoneIndex: number): string => {
  if (zoneIndex >= 0 && zoneIndex < ZONE_COLORS.length) return ZONE_COLORS[zoneIndex];
  return zoneIndex === -1 ? '#4CAF50' : '#F44336';
};

export const formatSeconds = (totalSeconds: number): string => {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
