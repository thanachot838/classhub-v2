import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// adminOnly = โมดูลที่นักเรียนไม่เห็น (ซ่อนจากเมนู และ App.tsx กันการพิมพ์ URL เข้าตรงๆ ด้วย)
const TABS = [
  { to: '/attendance', emoji: '🧹', label: 'เวร', accent: 'var(--duty)', adminOnly: true },
  { to: '/homework', emoji: '📚', label: 'งาน', accent: 'var(--homework)', adminOnly: false },
  { to: '/finance', emoji: '💰', label: 'บัญชี', accent: 'var(--finance)', adminOnly: false },
  { to: '/history', emoji: '📋', label: 'ประวัติ', accent: 'var(--history)', adminOnly: false },
  { to: '/profile', emoji: '👤', label: 'โปรไฟล์', accent: 'var(--profile)', adminOnly: false },
];

const COLLAPSE_KEY = 'classhub-sidebar-collapsed';
const DESKTOP_QUERY = '(min-width: 768px)';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  } catch {
    /* ใช้งานต่อได้ แค่จำสถานะไม่ได้ */
  }
}

/** true เมื่อหน้าจอกว้างระดับเดสก์ท็อป (อัปเดตตามตอนหมุนจอ/ย่อหน้าต่าง) */
function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

export default function Layout() {
  const { profile } = useAuth();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false); // ลิ้นชักบนมือถือ
  const [collapsed, setCollapsed] = useState(readCollapsed); // เดสก์ท็อป: ซ่อน sidebar

  const isAdmin = profile?.role === 'admin';
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const menuVisible = isDesktop ? !collapsed : open;

  // เปลี่ยนหน้าแล้วปิดลิ้นชักบนมือถืออัตโนมัติ
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // ปิดลิ้นชักด้วยปุ่ม Esc + ล็อกการเลื่อนหน้าเว็บด้านหลังตอนลิ้นชักเปิดอยู่บนมือถือ
  useEffect(() => {
    if (!open || isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isDesktop]);

  function toggleMenu() {
    if (isDesktop) {
      setCollapsed((c) => {
        writeCollapsed(!c);
        return !c;
      });
    } else {
      setOpen((o) => !o);
    }
  }

  function closeMenu() {
    if (isDesktop) {
      setCollapsed(true);
      writeCollapsed(true);
    } else {
      setOpen(false);
    }
  }

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      {/* ฉากหลังมืดตอนเปิดลิ้นชักบนมือถือ — แตะเพื่อปิด */}
      <div
        className={`sidebar-backdrop ${open ? 'show' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* ---- Sidebar ("สันสมุด") เลื่อนเข้า-ออกได้ ---- */}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="เมนูหลัก" aria-hidden={!menuVisible}>
        <div className="mb-4 flex items-center justify-between gap-2 pl-2 font-display text-lg font-bold">
          <span className="flex items-center gap-2">
            <span className="text-2xl">🎓</span> ClassHub
          </span>
          <button onClick={closeMenu} className="icon-btn text-white/70" aria-label="ปิดเมนู">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2.5 text-base transition-colors ${
                isActive ? 'font-semibold text-white' : 'text-white/60 hover:text-white/90'
              }`
            }
            style={({ isActive }) => ({
              backgroundColor: isActive ? tab.accent : 'transparent',
            })}
          >
            <span className="text-xl" role="img" aria-hidden="true">
              {tab.emoji}
            </span>
            {tab.label}
          </NavLink>
        ))}

        {profile && (
          <div className="mt-auto rounded-xl bg-white/10 px-3 py-2.5 text-sm">
            <p className="truncate font-semibold">{profile.name}</p>
            <p className="text-xs text-white/60">
              {isAdmin ? 'แอดมิน' : `เลขที่ ${profile.number}`} · ห้อง {profile.class}
            </p>
          </div>
        )}
      </aside>

      <div className="main-wrap">
        {/* ---- Top bar: ปุ่ม ☰ เปิด/ปิดเมนู ---- */}
        <header className="topbar">
          <button
            onClick={toggleMenu}
            className="icon-btn"
            aria-label={menuVisible ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={menuVisible}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </button>
          <span className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="text-xl">🎓</span> ClassHub
          </span>
        </header>

        <main className="main-scroll mx-auto max-w-4xl">
          <Outlet />
        </main>

        {/* ---- Mobile bottom nav (สลับหน้าด้วยนิ้วโป้งได้เร็ว) ---- */}
        <nav className="bottom-nav" aria-label="เมนูลัด">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs transition-colors ${
                  isActive ? 'font-semibold text-white' : 'text-white/50'
                }`
              }
              style={({ isActive }) => ({
                backgroundColor: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              })}
              aria-label={tab.label}
            >
              <span className="text-xl" role="img" aria-hidden="true">
                {tab.emoji}
              </span>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
