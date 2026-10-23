export interface SessionPerformance {
  distance: number;
  time: string;
  time_seconds: number;
  speed: number;
  pace: string;
  percentage: number;
  zone_name: string | null;
  zone_index: number;
}

export interface RunnerSession {
  id: string;
  first_name: string;
  last_name: string;
  vma_value: number;
  performances: SessionPerformance[];
  created_at: string;
}

export interface NewRecord {
  distance: number;
  time: string;
  time_seconds: number;
  previous_time_seconds: number | null;
  improvement_seconds: number | null;
}

export interface Group {
  id: string;
  name: string;
  member_count: number;
}
