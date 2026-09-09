import { createContext, useContext } from 'react'

export type ThemeMode = 'light' | 'dark'

export interface ChartTheme {
  surface: string
  grid: string
  baseline: string
  axisInk: string
  ink: string
  accent: string
  state: Record<string, string>
  queueOutcome: Record<string, string>
  errorSource: Record<string, string>
  alertSeverity: Record<string, string>
}

// Chart chrome tracks the CSS token scale (see global.css). Only the chrome
// moves with the redesign — every data-bearing palette below is fixed, having
// been cleared by the colour-vision validator in both modes.
const light: ChartTheme = {
  surface: '#ffffff',
  grid: '#e2e8f0',
  baseline: '#cbd5e1',
  axisInk: '#64748b',
  ink: '#0f172a',
  accent: '#3b82f6',
  state: {
    Successful: '#16a34a',
    Faulted: '#dc2626',
    Stopped: '#f97316',
    Running: '#3b82f6',
    Pending: '#94a3b8',
    Suspended: '#7c3aed',
  },
  queueOutcome: {
    Successful: '#16a34a',
    'App exception': '#7c3aed',
    'Business exception': '#d97706',
    Pending: '#94a3b8',
  },
  errorSource: {
    'Job fault': '#dc2626',
    'App exception (system)': '#7c3aed',
    'App exception (bot)': '#3b82f6',
    'Business exception': '#d97706',
    'Manual (IT)': '#0d9488',
  },
  alertSeverity: {
    Fatal: '#dc2626',
    Error: '#f97316',
    Warn: '#d97706',
    Info: '#3b82f6',
    Success: '#16a34a',
  },
}

const dark: ChartTheme = {
  ...light,
  surface: '#131c2e',
  grid: '#263145',
  baseline: '#3a465c',
  axisInk: '#94a3b8',
  ink: '#f1f5f9',
  accent: '#60a5fa',
  state: {
    ...light.state,
    Successful: '#22c55e',
    Faulted: '#f04444',
    Running: '#60a5fa',
    Stopped: '#fb923c',
    Suspended: '#a78bfa',
    Pending: '#8592a6',
  },
  queueOutcome: {
    ...light.queueOutcome,
    Successful: '#22c55e',
    'App exception': '#a78bfa',
    'Business exception': '#f59e0b',
    Pending: '#8592a6',
  },
  errorSource: {
    ...light.errorSource,
    'Job fault': '#f04444',
    'App exception (system)': '#a78bfa',
    'App exception (bot)': '#60a5fa',
    'Business exception': '#f59e0b',
    'Manual (IT)': '#14b8a6',
  },
  alertSeverity: {
    ...light.alertSeverity,
    Fatal: '#f04444',
    Error: '#fb923c',
    Warn: '#f59e0b',
    Info: '#60a5fa',
    Success: '#22c55e',
  },
}

export const chartThemes: Record<ThemeMode, ChartTheme> = { light, dark }

export const ThemeContext = createContext<{ mode: ThemeMode; toggle: () => void }>({
  mode: 'light',
  toggle: () => {},
})

export function useThemeMode() {
  return useContext(ThemeContext)
}

export function useChartTheme(): ChartTheme {
  const { mode } = useContext(ThemeContext)
  return chartThemes[mode]
}
