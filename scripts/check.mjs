import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const folder of ["server", "scripts", "client", "dist"]) {
  for (const name of await readdir(resolve(root, folder))) {
    if (/\.(mjs|js)$/.test(name)) run(["--check", `${folder}/${name}`]);
  }
}
const tests = (await readdir(resolve(root, "tests")))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);
if (!tests.length) throw Error("No tests found; refusing an empty successful check.");
run(["--test", "--test-isolation=none", ...tests]);
