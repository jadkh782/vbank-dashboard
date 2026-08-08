// Typed subset of the Orchestrator OData entities this dashboard reads.

export interface ODataResponse<T> {
  '@odata.count'?: number
  value: T[]
}

export interface OrchFolder {
  Id: number
  DisplayName: string
  FullyQualifiedName: string
}

export type JobState =
  | 'Pending'
  | 'Running'
  | 'Successful'
  | 'Faulted'
  | 'Stopped'
  | 'Suspended'
  | 'Resumed'
  | 'Stopping'
  | 'Terminating'

export interface OrchJob {
  Id: number
  Key: string
  State: JobState
  ReleaseName: string
  HostMachineName: string | null
  Source: string
  CreationTime: string
  StartTime: string | null
  EndTime: string | null
  Info: string | null
  FolderId: number
  FolderName: string
}

export type QueueItemStatus =
  | 'New'
  | 'InProgress'
  | 'Successful'
  | 'Failed'
  | 'Abandoned'
  | 'Retried'
  | 'Deleted'

export interface OrchQueueDefinition {
  Id: number
  Name: string
  Description: string | null
  FolderId: number
  FolderName: string
}

export interface OrchQueueItem {
  Id: number
  QueueDefinitionId: number
  Status: QueueItemStatus
  ProcessingExceptionType: 'ApplicationException' | 'BusinessException' | null
  ProcessingException: { Reason: string | null; Type: string | null } | null
  CreationTime: string
  StartProcessing: string | null
  EndProcessing: string | null
  Reference: string | null
  FolderId: number
}

export type AlertSeverity = 'Info' | 'Success' | 'Warn' | 'Error' | 'Fatal'

export interface OrchAlert {
  Id: string
  NotificationName: string
  Component: string
  Severity: AlertSeverity
  CreationTime: string
  State: string
  Data: string | null
}

export interface LicenseInfo {
  allowed: number | null
  used: number | null
}

export interface TenantData {
  folders: OrchFolder[]
  jobs: OrchJob[]
  queues: OrchQueueDefinition[]
  queueItems: OrchQueueItem[]
  alerts: OrchAlert[] | null // null = alerts scope not granted
  license: LicenseInfo | null // null = license endpoint not accessible
  truncated: boolean
  fetchedAt: number
}
