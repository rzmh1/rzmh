import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../server/config.mjs";
import { openDatabase } from "../server/database.mjs";
const cfg = config(),
  store = openDatabase(cfg),
  dir = join(cfg.dataDir, "backups");
await mkdir(dir, { recursive: true, mode: 0o700 });
const path = join(dir, "manual-" + Date.now() + ".sqlite");
await store.backupTo(path);
store.close();
console.log("Backup saved:", path);
