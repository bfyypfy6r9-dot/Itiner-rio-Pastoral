import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EventType, PastelEvent, PastorConfig } from '../types';

interface Props {
  currentDate: Date;
  events: PastelEvent[];
  config: PastorConfig;
  selectedTypes: EventType[];
}

export default function PrintTemplate({ currentDate, events, config, selectedTypes }: Props) {
  const groupEvents = (eventsToGroup: PastelEvent[]) => {
    const grouped = new Map();
    
    // Sort so events with local come first
    const sortedForGrouping = [...eventsToGroup].sort((a, b) => {
      // Prioritize events that have a local, and prioritize Pregação over others
      if (a.type === 'Pregação' && b.type !== 'Pregação') return -1;
      if (b.type === 'Pregação' && a.type !== 'Pregação') return 1;
      if (a.local && !b.local) return -1;
      if (!a.local && b.local) return 1;
      return 0;
    });

    sortedForGrouping.forEach(e => {
      // Use clean string for grouping to avoid space mismatch
      const safeLocal = (e.local || '').trim();
      let key = `${e.date}|${safeLocal.toLowerCase()}`;
      
      // se é desbravadores, tenta sempre atrelar ao primeiro evento do dia (preferencialmente pregação)
      if (e.type === 'Desbravadores' || !safeLocal) {
         const existingKey = Array.from(grouped.keys()).find(k => k.startsWith(`${e.date}|`));
         if (existingKey) {
            key = existingKey;
         }
      }

      if (!grouped.has(key)) {
        grouped.set(key, {
          date: e.date,
          dateLabel: e.dateLabel,
          dayOfWeek: e.dayOfWeek,
          local: e.local,
          clubNames: new Set<string>(),
          visitedNames: new Set<string>(),
          timeFrames: new Set<string>(),
          createdAt: e.createdAt,
        });
      }
      const group = grouped.get(key);
      if (e.type === 'Desbravadores' && e.clubName) {
        group.clubNames.add(e.clubName);
      }
      if (e.type === 'Visitação' && e.visitedName) {
        group.visitedNames.add(e.visitedName);
      }
      if (e.type === 'Planejamento e Estudo' && e.timeFrame) {
        group.timeFrames.add(e.timeFrame);
      }
    });

    return Array.from(grouped.values()).sort((a: any, b: any) => {
      const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (timeDiff === 0) return a.createdAt - b.createdAt;
      return timeDiff;
    });
  };

  const geralEvents = groupEvents(events.filter(e => ['Pregação', 'Desbravadores', 'Férias', 'PG'].includes(e.type)));
  const visitacaoEvents = groupEvents(events.filter(e => e.type === 'Visitação'));
  const comissaoEvents = groupEvents(events.filter(e => e.type === 'Comissão'));
  
  // Filtro Isolado Exclusivo
  const planejamentoEvents = events
    .filter(e => e.type === 'Planejamento e Estudo')
    .sort((a, b) => {
      const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return timeDiff === 0 ? (a.createdAt - b.createdAt) : timeDiff;
    });

  const monthName = format(currentDate, 'MMMM', { locale: ptBR }).toUpperCase();
  const year = format(currentDate, 'yyyy');

  return (
    <div className="bg-white text-black font-sans text-base leading-relaxed pt-12 pl-12 pr-8 pb-8">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="font-bold text-[1.1rem] uppercase tracking-wider mb-1">
          ITINERÁRIO PASTORAL - {year}
        </h1>
        <h2 className="font-medium text-[1.1rem] uppercase tracking-wide mb-1">
          DISTRITO - {config.district || '____________________'}
        </h2>
        <h3 className="font-bold text-[1.1rem]">
          {monthName}
        </h3>
      </div>

      {/* Table 1: Agenda Geral */}
      {(selectedTypes.includes('Pregação') || selectedTypes.includes('Desbravadores') || selectedTypes.includes('Férias') || selectedTypes.includes('PG')) && geralEvents.length > 0 && (
        <div className="mb-12 break-inside-avoid">
          <h4 className="font-bold text-[1.1rem] mb-2 uppercase text-center">ESCALA DE PREGAÇÃO / VISITA DBV</h4>
          <table className="w-full table-fixed text-base border-collapse border border-black">
            <thead>
              <tr className="bg-gray-100">
              <th className="border border-black px-2 py-1.5 text-center w-1/4">DATA</th>
              <th className="border border-black px-2 py-1.5 text-center w-1/4">DIA</th>
              <th className="border border-black px-2 py-1.5 text-center w-1/4">IGREJA</th>
              <th className="border border-black px-2 py-1.5 text-center w-1/4">DESBRAVADOR</th>
            </tr>
          </thead>
          <tbody>
            {geralEvents.map((e: any, index) => (
                <tr key={`geral-${index}`}>
                  <td className="border border-black px-2 py-1.5 text-center">{e.dateLabel}</td>
                  <td className="border border-black px-2 py-1.5 text-center">{e.dayOfWeek}</td>
                  <td className="border border-black px-2 py-1.5 text-center font-medium">{e.local}</td>
                  <td className="border border-black px-2 py-1.5 text-center text-gray-700">{e.clubNames.size > 0 ? Array.from(e.clubNames).join(', ') : '-'}</td>
                </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {/* Table 2: Visitação */}
      {selectedTypes.includes('Visitação') && visitacaoEvents.length > 0 && (
        <div className="mb-12 break-inside-avoid">
          <h4 className="font-bold text-[1.1rem] mb-2 uppercase text-center">VISITAÇÃO</h4>
          <table className="w-full table-fixed text-base border-collapse border border-black">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black px-2 py-1.5 text-center w-1/3">DATA</th>
                <th className="border border-black px-2 py-1.5 text-center w-1/3">IGREJA</th>
                <th className="border border-black px-2 py-1.5 text-center w-1/3">NOME DO VISITADO</th>
              </tr>
            </thead>
            <tbody>
              {visitacaoEvents.map((e: any, index) => (
                <tr key={`vis-${index}`}>
                  <td className="border border-black px-2 py-1.5 text-center">{e.dateLabel}</td>
                  <td className="border border-black px-2 py-1.5 text-center font-medium">{e.local}</td>
                  <td className="border border-black px-2 py-1.5 text-center text-gray-700">{e.visitedNames.size > 0 ? Array.from(e.visitedNames).join(', ') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table 3: Comissões */}
      {selectedTypes.includes('Comissão') && comissaoEvents.length > 0 && (
        <div className="mb-12 break-inside-avoid">
          <h4 className="font-bold text-[1.1rem] mb-2 uppercase text-center">COMISSÕES</h4>
          <table className="w-full table-fixed text-base border-collapse border border-black">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black px-2 py-1.5 text-center w-1/2">DATA</th>
                <th className="border border-black px-2 py-1.5 text-center w-1/2">IGREJA</th>
              </tr>
            </thead>
            <tbody>
              {comissaoEvents.map((e: any, index) => (
                <tr key={`com-${index}`}>
                  <td className="border border-black px-2 py-1.5 text-center">{e.dateLabel}</td>
                  <td className="border border-black px-2 py-1.5 text-center font-medium">{e.local}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Table 4: Planejamento e Estudo */}
      {selectedTypes.includes('Planejamento e Estudo') && planejamentoEvents.length > 0 && (
        <div className="mb-12 break-inside-avoid">
          <h4 className="font-bold text-[1.1rem] mb-2 uppercase text-center">ROTINA DE PLANEJAMENTO E ESTUDO</h4>
          <table className="w-full table-fixed text-base border-collapse border border-black">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-black px-2 py-1.5 text-center w-1/3">DIA DA SEMANA</th>
                <th className="border border-black px-2 py-1.5 text-center w-1/3">DATA</th>
                <th className="border border-black px-2 py-1.5 text-center w-1/3">HORÁRIO</th>
              </tr>
            </thead>
            <tbody>
              {planejamentoEvents.map((e, index) => (
                <tr key={`plan-${index}`}>
                  <td className="border border-black px-2 py-1.5 text-center">{e.dayOfWeek}</td>
                  <td className="border border-black px-2 py-1.5 text-center">{e.dateLabel}</td>
                  <td className="border border-black px-2 py-1.5 text-center text-gray-700">{e.timeFrame || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mensagem / Versículo */}
      {config.customMessage && (
        <div className="mb-16 mt-8 break-inside-avoid">
          <p className="text-left italic whitespace-pre-wrap">
            {config.customMessage}
          </p>
        </div>
      )}

      {/* Footer - Assinatura */}
      <div className={`text-left space-y-1 break-inside-avoid ${!config.customMessage ? 'mt-16' : ''}`}>
        <div className="border-t border-black w-72 mb-2"></div>
        <p className="font-bold uppercase tracking-wide">{config.name || 'Nome do Pastor'}</p>
        <p className="text-black">{config.phone || 'Telefone'}</p>
      </div>
    </div>
  );
}
