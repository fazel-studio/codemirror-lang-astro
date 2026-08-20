# Changelog

All notable changes to this project will be documented in this file.

## Unreleased (hardening fixes after 0.2.0)

### Fixed

- **Code folding now works for HTML elements, comments and the frontmatter
  region.** The HTML parse is now the top-level parse (mirroring
  `codemirror-lang-svelte`): previously the whole markup sat inside a nested
  subtree below the `Program` grammar rule, and CodeMirror's fold gutter only
  reads node props from the outer tree, so no fold markers ever appeared.
  The frontmatter is masked into a same-length HTML comment (`---` + next
  whitespace char become `<!--`, the closing `---` becomes `-->`) whose real
  text still reads `--- ... ---`, which the mixed pass recognises to mount
  the TypeScript parser over its inner content. The frontmatter (Comment)
  and every Element in the outer tree are foldable via `foldNodeProp`.
- **`MixedParse` now satisfies `LRLanguage.define`.** The mask-based parser
  extends `@lezer/common`'s `Parser`, which has no `configure` method, so
  language construction crashed after the top-level-parse change; the parser
  now implements `configure()` (safe to be a no-op — all relevant tree props
  are applied inside `createParse`).

- **`>` / `"` / newlines inside `{ ... }` expressions no longer corrupt the
  HTML parse.** Attribute expressions like `prop={x > 5 && y}` or
  `prop={`a "${b}"`}` used to truncate the surrounding tag because
  `@lezer/html` ended `UnquotedAttributeValue` at the first offending
  character. The markup text is now scanned for balanced braces
  (string-, comment-, template-literal- and regex-literal-aware) and masked
  before the HTML parse; the JSX parser is then mounted over the real,
  unmasked expression ranges via `parseMixed`.
- **Multiple sibling expressions** (`{a} and {b}`) **are all parsed** — the
  mask keeps both `{...}` ranges intact and later ones no longer collapse to
  `Text` via the `checkCover` partial-cover path.
- **Regex literals containing braces** (`{/}/.test(x)}`) no longer end the
  expression scan early — `/` is lexed with a regex-context heuristic.
- **`<script lang="ts">` / `<script lang="tsx">`** contents are parsed with
  the TypeScript / TSX parsers (plain JS remains the default; `type` is
  honoured too), and `<style>` contents are now parsed as CSS.
- **Quoted attribute values** (`title="{name}"`) now get their expressions
  parsed like unquoted ones.
- **Comments toggling / `wordChars` now work in the markup region**:
  `languageData` (HTML comment tokens `<!-- -->`, `-`/`_`) is stamped on the
  mounted HTML tree, and JS comment tokens on `{ ... }` overlay trees, so
  `EditorState.languageDataAt` returns the right data everywhere.
- **Frontmatter fences tolerate trailing whitespace** (`---   ` open and
  close) **and a leading UTF-8 BOM** (the BOM is consumed by the opening
  fence tokenizer instead of producing an error or disabling frontmatter
  parsing).
- Removed the duplicated `javascript().support` in `astro()` (TS + JSX +
  CSS support only).

## 0.2.0 (2026-08-20)

### Added / Changed

- **Phase B: Full JSX-in-expression parsing.**  
  `{ ... }` expressions in markup now use the **JSX dialect** of the
  JavaScript parser instead of plain JavaScript. This means Astro
  expressions that embed markup elements are parsed and highlighted
  correctly:
  - `{condition && <p>{title}</p>}` — `<p>` is a `JSXElement`; `title`
    inside is a `JSXExpressionContainer` (JS identifier), highlighted by
    the JS theme colours.
  - `{items.map(item => <li class="x">{item}</li>)}` — the `{item}`
    inside `<li>` is a `JSXExpressionContainer`; `item` resolves as a
    JS `VariableName`.
  - `{flag ? <Yes /> : <No />}` — both branches parse as
    `JSXSelfClosingElement` with `JSXIdentifier`.
  - Self-closing components inside expressions: `{ok && <MyComp />}`.

- **Cross-node expression detection** (`findElementExpressions`).  
  When `@lezer/html` splits an Astro expression across multiple HTML
  child nodes (text fragment + sub-elements), the new helper reads the
  raw document text across node boundaries to locate the matching `{`…`}`
  pair and mounts the JSX parser over the full expression range.

- **Test suite expanded to 20 passing cases** (was 15).  
  Five new Phase B tests covering conditional expressions, `map` with
  nested JSX, self-closing components, ternary branches, and a
  regression check for plain attribute-value expressions.

### Roadmap (v0.3+)

- Contextual autocomplete for Astro component props.
- Astro-specific linting / diagnostics.
- Snippet library (`astro:head`, etc.).
- Dedicated grammar nodes for Astro directives (`client:load`, `is:inline`, …).

## 0.1.0 (2026-08-20)

Initial release.

### Added

- `astro()` language support for CodeMirror 6, ready to use with any editor
  setup (`new EditorView({ extensions: [basicSetup, astro()] })`).
- Lezer grammar (`src/astro.grammar`) for the Astro frontmatter fence structure,
  with a top-level `Program -> Frontmatter? Markup` layout.
- Mixed-language parsing:
  - Frontmatter (`--- ... ---`) parsed with the TypeScript parser from
    `@codemirror/lang-javascript`.
  - Markup region parsed with the official `@lezer/html` parser.
  - `{ ... }` expressions inside markup (text children and unquoted attribute
    values) parsed with the JavaScript parser, including string/comment-aware
    brace matching.
- Syntax highlighting via standard `@lezer/highlight` tags (compatible with all
  CodeMirror 6 themes):
  - `---` fences as `processingInstruction`.
  - PascalCase component names as `typeName` (distinct from native HTML tags).
- Indentation and code folding support for the frontmatter block.
- ESM + CJS builds with type declarations (`dist/`), `sideEffects: false`,
  standard `exports` map.

### Roadmap (v0.2+)

- Recursive parsing of JSX-like markup inside `{ ... }` expressions (e.g.
  `{cond && <p>...</p>}`) via re-nesting into the markup parser.
- Contextual autocomplete for Astro component props.
- Astro-specific linting/diagnostics.
- Snippet library (`astro:head`, etc.).
- Dedicated grammar nodes for Astro directives (`client:load`, `is:inline`, ...).
