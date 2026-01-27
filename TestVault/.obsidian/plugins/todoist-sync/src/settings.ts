import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import TodoistSyncPlugin from './main';
import { TodoistSyncSettings, ConflictResolution, TodoistProject } from './types';

/**
 * Settings tab for Todoist Sync plugin
 */
export class TodoistSyncSettingTab extends PluginSettingTab {
  plugin: TodoistSyncPlugin;
  private projects: TodoistProject[] = [];
  private projectsLoaded = false;

  constructor(app: App, plugin: TodoistSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Todoist Sync Settings' });

    // API Token Setting
    new Setting(containerEl)
      .setName('Todoist API Token')
      .setDesc('Your Todoist API token. Find it in Todoist Settings → Integrations → Developer.')
      .addText((text) => {
        text
          .setPlaceholder('Enter your API token')
          .setValue(this.plugin.settings.apiToken)
          .onChange(async (value) => {
            this.plugin.settings.apiToken = value;
            await this.plugin.saveSettings();
            // Reset projects when token changes
            this.projectsLoaded = false;
            this.projects = [];
          });
        // Make it look like a password field
        text.inputEl.type = 'password';
        text.inputEl.style.width = '300px';
      })
      .addButton((button) => {
        button
          .setButtonText('Verify')
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('Verifying...');
            
            try {
              this.plugin.todoistService.initialize(this.plugin.settings.apiToken);
              const isValid = await this.plugin.todoistService.verifyToken();
              
              if (isValid) {
                new Notice('API token is valid!');
                // Load projects after successful verification
                await this.loadProjects();
                this.display(); // Refresh to show projects
              } else {
                new Notice('API token is invalid. Please check and try again.');
              }
            } catch (error) {
              new Notice('Failed to verify token. Please check your internet connection.');
              console.error('Token verification error:', error);
            } finally {
              button.setDisabled(false);
              button.setButtonText('Verify');
            }
          });
      });

    // Sync Tag Setting
    new Setting(containerEl)
      .setName('Sync Tag')
      .setDesc('Tag used to identify tasks for syncing. Include the # symbol.')
      .addText((text) =>
        text
          .setPlaceholder('#todoist')
          .setValue(this.plugin.settings.syncTag)
          .onChange(async (value) => {
            // Ensure tag starts with #
            if (value && !value.startsWith('#')) {
              value = '#' + value;
            }
            this.plugin.settings.syncTag = value || '#todoist';
            await this.plugin.saveSettings();
          })
      );

    // Load projects if token is set
    if (this.plugin.settings.apiToken && !this.projectsLoaded) {
      await this.loadProjects();
    }

    // Default Project Setting
    const projectSetting = new Setting(containerEl)
      .setName('Default Project')
      .setDesc('Default Todoist project for new tasks. Leave empty to use Inbox.');

    if (this.projects.length > 0) {
      projectSetting.addDropdown((dropdown) => {
        // Add empty option for Inbox
        dropdown.addOption('', 'Inbox (default)');
        
        for (const project of this.projects) {
          dropdown.addOption(project.id, project.name);
        }
        
        dropdown.setValue(this.plugin.settings.defaultProjectId);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultProjectId = value;
          await this.plugin.saveSettings();
        });
      });
    } else {
      projectSetting.addText((text) => {
        text
          .setPlaceholder('Verify API token to load projects')
          .setValue(this.plugin.settings.defaultProjectId)
          .setDisabled(true);
      });
    }

    // Sync Interval Setting
    new Setting(containerEl)
      .setName('Sync Interval')
      .setDesc('How often to sync with Todoist (in minutes). Set to 0 to disable automatic sync.')
      .addText((text) =>
        text
          .setPlaceholder('5')
          .setValue(String(this.plugin.settings.syncIntervalMinutes))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.syncIntervalMinutes = num;
              await this.plugin.saveSettings();
              this.plugin.restartSyncInterval();
            }
          })
      );

    // Conflict Resolution Setting
    new Setting(containerEl)
      .setName('Conflict Resolution')
      .setDesc('How to handle conflicts when both Obsidian and Todoist have changes.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('todoist-wins', 'Todoist wins (default)')
          .addOption('obsidian-wins', 'Obsidian wins')
          .addOption('ask-user', 'Ask me each time')
          .setValue(this.plugin.settings.conflictResolution)
          .onChange(async (value) => {
            this.plugin.settings.conflictResolution = value as ConflictResolution;
            await this.plugin.saveSettings();
          });
      });

    // Separator
    containerEl.createEl('hr');

    // Manual Sync Section
    containerEl.createEl('h3', { text: 'Manual Actions' });

    new Setting(containerEl)
      .setName('Sync Now')
      .setDesc('Manually trigger a sync with Todoist.')
      .addButton((button) => {
        button
          .setButtonText('Sync Now')
          .setCta()
          .onClick(async () => {
            if (!this.plugin.settings.apiToken) {
              new Notice('Please configure your Todoist API token first.');
              return;
            }

            button.setDisabled(true);
            button.setButtonText('Syncing...');

            try {
              const result = await this.plugin.syncNow();
              const message = `Sync complete: ${result.created} created, ${result.updated} updated, ${result.completed} completed`;
              new Notice(message);
              
              if (result.errors.length > 0) {
                console.error('Sync errors:', result.errors);
                new Notice(`Sync had ${result.errors.length} error(s). Check console for details.`);
              }
              
              // Refresh the display to show updated status
              this.display();
            } catch (error) {
              new Notice('Sync failed. Check console for details.');
              console.error('Sync error:', error);
            } finally {
              button.setDisabled(false);
              button.setButtonText('Sync Now');
            }
          });
      });

    // Status Section
    containerEl.createEl('hr');
    containerEl.createEl('h3', { text: 'Status' });

    const statusEl = containerEl.createDiv({ cls: 'todoist-sync-status' });
    this.updateStatusDisplay(statusEl);
  }

  /**
   * Load projects from Todoist
   */
  private async loadProjects(): Promise<void> {
    if (!this.plugin.settings.apiToken) {
      return;
    }

    try {
      this.plugin.todoistService.initialize(this.plugin.settings.apiToken);
      this.projects = await this.plugin.todoistService.getProjects();
      this.projectsLoaded = true;
    } catch (error) {
      console.error('Failed to load projects:', error);
      this.projects = [];
    }
  }

  /**
   * Update the status display
   */
  private updateStatusDisplay(containerEl: HTMLElement): void {
    containerEl.empty();

    const syncState = this.plugin.getSyncState();
    const taskCount = Object.keys(syncState.tasks).length;

    const statusText = containerEl.createEl('p');
    statusText.textContent = `Synced tasks: ${taskCount}`;

    if (syncState.lastFullSync > 0) {
      const lastSync = new Date(syncState.lastFullSync);
      const lastSyncText = containerEl.createEl('p');
      lastSyncText.textContent = `Last sync: ${lastSync.toLocaleString()}`;
    } else {
      const lastSyncText = containerEl.createEl('p');
      lastSyncText.textContent = 'Last sync: Never';
    }

    const apiStatus = containerEl.createEl('p');
    apiStatus.textContent = `API Status: ${this.plugin.todoistService.isInitialized() ? 'Connected' : 'Not connected'}`;
  }
}
