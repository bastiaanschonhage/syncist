import { Extension, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { findShorthandSpans, parseTasksFromContent } from './task-parser';
import { TodoistSyncSettings } from './types';

/**
 * Editor extension that highlights shorthand (p1, today, dd/mm, …) that the
 * next sync will convert, with its meaning as a tooltip.
 */
export function shorthandHighlighter(getSettings: () => TodoistSyncSettings): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private settingsKey: string;

      constructor(view: EditorView) {
        this.settingsKey = currentSettingsKey(getSettings());
        this.decorations = buildDecorations(view, getSettings());
      }

      update(update: ViewUpdate): void {
        const settingsKey = currentSettingsKey(getSettings());
        if (update.docChanged || settingsKey !== this.settingsKey) {
          this.settingsKey = settingsKey;
          this.decorations = buildDecorations(update.view, getSettings());
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
}

function currentSettingsKey(settings: TodoistSyncSettings): string {
  return `${settings.parseShorthand}|${settings.syncTag}`;
}

function buildDecorations(view: EditorView, settings: TodoistSyncSettings): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  if (!settings.parseShorthand) return builder.finish();

  // Parse the whole note so untagged subtasks of a synced parent are included
  const doc = view.state.doc;
  const tasks = parseTasksFromContent(doc.toString(), '', settings.syncTag, 0);
  for (const task of tasks) {
    const line = doc.line(task.lineNumber + 1);
    for (const span of findShorthandSpans(line.text)) {
      builder.add(
        line.from + span.start,
        line.from + span.end,
        Decoration.mark({
          class: 'syncist-shorthand',
          attributes: { title: `Syncist: ${span.label}` },
        })
      );
    }
  }
  return builder.finish();
}
