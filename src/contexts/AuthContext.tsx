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
  mockLogin: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  resetDevices: async () => {},
  mockLogin: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const mockLogin = () => {
    setUser({ id: 'mock-user-id', email: 'teste@itinerario.com', isMock: true });
  };

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
             new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
           ]).catch(e => {
             console.warn("Could not fetch user document, proceeding with fallback", e);
             return null;
           });
           
           if (userDocSnap && userDocSnap.exists()) {
             const activeSessions = userDocSnap.data().activeSessions || [];
             if (!activeSessions.includes(deviceId) && activeSessions.length >= 3) {
               setUser({ id: firebaseUser.uid, email: firebaseUser.email || '', needsDeviceReset: true });
               setLoading(false);
               return;
             } else if (!activeSessions.includes(deviceId)) {
               updateDoc(userDocRef, { activeSessions: arrayUnion(deviceId) }).catch(e => console.warn(e));
             }
           } else if (userDocSnap) {
             setDoc(userDocRef, { activeSessions: [deviceId] }, { merge: true }).catch(e => console.warn(e));
           }
           setUser({ id: firebaseUser.uid, email: firebaseUser.email || '' });
        } catch (e: any) {
           console.error("Device limit check failed", e);
           setUser({ id: firebaseUser.uid, email: firebaseUser.email || '' }); // fallback
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
    <AuthContext.Provider value={{ user, loading, logout, resetDevices, mockLogin }}>
      {children}
    </AuthContext.Provider>
  );
}
