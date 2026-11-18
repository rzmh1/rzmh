import { EditorState } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  keymap,
  drawSelection,
} from "@codemirror/view";
import {
  history,
  historyKeymap,
  defaultKeymap,
  undo,
  redo,
} from "@codemirror/commands";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
export function createEditor(parent, language, code, change) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        search(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        syntaxHighlighting(defaultHighlightStyle),
        { html, css, js: javascript }[language](),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) change?.(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": {
            fontSize: "13px",
            height: "360px",
            background: "var(--surface)",
            color: "var(--text)",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "monospace",
            direction: "ltr",
          },
          ".cm-gutters": {
            background: "var(--soft)",
            borderColor: "var(--border)",
            color: "var(--muted)",
          },
          ".cm-content": { caretColor: "var(--purple)" },
          ".cm-activeLine": { background: "#7460d40c" },
          ".cm-activeLineGutter": { background: "var(--purple-light)" },
          ".cm-searchMatch": { background: "#d9bb6750" },
        }),
      ],
    }),
  });
  return {
    value: () => view.state.doc.toString(),
    set: (code) =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: code },
      }),
    undo: () => undo(view),
    redo: () => redo(view),
    search: () => openSearchPanel(view),
    destroy: () => view.destroy(),
  };
}
