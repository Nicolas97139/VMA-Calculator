# Calculateur VMA – PRD

## Overview
French mobile app (Expo SDK 58 + FastAPI + MongoDB) to calculate VMA training zones, signed "by M.DURAND".

## Implemented
- VMA input → training zones (km/h + min/km pace); backend `/api/calculate`, `/api/history`
- Performance analysis: distance (metres) + time → speed, pace, % VMA, zone
- Multiple races, per-race remove, "Tout effacer", average intensity
- Runner first/last name + export recap image to photo library (expo-media-library `Asset.create`, react-native-view-shot; permission flow with Open Settings)
- Expo SDK 58 upgrade (RN 0.88, React 19.3), vector icons → @react-native-vector-icons/ionicons, web output "single"

- Runner history: "Enregistrer la séance" saves all races per runner (first+last name, case-insensitive) → `/api/sessions` (POST/GET/DELETE)
- "Historique" screen (`app/history.tsx`): dropdown listing all runners (`GET /api/runners`: name, session count, last session), search by runner, sessions list with delete confirm, progress chart per distance (speed or time, best per session, best value + progression)
- Personal records: "Records personnels" card in Historique (best time per distance, trophy icons on record runs); POST /api/sessions returns `new_records` → gold "Nouveau record !" badge on main screen
- Training groups (one per runner): GroupPicker in "Informations coureur" (create new group, prefill from `/api/runners/profile`), `/api/groups` (GET/POST), runners filtered by group chips in Historique, group leaderboard per distance (`/api/groups/{id}/leaderboard`)

## Notes
- Demo data: group "Club Demo" (Demo Coureur, Marie Leroy)
- Demo data: runner "Demo Coureur" has 4 seeded sessions
- Photo-library export only works on a real device build (not web preview)

## Backlog
- Split index.tsx into components; add testIDs
- Backend: replace datetime.utcnow / on_event
