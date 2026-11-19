import { access, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
try {
  await access(".env");
  console.log(".env already exists; keeping existing secrets.");
} catch {
  await writeFile(
    ".env",
    `NODE_ENV=development\nAPP_ORIGIN=http://localhost:3000\nPORT=3000\nAPP_KEY=${randomBytes(32).toString("base64")}\nDATA_DIR=./runtime\nSTORAGE_DRIVER=local\nBACKUP_INTERVAL_HOURS=24\nBACKUP_RETENTION_DAYS=14\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Created private .env with a random APP_KEY. Keep it out of source control and backups shared publicly.",
  );
}
