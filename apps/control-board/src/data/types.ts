// Row shapes of the staging tables and views the Control Board reads
// (supabase/migrations/0001_schema.sql, 0003_views_rpc.sql).

import type { Category, Confidence, ErrorKind } from '@vbank/shared'

export type DayState = 'open' | 'published'
export type ReviewStatus = 'open' | 'confirmed' | 'info'

export interface DayStats {
  business_day: string
  state: DayState
  fetched_through: string | null
  stale: boolean
  stale_reason: string | null
  published_at: string | null
  published_by: string | null
  open_count: number
  confirmed_count: number
  info_count: number
  unknown_count: number
  pending_tx: number
  manual_count: number
}

export interface AutomationRow {
  id: string
  kind: 'process' | 'queue'
  folder_id: number
  folder_name: string
  technical_name: string
  orch_id: number | null
  description: string | null
  included: boolean
  is_new: boolean
  display_name: string | null
  display_description: string | null
  human_minutes_per_item: number | null
  comment: string | null
  last_seen: string
}

export interface ReviewItemRow {
  id: number
  kind: 'job' | 'app'
  transaction_id: number | null
  job_id: number | null
  automation_id: string
  business_day: string
  status: ReviewStatus
  category: Category | null
  suggested_category: Category | null
  suggested_confidence: Confidence | null
  suggested_reason: string | null
  unknown_family: boolean
  confirmed_by: string | null
  confirmed_at: string | null
  note: string | null
  outcome_changed: boolean
}

export interface TransactionRow {
  id: number
  automation_id: string
  first_creation_time: string
  last_creation_time: string
  attempts: number
  was_retried: boolean
  final_status: string
  final_exception_type: string | null
  reason_raw: string | null
  reason_norm: string | null
  family_key: string | null
  kind: ErrorKind | null
  outcome: string
  processing_ms: number | null
}

export interface JobRow {
  id: number
  automation_id: string
  release_name: string
  state: string
  host_machine: string | null
  creation_time: string
  start_time: string | null
  end_time: string | null
  info: string | null
  info_norm: string | null
  family_key: string | null
}

export interface QueueItemRow {
  id: number
  status: string
  exception_type: string | null
  exception_reason: string | null
  creation_time: string
  start_processing: string | null
  end_processing: string | null
  reference: string | null
  retry_number: number
  attempt_no: number | null
  link_method: string | null
}

export interface ManualErrorRow {
  id: string
  business_day: string
  occurred_at: string
  category: Category
  automation_id: string | null
  target_name: string
  description: string
  downtime_minutes: number | null
  reported_by: string | null
}

export interface SettingsRow {
  hours_per_pt: number
  health_ok_min: number
  health_attention_min: number
  license_capacity: number | null
  go_live_day: string | null
  keyword_fallback: string[]
}

export interface MappingFamilyRow {
  kind: ErrorKind
  family_key: string
  category: Category
  workbook_nr: string | null
  source: string
  decided_count: number
  category_counts: Record<string, number>
  last_seen: string
}

export interface MappingMessageRow {
  kind: ErrorKind
  message_norm: string
  category: Category
  source: string
  decided_count: number
  category_counts: Record<string, number>
  last_decided_at: string | null
}

export interface IngestRunRow {
  id: number
  kind: string
  window_from: string | null
  window_to: string | null
  started_at: string
  finished_at: string | null
  status: string
  stats: Record<string, unknown>
  error: string | null
}

export interface IngestRequestRow {
  id: number
  kind: string
  status: string
  requested_at: string
  finished_at: string | null
  error: string | null
}

export interface IngestStateRow {
  key: string
  value: unknown
  updated_at: string
}

/** A review item enriched for the table and the drawer. */
export interface ReviewRow extends ReviewItemRow {
  automation: AutomationRow | undefined
  transaction: TransactionRow | undefined
  job: JobRow | undefined
  /** Time of the event (first attempt / job creation). */
  time: string
  reference: string | null
  attempts: number
  finalStatus: string
  message: string | null
}
