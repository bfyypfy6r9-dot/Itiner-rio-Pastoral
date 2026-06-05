import React from 'react';
import { PastelEvent } from '../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X } from 'lucide-react';
import { getBrazilianDayOfWeek } from '../lib/date-utils';

interface Props {
  isOpen: boolean;
  date: Date;
  events: PastelEvent[];
  onClose: () => void;
}

export default function DayDetailsModal({ isOpen, date, events, onClose }: Props) {
  if (!isOpen) return null;

  const dateStr = format(date, 'yyyy-MM-dd');
  const formattedDate = format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const dayOfWeek = getBrazilianDayOfWeek(date);

  return (
    <div className="fixed inset-0 bg-neutral-900/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100">
          <div>
            <h2 className="text-xl font-bold text-neutral-800">{String(format(date, 'dd')).padStart(2, '0')}</h2>
            <p className="text-sm text-neutral-500 font-medium capitalize">{dayOfWeek}</p>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {events.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-neutral-500">Nenhuma atividade agendada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((ev, index) => (
                <div key={index} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold
                      ${ev.type === 'Pregação' ? "bg-amber-100 text-amber-800" :
                        ev.type === 'Férias' ? "bg-blue-100 text-blue-800" :
                        ev.type === 'Desbravadores' ? "bg-emerald-100 text-emerald-800" :
                        ev.type === 'Visitação' ? "bg-indigo-100 text-indigo-800" :
                        (ev.type === 'Comissão' || ev.type === 'Comissão/Reunião') ? "bg-cyan-100 text-cyan-800" :
                        ev.type === 'Planejamento e Estudo' ? "bg-purple-100 text-purple-800" :
                        ev.type === 'PG' ? "bg-orange-100 text-orange-800" :
                        "bg-rose-100 text-rose-800"}`}
                    >
                      {ev.type}
                    </span>
                  </div>
                  
                  <div>
                    <span className="font-semibold text-neutral-800">{ev.local}</span>
                  </div>

                  {(ev.type === 'Desbravadores' && ev.clubName) || 
                   (ev.type === 'Visitação' && ev.visitedName) || 
                   ((ev.type === 'Planejamento e Estudo' || ev.type === 'Comissão' || ev.type === 'Comissão/Reunião') && ev.timeFrame) ? (
                    <div className="text-sm text-neutral-600 bg-white border border-neutral-100 px-3 py-2 rounded-lg mt-1">
                      {ev.type === 'Desbravadores' && <span className="block"><span className="font-medium">Desbravador:</span> {ev.clubName}</span>}
                      {ev.type === 'Visitação' && <span className="block"><span className="font-medium">Visitado:</span> {ev.visitedName}</span>}
                      {(ev.type === 'Planejamento e Estudo' || ev.type === 'Comissão' || ev.type === 'Comissão/Reunião') && <span className="block"><span className="font-medium">Horário:</span> {ev.timeFrame}</span>}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl flex justify-between items-center">
          <p className="text-xs text-neutral-500 italic flex-1 text-center">
            Para editar ou adicionar agendas, retorne à aba Calendário
          </p>
          <button
            onClick={onClose}
            className="ml-4 px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-sm font-medium rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
