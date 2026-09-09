import { createContext, useContext } from 'react'
import { CATEGORY_COLORS, type Category } from '@vbank/shared'

export type ThemeMode = 'light' | 'dark'

export interface ChartTheme {
  surface: string
  grid: string
  baseline: string
  axisInk: string
  ink: string
  accent: string
  /** Trend series: correct vs. not successful. */
  ok: string
  bad: string
  /**
   * Outcome palette. The order Erfolgreich → Aussteuerung → Nicht erfolgreich →
   * Neustart is the one the colour-vision validator clears in both themes
   * (green must not neighbour a warm hue; violet must not neighbour blue).
   */
  outcome: { erfolgreich: string; aussteuerung: string; nichtErfolgreich: string; neustart: string }
  category: Record<Category, string>
  health: { ok: string; attention: string; critical: string }
}

// Chart chrome tracks the CSS token scale (see packages/ui/styles/tokens.css).
// Every data-bearing palette is fixed, having been cleared by the colour-vision
// validator in both modes.
const light: ChartTheme = {
  surface: '#ffffff',
  grid: '#e2e8f0',
  baseline: '#cbd5e1',
  axisInk: '#64748b',
  ink: '#0f172a',
  accent: '#3b82f6',
  ok: '#16a34a',
  bad: '#dc2626',
  outcome: { erfolgreich: '#16a34a', aussteuerung: '#3b82f6', nichtErfolgreich: '#d97706', neustart: '#7c3aed' },
  category: CATEGORY_COLORS.light,
  health: { ok: '#0ca30c', attention: '#c98500', critical: '#d03b3b' },
}

const dark: ChartTheme = {
  ...light,
  surface: '#131c2e',
  grid: '#263145',
  baseline: '#3a465c',
  axisInk: '#94a3b8',
  ink: '#f1f5f9',
  accent: '#60a5fa',
  ok: '#22c55e',
  bad: '#f04444',
  outcome: { erfolgreich: '#22c55e', aussteuerung: '#60a5fa', nichtErfolgreich: '#f59e0b', neustart: '#a78bfa' },
  category: CATEGORY_COLORS.dark,
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
