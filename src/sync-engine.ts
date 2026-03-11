import { App, TFile } from 'obsidian';
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
  TodoistTask,
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

  updateSettings(settings: TodoistSyncSettings): void {
    this.settings = settings;
  }

  updateSyncState(syncState: SyncState): void {
    this.syncState = syncState;
  }

  /**
   * Resolve the display project name for a Todoist task.
   * Returns null when the task is in the configured default project (or inbox
   * when no default is set) so that 📁 is not written to the task line.
   */
  private resolveProjectName(projectId: string): string | null {
    if (this.settings.defaultProjectId) {
      if (projectId === this.settings.defaultProjectId) return null;
    } else {
      if (this.todoistService.isInboxProject(projectId)) return null;
    }
    return this.todoistService.getProjectName(projectId) ?? null;
  }

  getSyncState(): SyncState {
    return this.syncState;
  }

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

      // Ensure project cache is populated for project name lookups
      await this.todoistService.ensureProjectCache();

      console.debug('Todoist Sync: Fetching Todoist tasks...');
      let todoistTasks: TodoistTask[] = [];
      try {
        todoistTasks = await this.todoistService.getTasks();
        console.debug(`Todoist Sync: Found ${todoistTasks.length} tasks in Todoist`);
      } catch (error) {
        console.error('Todoist Sync: Failed to fetch Todoist tasks:', error);
        result.errors.push(`Failed to fetch Todoist tasks: ${error}`);
        this.isSyncing = false;
        return result;
      }

      const todoistTaskMap = new Map<string, TodoistTask>();
      for (const task of todoistTasks) {
        todoistTaskMap.set(task.id, task);
      }

      console.debug('Todoist Sync: Scanning vault for tasks...');
      const obsidianTasks = await this.getAllObsidianTasks();
      console.debug(`Todoist Sync: Found ${obsidianTasks.length} tasks with ${this.settings.syncTag} tag`);

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

      // Sort new tasks: parents first (lower indentLevel), then children.
      // This ensures parent Todoist IDs are available when creating subtasks.
      const sortedNewTasks = [...newObsidianTasks].sort((a, b) => a.indentLevel - b.indentLevel);

      // Track newly created tasks so children can reference their Todoist IDs.
      // Maps "filePath:lineNumber" to the created Todoist task ID.
      const createdTaskMap = new Map<string, string>();
      // Also track the IDs themselves so the stale-entry cleanup below does not
      // remove entries that were just added in this sync cycle.
      const newlyCreatedIds = new Set<string>();

      for (const task of sortedNewTasks) {
        try {
          // Resolve parentId: use the task's existing parentId, or look up from
          // a task that was just created in this same sync cycle.
          let parentId = task.parentId;
          if (!parentId && task.indentLevel > 0) {
            parentId = this.findParentTodoistId(task, obsidianTasks, createdTaskMap);
          }

          console.debug(`Todoist Sync: Creating task "${task.content}" (parent: ${parentId ?? 'none'})...`);
          const todoistTask = await this.createTodoistTaskWithParent(task, parentId);
          createdTaskMap.set(`${task.filePath}:${task.lineNumber}`, todoistTask.id);
          newlyCreatedIds.add(todoistTask.id);
          result.created++;
          console.debug('Todoist Sync: Task created successfully');
        } catch (error) {
          result.errors.push(`Failed to create task: ${task.content} - ${error}`);
          console.error('Todoist Sync: Failed to create task:', error);
        }
      }

      // Sync existing tasks
      for (const [todoistId, obsidianTask] of syncedObsidianTasks) {
        const todoistTask = todoistTaskMap.get(todoistId);

        if (!todoistTask) {
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

      // Clean up sync state for any entry no longer present in Obsidian.
      // This covers tasks whose file was renamed, moved, or deleted, as well
      // as task lines that were manually removed. The Todoist task is left
      // untouched; only the local tracking entry is removed.
      // Entries created during THIS sync cycle are excluded — they were added
      // after the vault scan and therefore won't be in syncedObsidianTasks yet.
      for (const todoistId of Object.keys(this.syncState.tasks)) {
        if (!syncedObsidianTasks.has(todoistId) && !newlyCreatedIds.has(todoistId)) {
          console.debug(`Todoist Sync: Removing stale sync state entry for ${todoistId}`);
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
   * Find the Todoist parent ID for a subtask by walking up the indent hierarchy.
   */
  private findParentTodoistId(
    task: ParsedObsidianTask,
    allTasks: ParsedObsidianTask[],
    createdTaskMap: Map<string, string>
  ): string | null {
    // Look backwards through tasks in the same file for the nearest parent
    const samefile = allTasks.filter(t => t.filePath === task.filePath && t.lineNumber < task.lineNumber);
    for (let i = samefile.length - 1; i >= 0; i--) {
      const candidate = samefile[i];
      if (candidate.indentLevel < task.indentLevel) {
        // Found the parent -- return its Todoist ID (existing or newly created)
        if (candidate.todoistId) return candidate.todoistId;
        const key = `${candidate.filePath}:${candidate.lineNumber}`;
        return createdTaskMap.get(key) ?? null;
      }
    }
    return null;
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
   * Create a Todoist task from an Obsidian task, with optional parentId
   */
  private async createTodoistTaskWithParent(task: ParsedObsidianTask, parentId: string | null): Promise<TodoistTask> {
    // Resolve project ID from project name if provided
    let projectId = this.settings.defaultProjectId || undefined;
    if (task.projectName) {
      const resolvedId = this.todoistService.getProjectIdByName(task.projectName);
      if (resolvedId) projectId = resolvedId;
    }

    const todoistTask = await this.todoistService.createTask(task.content, {
      projectId: parentId ? undefined : projectId, // Subtasks inherit project from parent
      parentId: parentId ?? undefined,
      priority: task.priority,
      dueDate: task.dueDate ?? undefined,
      labels: task.labels,
      description: task.description,
    });

    await this.updateObsidianTaskLine(task, (line) => addTodoistIdToLine(line, todoistTask.id));

    this.syncState.tasks[todoistTask.id] = {
      todoistId: todoistTask.id,
      parentId: parentId,
      filePath: task.filePath,
      lineNumber: task.lineNumber,
      contentHash: generateContentHash(task),
      lastSynced: Date.now(),
      obsidianCompleted: task.isCompleted,
      todoistCompleted: todoistTask.isCompleted,
      projectId: todoistTask.projectId,
    };

    if (task.isCompleted) {
      await this.todoistService.completeTask(todoistTask.id);
    }

    return todoistTask;
  }

  /**
   * @deprecated Use createTodoistTaskWithParent instead
   */
  private async createTodoistTask(task: ParsedObsidianTask): Promise<void> {
    await this.createTodoistTaskWithParent(task, task.parentId);
  }

  /**
   * Sync an existing task between Obsidian and Todoist
   */
  private async syncExistingTask(
    obsidianTask: ParsedObsidianTask,
    todoistTask: TodoistTask
  ): Promise<'updated' | 'conflict' | 'completed' | 'unchanged'> {
    const obsidianCompleted = obsidianTask.isCompleted;
    const todoistCompleted = todoistTask.isCompleted;

    // Handle completion status sync
    if (obsidianCompleted !== todoistCompleted) {
      if (obsidianCompleted && !todoistCompleted) {
        await this.todoistService.completeTask(todoistTask.id);
        this.updateSyncStateTask(todoistTask.id, obsidianTask, true, todoistTask);
        return 'completed';
      } else if (!obsidianCompleted && todoistCompleted) {
        if (this.settings.conflictResolution === 'todoist-wins') {
          await this.markObsidianTaskCompleted(obsidianTask);
          this.updateSyncStateTask(todoistTask.id, obsidianTask, true, todoistTask);
          return 'completed';
        } else if (this.settings.conflictResolution === 'obsidian-wins') {
          await this.todoistService.reopenTask(todoistTask.id);
          this.updateSyncStateTask(todoistTask.id, obsidianTask, false, todoistTask);
          return 'updated';
        } else {
          await this.markObsidianTaskCompleted(obsidianTask);
          this.updateSyncStateTask(todoistTask.id, obsidianTask, true, todoistTask);
          return 'conflict';
        }
      }
    }

    // Check for content changes between Obsidian and Todoist
    const todoistContent = todoistTask.content;
    const todoistPriority = todoistTask.priority as TodoistPriority;
    const todoistDueDate = TodoistService.parseDueDate(todoistTask);

    const contentDiffers = obsidianTask.content !== todoistContent;
    const priorityDiffers = obsidianTask.priority !== todoistPriority;
    const dueDateDiffers = obsidianTask.dueDate !== todoistDueDate;

    const todoistLabels = [...(todoistTask.labels ?? [])].sort();
    const obsidianLabels = [...obsidianTask.labels].sort();
    const labelsDiffer = JSON.stringify(todoistLabels) !== JSON.stringify(obsidianLabels);

    const todoistProjectName = this.todoistService.getProjectName(todoistTask.projectId) ?? null;
    const projectDiffers = todoistProjectName !== (obsidianTask.projectName ?? null);

    const hasChanges = contentDiffers || priorityDiffers || dueDateDiffers || labelsDiffer || projectDiffers;

    if (!hasChanges) {
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted, todoistTask);
      return 'unchanged';
    }

    // Determine which side changed since the last sync using the stored content
    // hash. After a successful sync Obsidian and Todoist are identical, so the
    // stored hash represents the last-known state of both sides.
    const storedHash = this.syncState.tasks[todoistTask.id]?.contentHash ?? '';
    const currentObsidianHash = generateContentHash(obsidianTask);

    // Build a comparable hash from the current Todoist state.
    // generateContentHash sorts labels internally, so order doesn't matter.
    const todoistAsObsidian: ParsedObsidianTask = {
      ...obsidianTask,
      content: todoistContent,
      priority: todoistPriority,
      dueDate: todoistDueDate,
      labels: todoistTask.labels ?? [],
      isCompleted: todoistTask.isCompleted,
      parentId: todoistTask.parentId ?? null,
      projectId: todoistTask.projectId,
    };
    const currentTodoistHash = generateContentHash(todoistAsObsidian);

    const obsidianChanged = currentObsidianHash !== storedHash;
    const todoistChanged = currentTodoistHash !== storedHash;

    // Project moved in Todoist (content hash unchanged on both sides) → pull to Obsidian
    if (projectDiffers && !obsidianChanged && !todoistChanged) {
      await this.updateObsidianTaskFromTodoist(obsidianTask, todoistTask);
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted, todoistTask);
      return 'updated';
    }

    // Only Obsidian changed → push to Todoist regardless of conflict policy
    if (obsidianChanged && !todoistChanged) {
      await this.todoistService.updateTask(todoistTask.id, {
        content: obsidianTask.content,
        priority: obsidianTask.priority,
        dueString: obsidianTask.dueDate ?? undefined,
        labels: obsidianTask.labels,
      });
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted, todoistTask);
      return 'updated';
    }

    // Only Todoist changed → pull to Obsidian regardless of conflict policy
    if (todoistChanged && !obsidianChanged) {
      await this.updateObsidianTaskFromTodoist(obsidianTask, todoistTask);
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted, todoistTask);
      return 'updated';
    }

    // Both sides changed (or hash unavailable) → apply conflict resolution policy
    if (this.settings.conflictResolution === 'obsidian-wins') {
      await this.todoistService.updateTask(todoistTask.id, {
        content: obsidianTask.content,
        priority: obsidianTask.priority,
        dueString: obsidianTask.dueDate ?? undefined,
        labels: obsidianTask.labels,
      });
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted, todoistTask);
      return 'updated';
    } else if (this.settings.conflictResolution === 'todoist-wins') {
      await this.updateObsidianTaskFromTodoist(obsidianTask, todoistTask);
      this.updateSyncStateTask(todoistTask.id, obsidianTask, obsidianCompleted, todoistTask);
      return 'updated';
    } else {
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
    completed: boolean,
    todoistTask?: TodoistTask
  ): void {
    this.syncState.tasks[todoistId] = {
      todoistId,
      parentId: todoistTask?.parentId ?? obsidianTask.parentId ?? null,
      filePath: obsidianTask.filePath,
      lineNumber: obsidianTask.lineNumber,
      contentHash: generateContentHash(obsidianTask),
      lastSynced: Date.now(),
      obsidianCompleted: completed,
      todoistCompleted: completed,
      projectId: todoistTask?.projectId ?? obsidianTask.projectId ?? null,
    };
  }

  /**
   * Update Obsidian task from Todoist data
   */
  private async updateObsidianTaskFromTodoist(
    obsidianTask: ParsedObsidianTask,
    todoistTask: TodoistTask
  ): Promise<void> {
    const projectName = this.resolveProjectName(todoistTask.projectId);

    const updatedTask: ParsedObsidianTask = {
      ...obsidianTask,
      content: todoistTask.content,
      priority: todoistTask.priority as TodoistPriority,
      dueDate: TodoistService.parseDueDate(todoistTask),
      isCompleted: todoistTask.isCompleted,
      labels: todoistTask.labels ?? [],
      projectName,
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
   * Import a Todoist task (and its subtasks) at the cursor position in a file.
   * Returns the number of lines inserted.
   */
  async importTaskAtCursor(
    task: TodoistTask,
    subtasks: TodoistTask[],
    filePath: string,
    lineNumber: number
  ): Promise<number> {
    const projectName = this.resolveProjectName(task.projectId);

    const parentParsed: ParsedObsidianTask = {
      originalLine: '',
      lineNumber,
      filePath,
      content: task.content,
      isCompleted: task.isCompleted,
      todoistId: task.id,
      parentId: task.parentId ?? null,
      indentLevel: 0,
      dueDate: TodoistService.parseDueDate(task),
      priority: task.priority as TodoistPriority,
      labels: task.labels ?? [],
      description: task.description ?? '',
      projectId: task.projectId,
      projectName,
      lastModified: Date.now(),
    };

    const lines: string[] = [buildTaskLine(parentParsed, this.settings.syncTag)];

    // Add to sync state
    this.syncState.tasks[task.id] = {
      todoistId: task.id,
      parentId: task.parentId ?? null,
      filePath,
      lineNumber,
      contentHash: generateContentHash(parentParsed),
      lastSynced: Date.now(),
      obsidianCompleted: task.isCompleted,
      todoistCompleted: task.isCompleted,
      projectId: task.projectId,
    };

    // Build subtask lines
    for (let i = 0; i < subtasks.length; i++) {
      const sub = subtasks[i];
      const subParsed: ParsedObsidianTask = {
        originalLine: '',
        lineNumber: lineNumber + 1 + i,
        filePath,
        content: sub.content,
        isCompleted: sub.isCompleted,
        todoistId: sub.id,
        parentId: sub.parentId ?? task.id,
        indentLevel: 1,
        dueDate: TodoistService.parseDueDate(sub),
        priority: sub.priority as TodoistPriority,
        labels: sub.labels ?? [],
        description: sub.description ?? '',
        projectId: sub.projectId,
        projectName: null,
        lastModified: Date.now(),
      };

      lines.push(buildTaskLine(subParsed, this.settings.syncTag));

      this.syncState.tasks[sub.id] = {
        todoistId: sub.id,
        parentId: sub.parentId ?? task.id,
        filePath,
        lineNumber: lineNumber + 1 + i,
        contentHash: generateContentHash(subParsed),
        lastSynced: Date.now(),
        obsidianCompleted: sub.isCompleted,
        todoistCompleted: sub.isCompleted,
        projectId: sub.projectId,
      };
    }

    // Insert lines into the file
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = await this.app.vault.read(file);
    const fileLines = fileContent.split('\n');
    fileLines.splice(lineNumber, 0, ...lines);
    await this.app.vault.modify(file, fileLines.join('\n'));

    return lines.length;
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

    const taskMatch = lineContent.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/);
    
    let content: string;
    let isTask = false;
    let prefix = '';

    if (taskMatch) {
      isTask = true;
      prefix = taskMatch[1];
      content = taskMatch[3];
      
      const todoistIdMatch = content.match(/<!--\s*todoist-id:\s*([\w]+)\s*-->/);
      if (todoistIdMatch) {
        return { success: false, message: 'Task is already synced with Todoist.' };
      }

      const syncTagPattern = new RegExp(this.settings.syncTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!syncTagPattern.test(content)) {
        content = content.trim() + ' ' + this.settings.syncTag;
      }
    } else {
      const trimmed = lineContent.trim();
      if (!trimmed) {
        return { success: false, message: 'Cannot create task from empty line.' };
      }
      
      let cleanedContent = trimmed
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim();
      
      if (!cleanedContent) {
        return { success: false, message: 'Cannot create task from empty bullet.' };
      }
      
      content = cleanedContent + ' ' + this.settings.syncTag;
      prefix = lineContent.match(/^(\s*)/)?.[1] ?? '';
    }

    const cleanContent = content
      .replace(new RegExp(this.settings.syncTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
      .replace(/#[a-zA-Z0-9_-]+/g, '')
      .replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '')
      .replace(/⏫|🔼|🔽/g, '')
      .replace(/📁\s*\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    try {
      const todoistTask = await this.todoistService.createTask(cleanContent, {
        projectId: this.settings.defaultProjectId || undefined,
      });

      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        return { success: false, message: 'File not found.' };
      }

      const fileContent = await this.app.vault.read(file);
      const lines = fileContent.split('\n');

      let newLine: string;
      if (isTask) {
        newLine = addTodoistIdToLine(lineContent, todoistTask.id);
        if (!new RegExp(this.settings.syncTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(newLine)) {
          newLine = newLine.replace(/(\s*)<!--/, ` ${this.settings.syncTag}$1<!--`);
        }
      } else {
        newLine = `${prefix}- [ ] ${content} <!-- todoist-id:${todoistTask.id} -->`;
      }

      lines[lineNumber] = newLine;
      await this.app.vault.modify(file, lines.join('\n'));

      this.syncState.tasks[todoistTask.id] = {
        todoistId: todoistTask.id,
        parentId: null,
        filePath,
        lineNumber,
        contentHash: '',
        lastSynced: Date.now(),
        obsidianCompleted: false,
        todoistCompleted: false,
        projectId: todoistTask.projectId,
      };

      return { success: true, message: `Created Todoist task: ${cleanContent}` };
    } catch (error) {
      console.error('Failed to create Todoist task:', error);
      return { success: false, message: `Failed to create task: ${error}` };
    }
  }

  getPendingConflicts(): SyncConflict[] {
    return this.pendingConflicts;
  }

  clearPendingConflicts(): void {
    this.pendingConflicts = [];
  }
}
