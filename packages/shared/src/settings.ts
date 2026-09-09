// Shared settings and manual-error types (storage lives in the apps).

export type ManualErrorCategory =
  | 'Server / Infrastructure'
  | 'IT system'
  | 'Machine / VM'
  | 'Network'
  | 'Other'

export const MANUAL_ERROR_CATEGORIES: ManualErrorCategory[] = [
  'Server / Infrastructure',
  'IT system',
  'Machine / VM',
  'Network',
  'Other',
]

export interface ManualError {
  id: string
  time: string // ISO — when the error occurred
  category: ManualErrorCategory
  process: string
  folder?: string
  description: string
  downtimeMinutes?: number
  reportedBy?: string
  createdAt: string
}

export interface DisplayInfo {
  name: string
  description?: string
}

export interface AppSettings {
  systemKeywords: string[]
  hoursPerPT: number
  humanMinutesPerItem: Record<string, number>
  licenseCapacity?: number
  /** Friendly names/descriptions for the stakeholder view, keyed by technical name. */
  displayInfo: Record<string, DisplayInfo>
  /** Success-rate thresholds (in %) for the stakeholder health status. */
  healthThresholds: { okMin: number; attentionMin: number }
}

export const DEFAULT_SETTINGS: AppSettings = {
  systemKeywords: [
    'server',
    'timeout',
    'connection',
    'network',
    'login',
    'unavailable',
    'remote',
    'disconnected',
    '502',
    '503',
    'crashed',
  ],
  hoursPerPT: 8,
  humanMinutesPerItem: {},
  displayInfo: {},
  healthThresholds: { okMin: 90, attentionMin: 75 },
}
