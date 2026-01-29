import { ParsedObsidianTask, TodoistPriority } from './types';

/**
 * Regex patterns for task parsing
 */
const PATTERNS = {
  // Matches markdown task: - [ ] or - [x] or * [ ] etc.
  task: /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/,
  // Matches Todoist ID comment: <!-- todoist-id:123456 -->
  todoistId: /<!--\s*todoist-id:\s*(\d+)\s*-->/,
  // Matches hashtags: #tag
  hashtag: /#([a-zA-Z0-9_-]+)/g,
  // Tasks plugin emoji patterns
  dueDate: /📅\s*(\d{4}-\d{2}-\d{2})/,
  scheduledDate: /⏳\s*(\d{4}-\d{2}-\d{2})/,
  startDate: /🛫\s*(\d{4}-\d{2}-\d{2})/,
  doneDate: /✅\s*(\d{4}-\d{2}-\d{2})/,
  highPriority: /⏫/,
  mediumPriority: /🔼/,
  lowPriority: /🔽/,
  // Alternative text-based due date: due:YYYY-MM-DD
  textDueDate: /due:(\d{4}-\d{2}-\d{2})/i,
};

/**
 * Parse a single line to extract task information
 */
export function parseTaskLine(
  line: string,
  lineNumber: number,
  filePath: string,
  syncTag: string,
  lastModified: number
): ParsedObsidianTask | null {
  const match = line.match(PATTERNS.task);
  if (!match) return null;

  const [, , checkbox, taskContent] = match;
  const isCompleted = checkbox.toLowerCase() === 'x';

  // Check if task has the sync tag
  const syncTagPattern = new RegExp(escapeRegex(syncTag), 'i');
  if (!syncTagPattern.test(taskContent)) {
    return null;
  }

  // Extract Todoist ID if present
  const todoistIdMatch = taskContent.match(PATTERNS.todoistId);
  const todoistId = todoistIdMatch ? todoistIdMatch[1] : null;

  // Extract due date (Tasks plugin emoji or text format)
  const dueDate = extractDueDate(taskContent);

  // Extract priority (Tasks plugin emoji format)
  const priority = extractPriority(taskContent);

  // Extract labels (hashtags excluding sync tag)
  const labels = extractLabels(taskContent, syncTag);

  // Clean content: remove metadata, keeping only the actual task text
  const content = cleanTaskContent(taskContent, syncTag);

  return {
    originalLine: line,
    lineNumber,
    filePath,
    content,
    isCompleted,
    todoistId,
    dueDate,
    priority,
    labels,
    description: '', // Will be populated by scanning subsequent lines
    lastModified,
  };
}

/**
 * Extract due date from task content
 */
function extractDueDate(content: string): string | null {
  // Try Tasks plugin emoji format first
  const emojiMatch = content.match(PATTERNS.dueDate);
  if (emojiMatch) return emojiMatch[1];

  // Try scheduled date
  const scheduledMatch = content.match(PATTERNS.scheduledDate);
  if (scheduledMatch) return scheduledMatch[1];

  // Try text format
  const textMatch = content.match(PATTERNS.textDueDate);
  if (textMatch) return textMatch[1];

  return null;
}

/**
 * Extract priority from task content (Tasks plugin emoji format)
 */
function extractPriority(content: string): TodoistPriority {
  if (PATTERNS.highPriority.test(content)) {
    return TodoistPriority.HIGH;
  }
  if (PATTERNS.mediumPriority.test(content)) {
    return TodoistPriority.MEDIUM;
  }
  if (PATTERNS.lowPriority.test(content)) {
    return TodoistPriority.LOW;
  }
  return TodoistPriority.NONE;
}

/**
 * Extract labels from hashtags (excluding sync tag)
 */
function extractLabels(content: string, syncTag: string): string[] {
  const labels: string[] = [];
  const syncTagName = syncTag.replace(/^#/, '').toLowerCase();
  
  let match;
  while ((match = PATTERNS.hashtag.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag !== syncTagName) {
      labels.push(tag);
    }
  }
  
  // Reset regex lastIndex
  PATTERNS.hashtag.lastIndex = 0;
  
  return labels;
}

/**
 * Clean task content by removing metadata, keeping only the task description
 */
function cleanTaskContent(content: string, syncTag: string): string {
  let cleaned = content;

  // Remove Todoist ID comment
  cleaned = cleaned.replace(PATTERNS.todoistId, '');

  // Remove sync tag
  const syncTagPattern = new RegExp(escapeRegex(syncTag), 'gi');
  cleaned = cleaned.replace(syncTagPattern, '');

  // Remove Tasks plugin emojis and their values
  cleaned = cleaned.replace(PATTERNS.dueDate, '');
  cleaned = cleaned.replace(PATTERNS.scheduledDate, '');
  cleaned = cleaned.replace(PATTERNS.startDate, '');
  cleaned = cleaned.replace(PATTERNS.doneDate, '');
  cleaned = cleaned.replace(PATTERNS.highPriority, '');
  cleaned = cleaned.replace(PATTERNS.mediumPriority, '');
  cleaned = cleaned.replace(PATTERNS.lowPriority, '');

  // Remove text-based due date
  cleaned = cleaned.replace(PATTERNS.textDueDate, '');

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build an Obsidian task line from parsed task data
 */
export function buildTaskLine(task: ParsedObsidianTask, syncTag: string): string {
  const checkbox = task.isCompleted ? '[x]' : '[ ]';
  let line = `- ${checkbox} ${task.content}`;

  // Add sync tag
  line += ` ${syncTag}`;

  // Add other labels
  for (const label of task.labels) {
    line += ` #${label}`;
  }

  // Add priority emoji (Tasks plugin format)
  if (task.priority === TodoistPriority.HIGH) {
    line += ' ⏫';
  } else if (task.priority === TodoistPriority.MEDIUM) {
    line += ' 🔼';
  } else if (task.priority === TodoistPriority.LOW) {
    line += ' 🔽';
  }

  // Add due date (Tasks plugin format)
  if (task.dueDate) {
    line += ` 📅 ${task.dueDate}`;
  }

  // Add Todoist ID comment
  if (task.todoistId) {
    line += ` <!-- todoist-id:${task.todoistId} -->`;
  }

  return line;
}

/**
 * Update an existing task line with new Todoist ID
 */
export function addTodoistIdToLine(line: string, todoistId: string): string {
  // Remove existing ID if present
  let updated = line.replace(PATTERNS.todoistId, '').trim();
  // Add new ID at the end
  updated += ` <!-- todoist-id:${todoistId} -->`;
  return updated;
}

/**
 * Update task completion status in a line
 */
export function updateTaskCompletion(line: string, isCompleted: boolean): string {
  if (isCompleted) {
    return line.replace(/\[\s\]/, '[x]');
  } else {
    return line.replace(/\[[xX]\]/, '[ ]');
  }
}

/**
 * Parse all tasks from file content
 */
export function parseTasksFromContent(
  content: string,
  filePath: string,
  syncTag: string,
  lastModified: number
): ParsedObsidianTask[] {
  const lines = content.split('\n');
  const tasks: ParsedObsidianTask[] = [];

  for (let i = 0; i < lines.length; i++) {
    const task = parseTaskLine(lines[i], i, filePath, syncTag, lastModified);
    if (task) {
      // Check for description in subsequent indented lines
      const description = extractDescription(lines, i);
      task.description = description;
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Extract description from indented lines following a task
 */
function extractDescription(lines: string[], taskIndex: number): string {
  const taskLine = lines[taskIndex];
  const taskIndent = taskLine.match(/^(\s*)/)?.[1].length ?? 0;
  const descriptionLines: string[] = [];

  for (let i = taskIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    // Stop if we hit a line with same or less indentation
    if (line.trim() && lineIndent <= taskIndent) {
      break;
    }

    // Skip if it's another task
    if (PATTERNS.task.test(line)) {
      break;
    }

    // Add non-empty lines to description
    if (line.trim()) {
      descriptionLines.push(line.trim());
    }
  }

  return descriptionLines.join('\n');
}

/**
 * Generate a content hash for change detection
 */
export function generateContentHash(task: ParsedObsidianTask): string {
  const data = `${task.content}|${task.isCompleted}|${task.dueDate ?? ''}|${task.priority}|${task.labels.join(',')}`;
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Convert Todoist task priority to emoji
 */
export function priorityToEmoji(priority: TodoistPriority): string {
  switch (priority) {
    case TodoistPriority.HIGH:
      return '⏫';
    case TodoistPriority.MEDIUM:
      return '🔼';
    case TodoistPriority.LOW:
      return '🔽';
    default:
      return '';
  }
}
