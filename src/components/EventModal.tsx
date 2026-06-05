import React, { useState, useEffect, useRef } from 'react';
import { db, isFirebaseConfigured, auth } from '../lib/firebase';
import { collection, doc, addDoc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { AppUser, EventType, PastelEvent } from '../types';
import { format } from 'date-fns';
import { getBrazilianDayOfWeek, formatDateLabel } from '../lib/date-utils';
import { X, Trash2, Plus } from 'lucide-react';

interface Props {
  isOpen: boolean;
  date: Date;
  events: PastelEvent[];
  user: AppUser;
  onClose: (shouldReload?: boolean) => void;
}

const EVENT_TYPES: EventType[] = ['Pregação', 'Desbravadores', 'Visitação', 'Comissão/Reunião', 'Férias', 'Planejamento e Estudo', 'PG'];

interface EventFormState {
  _localId: string;
  id?: string;
  type: EventType;
  local: string;
  clubName: string;
  visitedName: string;
  timeFrame: string;
  isDeleted: boolean;
  createdAt: number;
}

export default function EventModal({ isOpen, date, events, user, onClose }: Props) {
  const [dayEvents, setDayEvents] = useState<EventFormState[]>([]);
  const [saving, setSaving] = useState(false);
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (events.length > 0) {
      setDayEvents(events.map(e => ({
        _localId: crypto.randomUUID(),
        id: e.id,
        type: e.type === 'Comissão' ? 'Comissão/Reunião' : e.type,
        local: e.local === 'FÉRIAS' && e.type !== 'Férias' ? '' : (e.local || ''),
        clubName: e.clubName || '',
        visitedName: e.visitedName || '',
        timeFrame: e.timeFrame || '',
        isDeleted: false,
        createdAt: e.createdAt
      })));
    } else {
      setDayEvents([{
        _localId: crypto.randomUUID(),
        type: 'Pregação',
        local: '',
        clubName: '',
        visitedName: '',
        timeFrame: '',
        isDeleted: false,
        createdAt: Date.now()
      }]);
    }
  }, [events]);

  if (!isOpen) return null;

  const handleAddEvent = () => {
    setDayEvents([...dayEvents, {
      _localId: crypto.randomUUID(),
      type: 'Pregação',
      local: '',
      clubName: '',
      visitedName: '',
      timeFrame: '',
      isDeleted: false,
      createdAt: Date.now()
    }]);
  };

  const handleUpdateEvent = (localId: string, field: keyof EventFormState, value: any) => {
    setDayEvents(prev => prev.map(ev => {
      if (ev._localId !== localId) return ev;
      const updated = { ...ev, [field]: value };
      if (field === 'type' && value === 'Férias') {
        updated.local = 'FÉRIAS';
      } else if (field === 'type' && ev.type === 'Férias' && value !== 'Férias') {
        updated.local = '';
      }
      if (field === 'type' && value === 'Desbravadores') {
        updated.local = '';
      }
      return updated;
    }));
  };

  const handleMarkDeleted = (localId: string) => {
    setDayEvents(prev => prev.map(ev => ev._localId === localId ? { ...ev, isDeleted: true } : ev));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingRef.current) return; // Prevent double clicks
    
    // Check validation first
    const invalidEvents = dayEvents.filter(ev => {
      if (!ev.isDeleted) {
        if (!ev.local && !['Férias', 'Desbravadores'].includes(ev.type)) return true;
        if (ev.type === 'Desbravadores' && !ev.clubName) return true;
      }
      return false;
    });

    if (invalidEvents.length > 0) {
      alert('Por favor, preencha todos os campos obrigatórios (Igreja/Local ou Clube).');
      return;
    }

    isSavingRef.current = true;
    setSaving(true);
    let shouldReload = false;

    try {
      let mockAll = user.isMock ? JSON.parse(localStorage.getItem('mockEvents') || '[]') : [];
      const firestorePromises: Promise<any>[] = [];

      for (const ev of dayEvents) {
        if (ev.isDeleted) {
          if (ev.id) {
            if (user.isMock) {
              mockAll = mockAll.filter((me: any) => me.id !== ev.id);
              shouldReload = true;
            } else if (isFirebaseConfigured) {
              const currentUid = auth.currentUser?.uid || user.id;
              const docRef = doc(db, 'users', currentUid, 'events', ev.id);
              firestorePromises.push(deleteDoc(docRef));
              shouldReload = true;
            }
          }
          continue;
        }

        const isFerias = ev.type === 'Férias';
        const finalLocal = isFerias ? 'FÉRIAS' : ev.local;

        const eventData: any = {
          userId: user.id,
          date: format(date, 'yyyy-MM-dd'),
          dateLabel: formatDateLabel(date),
          dayOfWeek: getBrazilianDayOfWeek(date),
          month: format(date, 'yyyy-MM'),
          local: finalLocal,
          type: ev.type,
          createdAt: ev.createdAt || Date.now(),
        };

        if (ev.type === 'Desbravadores' && ev.clubName) eventData.clubName = ev.clubName;
        if (ev.type === 'Visitação' && ev.visitedName) eventData.visitedName = ev.visitedName;
        if ((ev.type === 'Planejamento e Estudo' || ev.type === 'Comissão/Reunião') && ev.timeFrame) eventData.timeFrame = ev.timeFrame;

        if (user.isMock) {
          const mockData = { ...eventData, id: ev.id || crypto.randomUUID() };
          if (ev.id) {
            const idx = mockAll.findIndex((me: any) => me.id === ev.id);
            if (idx >= 0) mockAll[idx] = mockData;
          } else {
            mockAll.push(mockData);
          }
          shouldReload = true;
        } else if (isFirebaseConfigured) {
          const currentUid = auth.currentUser?.uid || user.id;
          
          if (!ev.id) {
            const collRef = collection(db, 'users', currentUid, 'events');
            firestorePromises.push(addDoc(collRef, eventData));
          } else {
            const docRef = doc(db, 'users', currentUid, 'events', ev.id);
            firestorePromises.push(setDoc(docRef, eventData));
          }
          shouldReload = true;
        }
      }

      if (user.isMock) {
        localStorage.setItem('mockEvents', JSON.stringify(mockAll));
      }

      if (firestorePromises.length > 0) {
        // Fire and forget, local cache will update instantly.
        firestorePromises.forEach(p => p.catch(err => console.error("Firestore cache/sync error:", err)));
        // Optional small delay just for smooth UI transition
        await new Promise(r => setTimeout(r, 150));
      }

      onClose(shouldReload);
    } catch (err: any) {
      console.error("Erro completo no handleSave:", err);
      alert('Ocorreu um erro: ' + (err.message || 'Erro desconhecido. Verifique sua conexão e tente novamente.'));
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  const visibleEvents = dayEvents.filter(e => !e.isDeleted);

  return (
    <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50 shrink-0">
          <h3 className="text-lg font-semibold text-neutral-800">
            Agenda: {format(date, 'dd/MM/yyyy')}
          </h3>
          <button onClick={() => onClose()} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-neutral-50/30">
          {visibleEvents.length === 0 && (
             <p className="text-center text-neutral-500 text-sm">Nenhuma ação para este dia.</p>
          )}
          {visibleEvents.map((ev, index) => (
            <div key={ev._localId} className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm relative">
              <div className="absolute top-4 right-4">
                <button
                  type="button"
                  onClick={() => handleMarkDeleted(ev._localId)}
                  className="text-neutral-400 hover:text-rose-600 transition-colors"
                  title="Remover ação"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 pr-6">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">
                    Ação #{index + 1}
                  </label>
                  <select
                    value={ev.type}
                    onChange={(e) => handleUpdateEvent(ev._localId, 'type', e.target.value as EventType)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-sm font-medium text-neutral-700"
                  >
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {ev.type !== 'Desbravadores' && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">
                      Igreja / Local
                    </label>
                    <input
                      type="text"
                      required
                      disabled={ev.type === 'Férias'}
                      value={ev.local}
                      onChange={(e) => handleUpdateEvent(ev._localId, 'local', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-sm text-neutral-700 disabled:bg-neutral-100 disabled:text-neutral-500"
                      placeholder="Nome da igreja ou local"
                    />
                  </div>
                )}

                {ev.type === 'Desbravadores' && (
                  <div className="animate-in fade-in">
                    <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">
                      Clube de Desbravadores
                    </label>
                    <input
                      type="text"
                      value={ev.clubName}
                      onChange={(e) => handleUpdateEvent(ev._localId, 'clubName', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-sm text-neutral-700"
                      placeholder="Nome do clube..."
                    />
                  </div>
                )}

                {ev.type === 'Visitação' && (
                  <div className="animate-in fade-in">
                    <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">
                      Nome da Família / Membro Visitado
                    </label>
                    <input
                      type="text"
                      value={ev.visitedName}
                      onChange={(e) => handleUpdateEvent(ev._localId, 'visitedName', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-sm text-neutral-700"
                      placeholder="Nome do membro ou família..."
                    />
                  </div>
                )}

                {(ev.type === 'Planejamento e Estudo' || ev.type === 'Comissão/Reunião') && (
                  <div className="animate-in fade-in">
                    <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">
                      Horário
                    </label>
                    <input
                      type="text"
                      value={ev.timeFrame}
                      onChange={(e) => handleUpdateEvent(ev._localId, 'timeFrame', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-sm text-neutral-700"
                      placeholder="Ex: 08:00 - 12:00"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={handleAddEvent}
            className="w-full py-3 border-2 border-dashed border-neutral-300 rounded-xl text-neutral-500 font-medium hover:border-blue-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" /> Adicionar outra ação neste dia
          </button>
        </div>

        <div className="px-6 py-4 border-t border-neutral-100 bg-white shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
