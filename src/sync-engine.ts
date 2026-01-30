import { App, TFile } from 'obsidian';
import { Task } from '@doist/todoist-api-typescript';
import { TodoistService } from './todoist-service';
import {
  parseTasksFromContent,
  buildTaskLine,
  addTodoistIdToLine,
  updateTaskCompletion,
  generateContentHash,
} from './task-parser';
import {
  ParsedObsidianTask,
  SyncState,
  SyncResult,
  SyncConflict,
  TodoistSyncSettings,
  TodoistPriority,
} from './types';

/**
 * Core sync engine for bidirectional Todoist <-> Obsidian sync
 */
export class SyncEngine {
  private app: App;
  private todoistService: TodoistService;
  private settings: TodoistSyncSettings;
  private syncState: SyncState;
  private isSyncing = false;
  private pendingConflicts: SyncConflict[] = [];
  private conflictResolver: ((conflict: SyncConflict, resolution: 'obsidian' | 'todoist') => void) | null = null;

  constructor(
    app: App,
    todoistService: TodoistService,
    settings: TodoistSyncSettings,
    syncState: SyncState
  ) {
    this.app = app;
    this.todoistService = todoistService;
    this.settings = settings;
    this.syncState = syncState;
  }

  /**
   * Update settings reference
   */
  updateSettings(settings: TodoistSyncSettings): void {
    this.settings = settings;
  }

  /**
   * Update sync state reference
   */
  updateSyncState(syncState: SyncState): void {
    this.syncState = syncState;
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState {
    return this.syncState;
  }

  /**
   * Check if sync is currently running
   */
  isCurrentlySyncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Perform a full bidirectional sync
   */
  async performSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      console.debug('Todoist Sync: Already in progress, skipping...');
      return { created: 0, updated: 0, completed: 0, conflicts: 0, errors: ['Sync already in progress'] };
    }

    if (!this.todoistService.isInitialized()) {
      console.debug('Todoist Sync: API not configured');
      return { created: 0, updated: 0, completed: 0, conflicts: 0, errors: ['Todoist API not configured'] };
    }

    this.isSyncing = true;
    const result: SyncResult = { created: 0, updated: 0, completed: 0, conflicts: 0, errors: [] };

    try {
      console.debug('Todoist Sync: Starting sync...');

      // Get all Todoist tasks
      console.debug('Todoist Sync: Fetching Todoist tasks...');
      let todoistTasks: Task[] = [];
      try {
        todoistTasks = await this.todoistService.getTasks();
        console.debug(`Todoist Sync: Found ${todoistTasks.length} tasks in Todoist`);
      } catch (error) {
        console.error('Todoist Sync: Failed to fetch Todoist tasks:', error);
        result.errors.push(`Failed to fetch Todoist tasks: ${error}`);
        this.isSyncing = false;
        return result;
      }

      const todoistTaskMap = new Map<string, Task>();
      for (const task of todoistTasks) {
        todoistTaskMap.set(task.id, task);
      }

      // Get all Obsidian tasks with sync tag
      console.debug('Todoist Sync: Scanning vault for tasks...');
      const obsidianTasks = await this.getAllObsidianTasks();
      console.debug(`Todoist Sync: Found ${obsidianTasks.length} tasks with ${this.settings.syncTag} tag`);

      // Group tasks by Todoist ID for comparison
      const syncedObsidianTasks = new Map<string, ParsedObsidianTask>();
      const newObsidianTasks: ParsedObsidianTask[] = [];

      for (const task of obsidianTasks) {
        if (task.todoistId) {
          syncedObsidianTasks.set(task.todoistId, task);
        } else {
          newObsidianTasks.push(task);
        }
      }

      console.debug(`Todoist Sync: ${newObsidianTasks.length} new tasks to create, ${syncedObsidianTasks.size} existing tasks to sync`);

      // 1. Create Todoist tasks for new Obsidian tasks
      for (const task of newObsidianTasks) {
        try {
          console.debug(`Todoist Sync: Creating task "${task.content}"...`);
          await this.createTodoistTask(task);
          result.created++;
          console.debug('Todoist Sync: Task created successfully');
        } catch (error) {
          result.errors.push(`Failed to create task: ${task.content} - ${error}`);
          console.error('Todoist Sync: Failed to create task:', error);
        }
      }

      // 2. Sync existing tasks
      for (const [todoistId, obsidianTask] of syncedObsidianTasks) {
        const todoistTask = todoistTaskMap.get(todoistId);

        if (!todoistTask) {
          // Task was deleted in Todoist - mark as completed in Obsidian
          try {
            console.debug(`Todoist Sync: Task ${todoistId} not found in Todoist, marking completed`);
            await this.markObsidianTaskCompleted(obsidianTask);
            result.completed++;
            delete this.syncState.tasks[todoistId];
          } catch (error) {
            result.errors.push(`Failed to mark task completed: ${obsidianTask.content}`);
            console.error('Todoist Sync: Failed to mark task completed:', error);
          }
          continue;
        }

        // Compare and sync
        try {
          const syncResult = await this.syncExistingTask(obsidianTask, todoistTask);
          if (syncResult === 'updated') result.updated++;
          if (syncResult === 'conflict') result.conflicts++;
          if (syncResult === 'completed') result.completed++;
        } catch (error) {
          result.errors.push(`Failed to sync task: ${obsidianTask.content} - ${error}`);
          console.error('Todoist Sync: Failed to sync existing task:', error);
        }
      }

      // 3. Check for Todoist tasks that need to sync back to Obsidian
      // (tasks created in Todoist that have corresponding Obsidian entries that were completed)
      for (const [todoistId] of todoistTaskMap) {
        const syncedTask = this.syncState.tasks[todoistId];
        if (syncedTask && !syncedObsidianTasks.has(todoistId)) {
          // Task exists in sync state but not found in Obsidian
          // The file/line might have been deleted - remove from sync state
          delete this.syncState.tasks[todoistId];
        }
      }

      this.syncState.lastFullSync = Date.now();
      console.debug('Todoist Sync: Completed!', result);

    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
      console.error('Todoist Sync: Sync failed with error:', error);
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Get all tasks from all markdown files in the vault
   */
  private async getAllObsidianTasks(): Promise<ParsedObsidianTask[]> {
    const tasks: ParsedObsidianTask[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const fileTasks = parseTasksFromContent(
          content,
          file.path,
          this.settings.syncTag,
          file.stat.mtime
        );
        tasks.push(...fileTasks);
      } catch (error) {
        console.error(`Failed to read file ${file.path}:`, error);
      }
    }

    return tasks;
  }

  /**
   * Create a Todoist task from an Obsidian task
   */
  private async createTodoistTask(task: ParsedObsidianTask): Promise<void> {
    const todoistTask = await this.todoistService.createTask(task.content, {
      projectId: this.settings.defaultProjectId || undefined,
      priority: task.priority,
      dueDate: task.dueDate ?? undefined,
      labels: task.labels,
      description: task.description,
    });

    // Update Obsidian task with Todoist ID
    await this.updateObsidianTaskLine(task, (line) => addTodoistIdToLine(line, todoistTask.id));

    // Add to sync state
    this.syncState.tasks[todoistTask.id] = {
      todoistId: todoistTask.id,
      filePath: task.filePath,
      lineNumber: task.lineNumber,
      contentHash: generateContentHash(task),
      lastSynced: Date.now(),
      obsidianCompleted: task.isCompleted,
      todoistCompleted: todoistTask.isCompleted,
    };

    // If task is already completed in Obsidian, complete it in Todoist
    if (task.isCompleted) {
      await this.todoistService.completeTask(todoistTask.id);
    }
  }

  /**
   * Sync an existing task between Obsidian and Todoist
   */
  private async syncExistingTask(
    obsidianTask: ParsedObsidianTask,
    todoistTask: Task
  ): Promise<'updated' | 'conflict' | 'completed' | 'unchanged'> {
    // Check for completion status changes
    const obsidianCompleted = obsidianTask.isCompleted;
    const todoistCompleted = todoistTask.isCompleted;

    // Handle completion status sync
    if (obsidianCompleted !== todoistCompleted) {
      if (obsidianCompleted && !todoistCompleted) {
        // Obsidian completed, Todoist not - complete in Todoist
        await this.todoistService.completeTask(todoistTask.id);
        this.updateSyncStateTask(todoistTask.id, obsidianTask, true);
        return 'completed';
      } else if (!obsidianCompleted && todoistCompleted) {
        // Todoist completed, Obsidian not - complete in Obsidian or reopen in Todoist
        if (this.settings.conflictResolution === 'todoist-wins') {
          await this.markObsidianTaskCompleted(obsidianTask);
          this.updateSyncStateTask(todoistTask.id, obsidianTask, true);
          return 'completed';
        } else if (this.settings.conflictResolution === 'obsidian-wins') {
          await this.todoistService.reopenTask(todoistTask.id);
          this.updateSyncStateTask(todoistTask.id, obsidianTask, false);
          return 'updated';
        } else {
          // Ask user - for now, default to Todoist wins
          await this.markObsidianTaskCompleted(obsidianTask);
          this.updateSyncStateTask(todoistTask.id, obsidianTask, true);
          return 'conflict';
        }
      }
    }

    // Check for content changes
    const todoistContent = todoistTask.content;
    const todoistPriority = todoistTask.priority as TodoistPriority;
    const todoistDueDate = TodoistService.parseDueDate(todoistTask);

    const contentDiffers = obsidianTask.content !== todoistContent;
    const priorityDiffers = obsidianTask.priority !== todoistPriority;
    const dueDateDiffers = obsidianTask.dueDate !== todoistDueDate;

    const hasChanges = contentDiffers || priorityDiffers || dueDateDiffers;

    if (!hasChanges) {
      // No changes, just update sync state
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted);
      return 'unchanged';
    }

    // Determine which side wins
    if (this.settings.conflictResolution === 'obsidian-wins') {
      // Update Todoist with Obsidian data
      await this.todoistService.updateTask(todoistTask.id, {
        content: obsidianTask.content,
        priority: obsidianTask.priority,
        dueString: obsidianTask.dueDate ?? undefined,
        labels: obsidianTask.labels,
      });
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted);
      return 'updated';
    } else if (this.settings.conflictResolution === 'todoist-wins') {
      // Update Obsidian with Todoist data
      await this.updateObsidianTaskFromTodoist(obsidianTask, todoistTask);
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted);
      return 'updated';
    } else {
      // Ask user - queue conflict
      this.pendingConflicts.push({
        todoistId: todoistTask.id,
        filePath: obsidianTask.filePath,
        lineNumber: obsidianTask.lineNumber,
        obsidianContent: obsidianTask.content,
        todoistContent: todoistContent,
        obsidianCompleted,
        todoistCompleted,
      });
      return 'conflict';
    }
  }

  /**
   * Update sync state for a task
   */
  private updateSyncStateTask(
    todoistId: string,
    obsidianTask: ParsedObsidianTask,
    completed: boolean
  ): void {
    this.syncState.tasks[todoistId] = {
      todoistId,
      filePath: obsidianTask.filePath,
      lineNumber: obsidianTask.lineNumber,
      contentHash: generateContentHash(obsidianTask),
      lastSynced: Date.now(),
      obsidianCompleted: completed,
      todoistCompleted: completed,
    };
  }

  /**
   * Update Obsidian task from Todoist data
   */
  private async updateObsidianTaskFromTodoist(
    obsidianTask: ParsedObsidianTask,
    todoistTask: Task
  ): Promise<void> {
    const updatedTask: ParsedObsidianTask = {
      ...obsidianTask,
      content: todoistTask.content,
      priority: todoistTask.priority as TodoistPriority,
      dueDate: TodoistService.parseDueDate(todoistTask),
      isCompleted: todoistTask.isCompleted,
    };

    const newLine = buildTaskLine(updatedTask, this.settings.syncTag);
    await this.replaceLineInFile(obsidianTask.filePath, obsidianTask.lineNumber, newLine);
  }

  /**
   * Mark an Obsidian task as completed
   */
  private async markObsidianTaskCompleted(task: ParsedObsidianTask): Promise<void> {
    await this.updateObsidianTaskLine(task, (line) => updateTaskCompletion(line, true));
  }

  /**
   * Update a specific line in the Obsidian task
   */
  private async updateObsidianTaskLine(
    task: ParsedObsidianTask,
    transform: (line: string) => string
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${task.filePath}`);
    }

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');

    if (task.lineNumber >= lines.length) {
      throw new Error(`Line number out of range: ${task.lineNumber}`);
    }

    lines[task.lineNumber] = transform(lines[task.lineNumber]);
    await this.app.vault.modify(file, lines.join('\n'));
  }

  /**
   * Replace a line in a file
   */
  private async replaceLineInFile(
    filePath: string,
    lineNumber: number,
    newLine: string
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');

    if (lineNumber >= lines.length) {
      throw new Error(`Line number out of range: ${lineNumber}`);
    }

    lines[lineNumber] = newLine;
    await this.app.vault.modify(file, lines.join('\n'));
  }

  /**
   * Create a Todoist task from the current editor line
   */
  async createTaskFromLine(
    filePath: string,
    lineNumber: number,
    lineContent: string
  ): Promise<{ success: boolean; message: string }> {
    if (!this.todoistService.isInitialized()) {
      return { success: false, message: 'Todoist API not configured. Please add your API key in settings.' };
    }

    // Check if line is a task
    const taskMatch = lineContent.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
    
    let content: string;
    let isTask = false;
    let prefix = '';

    if (taskMatch) {
      // It's already a task
      isTask = true;
      prefix = taskMatch[1];
      content = taskMatch[3];
      
      // Check if already synced
      const todoistIdMatch = content.match(/<!--\s*todoist-id:\s*(\d+)\s*-->/);
      if (todoistIdMatch) {
        return { success: false, message: 'Task is already synced with Todoist.' };
      }

      // Check if it has the sync tag
      const syncTagPattern = new RegExp(this.settings.syncTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!syncTagPattern.test(content)) {
        // Add sync tag
        content = content.trim() + ' ' + this.settings.syncTag;
      }
    } else {
      // Convert line to a task
      const trimmed = lineContent.trim();
      if (!trimmed) {
        return { success: false, message: 'Cannot create task from empty line.' };
      }
      
      // Remove bullet points (-, *, +) or numbered list markers (1., 2., etc.)
      let cleanedContent = trimmed
        .replace(/^[-*+]\s+/, '')           // Remove -, *, + bullets
        .replace(/^\d+\.\s+/, '')           // Remove numbered list markers
        .trim();
      
      if (!cleanedContent) {
        return { success: false, message: 'Cannot create task from empty bullet.' };
      }
      
      content = cleanedContent + ' ' + this.settings.syncTag;
      prefix = lineContent.match(/^(\s*)/)?.[1] ?? '';
    }

    // Clean content for Todoist (remove hashtags and metadata)
    const cleanContent = content
      .replace(new RegExp(this.settings.syncTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
      .replace(/#[a-zA-Z0-9_-]+/g, '')
      .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '')
      .replace(/⏫|🔼|🔽/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    try {
      // Create task in Todoist
      const todoistTask = await this.todoistService.createTask(cleanContent, {
        projectId: this.settings.defaultProjectId || undefined,
      });

      // Update the line in the file
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        return { success: false, message: 'File not found.' };
      }

      const fileContent = await this.app.vault.read(file);
      const lines = fileContent.split('\n');

      let newLine: string;
      if (isTask) {
        // Update existing task with Todoist ID
        newLine = addTodoistIdToLine(lineContent, todoistTask.id);
        // Add sync tag if not present
        if (!new RegExp(this.settings.syncTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(newLine)) {
          newLine = newLine.replace(/(\s*)<!--/, ` ${this.settings.syncTag}$1<!--`);
        }
      } else {
        // Create new task line
        newLine = `${prefix}- [ ] ${content} <!-- todoist-id:${todoistTask.id} -->`;
      }

      lines[lineNumber] = newLine;
      await this.app.vault.modify(file, lines.join('\n'));

      // Add to sync state
      this.syncState.tasks[todoistTask.id] = {
        todoistId: todoistTask.id,
        filePath,
        lineNumber,
        contentHash: '',
        lastSynced: Date.now(),
        obsidianCompleted: false,
        todoistCompleted: false,
      };

      return { success: true, message: `Created Todoist task: ${cleanContent}` };
    } catch (error) {
      console.error('Failed to create Todoist task:', error);
      return { success: false, message: `Failed to create task: ${error}` };
    }
  }

  /**
   * Get pending conflicts for user resolution
   */
  getPendingConflicts(): SyncConflict[] {
    return this.pendingConflicts;
  }

  /**
   * Clear pending conflicts
   */
  clearPendingConflicts(): void {
    this.pendingConflicts = [];
  }
}
