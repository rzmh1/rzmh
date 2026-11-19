import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { transform } from "esbuild";
const root = fileURLToPath(new URL("../", import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ["client/editor.mjs"],
  bundle: true,
  format: "esm",
  target: ["safari16", "chrome110"],
  outfile: "dist/assets/editor.bundle.js",
  minify: true,
  legalComments: "eof",
});
// Validate the complete application graph without replacing its original modules.
await build({
  absWorkingDir: root,
  entryPoints: ["dist/app.js", "dist/theme.js"],
  bundle: true,
  format: "esm",
  target: ["safari16", "chrome110"],
  outdir: "dist",
  write: false,
});
for (const name of await readdir(resolve(root, "dist"))) {
  if (name.endsWith(".css"))
    await transform(await readFile(resolve(root, "dist", name), "utf8"), {
      loader: "css",
      sourcefile: name,
    });
}
console.log(
  "Validated application imports and styles; built dist/assets/editor.bundle.js.",
);
