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
  surface: '#fdfdfb',
  grid: '#e4e3dd',
  baseline: '#c0bfb6',
  axisInk: '#79818c',
  ink: '#111820',
  accent: '#2a78d6',
  state: {
    Successful: '#0ca30c',
    Faulted: '#d03b3b',
    Stopped: '#ec835a',
    Running: '#2a78d6',
    Pending: '#898781',
    Suspended: '#4a3aa7',
  },
  queueOutcome: {
    Successful: '#0ca30c',
    'App exception': '#4a3aa7',
    'Business exception': '#eda100',
    Pending: '#898781',
  },
  errorSource: {
    'Job fault': '#d03b3b',
    'App exception (system)': '#4a3aa7',
    'App exception (bot)': '#2a78d6',
    'Business exception': '#eda100',
    'Manual (IT)': '#1baf7a',
  },
  alertSeverity: {
    Fatal: '#d03b3b',
    Error: '#ec835a',
    Warn: '#eda100',
    Info: '#2a78d6',
    Success: '#0ca30c',
  },
}

const dark: ChartTheme = {
  ...light,
  surface: '#151a20',
  grid: '#262c34',
  baseline: '#39414a',
  axisInk: '#838b96',
  ink: '#f1f3f5',
  accent: '#3987e5',
  state: {
    ...light.state,
    Faulted: '#e05252',
    Running: '#3987e5',
    Stopped: '#d95926',
    Suspended: '#9085e9',
    Pending: '#8a8a85',
  },
  queueOutcome: {
    ...light.queueOutcome,
    'App exception': '#9085e9',
    'Business exception': '#c98500',
    Pending: '#8a8a85',
  },
  errorSource: {
    ...light.errorSource,
    'Job fault': '#e05252',
    'App exception (system)': '#9085e9',
    'App exception (bot)': '#3987e5',
    'Business exception': '#c98500',
    'Manual (IT)': '#199e70',
  },
  alertSeverity: {
    ...light.alertSeverity,
    Fatal: '#e05252',
    Info: '#3987e5',
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
