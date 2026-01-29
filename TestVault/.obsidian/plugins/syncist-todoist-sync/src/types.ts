import { Task as TodoistTask } from '@doist/todoist-api-typescript';

/**
 * Plugin settings interface
 */
export interface TodoistSyncSettings {
  /** Todoist API token */
  apiToken: string;
  /** Tag used to identify tasks for sync (default: #todoist) */
  syncTag: string;
  /** Default project ID for new tasks (empty = Inbox) */
  defaultProjectId: string;
  /** Sync interval in minutes */
  syncIntervalMinutes: number;
  /** Conflict resolution strategy */
  conflictResolution: ConflictResolution;
}

/**
 * Conflict resolution options
 */
export type ConflictResolution = 'obsidian-wins' | 'todoist-wins' | 'ask-user';

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: TodoistSyncSettings = {
  apiToken: '',
  syncTag: '#todoist',
  defaultProjectId: '',
  syncIntervalMinutes: 5,
  conflictResolution: 'todoist-wins',
};

/**
 * Priority levels matching Todoist (1=low, 4=urgent)
 * Note: Todoist uses 1-4 where 4 is highest, but API expects p1=4, p2=3, p3=2, p4=1
 */
export enum TodoistPriority {
  NONE = 1,
  LOW = 2,
  MEDIUM = 3,
  HIGH = 4,
}

/**
 * Parsed task from Obsidian markdown
 */
export interface ParsedObsidianTask {
  /** Original full line text */
  originalLine: string;
  /** Line number in the file (0-indexed) */
  lineNumber: number;
  /** File path where task is located */
  filePath: string;
  /** Task content (without checkbox, tags, metadata) */
  content: string;
  /** Whether the task is completed */
  isCompleted: boolean;
  /** Todoist task ID if already synced */
  todoistId: string | null;
  /** Due date in YYYY-MM-DD format */
  dueDate: string | null;
  /** Priority level (1-4) */
  priority: TodoistPriority;
  /** Labels/tags on the task (excluding sync tag) */
  labels: string[];
  /** Description (from indented content below task) */
  description: string;
  /** Last modification timestamp (from file) */
  lastModified: number;
}

/**
 * Task stored in sync state for tracking
 */
export interface SyncedTask {
  /** Todoist task ID */
  todoistId: string;
  /** File path in Obsidian */
  filePath: string;
  /** Line number in file */
  lineNumber: number;
  /** Content hash for change detection */
  contentHash: string;
  /** Last sync timestamp */
  lastSynced: number;
  /** Whether completed in Obsidian */
  obsidianCompleted: boolean;
  /** Whether completed in Todoist */
  todoistCompleted: boolean;
}

/**
 * Sync state persisted to disk
 */
export interface SyncState {
  /** Map of Todoist ID to synced task info */
  tasks: Record<string, SyncedTask>;
  /** Last full sync timestamp */
  lastFullSync: number;
}

/**
 * Default sync state
 */
export const DEFAULT_SYNC_STATE: SyncState = {
  tasks: {},
  lastFullSync: 0,
};

/**
 * Todoist project info
 */
export interface TodoistProject {
  id: string;
  name: string;
  isInbox: boolean;
}

/**
 * Task options for creating/updating Todoist tasks
 */
export interface TaskOptions {
  projectId?: string;
  priority?: TodoistPriority;
  dueDate?: string;
  labels?: string[];
  description?: string;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  created: number;
  updated: number;
  completed: number;
  conflicts: number;
  errors: string[];
}

/**
 * Conflict information for user prompt
 */
export interface SyncConflict {
  todoistId: string;
  filePath: string;
  lineNumber: number;
  obsidianContent: string;
  todoistContent: string;
  obsidianCompleted: boolean;
  todoistCompleted: boolean;
}

/**
 * Re-export Todoist task type for convenience
 */
export type { TodoistTask };
