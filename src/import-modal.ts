import { App, SuggestModal, Notice } from 'obsidian';
import { TodoistTask } from './types';
import { TodoistService } from './todoist-service';

/**
 * Modal for searching and importing a Todoist task into the current note.
 * Extends Obsidian's SuggestModal for fuzzy search.
 */
export class ImportTaskModal extends SuggestModal<TodoistTask> {
  private todoistService: TodoistService;
  private allTasks: TodoistTask[] = [];
  private onSelect: (task: TodoistTask, subtasks: TodoistTask[]) => void;
  private loading = true;

  constructor(
    app: App,
    todoistService: TodoistService,
    onSelect: (task: TodoistTask, subtasks: TodoistTask[]) => void
  ) {
    super(app);
    this.todoistService = todoistService;
    this.onSelect = onSelect;
    this.setPlaceholder('Search for a Todoist task...');
    this.setInstructions([
      { command: '↑↓', purpose: 'navigate' },
      { command: '↵', purpose: 'import task (with subtasks)' },
      { command: 'esc', purpose: 'cancel' },
    ]);
    void this.loadTasks();
  }

  private async loadTasks(): Promise<void> {
    try {
      await this.todoistService.ensureProjectCache();
      this.allTasks = await this.todoistService.getTasks();
      this.loading = false;
      this.inputEl.dispatchEvent(new Event('input'));
    } catch (error) {
      console.error('Failed to load tasks for import:', error);
      new Notice('Failed to load Todoist tasks. Check your API token.');
      this.close();
    }
  }

  getSuggestions(query: string): TodoistTask[] {
    if (this.loading) return [];

    const topLevel = this.allTasks.filter(t => !t.parentId);

    if (!query.trim()) {
      return topLevel.slice(0, 50);
    }

    const lower = query.toLowerCase();
    return topLevel.filter(task => {
      const content = task.content.toLowerCase();
      const projectName = this.todoistService.getProjectName(task.projectId)?.toLowerCase() ?? '';
      const labels = task.labels.join(' ').toLowerCase();
      const dueStr = task.due?.date?.toLowerCase() ?? '';

      return content.includes(lower) ||
        projectName.includes(lower) ||
        labels.includes(lower) ||
        dueStr.includes(lower);
    }).slice(0, 50);
  }

  renderSuggestion(task: TodoistTask, el: HTMLElement): void {
    const container = el.createDiv({ cls: 'syncist-import-suggestion' });

    const priorityMap: Record<number, string> = { 4: '🔺', 3: '⏫', 2: '🔼' };
    const priorityEmoji = priorityMap[task.priority] ?? '';

    const titleEl = container.createDiv({ cls: 'syncist-import-title' });
    if (priorityEmoji) {
      titleEl.createSpan({ text: priorityEmoji + ' ', cls: 'syncist-import-priority' });
    }
    titleEl.createSpan({ text: task.content });

    const metaEl = container.createDiv({ cls: 'syncist-import-meta' });
    const parts: string[] = [];

    const projectName = this.todoistService.getProjectName(task.projectId);
    if (projectName) parts.push(`📁 ${projectName}`);
    if (task.due) parts.push(`📅 ${task.due.date}`);
    if (task.labels.length) parts.push(task.labels.map(l => `#${l}`).join(' '));

    const subtaskCount = this.allTasks.filter(t => t.parentId === task.id).length;
    if (subtaskCount > 0) parts.push(`${subtaskCount} subtask${subtaskCount > 1 ? 's' : ''}`);

    if (parts.length > 0) {
      metaEl.createSpan({ text: parts.join('  ·  '), cls: 'syncist-import-meta-text' });
    }
  }

  onChooseSuggestion(task: TodoistTask): void {
    const subtasks = this.allTasks.filter(t => t.parentId === task.id);
    this.onSelect(task, subtasks);
  }
}
