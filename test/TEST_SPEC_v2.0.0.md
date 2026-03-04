# Syncist v2.0.0 - Test Specification

## Prerequisites

- [ ] Obsidian is open with the TestVault
- [ ] Syncist plugin is enabled
- [ ] A valid Todoist API token is configured and verified
- [ ] You have at least one project in Todoist (besides Inbox)
- [ ] Open the Obsidian developer console (`Ctrl/Cmd + Shift + I`) to monitor for errors

> **Tip**: Before testing, run "Syncist: Sync now" once to ensure the plugin connects to Todoist. Check the status bar shows "Todoist: N tasks".

---

## Part A: Regression Tests (Existing Features)

These tests verify that v1.0 functionality still works correctly after the v2.0 changes.

### A1. Basic task creation with sync tag

1. Create a new note called `Regression.md`
2. Type: `- [ ] Regression test basic #todoist`
3. Run command: **Syncist: Sync now**
4. **Expected**: The line gains a `<!-- todoist-id:XXXX -->` comment
5. Open Todoist and verify the task "Regression test basic" exists in Inbox
- [ ] **PASS** / **FAIL**

### A2. Create task from current line (command)

1. In `Regression.md`, type a plain line: `- [ ] Created via command`
2. Place your cursor on that line
3. Run command: **Syncist: Create task from current line**
4. **Expected**: The line gets `#todoist` and `<!-- todoist-id:XXXX -->` appended
5. Verify the task appears in Todoist
- [ ] **PASS** / **FAIL**

### A3. Complete task in Obsidian -> syncs to Todoist

1. In Obsidian, check the checkbox for "Regression test basic" (change `[ ]` to `[x]`)
2. Run **Syncist: Sync now**
3. **Expected**: The task is marked complete in Todoist
- [ ] **PASS** / **FAIL**

### A4. Complete task in Todoist -> syncs to Obsidian

1. Create a new task: `- [ ] Complete from Todoist #todoist`
2. Sync to create it in Todoist
3. Open Todoist and complete this task
4. Run **Syncist: Sync now** in Obsidian
5. **Expected**: The checkbox changes to `[x]` in Obsidian
- [ ] **PASS** / **FAIL**

### A5. Priority emojis

1. Create: `- [ ] High prio task #todoist ⏫`
2. Create: `- [ ] Medium prio task #todoist 🔼`
3. Create: `- [ ] Low prio task #todoist 🔽`
4. Sync
5. **Expected**: Each task appears in Todoist with the correct priority (p1, p2, p3)
- [ ] **PASS** / **FAIL**

### A6. Due date sync

1. Create: `- [ ] Due date task #todoist 📅 2026-12-25`
2. Sync
3. **Expected**: Task in Todoist has due date December 25, 2026
- [ ] **PASS** / **FAIL**

### A7. Untagged tasks are ignored

1. Create: `- [ ] This should NOT sync to Todoist`
2. Sync
3. **Expected**: This task does NOT appear in Todoist. No `todoist-id` comment added.
- [ ] **PASS** / **FAIL**

### A8. Status bar

1. Check the Obsidian status bar (bottom of the window)
2. **Expected**: Shows "Todoist: N tasks" where N matches the number of synced tasks
3. During sync, it should briefly show "Todoist: Syncing..."
- [ ] **PASS** / **FAIL**

### A9. Settings page

1. Open plugin settings (Settings -> Syncist)
2. **Expected**: All settings are visible: API token, sync tag, default project dropdown, sync interval, conflict resolution
3. Click "Verify" on the API token -- should say "API token is valid!"
- [ ] **PASS** / **FAIL**

---

## Part B: Feature 1 - Subtasks

### B1. Create parent with subtasks (tag inheritance)

1. In a new note `Subtasks.md`, type:
   ```
   - [ ] Grocery shopping #todoist
     - [ ] Milk
     - [ ] Bread
     - [ ] Eggs
   ```
2. Run **Syncist: Sync now**
3. **Expected**:
   - The parent gets `<!-- todoist-id:XXXX -->`
   - Each subtask also gets `<!-- todoist-id:YYYY -->`
   - Subtasks do NOT get `#todoist` added
   - In Todoist, "Milk", "Bread", "Eggs" appear as subtasks of "Grocery shopping"
- [ ] **PASS** / **FAIL**

### B2. Add a new subtask after initial sync

1. Under "Grocery shopping", add a new indented line:
   ```
     - [ ] Butter
   ```
2. Sync
3. **Expected**: "Butter" is created as a subtask of "Grocery shopping" in Todoist, with a `todoist-id` comment added
- [ ] **PASS** / **FAIL**

### B3. Complete a subtask in Obsidian

1. Check off "Milk" in Obsidian (`[x]`)
2. Sync
3. **Expected**: "Milk" is completed in Todoist, but parent "Grocery shopping" remains open
- [ ] **PASS** / **FAIL**

### B4. Complete a subtask in Todoist

1. Open Todoist and complete "Bread"
2. Sync in Obsidian
3. **Expected**: "Bread" changes to `[x]` in Obsidian
- [ ] **PASS** / **FAIL**

### B5. Deeply nested subtasks are not treated as description

1. Verify that the description field for the parent task in Todoist does NOT contain "Milk", "Bread", etc.
2. **Expected**: Subtask lines are not treated as description text
- [ ] **PASS** / **FAIL**

### B6. Standalone indented task without tagged parent is ignored

1. In `Subtasks.md`, add (not indented under a tagged parent):
   ```
   - [ ] Standalone parent (no tag)
     - [ ] Should not sync
   ```
2. Sync
3. **Expected**: Neither line gets a `todoist-id` -- they are not synced
- [ ] **PASS** / **FAIL**

---

## Part C: Feature 2 - Import Task from Todoist

### C1. Open the import modal

1. Create a new note `Import.md` and place your cursor on an empty line
2. Run command: **Syncist: Import task from Todoist**
3. **Expected**: A fuzzy search modal appears with a list of Todoist tasks
- [ ] **PASS** / **FAIL**

### C2. Search and filter

1. In the modal, type part of a task name that exists in Todoist
2. **Expected**: The list filters to show matching tasks
3. Verify each suggestion shows: content, project name, due date (if set), priority emoji (if set)
- [ ] **PASS** / **FAIL**

### C3. Import a task without subtasks

1. Select a task that has no subtasks
2. **Expected**:
   - A single task line is inserted at the cursor position with `#todoist` and `<!-- todoist-id:XXXX -->`
   - A notice appears: "Imported: [task content]"
3. Sync and verify the task stays in sync
- [ ] **PASS** / **FAIL**

### C4. Import a task with subtasks

1. In Todoist, create a task with 2-3 subtasks (if one doesn't already exist)
2. Run the import command again and select that parent task
3. **Expected**:
   - The parent task line is inserted with `#todoist` and `<!-- todoist-id:XXXX -->`
   - Subtask lines are inserted below, indented, each with `<!-- todoist-id:YYYY -->`
   - Subtask lines do NOT have `#todoist`
   - Notice shows: "Imported: [content] (+N subtasks)"
- [ ] **PASS** / **FAIL**

### C5. Import without API token

1. Temporarily clear the API token in settings
2. Run **Syncist: Import task from Todoist**
3. **Expected**: A notice appears saying to configure the API token
4. Restore the API token
- [ ] **PASS** / **FAIL**

### C6. Subtask count in modal

1. Open the import modal
2. Find a task that has subtasks
3. **Expected**: The suggestion shows "N subtasks" in the metadata line
- [ ] **PASS** / **FAIL**

---

## Part D: Feature 3 - Projects and Labels

### D1. Project metadata on imported/synced tasks

1. Import a task that belongs to a non-Inbox project
2. **Expected**: The imported line includes `📁 ProjectName`
- [ ] **PASS** / **FAIL**

### D2. Set project per-task via metadata

1. Create a task with a project name matching one of your Todoist projects:
   ```
   - [ ] Project test task #todoist 📁 YourProjectName
   ```
   (Replace `YourProjectName` with an actual Todoist project name)
2. Sync
3. **Expected**: The task is created in that specific project in Todoist (not in Inbox/default)
- [ ] **PASS** / **FAIL**

### D3. Invalid project name

1. Create: `- [ ] Bad project task #todoist 📁 NonExistentProject`
2. Sync
3. **Expected**: The task is created in the default project (Inbox), since the project name can't be resolved. No crash.
- [ ] **PASS** / **FAIL**

### D4. Label sync - Obsidian to Todoist

1. Create: `- [ ] Label test #todoist #work #urgent`
2. Sync
3. Open Todoist and check the task
4. **Expected**: The task has labels "work" and "urgent" in Todoist
- [ ] **PASS** / **FAIL**

### D5. Label sync - Todoist to Obsidian

1. In Todoist, add a label "review" to an existing synced task
2. Sync in Obsidian (with conflict resolution set to "Todoist wins")
3. **Expected**: The task line in Obsidian now includes `#review`
- [ ] **PASS** / **FAIL**

### D6. Project name synced back from Todoist

1. In Todoist, move a synced task to a different project
2. Sync in Obsidian (with "Todoist wins")
3. **Expected**: The `📁 ProjectName` metadata updates to the new project name
- [ ] **PASS** / **FAIL**

---

## Part E: Feature 4 - Query Blocks

### E1. Basic today filter

1. In a new note `Queries.md`, add:
   ````
   ```syncist
   filter: today
   ```
   ````
2. Switch to reading view (or just wait for the preview to render)
3. **Expected**: The block renders as a styled task list showing tasks due today. If none are due today, shows "No tasks match this filter."
- [ ] **PASS** / **FAIL**

### E2. Query block with tasks present

1. Create a task due today in Todoist (or use: `- [ ] Due today #todoist 📅 YYYY-MM-DD` with today's date, then sync)
2. Add or refresh the `filter: today` query block
3. **Expected**:
   - The task appears in the rendered list
   - Shows checkbox, content, due date, priority (if set), project name
   - The "Updated: HH:MM:SS" timestamp is shown at the bottom
- [ ] **PASS** / **FAIL**

### E3. Interactive checkbox in query block

1. In the rendered query block, click the checkbox next to a task to complete it
2. **Expected**:
   - A notice appears: "Completed: [task content]"
   - The task is completed in Todoist
3. Click the checkbox again to reopen
4. **Expected**: Notice says "Reopened: [task content]"
- [ ] **PASS** / **FAIL**

### E4. Refresh button

1. Click the "↻" refresh button in the query block header
2. **Expected**: The task list reloads and the "Updated" timestamp changes
- [ ] **PASS** / **FAIL**

### E5. Different filter types

Test each of these query blocks (create one block per filter):

1. `filter: overdue` -- shows overdue tasks (or "No tasks" if none)
2. `filter: p1` -- shows priority 1 tasks
3. `filter: @labelname` -- shows tasks with that label (use an existing label)
4. `filter: #ProjectName` -- shows tasks in that project (use an existing project)
5. **Expected**: Each renders the correct filtered set of tasks
- [ ] **PASS** / **FAIL**

### E6. Invalid / empty filter

1. Add a block with no filter:
   ````
   ```syncist
   something: wrong
   ```
   ````
2. **Expected**: Shows an error message: "Invalid syncist block. Use: filter: today"
- [ ] **PASS** / **FAIL**

### E7. Query block without API token

1. Temporarily clear the API token
2. Create a syncist block
3. **Expected**: Shows "Todoist API not configured. Add your token in settings."
4. Restore the token
- [ ] **PASS** / **FAIL**

### E8. Subtasks in query results

1. Use a filter that returns a parent task with subtasks (e.g., if "Grocery shopping" is due today)
2. **Expected**: Subtasks appear indented below their parent in the rendered block
- [ ] **PASS** / **FAIL**

---

## Part F: Edge Cases & Error Handling

### F1. Sync with no internet

1. Disconnect from the internet
2. Run **Syncist: Sync now**
3. **Expected**: A notice says sync failed. No crash. Status bar shows "Sync failed".
4. Reconnect and sync again -- should recover normally.
- [ ] **PASS** / **FAIL**

### F2. Multiple syncs in quick succession

1. Run **Syncist: Sync now** twice rapidly
2. **Expected**: The second sync is skipped with "Sync already in progress" (check console). No duplicate tasks.
- [ ] **PASS** / **FAIL**

### F3. Delete synced task in Obsidian

1. Delete the line for a synced task in Obsidian
2. Sync
3. **Expected**: The task is removed from sync state. It remains in Todoist (not deleted remotely). No error.
- [ ] **PASS** / **FAIL**

### F4. Task deleted in Todoist

1. In Todoist, delete a task that is synced to Obsidian
2. Sync in Obsidian
3. **Expected**: The Obsidian task is marked as completed (`[x]`). No crash.
- [ ] **PASS** / **FAIL**

### F5. Very long task content

1. Create: `- [ ] This is a very long task name that contains many words to test how the plugin handles long content strings in both Obsidian and Todoist without truncation or errors #todoist`
2. Sync
3. **Expected**: Task syncs correctly, content preserved in full
- [ ] **PASS** / **FAIL**

### F6. Special characters in task

1. Create: `- [ ] Special chars: quotes "hello" & ampersand <angle> #todoist`
2. Sync
3. **Expected**: Task created in Todoist with special characters preserved
- [ ] **PASS** / **FAIL**

---

## Test Summary

| Section | Tests | Passed | Failed |
|---------|-------|--------|--------|
| A. Regression | 9 | | |
| B. Subtasks | 6 | | |
| C. Import | 6 | | |
| D. Projects & Labels | 6 | | |
| E. Query Blocks | 8 | | |
| F. Edge Cases | 6 | | |
| **Total** | **41** | | |

**Tested by**: ___________________
**Date**: ___________________
**Plugin version**: 2.0.0
**Obsidian version**: ___________________
