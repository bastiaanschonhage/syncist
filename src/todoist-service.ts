import { requestUrl } from 'obsidian';
import {
  TaskOptions,
  TodoistPriority,
  TodoistProject,
  TodoistTask,
  TodoistApiRawTask,
  TodoistApiRawProject,
  TodoistPaginatedResponse,
  ProjectCache,
  normalizeTask,
} from './types';

const API_BASE = 'https://api.todoist.com/api/v1';

/**
 * Service class wrapping the Todoist API v1 via Obsidian's requestUrl.
 */
export class TodoistService {
  private apiToken: string | null = null;
  private projectCache: Map<string, string> = new Map();
  private reverseProjectCache: Map<string, string> = new Map();
  private inboxProjectId: string | null = null;

  initialize(apiToken: string): void {
    if (!apiToken) {
      this.apiToken = null;
      return;
    }
    this.apiToken = apiToken;
  }

  isInitialized(): boolean {
    return this.apiToken !== null;
  }

  private headers(): Record<string, string> {
    return { 'Authorization': `Bearer ${this.apiToken}` };
  }

  async verifyToken(): Promise<boolean> {
    if (!this.apiToken) return false;
    try {
      await requestUrl({ url: `${API_BASE}/projects?limit=1`, headers: this.headers() });
      return true;
    } catch (error) {
      console.error('Todoist token verification failed:', error);
      return false;
    }
  }

  async getProjects(): Promise<TodoistProject[]> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const allProjects: TodoistApiRawProject[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams({ limit: '200' });
        if (cursor) params.set('cursor', cursor);

        const resp = await requestUrl({
          url: `${API_BASE}/projects?${params.toString()}`,
          headers: this.headers(),
        });

        const data = resp.json as TodoistPaginatedResponse<TodoistApiRawProject>;
        allProjects.push(...(data.results ?? []));
        cursor = data.next_cursor ?? null;
      } while (cursor);

      this.projectCache.clear();
      this.reverseProjectCache.clear();
      this.inboxProjectId = null;

      return allProjects.map(p => {
        this.projectCache.set(p.id, p.name);
        this.reverseProjectCache.set(p.name.toLowerCase(), p.id);
        if (p.inbox_project) this.inboxProjectId = p.id;
        return { id: p.id, name: p.name, isInbox: p.inbox_project ?? false };
      });
    } catch (error) {
      console.error('Failed to get projects:', error);
      throw error;
    }
  }

  getProjectCache(): ProjectCache {
    const cache: ProjectCache = {};
    for (const [id, name] of this.projectCache) {
      cache[id] = name;
    }
    return cache;
  }

  getProjectName(projectId: string): string | undefined {
    return this.projectCache.get(projectId);
  }

  getProjectIdByName(name: string): string | undefined {
    return this.reverseProjectCache.get(name.toLowerCase());
  }

  isInboxProject(projectId: string): boolean {
    return this.inboxProjectId === projectId;
  }

  async ensureProjectCache(): Promise<void> {
    if (this.projectCache.size === 0) {
      await this.getProjects();
    }
  }

  async getTasks(projectId?: string): Promise<TodoistTask[]> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const allTasks: TodoistTask[] = [];
      let cursor: string | null = null;

      do {
        const params = new URLSearchParams({ limit: '200' });
        if (projectId) params.set('project_id', projectId);
        if (cursor) params.set('cursor', cursor);

        const resp = await requestUrl({
          url: `${API_BASE}/tasks?${params.toString()}`,
          headers: this.headers(),
        });

        const data = resp.json as TodoistPaginatedResponse<TodoistApiRawTask>;
        for (const raw of data.results ?? []) {
          allTasks.push(normalizeTask(raw));
        }
        cursor = data.next_cursor ?? null;
      } while (cursor);

      console.debug(`Fetched ${allTasks.length} tasks from Todoist`);
      return allTasks;
    } catch (error) {
      console.error('Failed to get tasks:', error);
      throw error;
    }
  }

  async getSubtasks(parentId: string): Promise<TodoistTask[]> {
    const allTasks = await this.getTasks();
    return allTasks.filter(t => t.parentId === parentId);
  }

  async getTask(taskId: string): Promise<TodoistTask | null> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const resp = await requestUrl({
        url: `${API_BASE}/tasks/${taskId}`,
        headers: this.headers(),
      });
      return normalizeTask(resp.json as TodoistApiRawTask);
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
        return null;
      }
      console.error('Failed to get task:', error);
      throw error;
    }
  }

  async createTask(content: string, options?: TaskOptions): Promise<TodoistTask> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const body: Record<string, unknown> = { content };
      if (options?.projectId) body.project_id = options.projectId;
      if (options?.parentId) body.parent_id = options.parentId;
      if (options?.priority) body.priority = options.priority;
      if (options?.dueDate) body.due_date = options.dueDate;
      if (options?.labels) body.labels = options.labels;
      if (options?.description) body.description = options.description;

      const resp = await requestUrl({
        url: `${API_BASE}/tasks`,
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      console.debug('Created Todoist task:', content);
      return normalizeTask(resp.json as TodoistApiRawTask);
    } catch (error) {
      console.error('Failed to create task:', error);
      throw error;
    }
  }

  async updateTask(taskId: string, updates: {
    content?: string;
    priority?: TodoistPriority;
    dueString?: string;
    labels?: string[];
    description?: string;
  }): Promise<TodoistTask> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      const body: Record<string, unknown> = {};
      if (updates.content !== undefined) body.content = updates.content;
      if (updates.priority !== undefined) body.priority = updates.priority;
      if (updates.dueString !== undefined) body.due_string = updates.dueString;
      if (updates.labels !== undefined) body.labels = updates.labels;
      if (updates.description !== undefined) body.description = updates.description;

      const resp = await requestUrl({
        url: `${API_BASE}/tasks/${taskId}`,
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      console.debug('Updated Todoist task:', taskId);
      return normalizeTask(resp.json as TodoistApiRawTask);
    } catch (error) {
      console.error('Failed to update task:', error);
      throw error;
    }
  }

  async completeTask(taskId: string): Promise<boolean> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      await requestUrl({
        url: `${API_BASE}/tasks/${taskId}/close`,
        method: 'POST',
        headers: this.headers(),
      });
      console.debug('Completed Todoist task:', taskId);
      return true;
    } catch (error) {
      console.error('Failed to complete task:', error);
      throw error;
    }
  }

  async reopenTask(taskId: string): Promise<boolean> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      await requestUrl({
        url: `${API_BASE}/tasks/${taskId}/reopen`,
        method: 'POST',
        headers: this.headers(),
      });
      console.debug('Reopened Todoist task:', taskId);
      return true;
    } catch (error) {
      console.error('Failed to reopen task:', error);
      throw error;
    }
  }

  async deleteTask(taskId: string): Promise<boolean> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    try {
      await requestUrl({
        url: `${API_BASE}/tasks/${taskId}`,
        method: 'DELETE',
        headers: this.headers(),
      });
      console.debug('Deleted Todoist task:', taskId);
      return true;
    } catch (error) {
      console.error('Failed to delete task:', error);
      throw error;
    }
  }

  async getFilteredTasks(filter: string): Promise<TodoistTask[]> {
    if (!this.apiToken) throw new Error('Todoist API not initialized');

    const allTasks: TodoistTask[] = [];
    let cursor: string | null = null;

    do {
      const params = new URLSearchParams({ query: filter, limit: '200' });
      if (cursor) params.set('cursor', cursor);

      const resp = await requestUrl({
        url: `${API_BASE}/tasks/filter?${params.toString()}`,
        headers: this.headers(),
        throw: false,
      });

      if (resp.status === 400) {
        const body = resp.json as { error?: string } | null;
        const detail = body?.error ?? 'invalid filter expression';
        throw new Error(`Invalid filter: ${detail}`);
      }

      if (resp.status !== 200) {
        throw new Error(`Request failed, status ${resp.status}`);
      }

      const data = resp.json as { items?: TodoistApiRawTask[]; results?: TodoistApiRawTask[]; next_cursor?: string };
      const rawItems = data.items ?? data.results ?? [];
      for (const raw of rawItems) {
        allTasks.push(normalizeTask(raw));
      }
      cursor = data.next_cursor ?? null;
    } while (cursor);

    return allTasks;
  }

  static fromTodoistPriority(priority: number): TodoistPriority {
    return priority as TodoistPriority;
  }

  static formatDueDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  static parseDueDate(task: TodoistTask): string | null {
    if (!task.due) return null;
    return task.due.date;
  }
}
