/* Hand-written tokenizers for the Astro top-level grammar.

The top-level grammar does not try to understand HTML or JavaScript:
it only recognizes the frontmatter fence (`---` at the very start of
the document) and hands the rest of the file to the nested parsers
(via `parseMixed` in `index.ts`) as raw content tokens.
*/

import {ExternalTokenizer} from "@lezer/lr"
import {
  FenceOpen as fenceOpenTerm,
  FenceClose as fenceCloseTerm,
  FrontmatterContent,
  MarkupContent,
} from "./parser.terms.js"

const dash = 45, newline = 10, carriageReturn = 13, bom = 0xFEFF

function isLineBreakOrEof(ch) {
  return ch < 0 || ch == newline || ch == carriageReturn
}

function isSpaceOrIgnorable(ch) {
  return ch == 32 || ch == 9 || ch == bom
}

// The fence is `---` followed (after a candidate position `off`) by
// optional trailing spaces/tabs and then a line break or the end of
// the file.
function isFenceAt(input, off = 0) {
  if (input.peek(off) != dash || input.peek(off + 1) != dash || input.peek(off + 2) != dash)
    return false
  let i = off + 3
  while (input.peek(i) == 32 || input.peek(i) == 9) i++
  return isLineBreakOrEof(input.peek(i))
}

// Position of a fence on the current line if there is one ahead of
// the tokenizer position (skipping leading spaces, tabs and a
// UTF-8 BOM), or -1 when there is none.  This lets the opening-fence
// tokenizer consume a BOM (and any leading indentation) that precedes
// `---` on the first line without making it a parse error.
function fenceAhead(input) {
  let i = 0
  while (isSpaceOrIgnorable(input.peek(i))) i++
  return isFenceAt(input, i) ? i : -1
}

export const fenceTokenizer = new ExternalTokenizer((input, stack) => {
  if (stack.canShift(fenceOpenTerm)) {
    // The opening fence is only valid on the first line of the
    // document, ignoring any whitespace (or a UTF-8 BOM) that
    // precedes it. This is what distinguishes Astro frontmatter from
    // Markdown-style `---` rules that can appear anywhere.
    let atDocStart = false
    for (let i = 1; i <= 100; i++) {
      let ch = input.peek(-i)
      if (ch < 0) {
        atDocStart = true
        break
      }
      if (ch != 32 && ch != 9 && ch != bom) return
    }
    if (atDocStart) {
      let off = fenceAhead(input)
      if (off >= 0) {
        // The token covers the fence plus anything skipped before it
        // (spaces/tabs/BOM), keeping the fence itself a single token
        // and the pending content aligned with the real document.
        for (let i = 0; i < off; i++) input.advance()
        input.acceptTokenTo(fenceOpenTerm, input.pos + 3)
      }
    }
  } else if (stack.canShift(fenceCloseTerm)) {
    if (isFenceAt(input))
      input.acceptToken(fenceCloseTerm, 3)
  }
})

export const contentTokenizer = new ExternalTokenizer((input, stack) => {
  if (stack.canShift(FrontmatterContent)) {
    // A line break right after the opening fence is skipped by the
    // grammar's `space` token; leaving the tokenizer without a match
    // here makes that happen (external tokenizers run before the
    // skip logic).
    if (input.next == newline || input.next == carriageReturn) return
    // If the current line already starts with a fence the frontmatter
    // content is empty. This happens for `---\n---`: the tokenizer is
    // invoked at the start of the closing fence's line.
    if (isFenceAt(input)) {
      input.acceptTokenTo(FrontmatterContent, input.pos)
      return
    }
    // Otherwise scan forward for the first line that starts with
    // `---`. Lines in between (even ones containing `---` further to
    // the right) are plain content.
    for (;;) {
      while (input.next != -1 && input.next != newline && input.next != carriageReturn)
        input.advance()
      if (input.next == -1) break
      while (input.next == newline || input.next == carriageReturn)
        input.advance()
      if (isFenceAt(input)) {
        input.acceptTokenTo(FrontmatterContent, input.pos)
        return
      }
    }
    // No closing fence found: the content runs to the end of the
    // file, and the parser reports a missing fenceClose error.
    input.acceptToken(FrontmatterContent, 0)
  } else if (stack.canShift(MarkupContent)) {
    // The rest of the document (after the frontmatter, or the whole
    // document when there is none) is one raw markup block. All
    // structural parsing happens in the nested @lezer/html parser.
    // As above, don't swallow the newline that follows the closing
    // fence: let it be skipped by the `space` token instead.
    if (input.next == newline || input.next == carriageReturn) return
    while (input.next != -1) input.advance()
    input.acceptToken(MarkupContent, 0)
  }
})