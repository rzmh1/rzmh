import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { config } from "../server/config.mjs";
import { openDatabase } from "../server/database.mjs";
import { email, passwordHash, cleanText } from "../server/security.mjs";
let muted = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) process.stdout.write(chunk, encoding);
    callback();
  },
});
output.isTTY = process.stdout.isTTY;
output.columns = process.stdout.columns;
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: !!process.stdin.isTTY,
});
try {
  const mail = email(
    process.env.ADMIN_EMAIL || (await rl.question("Admin email: ")),
  );
  const name =
    cleanText(await rl.question("Display name: "), 80) || "مالك رُزمة";
  process.stdout.write("Password (12+ characters, hidden): ");
  muted = true;
  const password = process.env.ADMIN_PASSWORD || (await rl.question(""));
  muted = false;
  process.stdout.write("\n");
  const hashed = await passwordHash(password);
  const store = openDatabase(config());
  const existing = store.db
    .prepare("SELECT id FROM users WHERE email=?")
    .get(mail);
  if (existing) {
    store.db
      .prepare(
        "UPDATE users SET password_hash=?,name=?,role='admin',disabled=0 WHERE id=?",
      )
      .run(hashed, name, existing.id);
    store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(existing.id);
  } else
    store.db
      .prepare(
        "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?, 'admin',?)",
      )
      .run(randomUUID(), mail, name, hashed, new Date().toISOString());
  store.audit(existing?.id || null, "admin.provision", mail);
  store.close();
  console.log(
    "Admin account is ready. Open /#/login and sign in; then /#/admin. No default password exists.",
  );
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  muted = false;
  rl.close();
}
