// The six categories. They replace the old keyword rule and the owner type:
// every failed transaction and faulted run gets exactly one of these, and the
// dashboard shows the result.

export type Category =
  | 'exelentic_uipath'
  | 'vbank_it'
  | 'neustartfaehig'
  | 'nicht_anzeigen'
  | 'fachbereich'
  | 'avaloq'

export const CATEGORIES: Category[] = [
  'exelentic_uipath',
  'vbank_it',
  'neustartfaehig',
  'nicht_anzeigen',
  'fachbereich',
  'avaloq',
]

export const CATEGORY_LABELS_DE: Record<Category, string> = {
  exelentic_uipath: 'Exelentic/UiPath',
  vbank_it: 'V-Bank IT',
  neustartfaehig: 'Neustartfähiger Vorgang',
  nicht_anzeigen: 'Nicht als Fehler anzeigen',
  fachbereich: 'Fachbereich',
  avaloq: 'Avaloq',
}

/** Plural form used where a category names a group of items. */
export const CATEGORY_LABELS_PLURAL_DE: Record<Category, string> = {
  ...CATEGORY_LABELS_DE,
  neustartfaehig: 'Neustartfähige Vorgänge',
}

export const CATEGORY_HINTS_DE: Record<Category, string> = {
  exelentic_uipath: 'Automatisierung selbst — Abläufe, Prozesslogik, UiPath-Plattform',
  vbank_it: 'Server, Netzwerk, Zugänge und angebundene Fremdsysteme der V-Bank',
  neustartfaehig: 'vorübergehende Systemausnahme — der Vorgang kann erneut gestartet werden',
  nicht_anzeigen: 'kein Fehler — wird im Statusbericht nicht als offener Punkt geführt',
  fachbereich: 'fachliche Klärung — Eingaben oder Stammdaten aus dem Fachbereich',
  avaloq: 'Kernbanksystem Avaloq — Verhalten oder Verfügbarkeit von Avaloq',
}

/**
 * Order used wherever the categories appear as one bar or list. Validated with
 * the dataviz palette checker on adjacent pairs in both themes: violet → teal →
 * amber → blue, then the neutral slate. `nicht_anzeigen` is never rendered.
 */
export const CATEGORY_ORDER: Category[] = ['exelentic_uipath', 'avaloq', 'vbank_it', 'fachbereich', 'neustartfaehig']

/**
 * Category colours. Slate for Neustartfähig is deliberately low-chroma: no
 * owner, no blame. Badges always carry their label, so colour never stands alone.
 */
export const CATEGORY_COLORS: Record<'light' | 'dark', Record<Category, string>> = {
  light: {
    exelentic_uipath: '#4a3aa7',
    avaloq: '#0d9488',
    vbank_it: '#eda100',
    fachbereich: '#2a78d6',
    neustartfaehig: '#64748b',
    nicht_anzeigen: '#94a3b8',
  },
  dark: {
    exelentic_uipath: '#9085e9',
    avaloq: '#10a394',
    vbank_it: '#c98500',
    fachbereich: '#3987e5',
    neustartfaehig: '#94a3b8',
    nicht_anzeigen: '#64748b',
  },
}

/** Does an item with this category count as an open point on the dashboard? */
export function isOpenPoint(c: Category | null): boolean {
  return c !== null && c !== 'nicht_anzeigen'
}

/** Categories that name someone who has to act (the neutral one does not). */
export function hasOwner(c: Category): boolean {
  return c !== 'neustartfaehig' && c !== 'nicht_anzeigen'
}

const LABEL_TO_CATEGORY: Record<string, Category> = {
  'exelentic/uipath': 'exelentic_uipath',
  exelentic: 'exelentic_uipath',
  uipath: 'exelentic_uipath',
  'v-bank it': 'vbank_it',
  'vbank it': 'vbank_it',
  'neustartfähiger vorgang': 'neustartfaehig',
  'neustartfaehiger vorgang': 'neustartfaehig',
  neustartfähig: 'neustartfaehig',
  'restartable element': 'neustartfaehig',
  'nicht als fehler anzeigen': 'nicht_anzeigen',
  'kein fehler': 'nicht_anzeigen',
  fachbereich: 'fachbereich',
  avaloq: 'avaloq',
}

/** Workbook / free-text label → category (tolerant of the v1 workbook labels). */
export function labelToCategory(label: string | null | undefined): Category | null {
  if (!label) return null
  const key = label.trim().toLowerCase().replace(/\s+/g, ' ')
  if ((CATEGORIES as string[]).includes(key)) return key as Category
  return LABEL_TO_CATEGORY[key] ?? null
}
