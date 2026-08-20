/* Module responsible for composing the raw Astro grammar with the
nested parsers that make up a working Astro language:

- The @lezer/html parser (with Astro-specific expression and
  component handling) is the TOP-LEVEL parser, so HTML elements,
  comments and scripts live directly in the outer syntax tree.  This
  makes indentation, bracket matching and — crucially — code folding
  work on the resulting tree (folding reads tree node props from the
  outer tree only, so a nested HTML sub-parse would never show fold
  markers).
- The frontmatter `--- ... ---` region is masked into an HTML comment
  of identical length before parsing (`---` + the following whitespace
  become `<!--`, the closing `---` becomes `-->`).  The masked comment
  is then recognised again (its real text starts/ends with `---`) and
  the TypeScript parser is mounted over its inner content.
- The JSX-capable JavaScript parser (v0.2+) is mounted over { ... }
  expression regions, enabling full recursive parsing of JSX-like
  markup inside expressions (e.g. `{cond && <p>{title}</p>}`).

Keeping this composition in a plain JavaScript module lets the test
suite run it directly (`test/test-astro.js`), while the TypeScript
entry point (`src/index.ts`) re-exports the finished language.
*/

import {Parser, parseMixed} from "@lezer/common"
import {parser as htmlParser} from "@lezer/html"
import {
  javascript,
  javascriptLanguage,
  typescriptLanguage,
  tsxLanguage
} from "@codemirror/lang-javascript"
import {cssLanguage} from "@codemirror/lang-css"
import {
  indentNodeProp,
  foldNodeProp,
  bracketMatchingHandle,
  languageDataProp,
  defineLanguageFacet
} from "@codemirror/language"
import {componentParser} from "./component.js"

// -------------------------------------------------------------------
// JSX-capable parser for Astro expression regions (v0.2)
//
// In v0.1, plain JavaScript was used for { ... } overlays.  That was
// sufficient for simple expressions like `{title}` or `{fn()}`, but
// it failed for JSX-like markup inside expressions:
//
//   {condition && <p>{title}</p>}
//   {items.map(item => <li class="x">{item}</li>)}
//
// Switching to the JSX dialect lets the JavaScript grammar handle the
// JSX element nodes (JSXElement, JSXOpenTag, JSXText,
// JSXExpressionContainer, …) natively and recursively — an expression
// inside a JSX element (JSXExpressionContainer) is already parsed by
// the JSX grammar itself, so no extra parseMixed layer is needed.
// -------------------------------------------------------------------
// -------------------------------------------------------------------
// Language data for regions we mount ourselves
//
// code-folding/indentation (indentNodeProp...) work from tree props,
// but editor-level data such as comment tokens and word characters
// (`EditorState.languageDataAt`) is read from the `languageDataProp`
// stamped on the TOP node type of every region.  @lezer/html /
// @lezer/javascript turn into plain parses when mounted here, so the
// tags below re-attach the same data the upstream languages carry:
// HTML for the markup region, JavaScript for { ... } overlays.
// -------------------------------------------------------------------
const htmlData = defineLanguageFacet({
  commentTokens: {block: {open: "<!--", close: "-->"}},
  wordChars: "-_"
})

const jsData = defineLanguageFacet({
  commentTokens: {line: "//", block: {open: "/*", close: "*/"}},
  wordChars: "$"
})

const jsxParser = javascript({jsx: true}).language.parser.configure({
  props: [languageDataProp.add((type) => type.isTop ? jsData : undefined)]
})

// -------------------------------------------------------------------
// Expression scanning and masking
//
// @lezer/html does not understand `{ ... }` blocks.  A `{` inside an
// (unquoted) attribute value turns the rest of the tag into one
// UnquotedAttributeValue node, a `>` or a `"` inside an expression
// truncates the HTML structure, and an expression that contains
// markup (`{cond && <p>x</p>}`) is split across a Text node and an
// Element node.  This makes it impossible to reliably detect
// expression ranges from the HTML tree alone.
//
// Instead we scan the raw markup text for balanced `{ ... }` braces
// (string-, template-literal-, comment- and regex-literal-aware) and
// REPLACE the expression contents with placeholder characters before
// handing the text to the HTML parser.  Masking preserves the length
// and structure of the document, so the tree produced by @lezer/html
// has exactly the same node ranges as the real text, but expressions
// that would otherwise corrupt the HTML parse now behave as inert
// plain text.  The same scan yields the overlay ranges used to mount
// the JSX parser over the real (unmasked) text afterwards.
// -------------------------------------------------------------------

function isSpaceCode(c) {
  return c == 32 || c == 9 || c == 10 || c == 13
}

// Heuristic for whether a `/` at `pos` starts a regex literal rather
// than a division operator (mirrors the approach used by
// @codemirror/lang-javascript and the CodeMirror bracket matcher).
function inRegexContext(text, pos) {
  let j = pos - 1
  while (j >= 0 && isSpaceCode(text.charCodeAt(j))) j--
  if (j < 0) return true
  let ch = text.charCodeAt(j)
  if (ch == 41 || ch == 93 || ch == 125 || ch == 60) return false
  if (ch == 62) return j > 0 && text.charCodeAt(j - 1) == 61
  if (ch == 34 || ch == 39 || ch == 96) return false
  if (ch >= 48 && ch <= 57) return false
  if ((ch >= 97 && ch <= 122) || (ch >= 65 && ch <= 90) || ch == 36 || ch == 95) {
    let k = j
    while (k >= 0 && /[A-Za-z0-9_$]/.test(text[k])) k--
    return /^(return|typeof|instanceof|in|of|new|void|delete|yield|await|case|do|else|throw|extends|assert|with)$/
      .test(text.slice(k + 1, j + 1))
  }
  return true
}

// Find the index of the `}` that matches the `{` at `start`, ignoring
// braces inside strings, template literals, comments and regex
// literals.  Returns -1 when the brace is unclosed.
function findMatchingBrace(text, start) {
  let depth = 0, inString = false, stringQuote = 0, inBlockComment = false
  for (let i = start; i < text.length; i++) {
    let ch = text.charCodeAt(i)
    if (inBlockComment) {
      if (ch == 42 && text.charCodeAt(i + 1) == 47) {
        inBlockComment = false
        i++
      }
    } else if (inString) {
      if (ch == 92) i++
      else if (ch == stringQuote) inString = false
    } else if (ch == 47 && text.charCodeAt(i + 1) == 47) {
      while (i < text.length && text.charCodeAt(i) != 10) i++
    } else if (ch == 47 && text.charCodeAt(i + 1) == 42) {
      inBlockComment = true
      i++
    } else if (ch == 47 && inRegexContext(text, i)) {
      let inClass = false, j
      for (j = i + 1; j < text.length; j++) {
        let rc = text.charCodeAt(j)
        if (rc == 10 || rc == 13) {
          j = -1
          break
        }
        if (rc == 92) j++
        else if (inClass) {
          if (rc == 93) inClass = false
        } else if (rc == 91) inClass = true
        else if (rc == 47) break
      }
      if (j < 0) continue
      i = j
    } else if (ch == 34 || ch == 39 || ch == 96) {
      inString = true
      stringQuote = ch
    } else if (ch == 123) {
      depth++
    } else if (ch == 125 && --depth == 0) {
      return i
    }
  }
  return -1
}

// Ranges (in `text` coordinates) of every top-level `{ ... }` pair,
// excluding the braces themselves from the inner range.
function findExpressionRanges(text) {
  let ranges = []
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) == 123) {
      let end = findMatchingBrace(text, i)
      if (end < 0) break
      ranges.push({from: i, to: end})
      i = end
    }
  }
  return ranges
}

function maskExpressions(text) {
  let ranges = findExpressionRanges(text)
  if (!ranges.length) return text
  let chars = text.split("")
  for (let {from, to} of ranges)
    for (let j = from + 1; j < to; j++) chars[j] = "a"
  return chars.join("")
}

// Overlay ranges (absolute document positions, braces excluded) for
// all expressions inside a node.
function findExpressions(node, input) {
  let from = node.from
  let text = input.read(from, node.to)
  let overlay = []
  for (let {from: relFrom, to: relTo} of findExpressionRanges(text)) {
    let innerFrom = from + relFrom + 1
    let innerTo = from + relTo
    if (innerFrom < innerTo) overlay.push({from: innerFrom, to: innerTo})
  }
  return overlay.length ? overlay : null
}

// -------------------------------------------------------------------
// Frontmatter detection and masking
//
// The whole document is parsed by the HTML parser, so the `--- ... ---`
// frontmatter region has to be turned into something the HTML parser
// treats as inert text (an HTML comment).  Masking preserves length:
// the opening `---` plus the following whitespace/newline (4 chars)
// becomes `<!--`, the closing `---` (3 chars) becomes `-->`, and the
// content in between is copied verbatim.  The real text of the
// resulting Comment node therefore still starts and ends with `---`,
// which is how the mixed pass recognises it and mounts TypeScript.
// -------------------------------------------------------------------

// True when the three dashes at `i` end their line (a real Astro
// frontmatter fence — trailing whitespace is allowed).
function isFenceEnd(text, i) {
  if (i >= text.length) return true
  let c = text.charCodeAt(i)
  return c == 10 || c == 13 || c == 32 || c == 9
}

// The frontmatter range (fences inclusive) for a document, or null.
// A leading UTF-8 BOM before the opening fence is allowed.
function findFrontmatter(text) {
  let start = text.charCodeAt(0) == 0xFEFF ? 1 : 0
  if (!text.startsWith("---", start) || !isFenceEnd(text, start + 3)) return null
  let from = start
  let pos = text.indexOf("\n", start + 3)
  while (pos >= 0 && pos < text.length) {
    let line = pos + 1
    if (text.startsWith("---", line) && isFenceEnd(text, line + 3))
      return {from, to: line + 3}
    pos = text.indexOf("\n", line)
  }
  return null
}

// A length-preserving version of the document: frontmatter masked as
// an HTML comment, expressions in the markup masked as inert text.
function maskDocument(text, fm) {
  if (!fm) return maskExpressions(text)
  return text.slice(0, fm.from) +
    "<!--" +
    text.slice(fm.from + 4, fm.to - 3) +
    "-->" +
    maskExpressions(text.slice(fm.to))
}

// -------------------------------------------------------------------
// Attributes of an open tag, for script/style language detection
// -------------------------------------------------------------------

function openTagAttrs(node, input) {
  let open = node.getChild("OpenTag")
  if (!open) return {}
  let cur = open.cursor()
  if (!cur.firstChild()) return {}
  let attrs = {}
  do {
    if (cur.name == "Attribute") {
      let attrName = cur.node.getChild("AttributeName")
      if (!attrName) continue
      let key = input.read(attrName.from, attrName.to).toLowerCase()
      let attrValue = cur.node.getChild("AttributeValue") || cur.node.getChild("UnquotedAttributeValue")
      let value = attrValue ? input.read(attrValue.from, attrValue.to).replace(/^["']|["']$/g, "") : ""
      attrs[key] = value
    }
  } while (cur.nextSibling())
  return attrs
}

// -------------------------------------------------------------------
// HTML parser, extended with Astro expression and component handling
// -------------------------------------------------------------------

// Plain HTML parse of the (masked) document, with the HTML
// indentation/folding/bracket-matching behaviour applied to the
// resulting tree.  Expression and script/style nesting is added by
// `htmlNesting` in a separate mixed pass (see MaskedHtmlParser).
const htmlWithProps = htmlParser.configure({
  props: [
    languageDataProp.add((type) => type.isTop ? htmlData : undefined),
    indentNodeProp.add({
      Element(context) {
        let after = /^(\s*)(<\/)?/.exec(context.textAfter)
        if (context.node.to <= context.pos + after[0].length)
          return context.continue()
        return context.lineIndent(context.node.from) + (after[2] ? 0 : context.unit)
      },
      "OpenTag CloseTag SelfClosingTag"(context) {
        return context.column(context.node.from) + context.unit
      },
      Document(context) {
        if (context.pos + /\s*/.exec(context.textAfter)[0].length < context.node.to)
          return context.continue()
        let endElt = null, close
        for (let cur = context.node;;) {
          let last = cur.lastChild
          if (!last || last.name != "Element" || last.to != cur.to)
            break
          endElt = cur = last
        }
        if (endElt && !((close = endElt.lastChild) && (close.name == "CloseTag" || close.name == "SelfClosingTag")))
          return context.lineIndent(endElt.from) + context.unit
        return null
      }
    }),
    foldNodeProp.add({
      Element(node) {
        let first = node.firstChild, last = node.lastChild
        if (!first || first.name != "OpenTag")
          return null
        return {from: first.to, to: last.name == "CloseTag" ? last.from : node.to}
      },
      // Covers both real `<!-- ... -->` comments and the masked
      // frontmatter region (whose real text is `--- ... ---`).
      Comment(node, state) {
        if (state.doc.sliceString(node.from, node.from + 3) === "---") {
          return {from: node.from + 3, to: node.to - 3}
        }
        return {from: Math.min(node.from + 4, node.to), to: Math.max(node.from + 4, node.to - 3)}
      }
    }),
    bracketMatchingHandle.add({
      "OpenTag CloseTag": node => node.getChild("TagName")
    })
  ]
})

// A parse whose only job is to produce a finished tree in one step.
class DoneParse {
  constructor(tree) { this.tree = tree; this.done = false }
  advance() {
    if (this.done) return null
    this.done = true
    return this.tree
  }
  get parsedPos() { return this.tree.length }
  stopAt() {}
  get stoppedAt() { return null }
}

// Parser that feeds @lezer/html a masked (expression-free and
// frontmatter-commented) version of the document, then mounts the
// nested parsers over the real regions via parseMixed.
const htmlNesting = parseMixed((node, input) => {
  let name = node.type.name
  if (name == "Comment") {
    // A comment whose real text runs `--- ... ---` is the masked
    // frontmatter region: mount TypeScript over its inner content.
    if (input.read(node.from, node.from + 3) == "---" &&
        input.read(node.to - 3, node.to) == "---") {
      let from = node.from + 4, to = node.to - 3
      if (to > from) return {parser: typescriptLanguage.parser, overlay: [{from, to}]}
      return null
    }
    return null
  }
  if (name == "Text" || name == "UnquotedAttributeValue" || name == "AttributeValue") {
    let overlay = findExpressions(node, input)
    if (overlay) return {parser: jsxParser, overlay}
  } else if (name == "ScriptText") {
    // <script> contents: plain JS by default, TS/TSX when the tag
    // declares it via `lang` or `type`.
    let attrs = openTagAttrs(node.node, input)
    if (attrs.src) return null
    let t = (attrs.lang || attrs.type || "").toLowerCase()
    if (t.indexOf("tsx") >= 0) return {parser: tsxLanguage.parser}
    if (t.indexOf("typescript") >= 0 || t.indexOf("ts") >= 0) return {parser: typescriptLanguage.parser}
    if (t.indexOf("jsx") >= 0) return {parser: jsxParser}
    return {parser: javascriptLanguage.parser}
  } else if (name == "StyleText") {
    return {parser: cssLanguage.parser}
  } else if (name == "TagName" && /^[A-Z]/.test(input.read(node.from, node.to))) {
    // PascalCase tag names are Astro components: mount them as
    // ComponentName nodes so they can be styled as typeName instead
    // of tagName (see component.js).
    return {parser: componentParser}
  }
  return null
})

class MaskedHtmlParser extends Parser {
  constructor(options = {}) {
    super()
    this.options = options
  }

  createParse(input, fragments, ranges) {
    let from = ranges.length ? ranges[0].from : 0
    let to = ranges.length ? ranges[0].to : input.length
    let text = input.read(from, to)
    let fm = findFrontmatter(text)
    
    let parser = htmlWithProps
    if (this.options.props && this.options.props.length > 0) {
      parser = parser.configure({ props: this.options.props })
    }
    
    let tree = parser.parse(maskDocument(text, fm))
    // The masked tree spans the same coordinates as the real input,
    // so the mixed parse can run against the given (real) input and
    // mount inner parses over the true expression ranges.  Reusing
    // the incoming fragments keeps live-edit reparses incremental.
    return htmlNesting(new DoneParse(tree), input, fragments, ranges)
  }

  configure(options) {
    return new MaskedHtmlParser(options)
  }
}

const mixedParser = new MaskedHtmlParser()

export {mixedParser}