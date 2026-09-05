// ============================================================================
// IBVAP Design System Tokens
// Mission-Critical Command-and-Control Visual Language
// ============================================================================

export const tokens = {
  typography: {
    display: 'text-2xl font-bold tracking-tight',
    heading: 'text-base font-semibold tracking-tight',
    subheading: 'text-sm font-medium',
    body: 'text-sm leading-relaxed',
    label: 'text-[11px] font-semibold uppercase tracking-wider',
    metadata: 'text-xs font-mono-num',
    caption: 'text-xs text-slate-400',
  },
  spacing: {
    containerPadding: 'p-4 sm:p-6',
    cardPadding: 'p-3.5 sm:p-4',
    compactPadding: 'p-2.5',
    sectionGap: 'gap-4',
    itemGap: 'gap-2',
  },
  radius: {
    none: 'rounded-none',
    sm: 'rounded-sm', // 2px
    md: 'rounded',    // 4px - standard card radius for mission control
    lg: 'rounded-md', // 6px
  },
  controlHeight: {
    sm: 'h-7 text-xs px-2.5',
    md: 'h-9 text-sm px-3.5',
    lg: 'h-10 text-sm px-4',
  },
  status: {
    healthy: {
      text: 'text-[#34C759]',
      bg: 'bg-[#34C759]/15',
      border: 'border-[#34C759]/30',
      dot: 'bg-[#34C759]',
      label: 'Normal / Healthy',
    },
    attention: {
      text: 'text-[#FF9500]',
      bg: 'bg-[#FF9500]/15',
      border: 'border-[#FF9500]/30',
      dot: 'bg-[#FF9500]',
      label: 'Attention / Degraded',
    },
    critical: {
      text: 'text-[#FF4D4D]',
      bg: 'bg-[#FF4D4D]/15',
      border: 'border-[#FF4D4D]/30',
      dot: 'bg-[#FF4D4D]',
      label: 'High Priority / Critical',
    },
    info: {
      text: 'text-[#007AFF]',
      bg: 'bg-[#007AFF]/15',
      border: 'border-[#007AFF]/30',
      dot: 'bg-[#007AFF]',
      label: 'System Information',
    },
    offline: {
      text: 'text-[#6C727A]',
      bg: 'bg-[#6C727A]/15',
      border: 'border-[#6C727A]/30',
      dot: 'bg-[#6C727A]',
      label: 'Offline / Inactive',
    },
  },
} as const;

export type StatusType = keyof typeof tokens.status;
