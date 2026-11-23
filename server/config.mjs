import { resolve } from "node:path";
export function config(env = process.env) {
  const production = env.NODE_ENV === "production";
  const origin = env.APP_ORIGIN || "http://localhost:3000";
  if (!/^https?:\/\//.test(origin) || new URL(origin).origin !== origin)
    throw Error(
      "APP_ORIGIN must be the exact origin without a trailing slash or path",
    );
  if (
    production &&
    (!origin.startsWith("https://") ||
      !env.APP_KEY ||
      Buffer.from(env.APP_KEY, "base64").length !== 32)
  )
    throw Error(
      "Production requires HTTPS APP_ORIGIN and a 32-byte base64 APP_KEY",
    );
  const requireEmailVerification =
      production || env.REQUIRE_EMAIL_VERIFICATION === "1",
    mail = {
apiKey: (env.RESEND_API_KEY || "")
  .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
  .trim(),      from: env.EMAIL_FROM || "",
    };
  if (mail.apiKey && !mail.from)
    throw Error("EMAIL_FROM is required when RESEND_API_KEY is configured");
  const port = Number(env.PORT || 3000),
    storage = env.STORAGE_DRIVER || "local",
    maxUpload = Number(env.MAX_UPLOAD_BYTES || 2147483648),
    backupInterval = Number(env.BACKUP_INTERVAL_HOURS || 24) * 3600000,
    retention = Number(env.BACKUP_RETENTION_DAYS || 14);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw Error("PORT must be an integer between 0 and 65535");
  if (!["local", "s3"].includes(storage))
    throw Error("STORAGE_DRIVER must be local or s3");
  if (!Number.isSafeInteger(maxUpload) || maxUpload < 1)
    throw Error("MAX_UPLOAD_BYTES must be a positive safe integer");
  if (!Number.isFinite(backupInterval) || backupInterval < 1 || backupInterval > 2147483647)
    throw Error("BACKUP_INTERVAL_HOURS must produce an interval between 1 and 2147483647 ms");
  if (!Number.isFinite(retention) || retention <= 0)
    throw Error("BACKUP_RETENTION_DAYS must be positive");
  return {
    trustProxy: env.TRUST_PROXY === "1",
    production,
    origin,
    requireEmailVerification,
    mail,
    port,
    host: env.HOST || "0.0.0.0",
    dataDir: resolve(env.DATA_DIR || "./runtime"),
    key: env.APP_KEY,
    storage,
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION || "auto",
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    maxUpload,
    ffmpeg: env.FFMPEG_PATH || "ffmpeg",
    ffprobe: env.FFPROBE_PATH || "ffprobe",
    backupInterval,
    retention,
  };
}
