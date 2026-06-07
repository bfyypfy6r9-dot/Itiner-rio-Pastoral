export type EventType = 'Pregação' | 'Desbravadores' | 'Visitação' | 'Comissão' | 'Comissão/Reunião' | 'Férias' | 'Planejamento e Estudo' | 'PG' | 'Aventureiros' | 'Santa ceia' | 'PGP' | 'Concílio' | 'Família';

export interface PastorConfig {
  name: string;
  district: string;
  phone: string;
  customMessage?: string;
}

export interface PastelEvent {
  id?: string;
  userId: string;
  date: string; // YYYY-MM-DD
  dateLabel: string; // e.g., 01/07
  dayOfWeek: string; // e.g., Quarta
  month: string; // YYYY-MM
  local: string;
  type: EventType;
  clubName?: string;
  visitedName?: string;
  timeFrame?: string;
  createdAt: number;
}

export interface AppUser {
  id: string;
  email: string;
  isMock?: boolean;
  needsDeviceReset?: boolean;
}
