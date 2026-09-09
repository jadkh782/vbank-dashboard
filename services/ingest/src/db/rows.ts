// Row shapes of the tables the worker writes (supabase/migrations/0001_schema.sql).

import type { Category, Confidence, ErrorKind } from '@vbank/shared'

export interface FolderRow {
  id: number
  display_name: string
  fully_qualified_name: string
  last_seen: string
}

export interface AutomationRow {
  id: string
  kind: 'process' | 'queue'
  folder_id: number
  folder_name: string
  technical_name: string
  orch_id: number | null
  process_key?: string | null
  version?: string | null
  description?: string | null
  included: boolean
  is_new: boolean
  last_seen?: string
}

export interface JobRow {
  id: number
  key: string | null
  automation_id: string
  folder_id: number
  release_name: string
  state: string
  host_machine: string | null
  source: string | null
  creation_time: string
  start_time: string | null
  end_time: string | null
  info: string | null
  info_norm: string | null
  family_key: string | null
  business_day: string
  updated_at: string
}

export interface QueueItemRow {
  id: number
  automation_id: string
  folder_id: number
  status: string
  exception_type: string | null
  exception_reason: string | null
  creation_time: string
  start_processing: string | null
  end_processing: string | null
  reference: string | null
  ancestor_id: number | null
  manual_ancestor_id: number | null
  retry_number: number
  chain_id: number | null
  attempt_no: number | null
  link_method: string | null
  updated_at: string
}

export interface TransactionRow {
  id: number
  automation_id: string
  folder_id: number
  first_creation_time: string
  last_creation_time: string
  business_day: string
  attempts: number
  was_retried: boolean
  final_item_id: number
  final_status: string
  final_exception_type: string | null
  reason_raw: string | null
  reason_norm: string | null
  family_key: string | null
  kind: ErrorKind | null
  outcome: 'successful' | 'business_exception' | 'failed' | 'pending' | 'deleted'
  processing_ms: number | null
  outcome_changed_at?: string | null
  updated_at: string
}

export interface ReviewItemRow {
  id?: number
  kind: 'job' | 'app'
  transaction_id: number | null
  job_id: number | null
  automation_id: string
  business_day: string
  status: 'open' | 'confirmed' | 'info'
  category: Category | null
  suggested_category: Category | null
  suggested_confidence: Confidence | null
  suggested_reason: string | null
  unknown_family: boolean
  outcome_changed: boolean
  updated_at: string
}

export interface MappingRowDb {
  kind: ErrorKind
  category: Category
  decided_count: number
  category_counts: Record<string, number>
  message_norm?: string
  family_key?: string
  source?: string
}

export interface IngestRequestRow {
  id: number
  kind: string
  params: Record<string, unknown>
  status: string
}
