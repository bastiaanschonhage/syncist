import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTaskLine,
  cleanTaskContent,
  buildTaskLine,
  addTodoistIdToLine,
  formatTaskId,
  PATTERNS,
} from '../src/task-parser';
import { ParsedObsidianTask, TodoistPriority } from '../src/types';

describe('Task Parser & ID Formats', () => {
  describe('PATTERNS.todoistId - Dual Format Matching', () => {
    it('matches legacy HTML comments', () => {
      const match = 'My task <!-- todoist-id:6hXf2w2M26FPQp2J -->'.match(PATTERNS.todoistId);
      assert.ok(match);
      const id = match[1] || match[2];
      assert.strictEqual(id, '6hXf2w2M26FPQp2J');
    });

    it('matches Obsidian block IDs', () => {
      const match = 'My task ^todoist-6hXf2w2M26FPQp2J'.match(PATTERNS.todoistId);
      assert.ok(match);
      const id = match[1] || match[2];
      assert.strictEqual(id, '6hXf2w2M26FPQp2J');
    });

    it('returns null when no ID is present', () => {
      const match = 'My task without any ID #todoist'.match(PATTERNS.todoistId);
      assert.strictEqual(match, null);
    });
  });

  describe('parseTaskLine', () => {
    it('parses a task line with legacy HTML comment', () => {
      const line = '- [ ] Buy groceries #todoist 📅 2026-09-30 ⏫ <!-- todoist-id:abc123XYZ -->';
      const task = parseTaskLine(line, 0, 'test.md', '#todoist', Date.now());

      assert.ok(task);
      assert.strictEqual(task.content, 'Buy groceries');
      assert.strictEqual(task.todoistId, 'abc123XYZ');
      assert.strictEqual(task.dueDate, '2026-09-30');
      assert.strictEqual(task.priority, TodoistPriority.MEDIUM);
      assert.strictEqual(task.isCompleted, false);
    });

    it('parses a task line with Obsidian block ID', () => {
      const line = '- [ ] Fix the marathon doc #todoist 📅 2026-09-30 🔺 ^todoist-xyz789ABC';
      const task = parseTaskLine(line, 1, 'test.md', '#todoist', Date.now());

      assert.ok(task);
      assert.strictEqual(task.content, 'Fix the marathon doc');
      assert.strictEqual(task.todoistId, 'xyz789ABC');
      assert.strictEqual(task.dueDate, '2026-09-30');
      assert.strictEqual(task.priority, TodoistPriority.HIGH);
    });

    it('returns null if syncTag is missing and required', () => {
      const line = '- [ ] Untagged task ^todoist-123';
      const task = parseTaskLine(line, 0, 'test.md', '#todoist', Date.now(), true);
      assert.strictEqual(task, null);
    });
  });

  describe('formatTaskId', () => {
    it('formats as comment when format is "comment"', () => {
      assert.strictEqual(formatTaskId('abc123', 'comment'), '<!-- todoist-id:abc123 -->');
    });

    it('formats as block ID when format is "block-id"', () => {
      assert.strictEqual(formatTaskId('abc123', 'block-id'), '^todoist-abc123');
    });

    it('defaults to comment when format is omitted', () => {
      assert.strictEqual(formatTaskId('abc123'), '<!-- todoist-id:abc123 -->');
    });
  });

  describe('cleanTaskContent', () => {
    it('strips both HTML comments and block IDs from task content', () => {
      const withComment = cleanTaskContent('Clean my room #todoist <!-- todoist-id:123 -->', '#todoist');
      assert.strictEqual(withComment, 'Clean my room');

      const withBlockId = cleanTaskContent('Clean my room #todoist ^todoist-123', '#todoist');
      assert.strictEqual(withBlockId, 'Clean my room');
    });

    it('strips tags, due dates, priorities, and projects', () => {
      const line = 'Finish report #todoist #work 📅 2026-10-01 ⏫ 📁 Projects ^todoist-999';
      const cleaned = cleanTaskContent(line, '#todoist');
      assert.strictEqual(cleaned, 'Finish report');
    });
  });

  describe('buildTaskLine', () => {
    const sampleTask: ParsedObsidianTask = {
      originalLine: '',
      lineNumber: 0,
      filePath: 'test.md',
      content: 'Walk the dog',
      isCompleted: false,
      todoistId: 'task123',
      parentId: null,
      indentLevel: 0,
      dueDate: '2026-09-25',
      priority: TodoistPriority.HIGH,
      labels: ['personal'],
      description: '',
      projectId: null,
      projectName: null,
      lastModified: Date.now(),
    };

    it('builds task line with HTML comment when idFormat is "comment"', () => {
      const line = buildTaskLine(sampleTask, '#todoist', 'comment');
      assert.strictEqual(line, '- [ ] Walk the dog #todoist #personal 🔺 📅 2026-09-25 <!-- todoist-id:task123 -->');
    });

    it('builds task line with Block ID when idFormat is "block-id"', () => {
      const line = buildTaskLine(sampleTask, '#todoist', 'block-id');
      assert.strictEqual(line, '- [ ] Walk the dog #todoist #personal 🔺 📅 2026-09-25 ^todoist-task123');
    });
  });

  describe('addTodoistIdToLine', () => {
    it('appends comment when idFormat is "comment"', () => {
      const line = '- [ ] Buy groceries #todoist';
      const updated = addTodoistIdToLine(line, 'id123', 'comment');
      assert.strictEqual(updated, '- [ ] Buy groceries #todoist <!-- todoist-id:id123 -->');
    });

    it('appends block ID when idFormat is "block-id"', () => {
      const line = '- [ ] Buy groceries #todoist';
      const updated = addTodoistIdToLine(line, 'id123', 'block-id');
      assert.strictEqual(updated, '- [ ] Buy groceries #todoist ^todoist-id123');
    });

    it('switches existing comment to block ID cleanly without duplicates', () => {
      const line = '- [ ] Buy groceries #todoist <!-- todoist-id:oldId -->';
      const updated = addTodoistIdToLine(line, 'newId', 'block-id');
      assert.strictEqual(updated, '- [ ] Buy groceries #todoist ^todoist-newId');
    });

    it('switches existing block ID to comment cleanly without duplicates', () => {
      const line = '- [ ] Buy groceries #todoist ^todoist-oldId';
      const updated = addTodoistIdToLine(line, 'newId', 'comment');
      assert.strictEqual(updated, '- [ ] Buy groceries #todoist <!-- todoist-id:newId -->');
    });

    it('preserves indentation properly', () => {
      const line = '\t\t- [ ] Subtask #todoist';
      const updated = addTodoistIdToLine(line, 'sub123', 'block-id');
      assert.strictEqual(updated, '\t\t- [ ] Subtask #todoist ^todoist-sub123');
    });
  });

  describe('Obsidian Tasks Plugin Interoperability', () => {
    // Tasks plugin's blockLinkRegex from its source code:
    const tasksBlockLinkRegex = / \^[a-zA-Z0-9-]+$/u;
    const tasksDueDateRegex = /📅\s*(\d{4}-\d{2}-\d{2})$/;

    it('allows Tasks plugin to strip block ID and successfully parse dates from end of line', () => {
      const line = '- [ ] Plan vacation #todoist 📅 2026-10-15 ^todoist-v12345';

      // 1. Tasks strips block link first:
      const blockMatch = line.match(tasksBlockLinkRegex);
      assert.ok(blockMatch);
      assert.strictEqual(blockMatch[0].trim(), '^todoist-v12345');

      const bodyWithoutBlock = line.replace(tasksBlockLinkRegex, '').trim();

      // 2. Tasks peels off due date from end of line:
      const dateMatch = bodyWithoutBlock.match(tasksDueDateRegex);
      assert.ok(dateMatch);
      assert.strictEqual(dateMatch[1], '2026-10-15');
    });

    it('confirms that trailing HTML comment prevents Tasks plugin from matching due date at end of line', () => {
      const lineWithComment = '- [ ] Plan vacation #todoist 📅 2026-10-15 <!-- todoist-id:v12345 -->';

      // Tasks checks for date at end of line ($):
      const dateMatch = lineWithComment.match(tasksDueDateRegex);
      // Because line ends with "-->", date at end of line DOES NOT MATCH:
      assert.strictEqual(dateMatch, null);
    });
  });
});
