# WYSIWYG Markdown Editing Plan

## Summary

Add a rich Markdown editing mode alongside the existing CodeMirror source editor. Use MDXEditor as the first implementation candidate, but put it behind a round-trip compatibility spike before integrating it into normal saves.

The Markdown files in Google Drive must remain the canonical data. The app must not adopt an editor-specific JSON or HTML format, and entering and cancelling edit mode must never rewrite a note. Frontmatter should remain byte-for-byte unchanged during rich editing, while unsupported documents should continue to open safely in the existing source editor.

This should be described in the UI as **Rich text** and **Markdown** editing rather than claiming that every Markdown construct can be edited invisibly. Markdown has multiple equivalent source representations, so any AST-based rich editor will normalize at least some body formatting when it serializes a genuine edit.

## Recommendation

Prototype [MDXEditor](https://mdxeditor.dev/editor/docs/overview) first.

It is the best fit for Web Notes because:

- It accepts and emits Markdown strings rather than requiring HTML or proprietary JSON as the saved format.
- It converts directly between MDAST and Lexical, which is close to the Unified/MDAST pipeline already used by the viewer and block tools.
- Its supported extension surface includes Markdown syntax extensions, MDAST import/export visitors, Lexical nodes, and React composer children. This is sufficient to implement wikilinks and rich-editor autocomplete without using private APIs. See [extending MDXEditor](https://mdxeditor.dev/editor/docs/extending-the-editor).
- It has built-in plugins for headings, nested ordered/unordered/check lists, links, GFM tables, blockquotes, thematic breaks, fenced code blocks, Markdown shortcuts, toolbars, and optional source/diff modes. See [basic formatting](https://mdxeditor.dev/editor/docs/basic-formatting), [tables](https://mdxeditor.dev/editor/docs/tables), and [code blocks](https://mdxeditor.dev/editor/docs/code-blocks).
- Its current package supports React 18 and 19, is MIT-licensed, and is actively published. At the time of this plan, npm lists `@mdxeditor/editor` 4.2.3. See the [package](https://www.npmjs.com/package/@mdxeditor/editor) and [repository](https://github.com/mdx-editor/editor).
- It provides `getMarkdown`, `setMarkdown`, `insertMarkdown`, focus control, error reporting, and a callback that identifies initial normalization. See the [methods](https://mdxeditor.dev/editor/api/interfaces/MDXEditorMethods) and [props](https://mdxeditor.dev/editor/api/interfaces/MDXEditorProps).

MDXEditor is not a drop-in replacement. Custom wikilink support, autocomplete, source-position behavior, styling, and strict save safeguards will still be application code. Its sizeable dependency graph also makes lazy loading important.

## Alternatives Considered

### Milkdown and Crepe

[Milkdown](https://milkdown.dev/docs/guide/architecture-overview) is the strongest fallback. It is MIT-licensed, built on ProseMirror and Remark, transforms Markdown through an extensible AST pipeline, and has first-class React integration. Its Crepe layer supplies a polished ready-made rich editor, while the lower layers allow a headless custom editor. The GFM preset includes tables, task lists, strikethrough, and footnotes. See [React integration](https://milkdown.dev/docs/recipes/react), [Crepe](https://milkdown.dev/docs/api/crepe), and the [GFM preset](https://milkdown.dev/docs/api/preset-gfm).

Milkdown should be tested if MDXEditor fails the compatibility gate. It may offer more control at the ProseMirror level, but integrating a custom schema, Web Notes-specific toolbars and suggestions, editor lifecycle, and source fallback would require more framework code. It also does not eliminate Markdown normalization.

### Tiptap

Tiptap is a mature, well-supported React/ProseMirror framework with strong extension APIs. Its open-source Markdown package now supports parse/serialize handlers and custom tokenizers, which could represent wikilinks. See [Markdown usage](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage) and [custom extension integration](https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension).

Do not select it for the first spike because the Markdown package is currently labelled beta. Building the complete editor UI and Markdown behavior from the headless framework would also be more work than starting with MDXEditor or Crepe.

### BlockNote

BlockNote has the most immediately Notion-like block UI and supports custom schemas. It is a poor fit for a vault whose canonical format is Markdown: its documentation explicitly calls Markdown import and export lossy and recommends BlockNote JSON for durable storage. See [format interoperability](https://www.blocknotejs.org/docs/foundations/supported-formats) and [Markdown export](https://www.blocknotejs.org/docs/features/export/markdown).

Do not use BlockNote unless Web Notes changes its storage model, which is outside the scope of this feature.

### Extending CodeMirror into a live-preview editor

Keeping the source document inside CodeMirror and selectively hiding syntax with decorations would offer the best byte preservation and cursor mapping. It would not be a straightforward use of an existing WYSIWYG component, however. Correct editing around hidden delimiters, nested lists, tables, widgets, IME composition, selections, copy/paste, and undo would effectively create a custom editor.

Keep this as a fallback only if both MDXEditor and Milkdown fail the round-trip gate and source fidelity is considered more important than delivery cost.

## Product Behavior

- Keep one Edit action, opening the user's preferred mode. Default existing users to Markdown during the staged rollout; make Rich text the default only after the compatibility corpus passes.
- Add a compact `Rich text | Markdown` mode switch to the editor toolbar and remember the preference locally.
- Continue to expose the existing CodeMirror editor as a permanent escape hatch. It remains the only mode for a document that the rich parser cannot safely represent.
- Clicking rendered note text should continue to open Markdown mode at the exact source offset. Mapping a Markdown source offset into a normalized Lexical tree is possible but disproportionately complex and less exact. A later enhancement may open the nearest rich-text block, but it should not replace the current exact behavior.
- The ordinary Edit button may open Rich text mode and focus the beginning or last remembered editor selection.
- Keep the note header, save/cancel controls, frontmatter properties, remote-update warning, auth recovery, and optimistic save behavior unchanged.
- Rich mode edits the note body. Frontmatter stays outside the rich editor and remains visible through the existing properties panel.
- If a note is incompatible, show a concise notice such as `This note contains Markdown that rich editing cannot safely preserve. Markdown mode is being used.` Do not make the note read-only.
- Do not add auto-save. Save, Cancel, and Ctrl/Cmd+S retain their current meanings.

## Markdown Safety and Round-Trip Policy

### Split the source before rich editing

Reuse `parseMarkdownWithFrontmatter`, but extend its result with exact source slices:

```ts
type MarkdownEnvelope = {
  frontmatterSource: string;
  bodySource: string;
  lineEnding: '\n' | '\r\n';
  hasFinalNewline: boolean;
};
```

Pass only `bodySource` to MDXEditor. When rich content changes, normalize its line endings to the original style and recombine it with `frontmatterSource`. Do not enable MDXEditor's frontmatter editor in the first release; the existing raw mode is the safe way to edit arbitrary YAML.

### Compatibility gate

Before rich mode opens:

1. Parse the body with the exact MDXEditor plugin set used by production.
2. Serialize it immediately without user edits.
3. Parse both the original and serialized Markdown using the Web Notes MDAST pipeline.
4. Strip positions and known representation-only differences, then compare the semantic trees.
5. Verify custom wikilink targets and aliases, code fence values/languages, link destinations, task states, table cells, and soft line breaks explicitly.
6. If parsing errors or the semantic trees differ, select Markdown mode and report the unsupported construct in development logging.

This gate prevents content loss, not textual normalization. For a compatible note, a real rich-text edit may canonicalize bullet characters, emphasis delimiters, spacing, wrapping, or blank lines elsewhere in the body.

### Do not dirty the draft on initialization

MDXEditor can emit normalized Markdown during initial import. Ignore `onChange` calls marked `initialMarkdownNormalize` and keep the original draft until a user transaction occurs. Entering rich mode, switching modes without editing, and cancelling must therefore leave the original source identical.

After the first user edit, update the shared draft with the serialized body joined to the original envelope. On the first rich save, consider a one-time unobtrusive warning that Markdown formatting may be normalized, with a setting to suppress it.

### Unsupported syntax

Start with a strict allow-list. Raw HTML, unknown MDAST nodes, malformed tables, unsupported directives, reference-definition patterns that do not round-trip, and future syntax extensions should force Markdown mode until they have fixtures and visitors.

Later, unsupported block constructs can be represented as opaque read-only raw-Markdown blocks, but that should not be required for the initial release.

## Component Architecture

Introduce an editor shell rather than expanding `MarkdownViewer` further:

```text
MarkdownViewer
  NoteEditorShell
    NoteEditorToolbar
    RichMarkdownEditor     (lazy-loaded MDXEditor)
    MarkdownEditor         (existing CodeMirror)
```

Suggested interfaces:

```ts
type NoteEditorMode = 'rich' | 'source';

type NoteEditorProps = {
  initialCursorOffset?: number | null;
  notes: VaultNode[];
  onChange(markdown: string): void;
  onSave(): void;
  recentNotes: VaultNode[];
  value: string;
};

type RichMarkdownCompatibility =
  | { compatible: true; envelope: MarkdownEnvelope }
  | { compatible: false; reason: string };
```

- `NoteEditorShell` owns mode switching, envelope recombination, compatibility state, and the shared Markdown draft.
- `MarkdownEditor` remains a focused CodeMirror adapter and receives the complete note source.
- `RichMarkdownEditor` receives only the body and reports body Markdown.
- Remount editors using the selected Drive file ID. Do not drive MDXEditor by passing every `onChange` value back through its initial `markdown` prop; its documentation treats that prop as initial content. Use `setMarkdown` only for safe external replacements.
- Keep remote-update conflict decisions in `MarkdownViewer`. If Drive content changes while either editor has a local draft, preserve the draft and show the existing warning.
- Lazy-load `RichMarkdownEditor` with `React.lazy` so users who view notes or use source mode do not download Lexical, Radix, nested CodeMirror support, and all rich-editor plugins up front.

## MDXEditor Configuration

Enable only the required plugins:

- `headingsPlugin`
- `quotePlugin`
- `listsPlugin`
- `linkPlugin` and `linkDialogPlugin`
- `tablePlugin`
- `thematicBreakPlugin`
- `codeBlockPlugin` with a small CodeMirror or plain-text fallback for every fence language
- `markdownShortcutPlugin`, placed after the syntax plugins
- a custom toolbar
- a Web Notes wikilink plugin
- Web Notes autocomplete and keyboard plugins

Do not enable JSX/MDX, images, directives, frontmatter editing, diff/source mode, or language auto-loading unless a later requirement needs them. The existing CodeMirror editor already provides the source mode and uses the app's tested autocomplete.

Build the toolbar from MDXEditor's supported primitives but style it to match Web Notes. Include:

- Undo and redo.
- Block style/headings.
- Bold, italic, and strikethrough. Do not add underline because it has no standard Markdown representation.
- Checklist, bulleted list, and numbered list.
- Markdown link creation.
- Inline code, code block, blockquote, table, and thematic break where supported.
- Rich text/Markdown mode switch in `NoteEditorShell` rather than inside editor-specific state.

Register a high-priority Lexical command for Ctrl/Cmd+S that invokes the existing save callback. Preserve standard Ctrl/Cmd+B and Ctrl/Cmd+I behavior and add the existing Ctrl/Cmd+L checklist command if it does not conflict with the browser/editor command pipeline.

## Wikilinks and Autocomplete

Create a first-class wikilink syntax extension; do not hide wikilinks behind temporary ordinary URLs during serialization.

The plugin should contain:

1. A micromark/MDAST syntax extension for `[[target]]` and `[[target|alias]]`.
2. A custom Lexical inline node containing `target` and optional `alias`.
3. MDAST-to-Lexical and Lexical-to-MDAST visitors registered through MDXEditor's public plugin API.
4. A React node view styled like the viewer's existing/missing wikilinks.
5. Tests proving exact target and alias round trips, including spaces, nested paths, duplicate filenames, escaped characters, and missing targets.

For suggestions, extract the current search/detection code into editor-neutral functions. Add thin adapters:

- Keep the existing CodeMirror completion sources for Markdown mode.
- Add a Lexical typeahead menu for `[[...` using the same note ranking, recent-note limit, labels, and insertion rules.
- Add a second Lexical typeahead menu for `:emoji` using the existing `emojilib` data and colon/space rules.
- Render overlays into `document.body` or a dedicated app overlay root so they cannot be clipped by the scrolling editor pane.

## Interaction with Existing Features

- View-mode task toggling and Markdown block dragging remain unchanged.
- Rich editor checkboxes change the draft only; they are saved with the rest of the edit rather than issuing the viewer's immediate task mutation.
- View-mode click-to-edit continues to enter source mode at the mapped UTF-16 offset.
- Note changes still use the single mutation lock and `updateDriveFileText` flow.
- Saving still updates IndexedDB immediately, returns optimistically to view mode, and confirms the cache timestamp after Drive responds.
- Saving failures reopen the same editor mode with its complete draft preserved.
- Note navigation during an in-flight save retains the existing rule that an old request must not roll back the newly selected note.
- Offline notes remain read-only in both editor modes.
- The rich editor should use the same content width, typography, list spacing, dark theme tokens, selection color, and scroll container as view mode where practical.

## Implementation Phases

### 1. Compatibility spike

- Add MDXEditor on an isolated development route or test harness, not the production save path.
- Build a representative fixture corpus from synthetic examples and sanitized real notes.
- Measure initial and lazy-loaded bundle sizes.
- Test React 19, Vite production builds, dark mode, mobile viewport behavior, long notes, large nested lists, tables, code fences, paste, undo/redo, and browser IME composition.
- Implement a minimal wikilink import/export visitor before making the library decision; custom syntax is a release blocker.
- Compare MDXEditor with Milkdown on any fixture MDXEditor cannot preserve.

Proceed with MDXEditor only if all required semantic fixtures round-trip, wikilinks work through public APIs, and no common note is silently dropped or substantially reinterpreted.

### 2. Editor shell and safe rollout

- Extract `NoteEditorShell` and keep source mode behavior unchanged.
- Add envelope parsing, compatibility checks, mode preference, lazy loading, an error boundary, and automatic source fallback.
- Ignore initial-normalization events and prove no-op/cancel byte identity.
- Initially expose Rich text as an opt-in toggle.

### 3. Core rich editing

- Enable paragraphs, headings, emphasis, strikethrough, links, nested lists, checklists, quotes, tables, thematic breaks, inline code, and fenced code.
- Add the Web Notes toolbar, Ctrl/Cmd+S integration, focus handling, and responsive/dark styling.
- Integrate with the existing draft, conflict, optimistic save, auth retry, and error flows.

### 4. Web Notes syntax and suggestions

- Complete wikilink parsing, rendering, serialization, missing-note styling, and note suggestions.
- Add emoji suggestions.
- Share ranking and completion model logic between CodeMirror and Lexical adapters.

### 5. Hardening and default decision

- Add browser-level editor tests and exercise a larger vault corpus.
- Add telemetry-free development diagnostics for automatic source fallbacks and normalization diffs.
- Fix accessibility and mobile issues.
- Make Rich text the default only if compatibility results are strong; otherwise retain it as an opt-in mode for compatible notes.

## Test Plan

### Round-trip fixtures

Cover:

- Empty notes and notes containing only frontmatter.
- Arbitrary YAML, comments, arrays, nested objects, `---` inside strings, LF/CRLF, and final-newline variants.
- Soft line breaks, hard breaks, blank-line runs, escaped punctuation, entities, emoji, and Unicode combining characters.
- All heading levels, bold/italic nesting, strikethrough, inline code, blockquotes, thematic breaks, and normal links.
- Wikilinks with and without aliases, missing notes, duplicate filenames, spaces, headings, and unusual characters.
- Ordered, unordered, mixed, nested, tight, and loose lists; checklists at multiple depths.
- GFM tables including alignment and escaped pipes.
- Fenced code with backtick and tilde fences, differing fence lengths, unknown languages, and metadata.
- Reference links, raw HTML, malformed Markdown, and every intentionally unsupported construct.

Assert both semantic equality and the expected normalization diff. Assert exact source equality when the editor is opened and cancelled without a user transaction.

### Component and integration tests

- Mode preference, compatibility fallback, lazy loading, loading failure, and error recovery.
- Switching source to rich and rich to source without losing the current draft.
- Save, Ctrl/Cmd+S, cancel, remote-update warning, expired-auth reconnection, offline disabling, failed-save draft recovery, and navigation during save.
- Toolbar state and commands for formatting, list types, checklists, links, tables, and code.
- Wikilink and emoji suggestion filtering, keyboard navigation, mouse selection, dismissal, and overlay positioning.
- Initial focus, editor selection, scrolling, copy/paste, undo/redo, and IME composition.
- Light/dark themes, narrow viewports, keyboard-only use, screen-reader labels, focus visibility, and reduced motion.

Add Playwright coverage for `contenteditable` behavior that jsdom cannot simulate reliably. Continue running Vitest, lint, the production build, and whitespace checks.

## Risks and Decisions

- **Source normalization is unavoidable:** AST-based WYSIWYG editors serialize a document model rather than patching original byte ranges. Preserve frontmatter and file envelope exactly, prevent no-op rewrites, verify semantic equivalence, and retain source mode.
- **Custom syntax is the main technical gate:** Wikilinks must be genuine import/export nodes before production integration. A preprocessing placeholder scheme is not acceptable because it is vulnerable to collisions and accidental rewriting.
- **Bundle size will increase:** MDXEditor includes Lexical, Radix components, Markdown tooling, and CodeMirror-related dependencies. Lazy loading and a minimal plugin set are required. The current main bundle already produces a size warning.
- **Two editors increase maintenance:** Keep application behavior in `NoteEditorShell` and pure Markdown helpers. Editor-specific code should be adapters, not separate save or synchronization implementations.
- **Exact click-to-edit remains source-only initially:** Rich cursor placement would need durable mappings between source offsets and a normalized Lexical tree. Keeping the existing source behavior avoids degrading a working feature.
- **Library upgrades need corpus testing:** Pin the selected editor to a controlled compatible range and run the full round-trip corpus before dependency upgrades, because parser and serializer changes can affect saved Markdown.

## Out of Scope

- Changing Google Drive storage from Markdown to JSON, HTML, or MDX.
- Collaborative real-time editing.
- Auto-save.
- Arbitrary fonts, colors, alignment, page layout, or other formatting without standard Markdown representations.
- Editing frontmatter through the rich editor in the first release.
- Replacing view-mode rendering or block drag-and-drop with the rich editor.
- Exact source-offset-to-Lexical cursor placement in the first release.

