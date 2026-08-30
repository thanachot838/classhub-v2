import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/attendance', emoji: '🧹', label: 'เวร' },
  { to: '/homework', emoji: '📚', label: 'งาน' },
  { to: '/finance', emoji: '💰', label: 'บัญชี' },
  { to: '/history', emoji: '📋', label: 'ประวัติ' },
  { to: '/profile', emoji: '👤', label: 'โปรไฟล์' },
];

export default function Layout() {
  return (
    <div className="min-h-screen pb-24">
      <main className="mx-auto max-w-2xl px-4 pt-6">
        <Outlet />
      </main>

      <nav
        className="glass-card fixed bottom-3 left-1/2 z-50 flex w-[94%] max-w-md -translate-x-1/2 justify-between px-2 py-2"
        aria-label="เมนูหลัก"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-xs transition-colors ${
                isActive ? 'bg-brand/15 text-brand font-semibold' : 'text-gray-500'
              }`
            }
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
  );
}
