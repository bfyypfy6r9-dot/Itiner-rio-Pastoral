import { useState, useEffect } from 'react';
import { db, isFirebaseConfigured } from '../lib/firebase';
import { collection, query, where, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { AppUser, EventType, PastelEvent, PastorConfig } from '../types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LogOut, Printer, Calendar as CalendarIcon, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CalendarGrid from '../components/CalendarGrid';
import EventModal from '../components/EventModal';
import PrintTemplate from '../components/PrintTemplate';
import DayDetailsModal from '../components/DayDetailsModal';

export default function Dashboard({ user, onLogout }: { user: AppUser, onLogout: () => void }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'calendar' | 'pdf' | 'view'>('calendar');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const ALL_EVENT_TYPES: EventType[] = ['Pregação', 'Desbravadores', 'Visitação', 'Comissão/Reunião', 'Férias', 'Planejamento e Estudo', 'PG', 'Aventureiros', 'Santa ceia', 'PGP', 'Concílio', 'Família'];
  const [selectedTypes, setSelectedTypes] = useState<EventType[]>(ALL_EVENT_TYPES);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Pastor Config
  const [config, setConfig] = useState<PastorConfig>({
    name: '',
    district: '',
    phone: '',
  });

  const [events, setEvents] = useState<PastelEvent[]>([]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedViewDate, setSelectedViewDate] = useState<Date | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<PastelEvent[]>([]);
  const [selectedViewEvents, setSelectedViewEvents] = useState<PastelEvent[]>([]);

  const monthStr = format(currentDate, 'yyyy-MM');

  // Trigger manual load for mock mode
  const fetchMockEvents = () => {
    if (user.isMock) {
      const storedEvents = JSON.parse(localStorage.getItem('mockEvents') || '[]');
      setEvents(storedEvents.filter((e: PastelEvent) => e.month === monthStr));
    }
  };

  useEffect(() => {
    // Load config
    const loadConfig = async () => {
      try {
        if (!user.id) return;
        if (user.isMock) {
          const storedConfig = JSON.parse(localStorage.getItem('mockConfig') || '{"name":"","district":"","phone":""}');
          setConfig(storedConfig);
        } else if (isFirebaseConfigured) {
          const docRef = doc(db, 'users', user.id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setConfig(docSnap.data() as PastorConfig);
          }
        }
      } catch (err: any) {
        if (err.message && err.message.includes('offline')) {
          console.warn("Firebase is offline, could not load config.");
        } else {
          console.error(err);
        }
      }
    };
    loadConfig();
  }, [user.id, user.isMock]);

  useEffect(() => {
    if (user.isMock) {
      if (!user.id) return;
      fetchMockEvents();
    } else if (isFirebaseConfigured && user.id) {
      const q = query(collection(db, 'users', user.id, 'events'), where('userId', '==', user.id), where('month', '==', monthStr));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const fbEvents: PastelEvent[] = [];
        querySnapshot.forEach((doc) => {
          fbEvents.push({ ...doc.data(), id: doc.id } as PastelEvent);
        });
        setEvents(fbEvents);
        
        // Update modal selections if they are open so we see realtime updates instantly
        if (selectedDate) {
           const existingStr = format(selectedDate, 'yyyy-MM-dd');
           setSelectedEvents(fbEvents.filter(e => e.date === existingStr));
        }
        if (selectedViewDate) {
           const existingStr = format(selectedViewDate, 'yyyy-MM-dd');
           setSelectedViewEvents(fbEvents.filter(e => e.date === existingStr));
        }
      }, (err) => {
        console.warn("Firebase listener error/offline:", err);
      });
      
      return () => unsubscribe();
    }
  }, [user.id, monthStr, user.isMock]);

  const saveConfig = async (newConfig: PastorConfig) => {
    setConfig(newConfig);
    try {
      if (user.isMock) {
        localStorage.setItem('mockConfig', JSON.stringify(newConfig));
      } else if (isFirebaseConfigured) {
        await setDoc(doc(db, 'users', user.id), { id: user.id, ...newConfig }, { merge: true });
      }
    } catch (err: any) {
      console.error(err);
      alert("Erro ao salvar configuração: " + (err?.message || "Erro desconhecido"));
    }
  };

  const handleDayClick = (date: Date) => {
    const existingStr = format(date, 'yyyy-MM-dd');
    const dayEvents = events.filter(e => e.date === existingStr);
    setSelectedDate(date);
    setSelectedEvents(dayEvents);
    setIsModalOpen(true);
  };

  const handleViewDayClick = (date: Date) => {
    const existingStr = format(date, 'yyyy-MM-dd');
    const dayEvents = events.filter(e => e.date === existingStr);
    setSelectedViewDate(date);
    setSelectedViewEvents(dayEvents);
    setIsViewModalOpen(true);
  };

  const generatePDFDoc = () => {
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });
    
    // Agrupamento para não repetir dias na mesma igreja
    const groupEvents = (eventsToGroup: PastelEvent[]) => {
      const grouped = new Map();

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
            types: new Set<string>(),
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
        if ((e.type === 'Planejamento e Estudo' || e.type === 'Comissão' || e.type === 'Comissão/Reunião') && e.timeFrame) {
          group.timeFrames.add(e.timeFrame);
        }
        group.types.add(e.type);
      });
      return Array.from(grouped.values()).sort((a: any, b: any) => {
        const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (timeDiff === 0) return (a.createdAt || 0) - (b.createdAt || 0);
        return timeDiff;
      });
    };

    const geralEvents = groupEvents(events.filter(e => ['Pregação', 'Desbravadores', 'Férias', 'Concílio', 'PG'].includes(e.type) && selectedTypes.includes(e.type)));
    const aventureirosEvents = groupEvents(events.filter(e => e.type === 'Aventureiros' && selectedTypes.includes(e.type)));
    const santaCeiaEvents = groupEvents(events.filter(e => e.type === 'Santa ceia' && selectedTypes.includes(e.type)));
    const pgpEvents = groupEvents(events.filter(e => e.type === 'PGP' && selectedTypes.includes(e.type)));
    const familiaEvents = groupEvents(events.filter(e => e.type === 'Família' && selectedTypes.includes(e.type)));
    const visitacaoEvents = groupEvents(events.filter(e => e.type === 'Visitação' && selectedTypes.includes(e.type)));
    const comissaoEvents = groupEvents(events.filter(e => (e.type === 'Comissão' || e.type === 'Comissão/Reunião') && selectedTypes.includes('Comissão/Reunião')));
    
    // Filtro Isolado Exclusivo
    const planejamentoEvents = events
      .filter(e => e.type === 'Planejamento e Estudo' && selectedTypes.includes(e.type))
      .sort((a, b) => {
        const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
        return timeDiff === 0 ? ((a.createdAt || 0) - (b.createdAt || 0)) : timeDiff;
      });

    const monthName = format(currentDate, 'MMMM', { locale: ptBR }).toUpperCase();
    const year = format(currentDate, 'yyyy');

    // Margens ABNT (Esquerda 30, Direita 20, Superior 30, Inferior 20)
    const ptLeft = 30;
    const ptRight = 20;
    const ptTop = 30;
    const usableWidth = 210 - ptLeft - ptRight; // 160mm
    const centerX = ptLeft + (usableWidth / 2); // 110mm

    // Cabeçalho
    let finalY = ptTop;
    doc.setFontSize(12); // Padrão ABNT 12
    doc.setFont("times", "bold");
    doc.text(`ITINERÁRIO PASTORAL - ${year}`, centerX, finalY, { align: 'center' });
    finalY += 6;
    doc.text(`DISTRITO - ${config.district || '____________________'}`, centerX, finalY, { align: 'center' });
    finalY += 6;
    doc.text(`${monthName}`, centerX, finalY, { align: 'center' });

    finalY += 10;

    // Tabela 1: Geral
    const showTabelaGeral = selectedTypes.includes('Pregação') || selectedTypes.includes('Desbravadores') || selectedTypes.includes('Férias') || selectedTypes.includes('Concílio') || selectedTypes.includes('PG');
    if (showTabelaGeral && geralEvents.length > 0) {
      doc.setFontSize(12);
      doc.setFont("times", "bold");
      doc.text("ESCALA DE PREGAÇÃO / VISITA DBV", centerX, finalY, { align: 'center' });
      finalY += 5;

      autoTable(doc, {
        startY: finalY,
        head: [['DATA', 'DIA', 'IGREJA', 'DESBRAVADOR']],
        body: geralEvents.map((e: any) => [
          e.dateLabel,
          e.dayOfWeek,
          e.local,
          e.clubNames.size > 0 ? Array.from(e.clubNames).join(', ') : '-'
        ]),
        theme: 'grid',
        headStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', font: 'times' },
        styles: { fontSize: 12, cellPadding: 3, textColor: 0, halign: 'center', valign: 'middle', font: 'times' },
        margin: { left: ptLeft, right: ptRight },
        tableWidth: usableWidth,
        columnStyles: {
          0: { cellWidth: usableWidth / 4 },
          1: { cellWidth: usableWidth / 4 },
          2: { cellWidth: usableWidth / 4 },
          3: { cellWidth: usableWidth / 4 }
        }
      });
      finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Tabela: Família
    if (selectedTypes.includes('Família') && familiaEvents.length > 0) {
       doc.setFontSize(12);
       doc.setFont("times", "bold");
       doc.text("FAMÍLIA", centerX, finalY, { align: 'center' });
       finalY += 5;

       autoTable(doc, {
         startY: finalY,
         head: [['DATA', 'IGREJA / LOCAL']],
         body: familiaEvents.map((e: any) => [
           e.dateLabel,
           e.local
         ]),
         theme: 'grid',
         headStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', font: 'times' },
         styles: { fontSize: 12, cellPadding: 3, textColor: 0, halign: 'center', valign: 'middle', font: 'times' },
         margin: { left: ptLeft, right: ptRight },
         tableWidth: usableWidth,
         columnStyles: {
           0: { cellWidth: usableWidth * 0.3 },
           1: { cellWidth: usableWidth * 0.7 }
         }
       });
       finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Tabela: PGP
    if (selectedTypes.includes('PGP') && pgpEvents.length > 0) {
       doc.setFontSize(12);
       doc.setFont("times", "bold");
       doc.text("PGP", centerX, finalY, { align: 'center' });
       finalY += 5;

       autoTable(doc, {
         startY: finalY,
         head: [['DATA', 'IGREJA / LOCAL']],
         body: pgpEvents.map((e: any) => [
           e.dateLabel,
           e.local
         ]),
         theme: 'grid',
         headStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', font: 'times' },
         styles: { fontSize: 12, cellPadding: 3, textColor: 0, halign: 'center', valign: 'middle', font: 'times' },
         margin: { left: ptLeft, right: ptRight },
         tableWidth: usableWidth,
         columnStyles: {
           0: { cellWidth: usableWidth * 0.3 },
           1: { cellWidth: usableWidth * 0.7 }
         }
       });
       finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Tabela: Aventureiros
    if (selectedTypes.includes('Aventureiros') && aventureirosEvents.length > 0) {
       doc.setFontSize(12);
       doc.setFont("times", "bold");
       doc.text("AVENTUREIROS", centerX, finalY, { align: 'center' });
       finalY += 5;

       autoTable(doc, {
         startY: finalY,
         head: [['DATA', 'IGREJA / LOCAL']],
         body: aventureirosEvents.map((e: any) => [
           e.dateLabel,
           e.local
         ]),
         theme: 'grid',
         headStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', font: 'times' },
         styles: { fontSize: 12, cellPadding: 3, textColor: 0, halign: 'center', valign: 'middle', font: 'times' },
         margin: { left: ptLeft, right: ptRight },
         tableWidth: usableWidth,
         columnStyles: {
           0: { cellWidth: usableWidth * 0.3 },
           1: { cellWidth: usableWidth * 0.7 }
         }
       });
       finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Tabela: Santa ceia
    if (selectedTypes.includes('Santa ceia') && santaCeiaEvents.length > 0) {
       doc.setFontSize(12);
       doc.setFont("times", "bold");
       doc.text("SANTA CEIA", centerX, finalY, { align: 'center' });
       finalY += 5;

       autoTable(doc, {
         startY: finalY,
         head: [['DATA', 'IGREJA / LOCAL']],
         body: santaCeiaEvents.map((e: any) => [
           e.dateLabel,
           e.local
         ]),
         theme: 'grid',
         headStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', font: 'times' },
         styles: { fontSize: 12, cellPadding: 3, textColor: 0, halign: 'center', valign: 'middle', font: 'times' },
         margin: { left: ptLeft, right: ptRight },
         tableWidth: usableWidth,
         columnStyles: {
           0: { cellWidth: usableWidth * 0.3 },
           1: { cellWidth: usableWidth * 0.7 }
         }
       });
       finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Tabela 2: Visitação
    if (selectedTypes.includes('Visitação') && visitacaoEvents.length > 0) {
       doc.setFontSize(12);
       doc.setFont("times", "bold");
       doc.text("VISITAÇÃO", centerX, finalY, { align: 'center' });
       finalY += 5;

       autoTable(doc, {
         startY: finalY,
         head: [['DATA', 'IGREJA', 'NOME DO VISITADO']],
         body: visitacaoEvents.map((e: any) => [
           e.dateLabel,
           e.local,
           e.visitedNames.size > 0 ? Array.from(e.visitedNames).join(', ') : '-'
         ]),
         theme: 'grid',
         headStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', font: 'times' },
         styles: { fontSize: 12, cellPadding: 3, textColor: 0, halign: 'center', valign: 'middle', font: 'times' },
         margin: { left: ptLeft, right: ptRight },
         tableWidth: usableWidth,
         columnStyles: {
           0: { cellWidth: usableWidth / 3 },
           1: { cellWidth: usableWidth / 3 },
           2: { cellWidth: usableWidth / 3 }
         }
       });
       finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Tabela 3: Comissões
    if (selectedTypes.includes('Comissão/Reunião') && comissaoEvents.length > 0) {
       doc.setFontSize(12);
       doc.setFont("times", "bold");
       doc.text("COMISSÃO/REUNIÃO", centerX, finalY, { align: 'center' });
       finalY += 5;

       autoTable(doc, {
         startY: finalY,
         head: [['DATA', 'LOCAL', 'HORÁRIO']],
         body: comissaoEvents.map((e: any) => [
           e.dateLabel,
           e.local,
           Array.from(e.timeFrames).join(', ') || '-'
         ]),
         theme: 'grid',
         headStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', font: 'times' },
         styles: { fontSize: 12, cellPadding: 3, textColor: 0, halign: 'center', valign: 'middle', font: 'times' },
         margin: { left: ptLeft, right: ptRight },
         tableWidth: usableWidth,
         columnStyles: {
           0: { cellWidth: usableWidth / 3 },
           1: { cellWidth: usableWidth / 3 },
           2: { cellWidth: usableWidth / 3 }
         }
       });
       finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Tabela 4: Planejamento e Estudo
    if (selectedTypes.includes('Planejamento e Estudo') && planejamentoEvents.length > 0) {
       doc.setFontSize(12);
       doc.setFont("times", "bold");
       doc.text("ROTINA DE PLANEJAMENTO E ESTUDO", centerX, finalY, { align: 'center' });
       finalY += 5;

       autoTable(doc, {
         startY: finalY,
         head: [['DIA DA SEMANA', 'DATA', 'HORÁRIO']],
         body: planejamentoEvents.map((e) => [
           e.dayOfWeek,
           e.dateLabel,
           e.timeFrame || '-'
         ]),
         theme: 'grid',
         headStyles: { fillColor: [243, 244, 246], textColor: 0, fontStyle: 'bold', halign: 'center', valign: 'middle', font: 'times' },
         styles: { fontSize: 12, cellPadding: 3, textColor: 0, halign: 'center', valign: 'middle', font: 'times' },
         margin: { left: ptLeft, right: ptRight },
         tableWidth: usableWidth,
         columnStyles: {
           0: { cellWidth: usableWidth / 3 },
           1: { cellWidth: usableWidth / 3 },
           2: { cellWidth: usableWidth / 3 }
         }
       });
       finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    // Versículo ou Frase Restante
    if (config.customMessage) {
      doc.setFontSize(12);
      doc.setFont("times", "italic");
      finalY += 5; // Margem extra do topo da Tabela 2
      const splitText = doc.splitTextToSize(config.customMessage, usableWidth);
      doc.text(splitText, ptLeft, finalY, { align: 'left' });
      finalY += (splitText.length * 6) + 15;
    } else {
      finalY += 15;
    }

    // Rodapé / Assinatura (Alinhado à esquerda seguindo margem ABNT)
    doc.setLineWidth(0.5);
    doc.line(ptLeft, finalY, ptLeft + 80, finalY); // Linha
    finalY += 5;
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.text(config.name || 'Nome do Pastor', ptLeft, finalY);
    finalY += 6;
    doc.setFont("times", "normal");
    doc.text(config.phone || 'Telefone', ptLeft, finalY);

    return doc;
  };

  const handlePrint = () => {
    try {
      const doc = generatePDFDoc();
      const fileName = `itinerario_pastoral_${format(currentDate, 'MM_yyyy')}.pdf`;
      
      try {
        doc.save(fileName);
      } catch(e) {
        console.warn("Save block failed", e);
      }
      
      // Provide an alternative open just in case download is blocked
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const a = window.document.createElement('a');
      a.href = pdfUrl;
      a.download = fileName;
      a.target = '_blank';
      a.click();
    } catch (err: any) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao tentar gerar o PDF. Verifique se há dados válidos.');
    }
  };

  const handlePrintPersonalizado = async () => {
    try {
      const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const monthName = format(currentDate, 'MMMM', { locale: ptBR }).toUpperCase();
      const year = format(currentDate, 'yyyy');

      const azulEscuro = '#0a1f44';
      const cinzaClaro = '#e6e6e6';

      // 1. Barra Lateral Esquerda
      const sidebarWidth = 25; // Mais larga
      doc.setFillColor(cinzaClaro);
      doc.rect(0, 0, sidebarWidth, pageHeight, 'F');

      // 1.5. Marca Azul no Canto Superior Direito (Arredondada e Sutil)
      doc.setFillColor(azulEscuro);
      doc.roundedRect(pageWidth - 28, -12, 38, 38, 10, 10, 'F');

      // 2. Logomarca
      try {
        const logoWidth = 18;
        const logoHeight = 18;
        const logoX = (sidebarWidth - logoWidth) / 2;
        const logoY = 10;
        doc.addImage('/logo-iasd.png', 'PNG', logoX, logoY, logoWidth, logoHeight);
      } catch (e) {
        console.warn('Logo não carregou', e);
      }

      // 3. Texto Lateral Esquerdo e Título ('AGENDA / MENSAL')
      doc.setTextColor(azulEscuro);
      doc.setFont(undefined, "bolditalic");
      doc.setFontSize(58); // Tamanho Gigante
      
      // Calcula centralização vertical de 'AGENDA'
      const agendaWidth = doc.getTextWidth('AGENDA');
      const startYAgenda = ((pageHeight + agendaWidth) / 2) + 40; // Descendo ~40 unidades (~4cm)
      
      // Escreve 'AGENDA' na barra cinza
      doc.text('AGENDA', sidebarWidth / 2 + 7, startYAgenda, { angle: 90 });
      
      // Calcula o deslocamento do 'N' (largura aproximada de 'AGE')
      const offsetN = doc.getTextWidth('AGE');
      
      // Escreve 'MENSAL' fora da barra cinza, alinhado com o 'N' de 'AGENDA'
      doc.text('MENSAL', sidebarWidth + 14, startYAgenda - offsetN, { angle: 90 });

      // 4. Cabeçalho Central
      doc.setFont(undefined, "bold");
      doc.setFontSize(20);
      const headerX = sidebarWidth + ((pageWidth - sidebarWidth - 20) / 2);
      doc.text('IGREJA ADVENTISTA DO 7º DIA', headerX, 10, { align: 'center' });
      doc.setFontSize(14);
      const distritoStr = config.district ? config.district.toUpperCase() : 'NÃO INFORMADO';
      doc.text(`ITINERÁRIO - DISTRITO ${distritoStr}`, headerX, 16, { align: 'center' });

      // 5. Mês Lateral Direito (Vertical, Vazado)
      doc.setFont(undefined, "bold");
      doc.setFontSize(65); // Tamanho grande para mês lateral
      
      const monthWidth = doc.getTextWidth(monthName);
      const startYMonth = (pageHeight + monthWidth) / 2;

      doc.setDrawColor(azulEscuro);
      doc.setLineWidth(0.2); // Linhas do contorno mais finas e elegantes
      try {
         // Tenta usar stroke (vazado)
         doc.setTextColor(255, 255, 255);
         doc.text(monthName, pageWidth + 1, startYMonth, { angle: 90, renderingMode: 'stroke' } as any);
      } catch(e) {
         // Fallback se stroke falhar
         doc.setTextColor(azulEscuro);
         doc.text(monthName, pageWidth + 1, startYMonth, { angle: 90 });
      }

      // 6. Tabela Principal (Calendário)
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      const days = eachDayOfInterval({ start, end });
      
      const calendarData: any[][] = [];
      let currentWeek: any[] = Array(7).fill('');

      days.forEach((day, index) => {
        const dayNum = format(day, 'd');
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayEvents = events.filter(e => e.date === dayStr && selectedTypes.includes(e.type)).sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));

        let cellText = dayNum;
        if(dayEvents.length > 0) {
           const eventsStr = dayEvents.map(e => {
             let details = e.local ? `\n  (${e.local})` : '';
             if (e.clubName) details += `\n  ${e.clubName}`;
             if (e.visitedName) details += `\n  ${e.visitedName}`;
             if (e.timeFrame) details += `\n  ${e.timeFrame}`;
             return `- ${e.type}${details}`;
           }).join('\n');
           cellText += '\n\n' + eventsStr;
        }

        const dayOfWeek = day.getDay();
        currentWeek[dayOfWeek] = { content: cellText };

        if (dayOfWeek === 6 || index === days.length - 1) {
          calendarData.push([...currentWeek]);
          currentWeek = Array(7).fill('');
        }
      });

      const tableBody = calendarData.map(week => week.map(d => d ? d.content : ''));

      const tableMarginLeft = sidebarWidth + 17; // Margem colada em MENSAL
      const tableMarginRight = 15; // Espaço mais reduzido e colado com o mês
      const tableWidthRaw = pageWidth - tableMarginLeft - tableMarginRight; // 100% do espaço livre
      const colWidth = tableWidthRaw / 7; // Distribuído igualmente

      // Calcula a altura da célula para esticar até o fim da página dinamicamente
      const tableStartY = 20; 
      const tableHeadHeight = 8;
      const bottomMargin = 15;
      const availableHeight = pageHeight - tableStartY - tableHeadHeight - bottomMargin;
      const dynamicCellHeight = availableHeight / calendarData.length;

      autoTable(doc, {
        startY: tableStartY,
        margin: { left: tableMarginLeft, right: tableMarginRight, bottom: 2 },
        tableLayout: 'fixed',
        head: [['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO']],
        body: tableBody,
        theme: 'grid',
        headStyles: { 
          fillColor: azulEscuro, 
          textColor: '#ffffff', 
          fontStyle: 'bold', 
          halign: 'center', 
          valign: 'middle',
          cellPadding: { top: 2, right: 2, bottom: 2, left: 2 } // Barra mais fina
        },
        bodyStyles: { minCellHeight: dynamicCellHeight },
        columnStyles: {
          0: { cellWidth: colWidth },
          1: { cellWidth: colWidth },
          2: { cellWidth: colWidth },
          3: { cellWidth: colWidth },
          4: { cellWidth: colWidth },
          5: { cellWidth: colWidth },
          6: { cellWidth: colWidth }
        },
        styles: { fontSize: 8, valign: 'top', halign: 'left', cellPadding: 2, overflow: 'linebreak' },
      });

      const fileName = `itinerario_personalizado_${format(currentDate, 'MM_yyyy')}.pdf`;
      try {
        doc.save(fileName);
      } catch(e) {
        console.warn('Doc save failed', e);
      }
      
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const a = window.document.createElement('a');
      a.href = pdfUrl;
      a.download = fileName;
      a.target = '_blank';
      a.click();
    } catch (err: any) {
      console.error('Erro ao gerar PDF personalizado:', err);
      alert('Erro ao tentar gerar o PDF personalizado.');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 print:bg-white print:pb-0">
      {/* Top Navbar */}
      <nav className="bg-white border-b border-neutral-200 px-4 py-3 print:hidden shadow-sm">
        <div className={`mx-auto flex justify-between items-center transition-all duration-300 ${activeTab === 'view' ? 'max-w-full px-4' : 'max-w-5xl'}`}>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-neutral-800">Itinerário Pastoral</span>
            {user.isMock && <span className="ml-2 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded uppercase tracking-wider">Modo Teste</span>}
          </div>
          <div className="flex items-center gap-4">
            {(user.isAdmin || user.role === 'admin') && (
              <button
                onClick={() => navigate('/admin')}
                className="text-indigo-600 hover:text-indigo-800 flex items-center gap-2 text-sm font-medium transition-colors"
              >
                Gerenciar Usuários
              </button>
            )}
            <button 
              onClick={async () => {
                setIsLoggingOut(true);
                try {
                  await onLogout();
                } finally {
                  setIsLoggingOut(false);
                }
              }} 
              disabled={isLoggingOut}
              className="text-neutral-500 hover:text-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium transition-colors"
            >
              {isLoggingOut ? (
                <div className="w-4 h-4 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              {isLoggingOut ? 'Saindo...' : 'Sair'}
            </button>
          </div>
        </div>
      </nav>


      <div className={`mx-auto px-4 mt-8 print:hidden transition-all duration-300 ${activeTab === 'view' ? 'w-full max-w-full' : 'max-w-5xl'}`}>
        {/* Tabs */}
        <div className="flex bg-neutral-200/50 p-1 rounded-lg w-fit mb-6 mx-auto sm:mx-0">
          <button onClick={() => setActiveTab('calendar')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
            Calendário
          </button>
          <button onClick={() => setActiveTab('view')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'view' ? 'bg-white text-blue-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
            Modo Agenda
          </button>
          <button onClick={() => setActiveTab('pdf')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'pdf' ? 'bg-white text-blue-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
            Gerar PDF
          </button>
        </div>

        {/* Header Configurations */}
        {activeTab === 'calendar' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-100 mb-6 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">Pastor</label>
                <input type="text" value={config.name} onChange={e => saveConfig({...config, name: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm" placeholder="Nome Completo" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">Distrito</label>
                <input type="text" value={config.district} onChange={e => saveConfig({...config, district: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm" placeholder="Nome do Distrito" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">Telefone</label>
                <input type="text" value={config.phone} onChange={e => saveConfig({...config, phone: e.target.value})} className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm" placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div className="flex gap-4 mt-4 pt-4 border-t border-neutral-100">
              <div className="w-48">
                <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">Mês</label>
                <select 
                  value={format(currentDate, 'MM')} 
                  onChange={e => {
                    if (e.target.value) {
                      const year = format(currentDate, 'yyyy');
                      setCurrentDate(new Date(`${year}-${e.target.value}-02`));
                    }
                  }} 
                  className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm"
                >
                  {Array.from({ length: 12 }).map((_, i) => {
                    const m = (i + 1).toString().padStart(2, '0');
                    const mName = format(new Date(`2024-${m}-02`), 'MMMM', { locale: ptBR });
                    return <option key={m} value={m}>{mName.charAt(0).toUpperCase() + mName.slice(1)}</option>;
                  })}
                </select>
              </div>
              <div className="w-32">
                <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">Ano</label>
                <select 
                  value={format(currentDate, 'yyyy')} 
                  onChange={e => {
                    if (e.target.value) {
                      const month = format(currentDate, 'MM');
                      setCurrentDate(new Date(`${e.target.value}-${month}-02`));
                    }
                  }} 
                  className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm"
                >
                  {Array.from({ length: 10 }).map((_, i) => {
                    const y = new Date().getFullYear() - 2 + i;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <label className="block text-xs font-medium text-neutral-500 mb-1 uppercase tracking-wider">Versículo ou Frase de Efeito (Opcional)</label>
              <textarea 
                value={config.customMessage || ''} 
                onChange={e => saveConfig({...config, customMessage: e.target.value})} 
                className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-sm min-h-[80px]" 
                placeholder="Ex: Tudo posso naquele que me fortalece. - Filipenses 4:13" 
              />
            </div>
          </div>
        )}

        {/* Content */}
        {activeTab === 'calendar' && (
          <div className="animate-in fade-in duration-300">
            <CalendarGrid currentDate={currentDate} events={events} onDayClick={handleDayClick} />
          </div>
        )}

        {activeTab === 'view' && (
          <div className="animate-in zoom-in-95 fade-in duration-300">
            <CalendarGrid currentDate={currentDate} events={events} onDayClick={handleViewDayClick} />
          </div>
        )}
        
        {activeTab === 'pdf' && (
           <div className="bg-white p-8 rounded-xl shadow-sm border border-neutral-100 animate-in fade-in duration-300">
             
             <div className="mb-8">
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                 <h3 className="text-lg font-bold text-neutral-800">Quais itens você deseja incluir no relatório?</h3>
                 <button
                   onClick={() => setSelectedTypes(selectedTypes.length === ALL_EVENT_TYPES.length ? [] : ALL_EVENT_TYPES)}
                   className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                 >
                   {selectedTypes.length === ALL_EVENT_TYPES.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                 </button>
               </div>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {ALL_EVENT_TYPES.map((type) => (
                    <label 
                      key={type}
                      className={`flex items-start gap-3 p-4 border rounded-xl cursor-pointer transition-all ${selectedTypes.includes(type) ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/50' : 'border-neutral-200 hover:border-blue-300 hover:bg-neutral-50'}`}
                    >
                      <div className="flex h-5 items-center mt-0.5">
                        <input
                          type="checkbox"
                          checked={selectedTypes.includes(type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTypes([...selectedTypes, type]);
                            } else {
                              setSelectedTypes(selectedTypes.filter(t => t !== type));
                            }
                          }}
                          className="w-4 h-4 text-blue-600 bg-white border-neutral-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className={`font-semibold text-sm ${selectedTypes.includes(type) ? 'text-blue-900' : 'text-neutral-700'}`}>{type}</span>
                      </div>
                    </label>
                  ))}
               </div>
             </div>

             <div className="flex justify-end gap-3 mb-8 pt-6 border-t border-neutral-100">
               <button onClick={handlePrint} className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
                 <Printer className="w-4 h-4" /> Gerar PDF Clássico
               </button>
               <button onClick={handlePrintPersonalizado} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
                 <CalendarIcon className="w-4 h-4" /> Gerar PDF Personalizado
               </button>
             </div>
             {/* Readonly View for the UI */}
             <PrintTemplate currentDate={currentDate} config={config} events={events} selectedTypes={selectedTypes} />
           </div>
        )}
      </div>

      {/* Print Only Area */}
      <div className="hidden print:block max-w-[800px] mx-auto p-8">
        <PrintTemplate currentDate={currentDate} config={config} events={events} selectedTypes={selectedTypes} />
      </div>

      {isModalOpen && selectedDate && (
        <EventModal
          isOpen={isModalOpen}
          date={selectedDate}
          events={selectedEvents}
          user={user}
          onClose={(shouldReload) => {
            setIsModalOpen(false);
            if (shouldReload && user.isMock) fetchMockEvents();
          }}
        />
      )}

      {isViewModalOpen && selectedViewDate && (
        <DayDetailsModal
          isOpen={isViewModalOpen}
          date={selectedViewDate}
          events={selectedViewEvents}
          onClose={() => setIsViewModalOpen(false)}
        />
      )}
    </div>
  );
}
