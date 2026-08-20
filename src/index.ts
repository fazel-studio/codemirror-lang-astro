import {javascript} from "@codemirror/lang-javascript"
import {css} from "@codemirror/lang-css"
import type {Extension} from "@codemirror/state"
import {
  Language,
  LanguageSupport,
  defineLanguageFacet,
} from "@codemirror/language"
import {mixedParser} from "./mixed.js"

/**
 * Configuration for the Astro language support.
 */
export interface AstroConfig {
  /**
   * Additional extensions to include. Useful for adding custom
   * highlight styles, fold gutters, or other editor features.
   *
   * @example
   * ```ts
   * import { foldGutter } from '@codemirror/language'
   * import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
   *
   * astro({
   *   extensions: [
   *     foldGutter(),
   *     syntaxHighlighting(defaultHighlightStyle),
   *   ]
   * })
   * ```
   */
  extraExtensions?: Extension[]
}

const astroData = defineLanguageFacet({
  commentTokens: {block: {open: "<!--", close: "-->"}},
  indentOnInput: /^\s*<\/\w+>$/,
  wordChars: "-_",
})

/**
 * The Astro language. Can be used directly for advanced use cases.
 */
export const astroLanguage = new Language(astroData, mixedParser, [], "astro")

/**
 * Astro language support for CodeMirror 6.
 *
 * Provides syntax highlighting, code folding, and bracket matching
 * for `.astro` files. Includes nested parsing for:
 * - TypeScript/JavaScript in frontmatter (`--- ... ---`)
 * - JSX/TSX in expressions (`{ ... }`)
 * - CSS in `<style>` tags
 * - JavaScript/TypeScript in `<script>` tags
 *
 * @example
 * ```ts
 * import { EditorView, basicSetup } from 'codemirror'
 * import { astro } from '@fazelstudio/codemirror-lang-astro'
 *
 * const editor = new EditorView({
 *   extensions: [
 *     basicSetup,  // includes foldGutter, lineNumbers, syntaxHighlighting, etc.
 *     astro(),
 *   ],
 *   parent: document.body,
 * })
 * ```
 *
 * @example
 * ```ts
 * // Custom setup with only what you need
 * import { foldGutter, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
 * import { lineNumbers } from '@codemirror/view'
 * import { astro } from '@fazelstudio/codemirror-lang-astro'
 *
 * const editor = new EditorView({
 *   extensions: [
 *     lineNumbers(),
 *     foldGutter(),
 *     syntaxHighlighting(defaultHighlightStyle),
 *     astro(),
 *   ],
 *   parent: document.body,
 * })
 * ```
 */
export function astro(config?: AstroConfig): LanguageSupport {
  return new LanguageSupport(astroLanguage, [
    javascript({typescript: true}).support,
    javascript({jsx: true}).support,
    css().support,
    ...(config?.extraExtensions || []),
  ])
}

// Note: To access the underlying parser, use:
//   astroLanguage.parser
// The parser is not exported directly to avoid type declaration issues
// with the internal mixed.js module.
