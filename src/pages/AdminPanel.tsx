import React, { useState, useEffect } from 'react';
import { db, app } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Trash2, UserPlus, ArrowLeft, Shield, Check } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!authUser) {
      navigate('/');
      return;
    }

    const checkAdminStatus = async () => {
      try {
        if (authUser?.isAdmin === true || authUser?.role === 'admin' || authUser?.email?.toLowerCase() === 'pedrorafaela_araujo@hotmail.com') {
          setCheckingAdmin(false);
        } else {
          const userDoc = await getDoc(doc(db, 'users', authUser.id));
          if (userDoc.exists()) {
             const data = userDoc.data();
             if (data?.isAdmin === true || data?.role === 'admin') {
                setCheckingAdmin(false);
                return;
             }
          }
          console.warn("Usuário não tem privilégios de administrador, redirecionando...");
          navigate('/dashboard');
        }
      } catch (err) {
        console.error("Erro ao verificar permissões de admin:", err);
        navigate('/dashboard');
      }
    };
    
    checkAdminStatus();
  }, [authUser, navigate]);

  useEffect(() => {
    if (checkingAdmin) return;

    const unsubscribe = onSnapshot(collection(db, 'users'), (querySnapshot) => {
      const usersData: any[] = [];
      querySnapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);
      setLoading(false);
    }, (err: any) => {
      console.error('Error fetching users:', err);
      setError('Erro ao carregar usuários. Verifique as permissões de acesso (Regras do Firestore).');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || password.length < 6) {
      setError('Preencha o e-mail corretamente e insira uma senha de no mínimo 6 caracteres.');
      return;
    }

    setIsCreating(true);
    setError('');
    setSuccess('');

    try {
      const secondaryApp = initializeApp(app.options, `SecondaryApp_${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUserId = userCredential.user.uid;
      
      // Create the user document using the primary DB (where admin is authenticated)
      await setDoc(doc(db, 'users', newUserId), {
        email: email,
        role: 'user',
        status: 'pendente',
        isApproved: false, // backwards compatibility
        activeSessions: [],
        createdAt: Date.now()
      });
      
      // Sign out the secondary auth only AFTER writing the doc
      await signOut(secondaryAuth);
      
      setSuccess('Usuário criado com sucesso!');
      setEmail('');
      setPassword('');
      
    } catch (err: any) {
      console.error('Create user error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('A autenticação por E-mail/Senha está desativada no seu projeto Firebase. Por favor, acesse o Console do Firebase > Authentication > Sign-in method e ative a opção "E-mail/Senha".');
      } else {
        setError(err.message || 'Erro ao criar usuário');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSetUserStatus = async (userId: string, status: 'ativo' | 'bloqueado' | 'pendente') => {
    try {
      await setDoc(doc(db, 'users', userId), {
        status: status,
        isApproved: status === 'ativo' // keep backwards compatibility aligned
      }, { merge: true });
      setSuccess(`Status atualizado para: ${status}`);
      setUsers(users.map(u => u.id === userId ? { ...u, status, isApproved: status === 'ativo' } : u));
    } catch (err: any) {
      console.error('Status error', err);
      setError(`Erro ao tentar mudar status para ${status}.`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    // Cannot use window.confirm properly in iFrame, so doing direct deletion
    try {
      await deleteDoc(doc(db, 'users', userId));
      setSuccess('Documento do usuário apagado (Revogado o acesso na plataforma).');
      setUsers(users.filter(u => u.id !== userId));
    } catch (err: any) {
      console.error('Delete error', err);
      setError('Erro ao tentar remover usuário.');
    }
  };

  if (checkingAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Verificando permissões de acesso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors flex items-center justify-center"
            title="Voltar ao Painel"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Administração</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        
        {error && (
          <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-3">
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-emerald-50 text-emerald-700 p-4 rounded-lg flex items-center gap-3">
            <span className="text-sm font-medium">{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="md:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                Novo Usuário
              </h2>
              
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm transition-shadow"
                    placeholder="E-mail do novo acesso"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none text-sm transition-shadow"
                    placeholder="Mínimo de 6 caracteres"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isCreating ? 'Criando...' : 'Criar Acesso'}
                </button>
              </form>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900">Usuários Cadastrados</h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-500 uppercase tracking-wider">
                      <th className="px-6 py-3 font-semibold">TIPO</th>
                      <th className="px-6 py-3 font-semibold">E-MAIL</th>
                      <th className="px-6 py-3 font-semibold">STATUS</th>
                      <th className="px-6 py-3 font-semibold text-right">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                          <div className="animate-pulse">Carregando usuários...</div>
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                          Nenhum usuário encontrado.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        let statusUI = { label: 'Ativo', bg: 'bg-emerald-100', text: 'text-emerald-800' };
                        let st = u.status;
                        if (!st) {
                          st = u.isApproved ? 'ativo' : 'pendente';
                        }
                        
                        if (u.isAdmin || u.role === 'admin') {
                          statusUI = { label: 'Admin (Mestre)', bg: 'bg-indigo-100', text: 'text-indigo-800' };
                          st = 'ativo';
                        } else if (st === 'pendente') {
                          statusUI = { label: 'Pendente', bg: 'bg-amber-100', text: 'text-amber-800' };
                        } else if (st === 'bloqueado') {
                          statusUI = { label: 'Bloqueado', bg: 'bg-red-100', text: 'text-red-800' };
                        }

                        return (
                        <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 flex flex-col gap-1 items-start">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${(u.isAdmin || u.role === 'admin') ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}>
                              {(u.isAdmin || u.role === 'admin') ? 'Admin' : 'Usuário Comum'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                            {u.email || 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${statusUI.bg} ${statusUI.text}`}>
                              {statusUI.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {!(u.isAdmin || u.role === 'admin') && st !== 'ativo' && (
                                <button
                                  onClick={() => handleSetUserStatus(u.id, 'ativo')}
                                  className="text-emerald-600 hover:text-emerald-900 hover:bg-emerald-50 p-2 rounded-full transition-colors flex items-center justify-center text-xs font-medium"
                                  title="Liberar Usuário"
                                >
                                  Liberar
                                </button>
                              )}
                              {!(u.isAdmin || u.role === 'admin') && st !== 'bloqueado' && (
                                <button
                                  onClick={() => handleSetUserStatus(u.id, 'bloqueado')}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-colors flex items-center justify-center text-xs font-medium"
                                  title="Bloquear Usuário"
                                >
                                  Bloquear
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="text-gray-400 hover:text-red-600 hover:bg-gray-100 p-2 rounded-full transition-colors flex items-center justify-center ml-2"
                                title="Deletar permanentemente"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )})
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
