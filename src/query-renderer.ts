import { Notice } from 'obsidian';
import type TodoistSyncPlugin from './main';
import { TodoistPriority, TodoistTask } from './types';
import type { TodoistCompletedTaskDateMode } from './todoist-service';

interface QueryConfig {
  filter: string;
  includeCompleted: boolean;
  completedBy: TodoistCompletedTaskDateMode | null;
  completedSince: string | null;
  completedUntil: string | null;
  completedRange: string | null;
}

interface ParseResult {
  config: QueryConfig | null;
  error: string | null;
}

interface CompletedTaskWindow {
  by: TodoistCompletedTaskDateMode;
  since: Date;
  until: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COMPLETED_WINDOW_DAYS: Record<TodoistCompletedTaskDateMode, number> = {
  due_date: 42,
  completion_date: 93,
};

function parseQueryConfig(source: string): ParseResult {
  const lines = source.trim().split('\n');
  let filter = '';
  let includeCompleted = false;
  let completedBy: TodoistCompletedTaskDateMode | null = null;
  let completedSince: string | null = null;
  let completedUntil: string | null = null;
  let completedRange: string | null = null;

  for (const line of lines) {
    const match = line.match(/^\s*([a-z_]+)\s*:\s*(.+)$/i);
    if (!match) {
      continue;
    }

    const key = match[1].toLowerCase();
    const value = match[2].trim();

    if (key === 'filter') {
      filter = value;
    } else if (key === 'include_completed') {
      includeCompleted = ['true', 'yes', '1', 'on'].includes(value.toLowerCase());
    } else if (key === 'completed_by') {
      if (value !== 'due_date' && value !== 'completion_date') {
        return { config: null, error: 'Invalid completed_by. Use due_date or completion_date.' };
      }
      completedBy = value;
    } else if (key === 'completed_since') {
      completedSince = value;
    } else if (key === 'completed_until') {
      completedUntil = value;
    } else if (key === 'completed_range') {
      completedRange = value;
    }
  }

  if (!filter) {
    return { config: null, error: 'Invalid syncist block. Use: filter: today' };
  }

  return {
    config: {
      filter,
      includeCompleted,
      completedBy,
      completedSince,
      completedUntil,
      completedRange,
    },
    error: null,
  };
}

function buildTaskTree(tasks: TodoistTask[]): { task: TodoistTask; children: TodoistTask[] }[] {
  const taskMap = new Map<string, TodoistTask>();
  const childrenMap = new Map<string, TodoistTask[]>();

  for (const t of tasks) {
    taskMap.set(t.id, t);
  }

  for (const t of tasks) {
    if (t.parentId && taskMap.has(t.parentId)) {
      const existing = childrenMap.get(t.parentId) ?? [];
      existing.push(t);
      childrenMap.set(t.parentId, existing);
    }
  }

  const roots: { task: TodoistTask; children: TodoistTask[] }[] = [];
  for (const t of tasks) {
    if (!t.parentId || !taskMap.has(t.parentId)) {
      roots.push({
        task: t,
        children: childrenMap.get(t.id) ?? [],
      });
    }
  }

  return roots;
}

const PRIORITY_EMOJI: Record<number, string> = {
  [TodoistPriority.HIGH]: '🔺',
  [TodoistPriority.MEDIUM]: '⏫',
  [TodoistPriority.LOW]: '🔼',
};

function mergeTasks(activeTasks: TodoistTask[], completedTasks: TodoistTask[]): TodoistTask[] {
  const tasksById = new Map<string, TodoistTask>();
  for (const task of [...activeTasks, ...completedTasks]) {
    tasksById.set(task.id, task);
  }
  return Array.from(tasksById.values());
}

function inferCompletedBy(filter: string): TodoistCompletedTaskDateMode {
  const lower = filter.toLowerCase();
  const hasDateIntent = /\b(today|tomorrow|overdue|date|due|before|after|next|this week|last week)\b/.test(lower);
  const hasProjectOrLabelIntent = /(^|\s)[@#][^\s)]+/.test(filter);
  return hasProjectOrLabelIntent && !hasDateIntent ? 'completion_date' : 'due_date';
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function parseDurationDays(value: string): number | null {
  const match = value.trim().toLowerCase().match(/^(\d+)\s*([dwm])$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 'd') return amount;
  if (unit === 'w') return amount * 7;
  return amount * 30;
}

function parseDateBoundary(value: string, now: Date, boundary: 'start' | 'end'): Date | null {
  const lower = value.trim().toLowerCase();
  let date: Date | null = null;

  if (lower === 'now') {
    return new Date(now);
  }

  if (lower === 'today') {
    date = startOfDay(now);
  } else if (lower === 'yesterday') {
    date = addDays(startOfDay(now), -1);
  } else if (lower === 'tomorrow') {
    date = addDays(startOfDay(now), 1);
  } else {
    const match = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }

  if (!date) return null;
  return boundary === 'start' ? date : addDays(date, 1);
}

function resolveCompletedRange(value: string, now: Date): { since: Date; until: Date } | null {
  const lower = value.trim().toLowerCase();
  const durationDays = parseDurationDays(lower);
  const until = addDays(startOfDay(now), 1);

  if (durationDays !== null) {
    return { since: addDays(until, -durationDays), until };
  }

  const since = parseDateBoundary(lower, now, 'start');
  const rangeUntil = parseDateBoundary(lower, now, 'end');
  if (!since || !rangeUntil) return null;

  return { since, until: rangeUntil };
}

function resolveCompletedWindow(config: QueryConfig, now: Date): CompletedTaskWindow {
  const by = config.completedBy ?? inferCompletedBy(config.filter);
  const defaultDays = by === 'due_date' ? 42 : 30;
  let since: Date;
  let until: Date;

  if (config.completedRange) {
    const range = resolveCompletedRange(config.completedRange, now);
    if (!range) {
      throw new Error('Invalid completed_range. Use today, yesterday, YYYY-MM-DD, or a duration like 30d/6w.');
    }
    since = range.since;
    until = range.until;
  } else {
    until = config.completedUntil
      ? parseDateBoundary(config.completedUntil, now, 'end') ?? (() => {
        throw new Error('Invalid completed_until. Use today, now, or YYYY-MM-DD.');
      })()
      : addDays(startOfDay(now), 1);

    if (config.completedSince) {
      const durationDays = parseDurationDays(config.completedSince);
      since = durationDays !== null
        ? addDays(until, -durationDays)
        : parseDateBoundary(config.completedSince, now, 'start') ?? (() => {
          throw new Error('Invalid completed_since. Use YYYY-MM-DD, today, yesterday, or a duration like 30d/6w.');
        })();
    } else {
      since = addDays(until, -defaultDays);
    }
  }

  if (since >= until) {
    throw new Error('Completed task range must start before it ends.');
  }

  const maxDays = MAX_COMPLETED_WINDOW_DAYS[by];
  const rangeDays = Math.ceil((until.getTime() - since.getTime()) / DAY_MS);
  if (rangeDays > maxDays) {
    const maxLabel = by === 'due_date' ? '6w' : '3m';
    throw new Error(`Completed ${by} queries can cover at most ${maxLabel}.`);
  }

  return { by, since, until };
}

function formatDateForLabel(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderTaskRow(
  task: TodoistTask,
  container: HTMLElement,
  plugin: TodoistSyncPlugin,
  indent: boolean
): void {
  const row = container.createDiv({ cls: `syncist-query-task${indent ? ' syncist-query-subtask' : ''}` });

  const checkbox = row.createEl('input', { type: 'checkbox', cls: 'syncist-query-checkbox' });
  checkbox.checked = task.isCompleted;
  checkbox.addEventListener('change', () => {
    void (async () => {
      try {
        if (checkbox.checked) {
          await plugin.todoistService.completeTask(task.id);
        } else {
          await plugin.todoistService.reopenTask(task.id);
        }
        new Notice(checkbox.checked ? `Completed: ${task.content}` : `Reopened: ${task.content}`);
      } catch (err) {
        console.error('Failed to toggle task:', err);
        new Notice(`Failed to update task: ${err}`);
        checkbox.checked = !checkbox.checked;
      }
    })();
  });

  const textContainer = row.createDiv({ cls: 'syncist-query-task-text' });

  const contentEl = textContainer.createSpan({ cls: 'syncist-query-content' });
  const emoji = PRIORITY_EMOJI[task.priority];
  if (emoji) {
    contentEl.createSpan({ text: emoji + ' ', cls: 'syncist-query-priority' });
  }
  contentEl.createSpan({ text: task.content });

  const metaEl = textContainer.createDiv({ cls: 'syncist-query-meta' });
  const badges: string[] = [];

  const projectName = plugin.todoistService.getProjectName(task.projectId);
  if (projectName) badges.push(`📁 ${projectName}`);
  if (task.due) badges.push(`📅 ${task.due.date}`);
  if (task.labels.length) badges.push(task.labels.map(l => `#${l}`).join(' '));

  if (badges.length > 0) {
    metaEl.createSpan({ text: badges.join('  ·  '), cls: 'syncist-query-badge' });
  }
}

export function renderQueryBlock(
  source: string,
  el: HTMLElement,
  plugin: TodoistSyncPlugin
): void {
  const { config, error } = parseQueryConfig(source);

  if (!config) {
    el.createDiv({ cls: 'syncist-query-error', text: error ?? 'Invalid syncist block. Use: filter: today' });
    return;
  }

  if (!plugin.todoistService.isInitialized()) {
    el.createDiv({ cls: 'syncist-query-error', text: 'Todoist API not configured. Add your token in settings.' });
    return;
  }

  const wrapper = el.createDiv({ cls: 'syncist-query-block' });

  const header = wrapper.createDiv({ cls: 'syncist-query-header' });
  header.createSpan({
    text: config.includeCompleted ? `Filter: ${config.filter} · including completed` : `Filter: ${config.filter}`,
    cls: 'syncist-query-filter-label',
  });

  const refreshBtn = header.createEl('button', { text: '↻', cls: 'syncist-query-refresh' });
  refreshBtn.setAttribute('aria-label', 'Refresh');

  const listContainer = wrapper.createDiv({ cls: 'syncist-query-list' });
  const footerEl = wrapper.createDiv({ cls: 'syncist-query-footer' });

  const loadTasks = async () => {
    listContainer.empty();
    footerEl.empty();
    listContainer.createDiv({ cls: 'syncist-query-loading', text: 'Loading tasks...' });

    try {
      await plugin.todoistService.ensureProjectCache();
      const activeTasks = await plugin.todoistService.getFilteredTasks(config.filter);
      let completedTasks: TodoistTask[] = [];
      let completedWarning: string | null = null;
      let completedWindow: CompletedTaskWindow | null = null;

      if (config.includeCompleted) {
        try {
          completedWindow = resolveCompletedWindow(config, new Date());
          completedTasks = await plugin.todoistService.getCompletedTasks({
            filterQuery: config.filter,
            by: completedWindow.by,
            since: completedWindow.since,
            until: completedWindow.until,
          });
        } catch (completedError) {
          completedWarning = completedError instanceof Error ? completedError.message : String(completedError);
          console.warn('Syncist query block completed task lookup failed:', completedError);
        }
      }

      const tasks = mergeTasks(activeTasks, completedTasks);
      listContainer.empty();

      if (tasks.length === 0) {
        listContainer.createDiv({ cls: 'syncist-query-empty', text: 'No tasks match this filter.' });
      } else {
        const tree = buildTaskTree(tasks);
        for (const node of tree) {
          renderTaskRow(node.task, listContainer, plugin, false);
          for (const child of node.children) {
            renderTaskRow(child, listContainer, plugin, true);
          }
        }
      }

      footerEl.createSpan({
        text: `Updated: ${new Date().toLocaleTimeString()}`,
        cls: 'syncist-query-timestamp',
      });

      if (completedWindow) {
        footerEl.createDiv({
          text: `Completed: ${completedWindow.by.replace('_', ' ')} ${formatDateForLabel(completedWindow.since)} to ${formatDateForLabel(completedWindow.until)}`,
          cls: 'syncist-query-completed-window',
        });
      }

      if (completedWarning) {
        footerEl.createDiv({
          text: `Completed tasks not loaded: ${completedWarning}`,
          cls: 'syncist-query-warning',
        });
      }
    } catch (error) {
      listContainer.empty();
      const message = error instanceof Error ? error.message : String(error);
      const isFilterError = message.toLowerCase().startsWith('invalid filter');
      if (isFilterError) {
        console.warn('Syncist query block: invalid filter —', message);
      } else {
        console.error('Syncist query block error:', error);
      }
      listContainer.createDiv({
        cls: 'syncist-query-error',
        text: isFilterError
          ? `${message}. Check the Todoist filter syntax.`
          : `Failed to load tasks: ${message}`,
      });
    }
  };

  refreshBtn.addEventListener('click', () => {
    void loadTasks();
  });

  void loadTasks();
}
