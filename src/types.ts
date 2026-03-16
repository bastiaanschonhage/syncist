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
 * Priority levels matching Todoist API values (1=normal, 4=urgent).
 * Maps to Obsidian Tasks plugin emojis:
 *   HIGH (4/urgent) → 🔺  MEDIUM (3/high) → ⏫  LOW (2/medium) → 🔼  NONE (1/normal) → (no emoji)
 */
export enum TodoistPriority {
  NONE = 1,
  LOW = 2,
  MEDIUM = 3,
  HIGH = 4,
}

// ─── Todoist API v1 types ────────────────────────────────────────────

/**
 * Todoist task as returned by the API v1 (snake_case).
 * We normalize to camelCase on ingestion via TodoistTask.
 */
export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  projectId: string;
  parentId: string | null;
  priority: number;
  due: { date: string; string?: string; isRecurring?: boolean } | null;
  labels: string[];
  isCompleted: boolean;
  createdAt: string;
  url: string;
}

/** Raw task shape from the Todoist API v1 */
export interface TodoistApiRawTask {
  id: string;
  content: string;
  description: string;
  project_id: string;
  parent_id: string | null;
  priority: number;
  due: { date: string; string?: string; is_recurring?: boolean } | null;
  labels: string[];
  checked: boolean;
  added_at: string;
}

/** Convert a raw API task to our normalized shape */
export function normalizeTask(raw: TodoistApiRawTask): TodoistTask {
  return {
    id: raw.id,
    content: raw.content,
    description: raw.description,
    projectId: raw.project_id,
    parentId: raw.parent_id,
    priority: raw.priority,
    due: raw.due,
    labels: raw.labels ?? [],
    isCompleted: raw.checked,
    createdAt: raw.added_at,
    url: `https://todoist.com/app/task/${raw.id}`,
  };
}

/** Raw project shape from the Todoist API v1 */
export interface TodoistApiRawProject {
  id: string;
  name: string;
  inbox_project?: boolean;
}

/**
 * Paginated response from Todoist API v1
 */
export interface TodoistPaginatedResponse<T> {
  results: T[];
  next_cursor?: string | null;
}

// ─── Internal types ──────────────────────────────────────────────────

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
  /** Todoist parent task ID (for subtasks) */
  parentId: string | null;
  /** Indentation level (0 = top-level, 1 = first indent, etc.) */
  indentLevel: number;
  /** Due date in YYYY-MM-DD format */
  dueDate: string | null;
  /** Priority level (1-4) */
  priority: TodoistPriority;
  /** Labels/tags on the task (excluding sync tag) */
  labels: string[];
  /** Description (from indented content below task) */
  description: string;
  /** Project ID from Todoist */
  projectId: string | null;
  /** Project name (for display) */
  projectName: string | null;
  /** Last modification timestamp (from file) */
  lastModified: number;
}

/**
 * Task stored in sync state for tracking
 */
export interface SyncedTask {
  /** Todoist task ID */
  todoistId: string;
  /** Todoist parent task ID (for subtasks) */
  parentId: string | null;
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
  /** Project ID */
  projectId: string | null;
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

export const DEFAULT_SYNC_STATE: SyncState = {
  tasks: {},
  lastFullSync: 0,
};

/**
 * Todoist project info (normalized)
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
  parentId?: string;
  priority?: TodoistPriority;
  dueDate?: string;
  labels?: string[];
  description?: string;
}

/** Project name cache: maps Todoist project ID to project name */
export type ProjectCache = Record<string, string>;

export interface SyncResult {
  created: number;
  updated: number;
  completed: number;
  conflicts: number;
  errors: string[];
}

export interface SyncConflict {
  todoistId: string;
  filePath: string;
  lineNumber: number;
  obsidianContent: string;
  todoistContent: string;
  obsidianCompleted: boolean;
  todoistCompleted: boolean;
}
