export type EventType = 'Atividades administrativas' | 'Aventureiros' | 'Concílio' | 'Desbravador' | 'Família' | 'Férias' | 'Outros' | 'PG' | 'PGP' | 'Planejamento e estudo' | 'Pregação' | 'Reunião/comissão' | 'Santa Ceia' | 'Visitação' | 'Comissão' | 'Comissão/Reunião' | 'Desbravadores' | 'Planejamento e Estudo' | 'Santa ceia' | 'Outro';

export type Turno = 'Manhã' | 'Tarde' | 'Noite';

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
  turno?: Turno;
  horario?: string;
  createdAt: number;
}

export interface AppUser {
  id: string;
  email: string;
  isMock?: boolean;
  needsDeviceReset?: boolean;
  isAdmin?: boolean;
  role?: string;
  isPendingApproval?: boolean;
  isBlocked?: boolean;
  status?: string;
}
