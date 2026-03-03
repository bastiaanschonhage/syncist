import { Notice } from 'obsidian';
import type TodoistSyncPlugin from './main';
import { TodoistPriority, TodoistTask } from './types';

interface QueryConfig {
  filter: string;
}

function parseQueryConfig(source: string): QueryConfig | null {
  const lines = source.trim().split('\n');
  let filter = '';

  for (const line of lines) {
    const match = line.match(/^\s*filter\s*:\s*(.+)$/i);
    if (match) {
      filter = match[1].trim();
    }
  }

  if (!filter) return null;
  return { filter };
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
  [TodoistPriority.HIGH]: '⏫',
  [TodoistPriority.MEDIUM]: '🔼',
  [TodoistPriority.LOW]: '🔽',
};

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
  const config = parseQueryConfig(source);

  if (!config) {
    el.createDiv({ cls: 'syncist-query-error', text: 'Invalid syncist block. Use: filter: today' });
    return;
  }

  if (!plugin.todoistService.isInitialized()) {
    el.createDiv({ cls: 'syncist-query-error', text: 'Todoist API not configured. Add your token in settings.' });
    return;
  }

  const wrapper = el.createDiv({ cls: 'syncist-query-block' });

  const header = wrapper.createDiv({ cls: 'syncist-query-header' });
  header.createSpan({ text: `Filter: ${config.filter}`, cls: 'syncist-query-filter-label' });

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
      const tasks = await plugin.todoistService.getFilteredTasks(config.filter);
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
    } catch (error) {
      console.error('Syncist query block error:', error);
      listContainer.empty();
      listContainer.createDiv({
        cls: 'syncist-query-error',
        text: `Failed to load tasks: ${error}`,
      });
    }
  };

  refreshBtn.addEventListener('click', () => {
    void loadTasks();
  });

  void loadTasks();
}
