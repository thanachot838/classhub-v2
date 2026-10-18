import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/attendance', emoji: '🧹', label: 'เวร', accent: 'var(--duty)' },
  { to: '/homework', emoji: '📚', label: 'งาน', accent: 'var(--homework)' },
  { to: '/finance', emoji: '💰', label: 'บัญชี', accent: 'var(--finance)' },
  { to: '/history', emoji: '📋', label: 'ประวัติ', accent: 'var(--history)' },
  { to: '/profile', emoji: '👤', label: 'โปรไฟล์', accent: 'var(--profile)' },
];

export default function Layout() {
  return (
    <div className="app-shell">
      {/* ---- Desktop sidebar ("สันสมุด") ---- */}
      <aside className="sidebar">
        <div className="mb-8 flex items-center gap-2 px-2 font-display text-lg font-bold">
          <span className="text-2xl">🎓</span> ClassHub
        </div>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
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
      </aside>

      <div>
        <main className="main-scroll mx-auto max-w-4xl">
          <Outlet />
        </main>

        {/* ---- Mobile bottom nav ---- */}
        <nav className="bottom-nav" aria-label="เมนูหลัก">
          {TABS.map((tab) => (
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
