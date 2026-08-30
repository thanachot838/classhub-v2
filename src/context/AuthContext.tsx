import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, authSecondary, db } from '../lib/firebase';
import type { AppUser } from '../types';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: AppUser | null;
  loading: boolean;
  /** true เมื่อ session ของ Firebase โปรเจกต์ "secondary" (attendance/finance) พร้อมใช้งานด้วย
   *  ต้องรอค่านี้ก่อนเขียนลง dbLogs ไม่งั้น Security Rules ของ secondary project จะเห็น
   *  request.auth เป็น null (ปฏิเสธ) แม้ profile หลักจะ login สำเร็จแล้วก็ตาม */
  secondaryReady: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  profile: null,
  loading: true,
  secondaryReady: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [secondaryReady, setSecondaryReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // ติดตาม session ของโปรเจกต์ secondary แยกต่างหาก — ทั้งสอง auth persist กันเองอยู่แล้ว
  // (คนละ IndexedDB key) ดังนั้นตอน reload หน้าเว็บทั้งคู่จะ restore session เองถ้าเคย
  // sign-in คู่กันไว้ตอน login (ดู src/pages/Login.tsx)
  useEffect(() => {
    const unsub = onAuthStateChanged(authSecondary, (u) => setSecondaryReady(!!u));
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    const ref = doc(db, 'users', firebaseUser.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setProfile(snap.exists() ? ({ uid: snap.id, ...snap.data() } as AppUser) : null);
      setLoading(false);
    });
    return unsub;
  }, [firebaseUser]);

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, loading, secondaryReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
