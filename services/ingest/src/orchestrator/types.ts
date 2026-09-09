// The subset of Orchestrator OData entities the worker reads.

export interface OrchFolder {
  Id: number
  DisplayName: string
  FullyQualifiedName: string
}

export interface OrchRelease {
  Id: number
  Name: string
  ProcessKey: string
  ProcessVersion: string
  Description: string | null
}

export interface OrchQueueDefinition {
  Id: number
  Name: string
  Description: string | null
}

export interface OrchJob {
  Id: number
  Key: string
  State: string
  ReleaseName: string
  HostMachineName: string | null
  Source: string | null
  CreationTime: string
  StartTime: string | null
  EndTime: string | null
  Info: string | null
}

export interface OrchQueueItem {
  Id: number
  QueueDefinitionId: number
  Status: string
  ProcessingExceptionType: 'ApplicationException' | 'BusinessException' | null
  ProcessingException: { Reason: string | null; Type: string | null } | null
  CreationTime: string
  StartProcessing: string | null
  EndProcessing: string | null
  Reference: string | null
  AncestorId?: number | null
  ManualAncestorId?: number | null
  RetryNumber?: number | null
}
