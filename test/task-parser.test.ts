import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTaskLine,
  cleanTaskContent,
  PATTERNS,
} from '../src/task-parser';
import { TodoistPriority } from '../src/types';

describe('Dataview Metadata & Title Cleaning', () => {
  describe('PATTERNS.dataviewDueDate & dataviewScheduledDate', () => {
    it('matches [due:: YYYY-MM-DD]', () => {
      const match = 'Task [due:: 2026-10-15]'.match(PATTERNS.dataviewDueDate);
      assert.ok(match);
      assert.strictEqual(match[1], '2026-10-15');
    });

    it('matches [scheduled:: YYYY-MM-DD]', () => {
      const match = 'Task [scheduled:: 2026-10-20]'.match(PATTERNS.dataviewScheduledDate);
      assert.ok(match);
      assert.strictEqual(match[1], '2026-10-20');
    });
  });

  describe('PATTERNS.dataviewPriority', () => {
    it('matches [priority:: <level>]', () => {
      const match = 'Task [priority:: high]'.match(PATTERNS.dataviewPriority);
      assert.ok(match);
      assert.strictEqual(match[1].trim(), 'high');
    });
  });

  describe('parseTaskLine with Dataview metadata', () => {
    it('extracts due date from [due:: YYYY-MM-DD]', () => {
      const line = '- [ ] Buy groceries #todoist [due:: 2026-10-01] <!-- todoist-id:abc123 -->';
      const task = parseTaskLine(line, 0, 'test.md', '#todoist', Date.now());

      assert.ok(task);
      assert.strictEqual(task.content, 'Buy groceries');
      assert.strictEqual(task.dueDate, '2026-10-01');
      assert.strictEqual(task.todoistId, 'abc123');
    });

    it('extracts due date from [scheduled:: YYYY-MM-DD] when due is absent', () => {
      const line = '- [ ] Plan vacation #todoist [scheduled:: 2026-11-15] <!-- todoist-id:abc456 -->';
      const task = parseTaskLine(line, 0, 'test.md', '#todoist', Date.now());

      assert.ok(task);
      assert.strictEqual(task.content, 'Plan vacation');
      assert.strictEqual(task.dueDate, '2026-11-15');
    });

    it('maps Dataview priorities correctly', () => {
      const highestLine = '- [ ] Urgent fix #todoist [priority:: highest] <!-- todoist-id:1 -->';
      assert.strictEqual(parseTaskLine(highestLine, 0, 'test.md', '#todoist', Date.now())?.priority, TodoistPriority.HIGH);

      const highLine = '- [ ] Important doc #todoist [priority:: high] <!-- todoist-id:2 -->';
      assert.strictEqual(parseTaskLine(highLine, 0, 'test.md', '#todoist', Date.now())?.priority, TodoistPriority.MEDIUM);

      const medLine = '- [ ] Review PR #todoist [priority:: medium] <!-- todoist-id:3 -->';
      assert.strictEqual(parseTaskLine(medLine, 0, 'test.md', '#todoist', Date.now())?.priority, TodoistPriority.LOW);

      const lowLine = '- [ ] Optional read #todoist [priority:: low] <!-- todoist-id:4 -->';
      assert.strictEqual(parseTaskLine(lowLine, 0, 'test.md', '#todoist', Date.now())?.priority, TodoistPriority.NONE);
    });
  });

  describe('cleanTaskContent with Dataview metadata', () => {
    it('strips all [field:: value] inline bracket fields from task title', () => {
      const line = 'Fold my clothes #todoist [created:: 2026-09-16] [scheduled:: 2026-09-21] [priority:: high] <!-- todoist-id:789 -->';
      const cleaned = cleanTaskContent(line, '#todoist');
      assert.strictEqual(cleaned, 'Fold my clothes');
    });

    it('handles mixed Dataview and Tasks plugin syntax cleanly', () => {
      const line = 'Refactor codebase #todoist [created:: 2026-09-16] 📅 2026-09-30 ⏫ <!-- todoist-id:refactor1 -->';
      const cleaned = cleanTaskContent(line, '#todoist');
      assert.strictEqual(cleaned, 'Refactor codebase');
    });
  });
});
