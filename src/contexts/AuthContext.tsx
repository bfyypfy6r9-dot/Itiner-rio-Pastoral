import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db, isFirebaseConfigured } from '../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import type { AppUser } from '../types';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  resetDevices: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  resetDevices: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setUser(null);
      setLoading(false);
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let deviceId = localStorage.getItem('deviceId');
        if (!deviceId) {
           deviceId = crypto.randomUUID();
           localStorage.setItem('deviceId', deviceId);
        }

        try {
           const userDocRef = doc(db, 'users', firebaseUser.uid);
           const userDocSnap: any = await Promise.race([
             getDoc(userDocRef),
             new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
           ]).catch(e => {
             console.warn("Could not fetch user document, proceeding with fallback", e);
             return null;
           });
           
           if (userDocSnap && userDocSnap.exists()) {
             const userData = userDocSnap.data();
             const activeSessions = userData.activeSessions || [];
             const userEmail = firebaseUser.email?.toLowerCase() || '';
             const isAdmin = userData.isAdmin === true || userData.isAdmin === 'true' || userData.role === 'admin' || userData.role === 'Admin' || userEmail === 'pedrorafaela_araujo@hotmail.com';
             
             // Backwards compatibility or explicit status
             let status = userData.status;
             if (!status) {
               status = userData.isApproved ? 'ativo' : 'pendente';
             }

             if (!isAdmin) {
               if (status === 'pendente') {
                 setUser({ id: firebaseUser.uid, email: firebaseUser.email || '', isPendingApproval: true, isBlocked: false, isAdmin: false, status: 'pendente' });
                 setLoading(false);
                 return;
               } else if (status === 'bloqueado') {
                 setUser({ id: firebaseUser.uid, email: firebaseUser.email || '', isPendingApproval: false, isBlocked: true, isAdmin: false, status: 'bloqueado' });
                 setLoading(false);
                 return;
               }
             }

             if (!userData.email || userData.email !== firebaseUser.email) {
               updateDoc(userDocRef, { email: firebaseUser.email || '' }).catch(e => console.warn(e));
             }
             if (!activeSessions.includes(deviceId) && activeSessions.length >= 3) {
               setUser({ id: firebaseUser.uid, email: firebaseUser.email || '', needsDeviceReset: true, isAdmin, role: userData.role, status: 'ativo' });
               setLoading(false);
               return;
             } else if (!activeSessions.includes(deviceId)) {
               updateDoc(userDocRef, { activeSessions: arrayUnion(deviceId) }).catch(e => console.warn(e));
             }
             setUser({ id: firebaseUser.uid, email: firebaseUser.email || '', isAdmin, role: userData.role, status: 'ativo' });
             setLoading(false);
             return;
           } else if (userDocSnap) {
             // We KNOW the document doesn't exist yet, it's safe to create.
             const userEmailRaw = firebaseUser.email?.toLowerCase() || '';
             const fallbackIsAdmin = userEmailRaw === 'pedrorafaela_araujo@hotmail.com';
             const newStatus = fallbackIsAdmin ? 'ativo' : 'pendente';
             
             let retryCount = 0;
             let success = false;
             while(retryCount < 3 && !success) {
               try {
                 await setDoc(userDocRef, { 
                   activeSessions: [deviceId], 
                   status: newStatus,
                   role: fallbackIsAdmin ? 'admin' : 'user',
                   isApproved: fallbackIsAdmin, // backwards compatibility
                   isAdmin: fallbackIsAdmin, 
                   email: firebaseUser.email || userEmailRaw, 
                   createdAt: Date.now() 
                 });
                 success = true;
               } catch(retryErr) {
                 retryCount++;
                 if (retryCount >= 3) throw retryErr;
                 await new Promise(r => setTimeout(r, 1000));
               }
             }

             if (fallbackIsAdmin) {
               setUser({ id: firebaseUser.uid, email: firebaseUser.email || '', isAdmin: true, status: 'ativo' });
             } else {
               setUser({ id: firebaseUser.uid, email: firebaseUser.email || '', isPendingApproval: true, isBlocked: false, isAdmin: false, status: 'pendente' });
             }
             setLoading(false);
             return;
           }
           
           const fallbackEmail = firebaseUser.email?.toLowerCase() || '';
           const fallbackIsAdmin = fallbackEmail === 'pedrorafaela_araujo@hotmail.com';
           
           // If we timed out (userDocSnap is null) and it's NOT an admin wait... 
           // we can try to set doc but not overwrite isApproved if it already exists -> use setDoc with merge for just basic fields? 
           // No, setDoc with merge will overwrite fields if they are in the payload. 
           // Best not to write if we are unsure if it exists and aren't admin. 
           
           if (fallbackIsAdmin) {
             setUser({ id: firebaseUser.uid, email: firebaseUser.email || '', isAdmin: true, status: 'ativo' });
           } else {
             setUser({ id: firebaseUser.uid, email: firebaseUser.email || '', isAdmin: false, isPendingApproval: true, isBlocked: false, status: 'pendente' });
           }
        } catch (e: any) {
           console.error("Device limit check failed", e);
           const errEmail = firebaseUser.email?.toLowerCase() || '';
           const isFallbackAdmin = errEmail === 'pedrorafaela_araujo@hotmail.com';
           setUser({ 
             id: firebaseUser.uid, 
             email: firebaseUser.email || '', 
             isAdmin: isFallbackAdmin, 
             isPendingApproval: !isFallbackAdmin,
             isBlocked: false,
             status: isFallbackAdmin ? 'ativo' : 'pendente'
           });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Firebase auth initialization failed:", error);
      setUser(null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      if (user && !user.isMock && !user.needsDeviceReset) {
        const deviceId = localStorage.getItem('deviceId');
        if (deviceId) {
          try {
            const userDocRef = doc(db, 'users', user.id);
            // Don't wait indefinitely for Firestore if the network is poor
            await Promise.race([
              updateDoc(userDocRef, { activeSessions: arrayRemove(deviceId) }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
            ]).catch(e => console.warn('Timeout or error updating sessions on logout', e));
          } catch(e) {}
        }
      }
      if (auth && auth.signOut) {
        await Promise.race([
          signOut(auth),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]).catch(e => console.warn('Timeout or error during signOut', e));
      }
    } catch (e) {
      console.error('Logout error', e);
      throw e;
    } finally {
      setUser(null);
    }
  };

  const resetDevices = async () => {
    if (user && user.needsDeviceReset) {
      setLoading(true);
      try {
        const userDocRef = doc(db, 'users', user.id);
        const deviceId = localStorage.getItem('deviceId');
        await updateDoc(userDocRef, { activeSessions: deviceId ? [deviceId] : [] });
        setUser({ id: user.id, email: user.email, needsDeviceReset: false });
      } catch(e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-3 text-neutral-600 font-medium">Carregando o sistema...</span>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, resetDevices }}>
      {children}
    </AuthContext.Provider>
  );
}
