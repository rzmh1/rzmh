import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defaults } from "../dist/data.js";
import { normalizeContent } from "../server/learning-model.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = process.argv[2] || resolve(root, "design-review.html");
const { outputFiles } = await build({
  entryPoints: [resolve(root, "client/design-review.mjs")],
  bundle: true,
  write: false,
  format: "iife",
  target: ["safari16", "chrome110"],
  minify: false,
  define: {
    __RUZMAH_REVIEW_CONTENT__: JSON.stringify(normalizeContent(defaults)),
  },
});
let html = await readFile(resolve(root, "dist/index.html"), "utf8");
let css = (
  await Promise.all(
    [
      "styles.css",
      "storefront.css",
      "learning.css",
      "storefront-final.css",
      "student-app.css",
    ].map((f) => readFile(resolve(root, "dist", f), "utf8")),
  )
).join("\n");
for (const font of ["arabic-regular.ttf", "arabic-bold.ttf"])
  css = css.replaceAll(
    "assets/" + font,
    "data:font/ttf;base64," +
      (await readFile(resolve(root, "dist/assets", font))).toString("base64"),
  );
const favicon = (
  await readFile(resolve(root, "dist/assets/favicon.svg"))
).toString("base64");
html = html
  .replace("assets/favicon.svg", "data:image/svg+xml;base64," + favicon)
  .replace(/<link\s+rel="preload"[\s\S]*?\/>/, "")
  .replace(
    '<link rel="stylesheet" href="styles.css" />',
    "<style>" +
      css +
      "\n.design-review-note{text-align:center;font:9px/1.9 Ruzmah,sans-serif;background:#30273f;color:#eadff8;padding:7px 12px}.design-review-note+header{top:0}</style>",
  )
  .replace('<link rel="stylesheet" href="storefront.css" />', "")
  .replace('<link rel="stylesheet" href="learning.css" />', "")
  .replace('<link rel="stylesheet" href="storefront-final.css" />', "")
  .replace('<link rel="stylesheet" href="student-app.css" />', "");
const theme = await readFile(resolve(root, "dist/theme.js"), "utf8");
html = html
  .replace('<script src="theme.js"></script>', "<script>" + theme + "</script>")
  .replace('<script type="module" src="app.js"></script>', "");
const js = outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
html = html.replace("</body>", "<script>" + js + "</script></body>");
await writeFile(output, html);
console.log("Actual storefront review exported:", output);
