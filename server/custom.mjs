import { randomUUID, randomBytes } from "node:crypto";
import { fail, cleanText } from "./security.mjs";
export function codeInput(b) {
  const scope = cleanText(b.scope || "home", 60);
  if (!/^(home|internal|all|section|course|lesson|pricing|tutor)$/.test(scope))
    fail(400, "نطاق التخصيص غير صالح");
  return {
    scope,
    html: cleanText(b.html || "", 100000),
    css: cleanText(b.css || "", 100000),
    js: cleanText(b.js || "", 100000),
    height: Math.max(180, Math.min(1600, Number(b.height) || 400)),
  };
}
export function frame(code) {
  const nonce = randomBytes(20).toString("base64");
  const safeScript = code.js.replace(/<\/script/gi, "<\\/script"),
    safeStyle = code.css.replace(/<\/style/gi, "<\\/style");
  return {
    csp: `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src data:; media-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox allow-scripts`,
    html: `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Tahoma,sans-serif;color:#27213d;padding:20px;margin:0}*{box-sizing:border-box}${safeStyle}</style></head><body>${code.html}<script nonce="${nonce}">${safeScript}</script></body></html>`,
  };
}
export function saveCode(store, user, b, status = "draft") {
  const code = codeInput(b),
    id = randomUUID();
  store.db
    .prepare("INSERT INTO custom_versions VALUES(?,?,?,?,?,?,?,?,?)")
    .run(
      id,
      code.scope,
      code.html,
      code.css,
      code.js,
      code.height,
      status,
      user.id,
      new Date().toISOString(),
    );
  if (status === "published")
    store.db
      .prepare(
        "INSERT INTO custom_active VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET version_id=excluded.version_id",
      )
      .run(code.scope, id);
  store.audit(user.id, "custom." + status, id);
  return { id, ...code, status };
}
