/* A tiny static parser used to mount `ComponentName` nodes over
PascalCase tag names found in the markup region.

The `@lezer/html` grammar always produces a `TagName` node for the
name in a tag, so it cannot distinguish `<Layout>` from `<div>` by
itself. Since the node types of the HTML parser are shared, the only
way to give component names their own highlight tag (`typeName`
instead of `tagName`) without writing our own HTML grammar is to
mount a small static tree over the tag-name token. This parser simply
returns a tree consisting of a single `ComponentName` node covering
the mounted range.
*/

import {Parser, NodeType, Tree} from "@lezer/common"
import {styleTags, tags as t} from "@lezer/highlight"

const componentNameType = NodeType.define({
  id: 0,
  name: "ComponentName",
  props: [styleTags({ComponentName: t.typeName})],
})

class ComponentNameParse {
  constructor(from, to) {
    this.from = from
    this.to = to
    this.done = false
  }
  advance() {
    if (this.done) return null
    this.done = true
    return new Tree(componentNameType, [], [], this.to - this.from)
  }
  get parsedPos() {
    return this.to
  }
  stopAt() {}
  get stoppedAt() {
    return null
  }
}

class ComponentParser extends Parser {
  createParse(input, fragments, ranges) {
    let from = ranges.length ? ranges[0].from : 0
    let to = ranges.length ? ranges[0].to : input.length
    return new ComponentNameParse(from, to)
  }
}

export const componentParser = new ComponentParser()
