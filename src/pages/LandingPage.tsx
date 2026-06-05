import React, { useState } from 'react';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { BookOpen, LogIn, Calendar, Lock, AlertTriangle } from 'lucide-react';
import type { AppUser } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface LandingPageProps {
  user: AppUser | null;
  onResetDevices?: () => void;
  onCancelLogin?: () => void;
}

export default function LandingPage({ user, onResetDevices, onCancelLogin }: LandingPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const {  } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError('');
    try {
      if (!isFirebaseConfigured) {
         setError('Firebase não conectado.');
         setLoading(false);
         return;
      }
      
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setError('O login por E-mail/Senha não está habilitado. Por favor, habilite-o no Console do Firebase.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-email') {
        setError('Senha ou login errado ou e-mail não cadastrado.');
      } else {
        setError('Erro de autenticação: ' + (err.message || 'Erro desconhecido'));
      }
      setLoading(false);
    }
  };

  if (user?.needsDeviceReset) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-red-100 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Limite de Aparelhos Atingido</h2>
          <p className="text-neutral-600 mb-8 leading-relaxed">
            Você já está conectado em 3 dispositivos (ex: celular, tablet e computador). Desconecte-se de um deles para continuar.
          </p>
          <div className="space-y-3">
            <button
              onClick={onResetDevices}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Desconectar de todos os aparelhos
            </button>
            <button
              onClick={onCancelLogin}
              className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium py-3 rounded-lg transition-colors"
            >
              Voltar ao Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col md:flex-row">
      {/* Hero Section / Vitrine */}
      <div className="flex-1 p-8 md:p-16 flex flex-col justify-center relative overflow-hidden">
         <div className="max-w-xl relative z-10">
           <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 tracking-tight leading-tight mb-6">
             Gerador de Itinerário Pastoral
           </h1>
           <p className="text-lg text-neutral-600 mb-10 leading-relaxed max-w-md">
             Organiza rapidamente a sua agenda mensal e gere seu itinerário em PDF.
           </p>

           {/* Mockup */}
           <div className="relative rounded-xl border border-neutral-200 bg-white shadow-xl overflow-hidden pointer-events-none select-none origin-left max-w-[450px]">
             {/* Fake Navbar */}
             <div className="bg-neutral-50 px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2 text-neutral-400">
                  <Calendar className="w-4 h-4 text-blue-600" /> <span className="text-sm font-bold text-neutral-700">Agenda Julho 2026</span>
                </div>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
             </div>
             {/* Fake Calendar Grid */}
             <div className="p-4 grid grid-cols-7 gap-1">
               {['D','S','T','Q','Q','S','S'].map((d,i) => (
                 <div key={i} className="text-center text-[10px] font-bold text-neutral-400">{d}</div>
               ))}
              {Array.from({length: 14}).map((_, i) => (
                <div key={i} className={`h-12 bg-neutral-50 rounded border border-neutral-100 flex flex-col p-1 ${i===5 ? 'bg-blue-50 border-blue-200' : ''}`}>
                  {i === 3 && <div className="text-[7px] bg-amber-100 text-amber-800 rounded px-1 mb-0.5 font-bold uppercase">Pregação</div>}
                   {i === 3 && <div className="text-[8px] text-neutral-600 font-medium truncate">Igreja Central</div>}
                   {i === 7 && <div className="text-[7px] bg-rose-100 text-rose-800 rounded px-1 mb-0.5 font-bold uppercase">Férias</div>}
                   {i === 12 && <div className="text-[7px] bg-indigo-100 text-indigo-800 rounded px-1 mb-0.5 font-bold uppercase">Visitação</div>}
                 </div>
               ))}
             </div>
             <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
                <div className="bg-neutral-900/90 text-white text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-2 shadow-lg scale-90">
                   <Lock className="w-4 h-4" /> Faça o seu login
                </div>
             </div>
           </div>
         </div>
         {/* Background Decor */}
         <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 rounded-bl-[100px]"></div>
      </div>

      {/* Login Sidebar */}
      <div className="w-full md:w-[480px] bg-white border-l border-neutral-200 flex flex-col justify-center p-8 md:p-14 shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-neutral-900 flex items-center gap-2 mb-2">
            Acesso Restrito
          </h2>
          <p className="text-neutral-500 text-sm">
            {isRegistering ? 'Crie sua conta para acessar o painel de criação.' : 'Entre com suas credenciais de administrador para acessar.'}
          </p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              E-mail
            </label>
            <input
              type="email"
              required
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 focus:bg-white outline-none transition-colors"
              placeholder="pastor@distrito.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5 flex justify-between items-center">
               Senha
            </label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 focus:bg-white outline-none transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors mt-2"
          >
            {loading ? 'Autenticando...' : isRegistering ? 'Criar Conta' : 'Entrar na Plataforma'}
          </button>
          
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
              className="text-sm text-blue-600 hover:underline"
            >
              {isRegistering ? 'Já tem uma conta? Entre aqui' : 'Não tem conta? Crie aqui'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
