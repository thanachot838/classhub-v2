import React from 'react';

const VARIANT: Record<string, string> = {
  ok: 'ok',
  danger: 'danger',
  pending: 'pending',
};

export default function StatusChip({
  label,
  variant,
}: {
  label: string;
  variant: 'ok' | 'danger' | 'pending';
}) {
  return <span className={`status-chip ${VARIANT[variant]}`}>{label}</span>;
}
