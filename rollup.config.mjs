import { nodeResolve } from "@rollup/plugin-node-resolve"
import typescript from "@rollup/plugin-typescript"

export default [
  {
    input: "./src/index.ts",
    output: [
      { file: "dist/index.js", format: "esm" },
      { file: "dist/index.cjs", format: "cjs" },
    ],
    external: (id) => {
      let norm = id.replace(/\\/g, "/")
      return !/^\.{1,2}\//.test(norm) && !/\/src\//.test(norm) && !/^\/src\//.test(norm)
    },
    plugins: [nodeResolve(), typescript({ declaration: true, declarationDir: "dist" })],
  },
]
