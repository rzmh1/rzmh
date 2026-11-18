import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = process.argv[2];
if (!bundle)
  throw Error("Pass the esbuild IIFE bundle path as the first argument.");
let html = await readFile(resolve(root, "dist/index.html"), "utf8");
let css = await readFile(resolve(root, "dist/styles.css"), "utf8");
for (const name of ["arabic-regular.ttf", "arabic-bold.ttf"]) {
  const font = (await readFile(resolve(root, "dist/assets", name))).toString(
    "base64",
  );
  css = css.replace("assets/" + name, "data:font/ttf;base64," + font);
}
const favicon = (
  await readFile(resolve(root, "dist/assets/favicon.svg"))
).toString("base64");
html = html
  .replace("assets/favicon.svg", "data:image/svg+xml;base64," + favicon)
  .replace(/<link\s+rel="preload"[\s\S]*?\/>/, "")
  .replace(
    '<link rel="stylesheet" href="styles.css" />',
    "<style>" + css + "</style>",
  )
  .replace('<script type="module" src="app.js"></script>', "");
const js = (await readFile(resolve(bundle), "utf8")).replace(
  /<\/script/gi,
  "<\\/script",
);
html = html.replace("</body>", "<script>" + js + "</script></body>");
await writeFile(resolve(root, "preview.html"), html);
console.log("Standalone preview exported to preview.html");
