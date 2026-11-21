import {
  randomBytes,
  scrypt as sc,
  timingSafeEqual,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { promisify } from "node:util";
import { domainToASCII } from "node:url";
const scrypt = promisify(sc);
export const token = () => randomBytes(32).toString("hex");
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export function fail(status, message) {
  throw Object.assign(Error(message), { status });
}
export async function passwordHash(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 200
  )
    fail(400, "كلمة المرور يجب أن تكون بين ١٢ و٢٠٠ حرف");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return salt + ":" + key.toString("hex");
}
export async function passwordVerify(password, stored) {
  if (typeof password !== "string" || password.length > 200) return false;
  const [salt, hex] = stored.split(":");
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export function equal(a, b) {
  const x = Buffer.from(String(a || "")),
    y = Buffer.from(String(b || ""));
  return x.length === y.length && timingSafeEqual(x, y);
}
export function encrypt(value, key) {
  if (!key || Buffer.from(key, "base64").length !== 32)
    fail(503, "اضبط APP_KEY على الخادم قبل حفظ الأسرار");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((b) => b.toString("base64"))
    .join(".");
}
export function decrypt(value, key) {
  if (!value) return "";
  if (!key) fail(503, "مفتاح تشفير الخادم غير مضبوط");
  const [iv, tag, bytes] = value
    .split(".")
    .map((b) => Buffer.from(b, "base64"));
  const c = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  c.setAuthTag(tag);
  return Buffer.concat([c.update(bytes), c.final()]).toString("utf8");
}
export function cleanText(v, max = 5000) {
  if (typeof v !== "string" || v.length > max) fail(400, "قيمة نصية غير صالحة");
  return v.trim();
}
export function email(v) {
  const x = cleanText(v, 254).toLowerCase();
  const at = x.lastIndexOf("@");
  const local = x.slice(0, at);
  const domain = domainToASCII(x.slice(at + 1)).toLowerCase();
  const labels = domain ? domain.split(".") : [];
  if (
    at <= 0 ||
    at !== x.indexOf("@") ||
    at > 64 ||
    !/^[a-z0-9.!#$%&'*+/=?^_{|}~-]+$/i.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !domain ||
    domain.length > 253 ||
    labels.length < 2 ||
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    ) ||
    !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(labels.at(-1))
  )
    fail(400, "البريد الإلكتروني غير صالح");
  return local + "@" + domain;
}
export async function jsonBody(req, limit = 2 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, "حجم الطلب أكبر من المسموح");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  let value;
  try {
    value = raw.length ? JSON.parse(raw) : {};
  } catch {
    fail(400, "صيغة JSON غير صحيحة");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "يتطلب الطلب كائن JSON");
  return value;
}
export async function rawBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) fail(413, "طلب كبير");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
