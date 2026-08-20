import {styleTags, tags as t} from "@lezer/highlight"

// Styling for the nodes produced by the Astro top-level grammar
// itself. Everything inside the frontmatter and the markup region is
// styled by the nested TypeScript / HTML parsers, so only the fence
// tokens need to be mapped here.
export const astroHighlighting = styleTags({
  "FenceOpen FenceClose": t.processingInstruction,
})
