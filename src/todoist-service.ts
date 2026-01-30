import { TodoistApi, Task } from '@doist/todoist-api-typescript';
import { TaskOptions, TodoistPriority, TodoistProject, TodoistPaginatedResponse, TodoistApiProject } from './types';

/**
 * Service class wrapping the Todoist API
 */
export class TodoistService {
  private api: TodoistApi | null = null;

  /**
   * Initialize the service with an API token
   */
  initialize(apiToken: string): void {
    if (!apiToken) {
      this.api = null;
      return;
    }
    this.api = new TodoistApi(apiToken);
  }

  /**
   * Check if the service is initialized with a valid token
   */
  isInitialized(): boolean {
    return this.api !== null;
  }

  /**
   * Verify the API token is valid by making a test request
   */
  async verifyToken(): Promise<boolean> {
    if (!this.api) return false;
    try {
      await this.api.getProjects();
      return true;
    } catch (error) {
      console.error('Todoist token verification failed:', error);
      return false;
    }
  }

  /**
   * Get all projects from Todoist
   */
  async getProjects(): Promise<TodoistProject[]> {
    if (!this.api) {
      throw new Error('Todoist API not initialized');
    }

    try {
      const response = await this.api.getProjects();
      // API v3 returns { results: Project[] } or direct array depending on version
      const projects: TodoistApiProject[] = Array.isArray(response) 
        ? response 
        : (response as TodoistPaginatedResponse<TodoistApiProject>).results ?? [];
      return projects.map((project: TodoistApiProject) => ({
        id: project.id,
        name: project.name,
        isInbox: project.isInboxProject ?? false,
      }));
    } catch (error) {
      console.error('Failed to get projects:', error);
      throw error;
    }
  }

  /**
   * Get all active (non-completed) tasks
   */
  async getTasks(projectId?: string): Promise<Task[]> {
    if (!this.api) {
      throw new Error('Todoist API not initialized');
    }

    try {
      const options: { projectId?: string } = {};
      if (projectId) {
        options.projectId = projectId;
      }

      // Paginate through all tasks
      const allTasks: Task[] = [];
      let cursor: string | null = null;

      do {
        const response = await this.api.getTasks({
          ...options,
          cursor: cursor ?? undefined,
          limit: 100,
        });
        
        // Handle both array and paginated response formats
        if (Array.isArray(response)) {
          allTasks.push(...response);
          cursor = null; // No pagination for array response
        } else {
          const paginatedResponse = response as TodoistPaginatedResponse<Task>;
          const results = paginatedResponse.results ?? [];
          allTasks.push(...results);
          cursor = paginatedResponse.nextCursor ?? null;
        }
      } while (cursor);

      console.debug(`Fetched ${allTasks.length} tasks from Todoist`);
      return allTasks;
    } catch (error) {
      console.error('Failed to get tasks:', error);
      throw error;
    }
  }

  /**
   * Get a single task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    if (!this.api) {
      throw new Error('Todoist API not initialized');
    }

    try {
      return await this.api.getTask(taskId);
    } catch (error: unknown) {
      // Task might have been deleted
      if (error && typeof error === 'object' && 'httpStatusCode' in error && error.httpStatusCode === 404) {
        return null;
      }
      console.error('Failed to get task:', error);
      throw error;
    }
  }

  /**
   * Create a new task in Todoist
   */
  async createTask(content: string, options?: TaskOptions): Promise<Task> {
    if (!this.api) {
      throw new Error('Todoist API not initialized');
    }

    try {
      const task = await this.api.addTask({
        content,
        projectId: options?.projectId || undefined,
        priority: options?.priority || TodoistPriority.NONE,
        dueString: options?.dueDate || undefined,
        labels: options?.labels || undefined,
        description: options?.description || undefined,
      });

      console.debug('Created Todoist task:', task.id, content);
      return task;
    } catch (error) {
      console.error('Failed to create task:', error);
      throw error;
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(taskId: string, updates: {
    content?: string;
    priority?: TodoistPriority;
    dueString?: string;
    labels?: string[];
    description?: string;
  }): Promise<Task> {
    if (!this.api) {
      throw new Error('Todoist API not initialized');
    }

    try {
      const task = await this.api.updateTask(taskId, updates);
      console.debug('Updated Todoist task:', taskId);
      return task;
    } catch (error) {
      console.error('Failed to update task:', error);
      throw error;
    }
  }

  /**
   * Complete (close) a task
   */
  async completeTask(taskId: string): Promise<boolean> {
    if (!this.api) {
      throw new Error('Todoist API not initialized');
    }

    try {
      const success = await this.api.closeTask(taskId);
      console.debug('Completed Todoist task:', taskId);
      return success;
    } catch (error) {
      console.error('Failed to complete task:', error);
      throw error;
    }
  }

  /**
   * Reopen a completed task
   */
  async reopenTask(taskId: string): Promise<boolean> {
    if (!this.api) {
      throw new Error('Todoist API not initialized');
    }

    try {
      const success = await this.api.reopenTask(taskId);
      console.debug('Reopened Todoist task:', taskId);
      return success;
    } catch (error) {
      console.error('Failed to reopen task:', error);
      throw error;
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<boolean> {
    if (!this.api) {
      throw new Error('Todoist API not initialized');
    }

    try {
      const success = await this.api.deleteTask(taskId);
      console.debug('Deleted Todoist task:', taskId);
      return success;
    } catch (error) {
      console.error('Failed to delete task:', error);
      throw error;
    }
  }

  /**
   * Convert Todoist priority to internal priority
   * Todoist API: 1 = normal, 4 = urgent
   */
  static fromTodoistPriority(priority: number): TodoistPriority {
    return priority as TodoistPriority;
  }

  /**
   * Format a date for Todoist API
   */
  static formatDueDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Parse due date from Todoist task
   */
  static parseDueDate(task: Task): string | null {
    if (!task.due) return null;
    return task.due.date;
  }
}
