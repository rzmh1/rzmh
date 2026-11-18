import { build } from "esbuild";
await build({
  entryPoints: ["editor.mjs"],  bundle: true,
  format: "esm",
  target: ["safari16", "chrome110"],
  outfile: "dist/assets/editor.bundle.js",
  minify: true,
  legalComments: "eof",
});
console.log(
  "Built local CodeMirror editor. The existing dist application remains the source.",
);
