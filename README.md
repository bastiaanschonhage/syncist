# Syncist (Todoist Sync) - Obsidian Plugin

> **100% coded by AI** - Built entirely with Claude Opus 4.5, guided by Context7 documentation

### Summary
With this plugin it is possible to create `Todoist` tasks from `Obsidian` and keep them in sync bidirectionally.
Its usage is very simple after the plugin has been connected to your Todoist account.
When you add the `#todoist` tag to a task (or checkbox item) it will automatically be created on Todoist and from that moment onward, the Todoist and Obsidian task will be synced.

### Features
- **Bidirectional Sync**: Changes in Obsidian or Todoist are synced both ways
- **Tasks Plugin Compatible**: Works with the popular Obsidian Tasks plugin emojis (📅, ⏫, 🔼, 🔽)
- **Configurable**: Customize sync tag, default project, sync interval, and conflict resolution
- **Commands**: Quick commands to create tasks and trigger sync
- **Conflict Resolution**: Choose how to handle conflicts (Obsidian wins, Todoist wins, or ask)
- **AI-Crafted**: 100% coded by AI using modern best practices

### Installation

#### From Community Plugins (Recommended)
1. Open Obsidian Settings → Community plugins
2. Click "Browse" and search for "Syncist"
3. Install and enable the plugin
4. Configure your Todoist API token in the plugin settings

#### Manual Installation
1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/bastiaanschonhage/syncist/releases)
2. Create a folder `syncist-todoist-sync` in your vault's `.obsidian/plugins/` directory
3. Copy `main.js` and `manifest.json` into that folder
4. Enable the plugin in Obsidian settings

#### From Source (Development)
1. Clone this repository
2. Run `npm install` and `npm run build`
3. Open the `TestVault` folder in Obsidian (the plugin is symlinked)
4. Enable Community plugins in Settings → Community plugins
5. Enable the "Syncist (Todoist Sync)" plugin

### Configuration

1. Get your Todoist API token from [Todoist Settings → Integrations → Developer](https://todoist.com/app/settings/integrations/developer)
2. Open plugin settings in Obsidian
3. Enter your API token and click "Verify"
4. Configure other settings as needed:
   - **Sync Tag**: Tag to mark tasks for sync (default: `#todoist`)
   - **Default Project**: Where new tasks go (default: Inbox)
   - **Sync Interval**: Auto-sync frequency in minutes
   - **Conflict Resolution**: How to handle conflicting changes

### Usage

#### Creating Tasks
Add the `#todoist` tag to any task:
```markdown
- [ ] Buy groceries #todoist
- [ ] Meeting with team #todoist 📅 2026-01-28 ⏫
```

After sync, the task will have a Todoist ID:
```markdown
- [ ] Buy groceries #todoist <!-- todoist-id:8765432109 -->
```

#### Commands
- **Create Todoist task from current line**: Convert current line to a synced task
- **Sync with Todoist now**: Manually trigger sync
- **Open Todoist Sync settings**: Quick access to settings

### Supported Task Formats

| Emoji | Meaning | Todoist Mapping |
|-------|---------|-----------------|
| 📅 | Due date | Task due date |
| ⏫ | High priority | Priority 4 |
| 🔼 | Medium priority | Priority 3 |
| 🔽 | Low priority | Priority 2 |

### Network Usage

This plugin connects to the **Todoist API** to sync tasks. Your Todoist API token is stored locally in Obsidian's plugin data and is only used to communicate with Todoist's servers (`api.todoist.com`).

### Development

To build the plugin from source:
```bash
npm install
npm run build
```

### About This Plugin

This plugin is **100% coded by AI**:
- Built entirely using `Claude Opus 4.5` in Cursor IDE
- API integration guided by `Context7` MCP for up-to-date Todoist and Obsidian documentation
- No human-written code - demonstrating the capabilities of AI-assisted development

### Finally
If you like this plugin, please give it a star on `GitHub` and in `Obsidian`!