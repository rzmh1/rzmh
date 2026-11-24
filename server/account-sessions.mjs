import { hash } from "./security.mjs";

const prefix = "ruzmah_account_";
const validId = (id) => typeof id === "string" && /^[\w-]{1,100}$/.test(id);
export const accountCookieName = (id) => prefix + id;
export function cookies(req) {
  return new Map((req.headers.cookie || "").split(";").map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
}
export function accountSessions(db, cfg) {
  const cookie = (name, value, maxAge = 604800) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.production ? "; Secure" : ""}`;
  function resolve(value) {
    if (!value) return {};
    const session = db.prepare("SELECT * FROM sessions WHERE hash=? AND expires>?")
      .get(hash(value), Date.now());
    if (!session) return {};
    const user = db.prepare("SELECT * FROM users WHERE id=? AND disabled=0").get(session.user_id);
    return user ? { user, session, token: value } : {};
  }
  function authenticate(req, selection) {
    const jar = cookies(req);
    if (selection != null) {
      if (!validId(selection)) return {};
      // An explicit selection never falls back to a different account.
      const result = resolve(jar.get(accountCookieName(selection)) ?? jar.get("ruzmah_session"));
      return result.user?.id === selection ? result : {};
    }
    return resolve(jar.get("ruzmah_session"));
  }
  function list(req) {
    const found = new Map();
    for (const [name, value] of cookies(req)) {
      if (name !== "ruzmah_session" && !name.startsWith(prefix)) continue;
      const { user } = resolve(value);
      if (user && (name === "ruzmah_session" || name === accountCookieName(user.id)))
        found.set(user.id, { id: user.id, name: user.name, email: user.email, role: user.role });
    }
    return [...found.values()];
  }
  return { authenticate, list, cookie };
}
