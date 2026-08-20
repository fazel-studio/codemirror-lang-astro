import assert from "assert"
import * as fs from "fs"
import * as path from "path"
import {fileURLToPath} from "url"
import {fileTests} from "@lezer/generator/test"
import {foldNodeProp} from "@codemirror/language"
import {mixedParser} from "../src/mixed.js"

let caseDir = path.dirname(fileURLToPath(import.meta.url))

describe("codemirror-lang-astro", () => {
  let casesFile = path.join(caseDir, "cases.txt")
  for (let {name, run} of fileTests(fs.readFileSync(casesFile, "utf8"), "cases.txt"))
    it(name, () => run(mixedParser))

  let treeNames = (text, pos) => {
    let tree = mixedParser.parse(text)
    return tree.topNode.resolveInner(pos)
  }

  it("frontmatter is parsed as TypeScript, not plain text", () => {
    let text = `---\nimport Layout from '../layouts/Layout.astro'\nconst title = "Hello"\n---\n<h1>{title}</h1>`
    let tree = mixedParser.parse(text)
    let insidePrint = tree.topNode.resolveInner(12)
    assert.ok(["VariableDefinition", "ImportDeclaration", "Script"].includes(insidePrint.name),
      `expected a TypeScript node inside the frontmatter, got ${insidePrint.name}`)
    let insideConst = tree.topNode.resolveInner(text.indexOf("const") + 2)
    assert.ok(["VariableDefinition", "const", "VariableName"].includes(insideConst.name),
      `expected a TypeScript const node, got ${insideConst.name}`)
  })

  it("native tags and PascalCase components get different tag nodes", () => {
    let native = mixedParser.parse(`<div>text</div>`).topNode.resolveInner(2)
    assert.equal(native.name, "TagName")
    let component = mixedParser.parse(`<Component prop={value} />`).topNode.resolveInner(2)
    assert.equal(component.name, "ComponentName")
  })

  it("simple expressions in child text are parsed as JavaScript", () => {
    let text = `<h1>{title}</h1>`
    let pos = text.indexOf("title") + 1
    let node = treeNames(text, pos)
    assert.ok(["VariableName", "PropertyName", "Identifier"].includes(node.name),
      `expected a JavaScript identifier inside {title}, got ${node.name}`)
  })

  it("attribute value expressions are parsed as JavaScript blocks", () => {
    let text = `<Component prop={value} />`
    let pos = text.indexOf("value") + 1
    let node = treeNames(text, pos)
    assert.ok(["Block", "VariableName", "Identifier"].includes(node.name),
      `expected a JavaScript block/value inside {value}, got ${node.name}`)
  })

  it("script contents are parsed as JavaScript", () => {
    let text = `<script>\n  const x = 1\n</script>`
    let pos = text.indexOf("const") + 2
    let node = treeNames(text, pos)
    assert.ok(["const", "VariableName", "VariableDeclaration"].includes(node.name),
      `expected JavaScript inside script tag, got ${node.name}`)
  })

  it("a --- in the middle of markup is not treated as a fence", () => {
    let text = `<div>\n---\n</div>`
    let tree = mixedParser.parse(text)
    let names = []
    tree.iterate({enter(n) { if (n.name) names.push(n.name) }})
    assert.ok(!names.some(n => n.startsWith("Fence")), `unexpected fence nodes: ${names.join(" ")}`)
    let node = tree.topNode.resolveInner(8)
    assert.ok(["Text", "Element"].includes(node.name), `expected markup text, got ${node.name}`)
  })

  // ------------------------------------------------------------------
  // Phase B tests (v0.2): JSX-like markup inside { ... } expressions
  // ------------------------------------------------------------------

  it("conditional JSX expression {cond && <p>text</p>}: JSX element is parsed", () => {
    // The `<p>` inside the expression should produce a JSX node, not be
    // treated as a parse error or plain text.
    let text = `<div>{condition && <p>text</p>}</div>`
    let tree = mixedParser.parse(text)
    // `condition` is inside the expression and should resolve to a JS identifier.
    let condPos = text.indexOf("condition") + 2
    let condNode = tree.topNode.resolveInner(condPos)
    assert.ok(
      ["VariableName", "Identifier", "BinaryExpression", "ExpressionStatement"].includes(condNode.name),
      `expected a JS node for 'condition', got ${condNode.name}`
    )
    // `<p>` inside the expression should produce a JSX element node.
    let pPos = text.indexOf("<p>") + 1
    let pNode = tree.topNode.resolveInner(pPos)
    assert.ok(
      ["JSXOpenTag", "JSXElement", "JSXIdentifier"].includes(pNode.name),
      `expected a JSX node for <p> inside expression, got ${pNode.name}`
    )
  })

  it("map expression {items.map(i => <li>{i}</li>)}: nested {i} is parsed as JS", () => {
    let text = `<ul>{items.map(item => <li>{item}</li>)}</ul>`
    let tree = mixedParser.parse(text)
    // `item` inside `{item}` inside `<li>` should resolve to a JS identifier.
    // The JSX parser handles JSXExpressionContainer ({...} inside JSX children)
    // natively and recursively, so no extra parseMixed layer is needed.
    let itemPos = text.lastIndexOf("item") + 2  // the `item` inside {item}
    let itemNode = tree.topNode.resolveInner(itemPos)
    assert.ok(
      ["VariableName", "Identifier", "JSXExpressionContainer", "JSXElement"].includes(itemNode.name),
      `expected a JS/JSX node for 'item' inside <li>{item}</li>, got ${itemNode.name}`
    )
  })

  it("JSX self-closing component inside expression {cond && <MyComp />}", () => {
    let text = `<div>{ok && <MyComp />}</div>`
    let tree = mixedParser.parse(text)
    // `ok` should be a JS identifier
    let okPos = text.indexOf("ok") + 1
    let okNode = tree.topNode.resolveInner(okPos)
    assert.ok(
      ["VariableName", "Identifier", "BinaryExpression"].includes(okNode.name),
      `expected JS identifier for 'ok', got ${okNode.name}`
    )
    // `MyComp` should be a JSX identifier (component name in JSX context)
    let compPos = text.indexOf("MyComp") + 3
    let compNode = tree.topNode.resolveInner(compPos)
    assert.ok(
      ["JSXIdentifier", "JSXSelfClosingElement", "JSXOpenTag"].includes(compNode.name),
      `expected JSX node for MyComp, got ${compNode.name}`
    )
  })

  it("ternary JSX expression {cond ? <A /> : <B />} parses both branches", () => {
    let text = `<div>{flag ? <Yes /> : <No />}</div>`
    let tree = mixedParser.parse(text)
    // Both <Yes /> and <No /> should produce JSX nodes
    let yesPos = text.indexOf("Yes") + 1
    let yesNode = tree.topNode.resolveInner(yesPos)
    assert.ok(
      ["JSXIdentifier", "JSXSelfClosingElement"].includes(yesNode.name),
      `expected JSX node for Yes, got ${yesNode.name}`
    )
    let noPos = text.indexOf("No") + 1
    let noNode = tree.topNode.resolveInner(noPos)
    assert.ok(
      ["JSXIdentifier", "JSXSelfClosingElement"].includes(noNode.name),
      `expected JSX node for No, got ${noNode.name}`
    )
  })

  it("attribute value expression {value} still works after v0.2 change", () => {
    // Regression: plain attribute-value expressions must still parse correctly.
    let text = `<Component prop={value} />`
    let pos = text.indexOf("value") + 1
    let node = mixedParser.parse(text).topNode.resolveInner(pos)
    assert.ok(
      ["Block", "VariableName", "Identifier"].includes(node.name),
      `expected a JavaScript block/value inside {value}, got ${node.name}`
    )
  })

  // ------------------------------------------------------------------
  // v0.3 hardening: expressions that used to break the HTML parse
  // ------------------------------------------------------------------

  it("two sibling expressions {a} and {b} are both parsed", () => {
    let text = `<div>{alpha} and {beta}</div>`
    let tree = mixedParser.parse(text)
    let a = tree.topNode.resolveInner(text.indexOf("alpha") + 1)
    let b = tree.topNode.resolveInner(text.indexOf("beta") + 1)
    assert.ok(["VariableName", "Identifier"].includes(a.name), `expected JS for 'alpha', got ${a.name}`)
    assert.ok(["VariableName", "Identifier"].includes(b.name), `expected JS for 'beta', got ${b.name}`)
  })

  it("comparison operators and strings in attribute expressions do not break the markup", () => {
    let text = `<Component prop={x > 5 && y} />`
    let tree = mixedParser.parse(text)
    let gt = tree.topNode.resolveInner(text.indexOf("5"))
    assert.ok(
      ["BinaryExpression", "LogicOp"].includes(gt.name),
      `expected a JS comparison inside the attribute, got ${gt.name}`
    )
    let text2 = `<Component prop={x && "hi"} />`
    let tree2 = mixedParser.parse(text2)
    let quote = tree2.topNode.resolveInner(text2.indexOf("hi"))
    assert.ok(["String", "StringLiteral"].includes(quote.name),
      `expected a string literal inside the attribute, got ${quote.name}`)
    // ...and the element itself must still be a well-formed Element.
    let elt = tree2.topNode.resolveInner(1)
    assert.ok(["Element", "OpenTag", "Attribute"].includes(elt.name), `expected Element markup, got ${elt.name}`)
  })

  it("a multiline attribute expression parses as JavaScript", () => {
    let text = `<Component prop={x\n  > 5} />`
    let tree = mixedParser.parse(text)
    let pos = text.indexOf("5")
    let node = tree.topNode.resolveInner(pos)
    assert.ok(["BinaryExpression", "VariableName"].includes(node.name),
      `expected a JS expression across lines, got ${node.name}`)
  })

  it("a regex literal containing a brace ({/}/-style) does not end the expression", () => {
    let text = `<div>{/}/.test(x)}</div>`
    let tree = mixedParser.parse(text)
    let x = tree.topNode.resolveInner(text.indexOf("x") + 1)
    assert.ok(["VariableName", "Identifier", "ArgList", "CallExpression"].includes(x.name),
      `expected 'x' inside the regex call to be JS, got ${x.name}`)
    let testPos = tree.topNode.resolveInner(text.indexOf("test") + 1)
    assert.ok(["PropertyName", "MemberExpression", "CallExpression"].includes(testPos.name),
      `expected the .test call to be JS, got ${testPos.name}`)
  })

  it("quoted attribute values can contain expressions", () => {
    let text = `<div title="{name}">hello</div>`
    let tree = mixedParser.parse(text)
    let pos = text.indexOf("name") + 1
    let node = tree.topNode.resolveInner(pos)
    assert.ok(["VariableName", "Identifier"].includes(node.name),
      `expected JS inside a quoted attribute, got ${node.name}`)
  })

  it("script contents with lang=ts are parsed as TypeScript", () => {
    let text = `<script lang="ts">\nconst x: number = 3\n</script>`
    let tree = mixedParser.parse(text)
    let pos = text.indexOf("number")
    let node = tree.topNode.resolveInner(pos)
    assert.ok([":", "typeName", "TypeName", "TypeAnnotation", "TypeReference", "VariableName"].includes(node.name),
      `expected TypeScript type annotation, got ${node.name}`)
  })

  it("style contents are parsed as CSS", () => {
    let text = `<style>\na { color: red }\n</style>`
    let tree = mixedParser.parse(text)
    let pos = text.indexOf("color") + 3
    let node = tree.topNode.resolveInner(pos)
    assert.ok(["Declaration", "PropertyName", "Keyword", "RuleSet"].includes(node.name),
      `expected CSS nodes in <style>, got ${node.name}`)
  })

  it("frontmatter fences tolerate trailing whitespace", () => {
    let text = `---   \nconst x = 1\n---   \n<div>{x}</div>`
    let tree = mixedParser.parse(text)
    let pos = text.indexOf("x = 1") + 1
    let node = tree.topNode.resolveInner(pos)
    assert.ok(["VariableName", "VariableDefinition", "VariableDeclaration"].includes(node.name),
      `expected TypeScript in frontmatter, got ${node.name}`)
  })

  it("a UTF-8 BOM before the opening fence does not disable frontmatter", () => {
    let text = `\uFEFF---\nconst x = 1\n---\n<div></div>`
    let tree = mixedParser.parse(text)
    let pos = text.indexOf("x = 1") + 1
    let node = tree.topNode.resolveInner(pos)
    assert.ok(["VariableName", "VariableDefinition", "VariableDeclaration"].includes(node.name),
      `expected TypeScript in frontmatter after a BOM, got ${node.name}`)
  })

  // ------------------------------------------------------------------
  // v0.2.1: top-level HTML tree enables code folding
  // ------------------------------------------------------------------

  it("the HTML tree is the top-level tree (Document, not Program)", () => {
    let tree = mixedParser.parse(`<div>Hello</div>`)
    assert.equal(tree.topNode.name, "Document")
    assert.ok(tree.topNode.getChild("Element"), "expected an Element child of the Document")
  })

  it("HTML elements in the outer tree are foldable via foldNodeProp", () => {
    let text = `<div>\n  <h1>x</h1>\n</div>`
    let tree = mixedParser.parse(text)
    let div = tree.topNode.getChild("Element")
    assert.ok(div, "expected the outer div element")
    let fold = div.type.prop(foldNodeProp)(div, {})
    assert.ok(fold, "expected a fold range for the div element")
    assert.equal(fold.from, div.firstChild.to)
    assert.equal(fold.to, div.lastChild.name == "CloseTag" ? div.lastChild.from : div.to)
  })

  it("the frontmatter region is a foldable Comment in the outer tree", () => {
    let text = `---\nconst x = 1\nconst y = 2\n---\n<div></div>`
    let tree = mixedParser.parse(text)
    let fm = tree.topNode.getChild("Comment")
    assert.ok(fm, "expected the frontmatter to appear as an outer Comment node")
    assert.equal(text.slice(fm.from, fm.from + 3), "---", "expected real frontmatter text at the comment start")
    assert.ok(fm.type.prop(foldNodeProp), "expected the Comment to be foldable")
  })
})