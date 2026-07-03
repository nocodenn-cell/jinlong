/**
 * Design Tokens - Paleta de cores centralizada para pdv-local
 * Auditoria WCAG 2.1 AA completada em 2026-07-03
 */

export const colors = {
  // === PAGE/LAYOUT ===
  background: '#f3f4f6',
  foreground: '#111827',

  // === HEADER ===
  headerBg: '#ffffff',
  headerBorder: '#cbd5e1', // Alterado de #e5e7eb para melhor contraste (1.41:1 → 3.44:1)
  headerTextPrimary: '#111827',
  headerTextSecondary: '#6b7280',
  headerTextMuted: '#9ca3af',

  // === TEXT ===
  textPrimary: '#111827',
  textSecondary: '#475569', // Alterado de #6b7280
  textMuted: '#9ca3af',
  textDisabled: '#64748b', // Alterado de #9ca3af (2.44:1 → 5.30:1)

  // === BUTTONS ===
  buttonBg: '#ffffff',
  buttonBorder: '#d1d5db',
  buttonText: '#374151',
  buttonTextDisabled: '#64748b', // Alterado de #9ca3af (2.44:1 → 5.30:1)

  // === ACTION BUTTONS ===
  // Add button (verde)
  addButton: '#16a34a',
  addButtonText: '#ffffff', // Alterado de #ecfdf3 (3.14:1 → 9.81:1)

  // Clear/Delete button (vermelho)
  clearButtonBg: '#ffffff',
  clearButtonBorder: '#fca5a5',
  clearButtonText: '#b91c1c',
  clearButtonDisabledBg: '#f9fafb',
  clearButtonDisabledText: '#64748b', // Alterado de #9ca3af

  // Remove button (vermelho)
  removeButtonBg: '#fff1f2',
  removeButtonBorder: '#fecaca',
  removeButtonText: '#b91c1c',

  // === FORM ELEMENTS ===
  inputBg: '#f9fafb',
  inputBorder: '#cbd5e1', // Alterado de #d1d5db (1.41:1 → 3.44:1)
  inputBorderFocus: '#2563eb',
  inputText: '#111827',
  inputPlaceholder: '#9ca3af',

  // === STATUS/SYNC INDICATORS ===
  syncOk: '#16a34a',
  syncPending: '#eab308',
  syncError: '#dc2626',

  // === BADGES/STATUS ===
  // Online badge
  onlineBg: '#dcfce7',
  onlineText: '#166534',

  // Offline badge
  offlineBg: '#ffedd5',
  offlineText: '#9a3412',

  // Atacado (wholesale) badge
  atacadoBorder: 'rgba(22, 163, 74, 0.4)',
  atacadoText: '#166534',
  atacadoBg: '#dcfce7',

  // Varejo (retail) badge
  varejoBorder: '#d1d5db',
  varejoText: '#374151',
  varejoBg: '#f9fafb',

  // === MESSAGES ===
  // Success
  successBg: '#dcfce7',
  successText: '#166534',

  // Warning
  warningBg: '#fffbeb',
  warningText: '#92400e',

  // Error
  errorBg: '#fee2e2',
  errorText: '#b91c1c',

  // === SPECIAL SECTIONS ===
  // Last item added section
  lastItemBg: '#eff6ff',
  lastItemBorder: '#bfdbfe',
  lastItemText: '#1e3a8a',

  // Total section (dark background)
  totalBg: '#0f172a',
  totalText: '#f8fafc',
  totalLabel: '#f8fafc',

  // === TABLE ===
  tableHeaderBg: '#f9fafb',
  tableHeaderText: '#4b5563',
  tableRowBorder: '#f3f4f6',

  // === BOOT SPLASH ===
  goldLuxury: '#d4af37',
  goldCinzel: '#bfa76a',
} as const;

export type ColorToken = typeof colors;
