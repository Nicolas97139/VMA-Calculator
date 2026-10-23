import { RunnerSession } from '../types/session';
import { parseDate } from './vma';

export interface PersonalRecord {
  distance: number;
  time: string;
  time_seconds: number;
  speed: number;
  date: string;
  sessionId: string;
  index: number;
}

// Fastest run per distance (the earliest session keeps the record on a tie)
export const computeRecords = (sessions: RunnerSession[]): PersonalRecord[] => {
  const best = new Map<number, PersonalRecord>();
  [...sessions]
    .sort((a, b) => parseDate(a.created_at).getTime() - parseDate(b.created_at).getTime())
    .forEach((s) =>
      s.performances.forEach((p, index) => {
        const current = best.get(p.distance);
        if (!current || p.time_seconds < current.time_seconds) {
          best.set(p.distance, {
            distance: p.distance,
            time: p.time,
            time_seconds: p.time_seconds,
            speed: p.speed,
            date: s.created_at,
            sessionId: s.id,
            index,
          });
        }
      })
    );
  return [...best.values()].sort((a, b) => a.distance - b.distance);
};
