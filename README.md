# @fazelstudio/codemirror-lang-astro

[![NPM version](https://img.shields.io/npm/v/@fazelstudio/codemirror-lang-astro.svg)](https://www.npmjs.com/package/@fazelstudio/codemirror-lang-astro)
[![License](https://img.shields.io/npm/l/@fazelstudio/codemirror-lang-astro.svg)](https://github.com/fazelllyyy/codemirror-lang-astro/blob/main/LICENSE)

Astro (`.astro`) language support for the [CodeMirror 6](https://codemirror.net/) code editor.

Provides syntax highlighting, code folding, bracket matching, and mixed-language parsing for embedded TypeScript, JSX, and CSS.

## Installation

```bash
npm install @fazelstudio/codemirror-lang-astro
# or
bun add @fazelstudio/codemirror-lang-astro
# or
yarn add @fazelstudio/codemirror-lang-astro
```

## Quick Start

```ts
import { EditorView, basicSetup } from "codemirror"
import { astro } from "@fazelstudio/codemirror-lang-astro"

const editor = new EditorView({
  parent: document.body,
  doc: `---
const title = "Hello"
---
<h1>{title}</h1>`,
  extensions: [
    basicSetup,  // includes foldGutter, lineNumbers, syntaxHighlighting, etc.
    astro(),
  ],
})
```

> **Note:** `basicSetup` from the `codemirror` package already includes `foldGutter()`, `lineNumbers()`, `syntaxHighlighting(defaultHighlightStyle)`, and other UI extensions. You don't need to add them separately.

## What's Included

| Feature | Description |
|---------|-------------|
| **Frontmatter parsing** | `--- ... ---` regions parsed as TypeScript |
| **Expression parsing** | `{ ... }` in markup parsed as JSX/TSX |
| **Script parsing** | `<script>` parsed as JavaScript/TypeScript (respects `lang` attribute) |
| **Style parsing** | `<style>` parsed as CSS |
| **Component highlighting** | PascalCase tags (`<Layout>`) highlighted as `typeName` |
| **Code folding** | Fold ranges for HTML elements, comments, and frontmatter |
| **Bracket matching** | Matches `<tag>` / `</tag>` pairs |
| **Indentation** | Automatic indentation for HTML elements |

## API

### `astro(config?) → LanguageSupport`

Main entry point. Returns a `LanguageSupport` instance ready to use with CodeMirror.

```ts
import { astro } from "@fazelstudio/codemirror-lang-astro"

// Simple — just pass it to extensions
const extensions = [astro()]

// With custom extensions
const extensions = [
  astro({
    extraExtensions: [
      myCustomHighlightStyle,
      myCustomExtension,
    ],
  }),
]
```

### `astroLanguage: Language`

The raw language instance. Use this when you need direct access to the language for advanced configurations.

```ts
import { astroLanguage } from "@fazelstudio/codemirror-lang-astro"

// Access language data
const commentTokens = astroLanguage.data.of().commentTokens
```

### `mixedParser: Parser`

The underlying mixed parser. Exported for advanced use cases like custom tree queries or highlight styles.

```ts
import { mixedParser } from "@fazelstudio/codemirror-lang-astro"

// Parse a document and inspect the tree
const tree = mixedParser.parse(sourceCode)
```

### `AstroConfig`

Configuration interface for the `astro()` function.

```ts
interface AstroConfig {
  extraExtensions?: Extension[]
}
```

## Configuration Examples

### With `basicSetup` (Recommended for beginners)

```ts
import { EditorView, basicSetup } from "codemirror"
import { astro } from "@fazelstudio/codemirror-lang-astro"

new EditorView({
  extensions: [basicSetup, astro()],
  parent: document.body,
})
```

### Custom Setup (Full control)

```ts
import { EditorView } from "@codemirror/view"
import { EditorState } from "@codemirror/state"
import {
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from "@codemirror/view"
import {
  foldGutter,
  foldKeymap,
  indentOnInput,
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle,
  indentUnit,
} from "@codemirror/language"
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands"
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"
import { astro } from "@fazelstudio/codemirror-lang-astro"

const myExtensions = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  indentUnit.of("  "),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...historyKeymap,
    ...foldKeymap,
  ]),
  astro(),
]

new EditorView({
  state: EditorState.create({
    doc: "Your Astro code here",
    extensions: myExtensions,
  }),
  parent: document.body,
})
```

### With Custom Extensions

```ts
import { astro } from "@fazelstudio/codemirror-lang-astro"
import { myCustomExtension } from "./my-extension"

const extensions = [
  astro({
    extraExtensions: [
      myCustomExtension,
      // any other CodeMirror extension
    ],
  }),
]
```

## Dependencies

This package requires the following peer dependencies (usually already installed with CodeMirror):

| Package | Version |
|---------|---------|
| `@codemirror/lang-javascript` | `^6.0.0` |
| `@codemirror/lang-css` | `^6.0.0` |
| `@codemirror/language` | `^6.0.0` |
| `@lezer/common` | `^1.0.0` |
| `@lezer/highlight` | `^1.0.0` |
| `@lezer/html` | `^1.0.0` |

## Known Limitations

- **Astro directives** (`client:load`, `set:html`, `is:inline`, etc.) are highlighted as generic HTML attributes. Dedicated grammar nodes for directives are planned for a future release.

- **Expression nesting** beyond two levels (e.g. `{cond && <A>{b && <B />}</A>}`) may not resolve inner highlight tokens when read via `resolveInner` from the outer tree — the JSX overlay is correctly mounted and the editor highlights the content properly, but programmatic tree queries must account for the overlay mount depth.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

```bash
# Clone the repo
git clone https://github.com/fazelllyyy/codemirror-lang-astro.git

# Install dependencies
bun install

# Run tests
bun run test

# Build
bun run build
```

## License

MIT © [Zulfazli (Fazelllyyy)](https://github.com/fazelllyyy)
