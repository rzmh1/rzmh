import { canReadLesson } from "../dist/course-policy.js";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { mkdir, stat, unlink, rename } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, Readable } from "node:stream";
import { execFile } from "node:child_process";
import { courseVisible } from "./learning-model.mjs";
import { promisify } from "node:util";
import { fail, cleanText } from "./security.mjs";
const exec = promisify(execFile),
  PART = 10 * 1024 * 1024;
const mimeTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/html",
  "text/javascript",
  "application/json",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/x-python",
  "text/plain",
  "text/css",
  "text/x-c",
  "text/x-c++",
  "text/x-csharp",
  "text/x-golang",
  "text/x-java",
  "text/x-php",
  "text/x-ruby",
  "application/x-sh",
  "text/x-tex",
  "application/typescript",
]);
export function storageService(store) {
  const { cfg, db } = store;
  const local = join(cfg.dataDir, "media"),
    temp = join(cfg.dataDir, "tmp");
  let s3;
  const client = () => {
    if (
      !cfg.s3.bucket ||
      !cfg.s3.endpoint ||
      !cfg.s3.accessKeyId ||
      !cfg.s3.secretAccessKey
    )
      fail(503, "إعدادات S3/R2 غير مكتملة في الخادم");
    s3 ||= new S3Client({
      region: cfg.s3.region,
      endpoint: cfg.s3.endpoint,
      credentials: {
        accessKeyId: cfg.s3.accessKeyId,
        secretAccessKey: cfg.s3.secretAccessKey,
      },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    return s3;
  };
  const command = (Cmd, args) =>
    client().send(new Cmd({ Bucket: cfg.s3.bucket, ...args }));
  const sign = (Cmd, args, expiresIn = 600) =>
    getSignedUrl(client(), new Cmd({ Bucket: cfg.s3.bucket, ...args }), {
      expiresIn,
    });
  async function init(user, input) {
    const name = cleanText(input.name, 200),
      mime = cleanText(input.mime, 100),
      size = Number(input.size);
    if (
      !mimeTypes.has(mime) ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > cfg.maxUpload
    )
      fail(400, "نوع الملف أو حجمه غير مسموح");
    const content = store.getContent();
    const course = content.courses.find((c) => c.id === input.courseId);
    if (input.courseId && !course) fail(400, "الدورة غير موجودة");
    if (input.lessonId && !course?.lessons.some((l) => l.id === input.lessonId))
      fail(400, "الدرس غير موجود");
    const id = randomUUID(),
      key = id + ".source";
    let uploadId = null;
    if (cfg.storage === "s3" && size >= PART) {
      const x = await command(CreateMultipartUploadCommand, {
        Key: key,
        ContentType: mime,
      });
      uploadId = x.UploadId;
    }
    db.prepare(
      "INSERT INTO assets(id,owner_id,name,mime,size,storage,object_key,upload_id,status,public,course_id,lesson_id,section_id,thumbnail_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      user.id,
      name,
      mime,
      size,
      cfg.storage,
      key,
      uploadId,
      "uploading",
      input.public && mime.startsWith("image/") ? 1 : 0,
      input.courseId || null,
      input.lessonId || null,
      input.sectionId || course?.sectionId || null,
      input.thumbnailId || null,
      new Date().toISOString(),
    );
    const urls = [];
    if (cfg.storage === "s3") {
      if (uploadId)
        for (let n = 1; n <= Math.ceil(size / PART); n++)
          urls.push(
            await sign(
              UploadPartCommand,
              { Key: key, UploadId: uploadId, PartNumber: n },
              3600,
            ),
          );
      else
        urls.push(
          await sign(
            PutObjectCommand,
            { Key: key, ContentType: mime, ContentLength: size },
            3600,
          ),
        );
    } else if (cfg.storage !== "local") fail(503, "سائق التخزين غير مدعوم");
    store.audit(user.id, "asset.init", id, { size, mime });
    return {
      id,
      driver: cfg.storage,
      partSize: PART,
      urls,
      uploadUrl: "/api/admin/assets/" + id + "/bytes",
    };
  }
  async function writeLocal(user, id, req) {
    const asset = db
      .prepare("SELECT * FROM assets WHERE id=? AND owner_id=?")
      .get(id, user.id);
    if (!asset || asset.storage !== "local" || asset.status !== "uploading")
      fail(404, "عملية رفع غير صالحة");
    await mkdir(local, { recursive: true, mode: 0o700 });
    const target = join(local, asset.object_key);
    let count = 0;
    const limit = new Transform({
      transform(chunk, encoding, next) {
        count += chunk.length;
        if (count > asset.size)
          next(
            Object.assign(Error("حجم الملف أكبر من المسجل"), { status: 413 }),
          );
        else next(null, chunk);
      },
    });
    try {
      await pipeline(
        req,
        limit,
        createWriteStream(target, { flags: "wx", mode: 0o600 }),
      );
      if (count !== asset.size) throw Error("رفع غير مكتمل");
    } catch (err) {
      await unlink(target).catch(() => {});
      throw err;
    }
    return { uploaded: true };
  }
  async function complete(user, id, parts) {
    const asset = db
      .prepare("SELECT * FROM assets WHERE id=? AND owner_id=?")
      .get(id, user.id);
    if (!asset || asset.status !== "uploading")
      fail(404, "عملية رفع غير صالحة");
    if (asset.storage === "s3") {
      if (asset.upload_id) {
        if (
          !Array.isArray(parts) ||
          parts.length !== Math.ceil(asset.size / PART) ||
          parts.some(
            (p, i) =>
              p.PartNumber !== i + 1 ||
              typeof p.ETag !== "string" ||
              p.ETag.length > 200,
          )
        )
          fail(400, "أجزاء الرفع غير مكتملة");
        await command(CompleteMultipartUploadCommand, {
          Key: asset.object_key,
          UploadId: asset.upload_id,
          MultipartUpload: {
            Parts: parts.map((p) => ({
              PartNumber: p.PartNumber,
              ETag: p.ETag,
            })),
          },
        });
      }
      const head = await command(HeadObjectCommand, { Key: asset.object_key });
      if (Number(head.ContentLength) !== asset.size)
        fail(400, "حجم الملف المخزن لا يطابق الرفع");
    } else if ((await stat(join(local, asset.object_key))).size !== asset.size)
      fail(400, "الرفع غير مكتمل");
    const video = asset.mime.startsWith("video/");
    db.prepare("UPDATE assets SET status=?,upload_id=NULL WHERE id=?").run(
      video ? "processing" : "ready",
      id,
    );
    store.audit(user.id, "asset.uploaded", id);
    if (video) void processVideo({ ...asset, status: "processing" });
    return { status: video ? "processing" : "ready" };
  }
  const queue = [];
  let busy = false;
  let drained = [];
  function drain() {
    return busy ? new Promise((resolve) => drained.push(resolve)) : Promise.resolve();
  }
  function invalidateMediaPlans(id) {
    if (
      store
        .getContent()
        .courses.some((c) => c.lessons.some((l) => l.videoAssetId === id))
    )
      db.exec("UPDATE content SET version=version+1 WHERE id=1");
  }
  async function processVideo(asset) {
    queue.push(asset);
    if (busy) return;
    busy = true;
    while (queue.length) {
      const a = queue.shift();
      try {
        await transcode(a);
      } catch (err) {
        db.prepare("UPDATE assets SET status='failed',error=? WHERE id=?").run(
          "تعذرت معالجة الفيديو. تحقق من FFmpeg ومساحة القرص وصحة الملف.",
          a.id,
        );
        store.audit(null, "asset.processing_failed", a.id);
      }
    }
    busy = false;
    for (const resolve of drained) resolve();
    drained = [];
  }
  async function transcode(asset) {
    await mkdir(temp, { recursive: true, mode: 0o700 });
    await mkdir(local, { recursive: true, mode: 0o700 });
    const source =
        asset.storage === "local"
          ? join(local, asset.object_key)
          : join(temp, asset.id + ".source"),
      output = join(temp, asset.id + ".mp4");
    try {
      if (asset.storage === "s3") {
        const url = await sign(GetObjectCommand, { Key: asset.object_key });
        const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw Error("Download failed");
        await pipeline(
          Readable.fromWeb(r.body),
          createWriteStream(source, { mode: 0o600 }),
        );
      }
      await exec(
        cfg.ffmpeg,
        [
          "-nostdin",
          "-y",
          "-i",
          source,
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          "-vf",
          "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          output,
        ],
        { timeout: 3600000, maxBuffer: 1024 * 1024 },
      );
      const metadata = await probeFile(output);
      const size = (await stat(output)).size,
        key = asset.id + ".mp4";
      if (asset.storage === "s3")
        await command(PutObjectCommand, {
          Key: key,
          Body: createReadStream(output),
          ContentLength: size,
          ContentType: "video/mp4",
        });
      else await rename(output, join(local, key));
      db.prepare(
        "UPDATE assets SET object_key=?,mime='video/mp4',size=?,status='ready',error=NULL,duration_seconds=?,video_width=?,video_height=? WHERE id=?",
      ).run(
        key,
        size,
        metadata.durationSeconds,
        metadata.width,
        metadata.height,
        asset.id,
      );
      invalidateMediaPlans(asset.id);
      if (asset.storage === "s3")
        await command(DeleteObjectCommand, { Key: asset.object_key }).catch(
          () => store.audit(null, "asset.cleanup_pending", asset.id),
        );
      else await unlink(source).catch(() => {});
      store.audit(null, "asset.ready", asset.id, { quality: "720p" });
    } finally {
      if (asset.storage === "s3") await unlink(source).catch(() => {});
      await unlink(output).catch(() => {});
    }
  }
  async function probeFile(file) {
    const { stdout } = await exec(
      cfg.ffprobe,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        file,
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    const data = JSON.parse(stdout),
      video = data.streams?.find((s) => s.codec_type === "video"),
      duration = Number(data.format?.duration);
    if (!video || !Number.isFinite(duration) || duration <= 0)
      fail(400, "تعذر استخراج مدة فيديو صحيحة");
    return {
      durationSeconds: duration,
      width: video.width,
      height: video.height,
    };
  }
  async function probe(user, id) {
    const asset = db
      .prepare(
        "SELECT * FROM assets WHERE id=? AND mime LIKE 'video/%' AND status='ready'",
      )
      .get(id);
    if (!asset) fail(404, "الفيديو غير جاهز أو غير موجود");
    let file = join(local, asset.object_key),
      temporary = false;
    try {
      if (asset.storage === "s3") {
        await mkdir(temp, { recursive: true, mode: 0o700 });
        file = join(temp, randomUUID() + ".probe");
        const response = await fetch(
          await sign(GetObjectCommand, { Key: asset.object_key }),
        );
        if (!response.ok) fail(502, "تعذر قراءة ملف الفيديو");
        await pipeline(
          Readable.fromWeb(response.body),
          createWriteStream(file, { mode: 0o600 }),
        );
        temporary = true;
      }
      const meta = await probeFile(file);
      db.prepare(
        "UPDATE assets SET duration_seconds=?,video_width=?,video_height=? WHERE id=?",
      ).run(meta.durationSeconds, meta.width, meta.height, id);
      if (Math.abs((asset.duration_seconds || 0) - meta.durationSeconds) > 0.01)
        invalidateMediaPlans(id);
      store.audit(user.id, "asset.duration", id);
      return meta;
    } finally {
      if (temporary) await unlink(file).catch(() => {});
    }
  }
  function allowed(asset, user) {
    if (user?.role === "admin") return true;
    if (asset.status !== "ready") return false;
    if (asset.public && asset.mime.startsWith("image/")) return true;
    const content = store.getContent();
    if (
      !asset.mime.startsWith("video/") &&
      content.updates.some(
        (u) =>
          u.visible !== false &&
          u.assetId === asset.id &&
          u.rightsConfirmed === true &&
          (!u.sectionId ||
            content.sections.some((s) => s.id === u.sectionId && s.visible)) &&
          (u.free || store.entitled(user)),
      )
    )
      return true;
    return content.courses.some(
      (c) =>
        courseVisible(content, c) &&
        c.lessons.some(
          (l) =>
            l.visible !== false &&
            (l.videoAssetId === asset.id ||
              l.posterAssetId === asset.id ||
              (l.fileAssetIds || []).includes(asset.id)) &&
            canReadLesson(c, l, user, store.entitled(user)),
        ),
    );
  }
  async function media(asset, user, req, res) {
    if (!allowed(asset, user))
      fail(user ? 403 : 401, "الملف يتطلب صلاحية أو اشتراكًا نشطًا");
    if (asset.status !== "ready") fail(409, "الملف غير جاهز");
    res.setHeader(
      "Cache-Control",
      asset.public && asset.mime.startsWith("image/")
        ? "public,max-age=60"
        : "private,no-store",
    );
    if (asset.storage === "s3") {
      res.writeHead(302, {
        Location: await sign(
          GetObjectCommand,
          { Key: asset.object_key, ResponseContentType: asset.mime },
          60,
        ),
      });
      res.end();
      return;
    }
    const path = join(local, asset.object_key),
      size = (await stat(path)).size;
    res.setHeader("Content-Type", asset.mime);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader(
      "Content-Disposition",
      (asset.mime === "application/pdf" ? "attachment" : "inline") +
        '; filename="file"',
    );
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m) {
        res.writeHead(416, { "Content-Range": "bytes */" + size });
        res.end();
        return;
      }
      const suffix = !m[1],
        start = suffix ? Math.max(0, size - Number(m[2])) : Number(m[1]),
        end = suffix
          ? size - 1
          : Math.min(size - 1, m[2] ? Number(m[2]) : size - 1);
      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": "bytes */" + size });
        res.end();
        return;
      }
      res.writeHead(206, {
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`,
      });
      await pipeline(createReadStream(path, { start, end }), res);
    } else {
      res.writeHead(200, { "Content-Length": size });
      await pipeline(createReadStream(path), res);
    }
  }
  async function openForAI(user, id) {
    if (user?.role !== "admin") fail(403, "مكتبة مصادر المدرس الذكي خاصة بمالك المنصة");
    const asset = db
      .prepare("SELECT * FROM assets WHERE id=? AND status='ready'")
      .get(id);
    if (!asset) fail(404, "الملف غير موجود أو لم يكتمل رفعه");
    if (!mimeTypes.has(asset.mime) || asset.mime.startsWith("video/") || asset.mime.startsWith("image/"))
      fail(415, "هذا النوع من الملفات غير مدعوم في مكتبة المدرس الذكي");
    if (asset.storage === "s3") {
      const object = await command(GetObjectCommand, { Key: asset.object_key });
      if (!object.Body) fail(502, "تعذر فتح الملف من التخزين السحابي");
      return { asset, stream: object.Body };
    }
    return { asset, stream: createReadStream(join(local, asset.object_key)) };
  }
  async function remove(user, id) {
    const a = db.prepare("SELECT * FROM assets WHERE id=?").get(id);
    if (!a) fail(404, "الملف غير موجود");
    if (a.status === "processing")
      fail(409, "انتظر انتهاء معالجة الفيديو قبل الحذف");
    if (a.storage === "s3") {
      if (a.upload_id)
        await command(AbortMultipartUploadCommand, {
          Key: a.object_key,
          UploadId: a.upload_id,
        });
      await command(DeleteObjectCommand, { Key: a.object_key });
    } else await unlink(join(local, a.object_key)).catch(() => {});
    db.prepare("DELETE FROM assets WHERE id=?").run(id);
    invalidateMediaPlans(id);
    store.audit(user.id, "asset.delete", id);
    return { ok: true };
  }
  async function test() {
    if (cfg.storage === "s3") {
      await command(HeadBucketCommand, {});
      return { verified: true, driver: "s3" };
    }
    await mkdir(local, { recursive: true, mode: 0o700 });
    return {
      verified: true,
      driver: "local",
      message: "تخزين على قرص الخادم. ليس تخزينًا سحابيًا.",
    };
  }
  function resume() {
    db.prepare(
      "UPDATE assets SET status='failed',error='انقطع الخادم أثناء المعالجة. أعد رفع الملف.' WHERE status='processing'",
    ).run();
  }
  return {
    init,
    writeLocal,
    complete,
    allowed,
    media,
    openForAI,
    remove,
    test,
    resume,
    probe,
    drain,
  };
}
