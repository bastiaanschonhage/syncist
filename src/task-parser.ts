import { ParsedObsidianTask, TodoistPriority } from './types';

/**
 * Regex patterns for task parsing
 */
const PATTERNS = {
  // Matches markdown task: - [ ] or - [x] or * [ ] etc.
  task: /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/,
  // Matches Todoist ID comment: <!-- todoist-id:abc123 --> (v1 IDs are alphanumeric)
  todoistId: /<!--\s*todoist-id:\s*([\w]+)\s*-->/,
  // Matches hashtags: #tag (but not #project/ prefixed)
  hashtag: /#([a-zA-Z0-9_-]+)/g,
  // Tasks plugin emoji patterns
  dueDate: /📅\s*(\d{4}-\d{2}-\d{2})/,
  scheduledDate: /⏳\s*(\d{4}-\d{2}-\d{2})/,
  startDate: /🛫\s*(\d{4}-\d{2}-\d{2})/,
  doneDate: /✅\s*(\d{4}-\d{2}-\d{2})/,
  urgentPriority: /🔺/,
  highPriority: /⏫/,
  mediumPriority: /🔼/,
  lowPriority: /🔽/,
  // Alternative text-based due date: due:YYYY-MM-DD
  textDueDate: /due:(\d{4}-\d{2}-\d{2})/i,
  // Project metadata: 📁 ProjectName
  project: new RegExp('📁\\s*([^\\s#📅🔺⏫🔼🔽<]+)', 'u'),
};

/**
 * Compute indentation level from leading whitespace.
 * Tabs count as one level each (Obsidian default); spaces use 2-per-level.
 * Mixed indentation is handled character by character.
 */
function getIndentLevel(line: string): number {
  const leading = line.match(/^(\s*)/)?.[1] ?? '';
  let level = 0;
  let i = 0;
  while (i < leading.length) {
    if (leading[i] === '\t') {
      level++;
      i++;
    } else if (leading[i] === ' ') {
      // Count a run of spaces, 2 per level
      let spaces = 0;
      while (i < leading.length && leading[i] === ' ') {
        spaces++;
        i++;
      }
      level += Math.floor(spaces / 2);
    } else {
      // Skip non-breaking spaces and other unicode whitespace
      i++;
    }
  }
  return level;
}

/**
 * Parse a single line to extract task information.
 * If requireSyncTag is false, the task is treated as a subtask inheriting sync from its parent.
 */
export function parseTaskLine(
  line: string,
  lineNumber: number,
  filePath: string,
  syncTag: string,
  lastModified: number,
  requireSyncTag = true
): ParsedObsidianTask | null {
  const match = line.match(PATTERNS.task);
  if (!match) return null;

  const [, , checkbox, taskContent] = match;
  const isCompleted = checkbox.toLowerCase() === 'x';

  const syncTagPattern = new RegExp(escapeRegex(syncTag), 'i');
  const hasSyncTag = syncTagPattern.test(taskContent);

  if (requireSyncTag && !hasSyncTag) {
    return null;
  }

  const todoistIdMatch = taskContent.match(PATTERNS.todoistId);
  const todoistId = todoistIdMatch ? todoistIdMatch[1] : null;

  const dueDate = extractDueDate(taskContent);
  const priority = extractPriority(taskContent);
  const labels = extractLabels(taskContent, syncTag);
  const content = cleanTaskContent(taskContent, syncTag);
  const indentLevel = getIndentLevel(line);
  const projectName = extractProjectName(taskContent);

  return {
    originalLine: line,
    lineNumber,
    filePath,
    content,
    isCompleted,
    todoistId,
    parentId: null,
    indentLevel,
    dueDate,
    priority,
    labels,
    description: '',
    projectId: null,
    projectName,
    lastModified,
  };
}

/**
 * Extract project name from 📁 emoji metadata
 */
function extractProjectName(content: string): string | null {
  const match = content.match(PATTERNS.project);
  return match ? match[1] : null;
}

/**
 * Extract due date from task content
 */
function extractDueDate(content: string): string | null {
  const emojiMatch = content.match(PATTERNS.dueDate);
  if (emojiMatch) return emojiMatch[1];

  const scheduledMatch = content.match(PATTERNS.scheduledDate);
  if (scheduledMatch) return scheduledMatch[1];

  const textMatch = content.match(PATTERNS.textDueDate);
  if (textMatch) return textMatch[1];

  return null;
}

/**
 * Extract priority from task content (Tasks plugin emoji format)
 */
function extractPriority(content: string): TodoistPriority {
  if (PATTERNS.urgentPriority.test(content)) {
    return TodoistPriority.HIGH;
  }
  if (PATTERNS.highPriority.test(content)) {
    return TodoistPriority.MEDIUM;
  }
  if (PATTERNS.mediumPriority.test(content)) {
    return TodoistPriority.LOW;
  }
  if (PATTERNS.lowPriority.test(content)) {
    return TodoistPriority.NONE;
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
    // Preserve original case so Todoist label names are matched exactly.
    const tag = match[1];
    if (tag.toLowerCase() !== syncTagName) {
      labels.push(tag);
    }
  }
  
  PATTERNS.hashtag.lastIndex = 0;
  
  return labels;
}

/**
 * Clean task content by removing metadata, keeping only the task description
 */
function cleanTaskContent(content: string, syncTag: string): string {
  let cleaned = content;

  cleaned = cleaned.replace(/<!--\s*todoist-id:\s*[\w]+\s*-->/g, '');

  const syncTagPattern = new RegExp(escapeRegex(syncTag), 'gi');
  cleaned = cleaned.replace(syncTagPattern, '');

  cleaned = cleaned.replace(PATTERNS.dueDate, '');
  cleaned = cleaned.replace(PATTERNS.scheduledDate, '');
  cleaned = cleaned.replace(PATTERNS.startDate, '');
  cleaned = cleaned.replace(PATTERNS.doneDate, '');
  cleaned = cleaned.replace(PATTERNS.urgentPriority, '');
  cleaned = cleaned.replace(PATTERNS.highPriority, '');
  cleaned = cleaned.replace(PATTERNS.mediumPriority, '');
  cleaned = cleaned.replace(PATTERNS.lowPriority, '');

  cleaned = cleaned.replace(PATTERNS.textDueDate, '');

  // Remove project metadata
  cleaned = cleaned.replace(PATTERNS.project, '');

  // Remove all remaining hashtag labels (they are synced as Todoist labels,
  // not part of the task title). Use a fresh regex to avoid lastIndex issues
  // with the shared global PATTERNS.hashtag.
  cleaned = cleaned.replace(/#[a-zA-Z0-9_-]+/g, '');

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
 * Build an Obsidian task line from parsed task data.
 * Only adds the sync tag to top-level tasks (indentLevel === 0).
 */
export function buildTaskLine(task: ParsedObsidianTask, syncTag: string): string {
  const indent = '\t'.repeat(task.indentLevel);
  const checkbox = task.isCompleted ? '[x]' : '[ ]';
  let line = `${indent}- ${checkbox} ${task.content}`;

  // Only top-level tasks carry the sync tag; subtasks inherit from parent
  if (task.indentLevel === 0) {
    line += ` ${syncTag}`;
  }

  for (const label of task.labels) {
    line += ` #${label}`;
  }

  if (task.projectName) {
    line += ` 📁 ${task.projectName}`;
  }

  if (task.priority === TodoistPriority.HIGH) {
    line += ' 🔺';
  } else if (task.priority === TodoistPriority.MEDIUM) {
    line += ' ⏫';
  } else if (task.priority === TodoistPriority.LOW) {
    line += ' 🔼';
  }

  if (task.dueDate) {
    line += ` 📅 ${task.dueDate}`;
  }

  if (task.todoistId) {
    line += ` <!-- todoist-id:${task.todoistId} -->`;
  }

  return line;
}

/**
 * Update an existing task line with new Todoist ID
 */
export function addTodoistIdToLine(line: string, todoistId: string): string {
  // Preserve leading whitespace (indentation) — only trim the trailing end
  const leadingWhitespace = line.match(/^(\s*)/)?.[1] ?? '';
  const stripped = line.replace(/<!--\s*todoist-id:\s*[\w]+\s*-->/g, '').trimEnd();
  const withoutLeading = stripped.trimStart();
  const updated = `${leadingWhitespace}${withoutLeading} <!-- todoist-id:${todoistId} -->`;
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
 * Parse all tasks from file content, including subtask hierarchy.
 * Subtasks inherit sync from their parent -- they don't need the sync tag.
 */
export function parseTasksFromContent(
  content: string,
  filePath: string,
  syncTag: string,
  lastModified: number
): ParsedObsidianTask[] {
  const lines = content.split('\n');
  const tasks: ParsedObsidianTask[] = [];

  // Stack tracks parent tasks at each indent level: [indentLevel, task]
  const parentStack: { indentLevel: number; task: ParsedObsidianTask }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineIndent = getIndentLevel(line);

    // First, try parsing as a tagged task (has the sync tag itself)
    let task = parseTaskLine(line, i, filePath, syncTag, lastModified, true);

    if (task) {
      // Pop stack entries at same or deeper indent (new top-level or sibling)
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].indentLevel >= lineIndent) {
        parentStack.pop();
      }

      // If there's a parent on the stack, this tagged task is also a child
      if (parentStack.length > 0) {
        const parent = parentStack[parentStack.length - 1].task;
        task.parentId = parent.todoistId;
      }

      const description = extractDescription(lines, i);
      task.description = description;
      tasks.push(task);

      parentStack.push({ indentLevel: lineIndent, task });
      continue;
    }

    // If it's not a tagged task, check if it's a subtask of a synced parent
    if (parentStack.length > 0) {
      // Pop stack entries at same or deeper indent
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].indentLevel >= lineIndent) {
        parentStack.pop();
      }

      if (parentStack.length > 0) {
        // Parse without requiring the sync tag (subtask inherits)
        task = parseTaskLine(line, i, filePath, syncTag, lastModified, false);

        if (task) {
          const parent = parentStack[parentStack.length - 1].task;
          task.parentId = parent.todoistId;

          const description = extractDescription(lines, i);
          task.description = description;
          tasks.push(task);

          parentStack.push({ indentLevel: lineIndent, task });
          continue;
        }
      }
    }

    // Non-task line: if it's at base indentation, clear the parent stack
    if (line.trim() === '' || (line.trim() && lineIndent === 0 && !PATTERNS.task.test(line))) {
      // Only clear if it's a non-indented non-task line
      if (lineIndent === 0 && line.trim() !== '') {
        parentStack.length = 0;
      }
    }
  }

  return tasks;
}

/**
 * Extract description from indented lines following a task (stops at subtask lines)
 */
function extractDescription(lines: string[], taskIndex: number): string {
  const taskLine = lines[taskIndex];
  const taskIndent = taskLine.match(/^(\s*)/)?.[1].length ?? 0;
  const descriptionLines: string[] = [];

  for (let i = taskIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;

    if (line.trim() && lineIndent <= taskIndent) {
      break;
    }

    // Stop at subtask lines
    if (PATTERNS.task.test(line)) {
      break;
    }

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
  // Only hash user-editable fields: content, completion, due date, priority,
  // and labels. Structural fields (parentId, projectId) are excluded because
  // they differ between the Obsidian and Todoist representations and would
  // cause false positives in change detection.
  const sortedLabels = [...task.labels].sort().join(',');
  const data = `${task.content}|${task.isCompleted}|${task.dueDate ?? ''}|${task.priority}|${sortedLabels}`;
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
      return '🔺';
    case TodoistPriority.MEDIUM:
      return '⏫';
    case TodoistPriority.LOW:
      return '🔼';
    default:
      return '';
  }
}
