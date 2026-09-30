# Syncist (Todoist Sync) - Obsidian Plugin

> **Created with the help of AI; fully validated and tested by human.**

### Summary
With this plugin it is possible to create `Todoist` tasks from `Obsidian` and keep them in sync bidirectionally.
Its usage is very simple after the plugin has been connected to your Todoist account.
When you add the `#todoist` tag to a task (or checkbox item) it will automatically be created on Todoist and from that moment onward, the Todoist and Obsidian task will be synced.

### Features
- **Bidirectional Sync**: Changes in Obsidian or Todoist are synced both ways
- **Subtasks**: Indented tasks beneath a `#todoist` parent are synced as subtasks automatically — no tag needed on each child
- **Import from Todoist**: Search and import any Todoist task (with its subtasks) into your note via a fuzzy-search modal
- **Projects & Labels**: Per-task project assignment with `📁 ProjectName` metadata, bidirectional label sync via `#hashtags`
- **Query Blocks**: Embed live Todoist task lists in your notes using `syncist` code blocks (e.g., `filter: today`)
- **Tasks Plugin Compatible**: Works with the popular Obsidian Tasks plugin emojis (📅, 🔺, ⏫, 🔼, 🔽)
- **Shorthand**: Type `p1`–`p4` for priority and `today`, `tomorrow` or `dd/mm` for the due date — no emoji picker needed
- **Configurable**: Customize sync tag, default project, sync interval, and conflict resolution
- **Commands**: Quick commands to create tasks, import tasks, and trigger sync
- **Conflict Resolution**: Choose how to handle conflicts (Obsidian wins, Todoist wins, or ask)
- **Zero Dependencies**: Direct Todoist API v1 integration via Obsidian's built-in `requestUrl` — no external SDKs
- **AI-Crafted**: Created with the help of AI; fully validated and tested by human

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
   - **Shorthand priorities and dates**: Recognize `p1`–`p4`, `today`, `tomorrow` and `dd/mm[/yy[yy]]` (default: on)

### Usage

#### Creating Tasks
Add the `#todoist` tag to any task:
```markdown
- [ ] Buy groceries #todoist
- [ ] Meeting with team #todoist 📅 2026-01-28 ⏫
- [ ] Call the dentist p1 tomorrow #todoist
```

After sync, the task will have a Todoist ID:
```markdown
- [ ] Buy groceries #todoist <!-- todoist-id:8765432109 -->
```

#### Shorthand Priorities and Dates
Instead of the emojis you can type the priority and due date as plain words anywhere in the task:
```markdown
- [ ] Call the dentist p1 tomorrow #todoist
- [ ] Renew passport p2 15/11 #todoist
```

| Shorthand | Meaning |
|-----------|---------|
| `p1` / `p2` / `p3` / `p4` | Priority, same as in Todoist (`p1` is highest, `p4` is none) |
| `today`, `tomorrow` | Due today / tomorrow |
| `dd/mm` | Next occurrence of that date (e.g. `15/11`; a date already passed this year means next year) |
| `dd/mm/yy`, `dd/mm/yyyy` | Exact date (e.g. `15/11/27`, `15/11/2027`) |

On the next sync the shorthand is sent to Todoist and rewritten in your note to the emoji format, e.g. the first task becomes:
```markdown
- [ ] Call the dentist #todoist 🔺 📅 2026-10-01 <!-- todoist-id:8765432109 -->
```
This pins relative dates like `today`, so they don't change on later syncs. To change a priority or date later, just type a new shorthand at the end of the line — it overrides the existing emoji.

While you type, the shorthand that will be converted is **highlighted in green** in the editor; hover it to see what it means (e.g. `Syncist: Due 2026-11-15`).

**The last one on the line wins.** Only the last priority and the last date on a line count, whether shorthand or emoji. Earlier words stay part of the title:
```markdown
- [ ] Plan p2 roadmap today p1 tomorrow #todoist
```
becomes the task "Plan p2 roadmap today" with priority p1, due tomorrow. After the sync the `🔺 📅` emojis come last on the line, so the `p2` and `today` left in the title are not picked up again. For the same reason, shorthand typed *before* an existing emoji is ignored — type it at the end.

Things to know:
- Shorthand must be a separate word: `mp3`, `#p1` or `today's` are not recognized, and neither are invalid dates like `31/02`
- Dates are always day-first (`dd/mm`)
- This also applies to task titles that come from Todoist, when the task has no due date: a title like `Buy 1/2 kg` would be read as a due date (the green highlight shows this). Turn off **Shorthand priorities and dates** in settings if that is a problem
- `p4` is written as `🔽`, so a `pN` word left in the title is not read as the priority later
- The emoji format keeps working either way

#### Subtasks
Indent tasks beneath a `#todoist`-tagged parent. Subtasks inherit the sync tag automatically — you do **not** need to add `#todoist` to each one:
```markdown
- [ ] Buy groceries #todoist <!-- todoist-id:111 -->
  - [ ] Milk <!-- todoist-id:222 -->
  - [ ] Bread <!-- todoist-id:333 -->
  - [ ] Eggs
```

- Subtasks are synced as Todoist subtasks (using `parentId`)
- New indented tasks without a Todoist ID are created as subtasks on the next sync
- Subtask hierarchy is preserved in both directions

#### Importing Tasks from Todoist
Use the command **"Import task from Todoist"** to search for any open Todoist task and insert it at your cursor:

1. Open the command palette (`Ctrl/Cmd + P`)
2. Run "Syncist: Import task from Todoist"
3. Search by task content, project, label, or due date
4. Select a task — it and its subtasks are inserted as synced markdown

#### Projects and Labels
Assign a project to a task using the `📁` emoji:
```markdown
- [ ] Design review #todoist #design #urgent 📁 WorkProject 📅 2026-03-05 <!-- todoist-id:123 -->
```

- `📁 ProjectName` sets the Todoist project for the task (overrides the default project)
- `#hashtags` (other than the sync tag) are synced as Todoist labels, bidirectionally
- Project names are resolved from the Todoist project list and cached

#### Query Blocks (Show Today's Tasks)
Embed a live, interactive task list in any note using a `syncist` code block:

````markdown
```syncist
filter: today
```
````

The block renders as a styled task list with checkboxes, priorities, projects, and due dates. You can complete or reopen tasks directly from the rendered block.

**Supported filters** (uses [Todoist filter syntax](https://todoist.com/help/articles/introduction-to-filters-702348ff)):

| Filter | Description |
|--------|-------------|
| `filter: today` | Tasks due today |
| `filter: overdue` | Overdue tasks |
| `filter: today \| overdue` | Combined filters |
| `filter: #ProjectName` | Tasks in a project |
| `filter: @label` | Tasks with a label |
| `filter: p1` | High priority tasks |

Each query block includes a refresh button and shows when it was last updated.

#### Commands
- **Create Todoist task from current line**: Convert current line to a synced task
- **Import task from Todoist**: Search and import a Todoist task at cursor
- **Sync with Todoist now**: Manually trigger sync
- **Open Todoist Sync settings**: Quick access to settings

### Supported Task Formats

| Emoji | Shorthand | Meaning | Todoist Mapping |
|-------|-----------|---------|-----------------|
| 📅 YYYY-MM-DD | `today`, `tomorrow`, `dd/mm`, `dd/mm/yy`, `dd/mm/yyyy` | Due date | Task due date |
| 🔺 | `p1` | Highest priority | p1 |
| ⏫ | `p2` | High priority | p2 |
| 🔼 | `p3` | Medium priority | p3 |
| 🔽 or none | `p4` | Low / no priority | p4 |
| 📁 | — | Project | Task project |

### Network Usage

This plugin connects directly to the **Todoist API v1** (via Obsidian's built-in `requestUrl`) to sync tasks. There are no external SDK dependencies. Your Todoist API token is stored locally in Obsidian's plugin data and is only used to communicate with Todoist's servers (`api.todoist.com`).

### Development

To build the plugin from source:
```bash
npm install
npm run build
```

To lint:
```bash
npm run lint
```

### About This Plugin

**Created with the help of AI; fully validated and tested by human.**

- Built entirely using `Claude` in Cursor IDE
- API integration guided by `Context7` MCP for up-to-date Todoist and Obsidian documentation
- Direct Todoist API v1 integration — no external SDKs, only Obsidian's built-in `requestUrl`
- Every feature manually validated and tested by a human

### Finally
If you like this plugin, please give it a star on `GitHub` and in `Obsidian`!
