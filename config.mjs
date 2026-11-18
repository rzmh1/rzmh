import { resolve } from "node:path";
export function config(env = process.env) {
  const production = env.NODE_ENV === "production";
  const origin = env.APP_ORIGIN || "http://localhost:3000";
  if (new URL(origin).origin !== origin)
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
  return {
    trustProxy: env.TRUST_PROXY === "1",
    production,
    origin,
    port: Number(env.PORT || 3000),
    host: env.HOST || "0.0.0.0",
    dataDir: resolve(env.DATA_DIR || "./runtime"),
    key: env.APP_KEY,
    storage: env.STORAGE_DRIVER || "local",
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION || "auto",
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    maxUpload: Number(env.MAX_UPLOAD_BYTES || 2147483648),
    ffmpeg: env.FFMPEG_PATH || "ffmpeg",
    ffprobe: env.FFPROBE_PATH || "ffprobe",
    backupInterval: Number(env.BACKUP_INTERVAL_HOURS || 24) * 3600000,
    retention: Number(env.BACKUP_RETENTION_DAYS || 14),
  };
}
