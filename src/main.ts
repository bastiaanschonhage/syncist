import { App, Editor, MarkdownView, Notice, Plugin } from 'obsidian';
import { TodoistSyncSettingTab } from './settings';
import { TodoistService } from './todoist-service';
import { SyncEngine } from './sync-engine';
import {
  TodoistSyncSettings,
  DEFAULT_SETTINGS,
  SyncState,
  DEFAULT_SYNC_STATE,
  SyncResult,
} from './types';

/**
 * Todoist Sync Plugin for Obsidian
 * 
 * Enables bidirectional sync between Obsidian tasks tagged with #todoist and Todoist.
 */
export default class TodoistSyncPlugin extends Plugin {
  settings: TodoistSyncSettings;
  todoistService: TodoistService;
  private syncEngine: SyncEngine;
  private syncState: SyncState;
  private syncIntervalId: number | null = null;
  private statusBarItem: HTMLElement | null = null;

  async onload(): Promise<void> {
    console.debug('Loading Syncist plugin...');

    // Load settings and sync state
    await this.loadSettings();
    await this.loadSyncState();

    // Initialize services
    this.todoistService = new TodoistService();
    if (this.settings.apiToken) {
      this.todoistService.initialize(this.settings.apiToken);
    }

    // Initialize sync engine
    this.syncEngine = new SyncEngine(
      this.app,
      this.todoistService,
      this.settings,
      this.syncState
    );

    // Add settings tab
    this.addSettingTab(new TodoistSyncSettingTab(this.app, this));

    // Add status bar item
    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar();

    // Register commands
    this.registerCommands();

    // Start sync interval
    this.startSyncInterval();

    console.debug('Syncist plugin loaded');
  }

  onunload(): void {
    console.debug('Unloading Syncist plugin...');
    
    // Stop sync interval
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Register plugin commands
   */
  private registerCommands(): void {
    // Command: Create Todoist task from current line
    this.addCommand({
      id: 'create-todoist-task',
      name: 'Create task from current line',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const filePath = view.file?.path;

        if (!filePath) {
          new Notice('Cannot determine file path');
          return;
        }

        const result = await this.syncEngine.createTaskFromLine(
          filePath,
          cursor.line,
          line
        );

        new Notice(result.message);
        
        if (result.success) {
          // Refresh the editor to show updated line
          const newContent = await this.app.vault.read(view.file!);
          editor.setValue(newContent);
          editor.setCursor(cursor);
          
          // Save sync state
          await this.saveSyncState();
        }
      },
    });

    // Command: Sync now
    this.addCommand({
      id: 'sync-now',
      name: 'Sync now',
      callback: async () => {
        if (!this.settings.apiToken) {
          new Notice('Please configure your API token in the settings.');
          return;
        }

        new Notice('Starting sync...');
        const result = await this.syncNow();
        
        const message = `Sync complete: ${result.created} created, ${result.updated} updated, ${result.completed} completed`;
        new Notice(message);

        if (result.errors.length > 0) {
          new Notice(`Sync had ${result.errors.length} error(s). Check console for details.`);
        }
      },
    });

    // Command: Open Todoist Sync settings
    this.addCommand({
      id: 'open-settings',
      name: 'Open settings',
      callback: () => {
        // Open settings tab - using internal Obsidian API
        const appWithSettings = this.app as App & { 
          setting?: { open: () => void; openTabById: (id: string) => void } 
        };
        if (appWithSettings.setting) {
          appWithSettings.setting.open();
          appWithSettings.setting.openTabById('todoist-sync');
        }
      },
    });
  }

  /**
   * Load plugin settings
   */
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  /**
   * Save plugin settings
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    
    // Update services with new settings
    if (this.settings.apiToken) {
      this.todoistService.initialize(this.settings.apiToken);
    }
    
    if (this.syncEngine) {
      this.syncEngine.updateSettings(this.settings);
    }
  }

  /**
   * Load sync state
   */
  private async loadSyncState(): Promise<void> {
    const data = await this.loadData();
    this.syncState = data?.syncState ?? { ...DEFAULT_SYNC_STATE };
  }

  /**
   * Save sync state
   */
  async saveSyncState(): Promise<void> {
    const data = await this.loadData() ?? {};
    data.syncState = this.syncEngine.getSyncState();
    await this.saveData({ ...this.settings, syncState: data.syncState });
  }

  /**
   * Get current sync state
   */
  getSyncState(): SyncState {
    return this.syncEngine?.getSyncState() ?? this.syncState;
  }

  /**
   * Perform a sync operation
   */
  async syncNow(): Promise<SyncResult> {
    this.updateStatusBar('Syncing...');
    
    try {
      const result = await this.syncEngine.performSync();
      await this.saveSyncState();
      this.updateStatusBar();
      return result;
    } catch (error) {
      this.updateStatusBar('Sync failed');
      throw error;
    }
  }

  /**
   * Start the automatic sync interval
   */
  private startSyncInterval(): void {
    if (this.settings.syncIntervalMinutes <= 0) {
      return;
    }

    const intervalMs = this.settings.syncIntervalMinutes * 60 * 1000;
    
    this.syncIntervalId = window.setInterval(() => {
      if (!this.settings.apiToken) {
        return;
      }

      console.debug('Running scheduled sync...');
      void this.syncNow().catch((error: unknown) => {
        console.error('Scheduled sync failed:', error);
      });
    }, intervalMs);

    // Register interval for cleanup
    this.registerInterval(this.syncIntervalId);
  }

  /**
   * Restart the sync interval (after settings change)
   */
  restartSyncInterval(): void {
    // Stop existing interval
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    // Start new interval
    this.startSyncInterval();
  }

  /**
   * Update the status bar text
   */
  private updateStatusBar(text?: string): void {
    if (!this.statusBarItem) return;

    if (text) {
      this.statusBarItem.setText(`Todoist: ${text}`);
    } else {
      const taskCount = Object.keys(this.getSyncState().tasks).length;
      this.statusBarItem.setText(`Todoist: ${taskCount} tasks`);
    }
  }
}
