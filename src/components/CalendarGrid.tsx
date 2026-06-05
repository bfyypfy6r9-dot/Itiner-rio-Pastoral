import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday } from 'date-fns';
import { PastelEvent } from '../types';
import { getBrazilianDayOfWeek } from '../lib/date-utils';

interface Props {
  currentDate: Date;
  events: PastelEvent[];
  onDayClick?: (date: Date) => void;
}

export default function CalendarGrid({ currentDate, events, onDayClick }: Props) {
  const start = startOfMonth(currentDate);
  const end = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start, end });
  const startDayPadding = getDay(start); // 0 = Sunday

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50/50">
        {weekDays.map(day => (
          <div key={day} className="py-3 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 bg-neutral-100 gap-[1px]">
        {/* Padding for first week alignment */}
        {Array.from({ length: startDayPadding }).map((_, i) => (
          <div key={`pad-${i}`} className="bg-white min-h-[100px]" />
        ))}
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayEvents = events.filter(e => e.date === dateStr);
          const isCurrentDay = isToday(day);

          return (
            <div 
              key={dateStr}
              onClick={() => onDayClick && onDayClick(day)}
              className={`bg-white min-h-[120px] p-2 transition-colors relative flex flex-col ${isCurrentDay ? 'bg-blue-50/20' : ''} ${onDayClick ? 'hover:bg-blue-50/50 cursor-pointer' : ''}`}
            >
              <div className={`text-right text-sm font-medium mb-1 ${isCurrentDay ? 'text-blue-600' : 'text-neutral-400'}`}>
                {format(day, 'd')}
              </div>
              
              <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto w-full no-scrollbar">
                {dayEvents.map((event, idx) => (
                  <div key={event.id || idx} className="bg-neutral-50 border border-neutral-100 rounded-md p-1.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className={"text-[9px] uppercase font-bold tracking-wide rounded-sm px-1 py-0 w-fit " + 
                        (event.type === 'Pregação' ? "bg-amber-100 text-amber-800" :
                        event.type === 'Desbravadores' ? "bg-emerald-100 text-emerald-800" :
                        event.type === 'Visitação' ? "bg-indigo-100 text-indigo-800" :
                        (event.type === 'Comissão' || event.type === 'Comissão/Reunião') ? "bg-cyan-100 text-cyan-800" :
                        event.type === 'Planejamento e Estudo' ? "bg-purple-100 text-purple-800" :
                        event.type === 'PG' ? "bg-orange-100 text-orange-800" :
                        "bg-rose-100 text-rose-800")}
                      >
                        {event.type}
                      </div>
                    </div>
                    <div className="text-[11px] text-neutral-700 font-medium leading-tight truncate">
                      {event.local}{event.type === 'Planejamento e Estudo' && event.timeFrame ? ` (${event.timeFrame})` : ''}
                    </div>
                    {event.clubName && (
                      <div className="text-[9px] text-neutral-500 truncate mt-0.5">
                        {event.clubName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
