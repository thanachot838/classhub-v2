import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Attendance from './pages/Attendance';
import Homework from './pages/Homework';
import Finance from './pages/Finance';
import History from './pages/History';
import Profile from './pages/Profile';

/** หน้าโหลดตอนเปิดแอป — โชว์ระหว่างรอ Firebase Auth เช็ค session เดิม (เร็วมากแต่กันจอกระพริบ) */
function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-brand">
      <div className="text-5xl animate-bounce">🎓</div>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-brand/15">
        <div className="h-full w-1/2 animate-[loadingBar_1.1s_ease-in-out_infinite] rounded-full bg-brand" />
      </div>
      <p className="text-sm font-medium text-gray-400">กำลังโหลด ClassHub...</p>
      <style>{`
        @keyframes loadingBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/attendance" replace />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/homework" element={<Homework />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/history" element={<History />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
