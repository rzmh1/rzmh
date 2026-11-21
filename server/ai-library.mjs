import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { extname } from "node:path";
import { fail, cleanText } from "./security.mjs";

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const supported = new Set([
  ".c", ".cpp", ".cs", ".css", ".doc", ".docx", ".go", ".html", ".java",
  ".js", ".json", ".md", ".pdf", ".php", ".pptx", ".py", ".rb", ".sh",
  ".tex", ".ts", ".txt",
]);
const mimeByExtension = {
  ".c": "text/x-c",
  ".cpp": "text/x-c++",
  ".cs": "text/x-csharp",
  ".css": "text/css",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".go": "text/x-golang",
  ".html": "text/html",
  ".java": "text/x-java",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".php": "text/x-php",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".py": "text/x-python",
  ".rb": "text/x-ruby",
  ".sh": "text/x-sh",
  ".tex": "text/x-tex",
  ".ts": "application/typescript",
  ".txt": "text/plain",
};
const now = () => new Date().toISOString();

function requireOwner(user) {
  if (!user) fail(401, "سجّل الدخول للمتابعة");
  if (user.role !== "admin") fail(403, "مكتبة المدرس الذكي خاصة بمالك المنصة");
}

function apiKey(store) {
  const settings = store.setting("ai");
  const key = settings.secrets?.apiKey || process.env.OPENAI_API_KEY;
  if (!key) fail(503, "أضف مفتاح OpenAI في إعدادات المدرس الذكي أولًا");
  return key;
}

async function request(key, path, options = {}) {
  let response;
  try {
    response = await fetch("https://api.openai.com/v1" + path, {
      ...options,
      headers: {
        Authorization: "Bearer " + key,
        ...(options.headers || {}),
      },
      signal: options.signal || AbortSignal.timeout(120000),
    });
  } catch {
    fail(502, "تعذر الاتصال بخدمة فهرسة ملفات المدرس الذكي. حاول مرة أخرى.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = cleanText(data.error?.message || "", 300);
    fail(
      response.status === 429 ? 503 : 502,
      message
        ? "تعذر فهرسة الملف: " + message
        : "رفضت خدمة الملفات الطلب. تحقق من مفتاح OpenAI وإعدادات المشروع.",
    );
  }
  return data;
}

export function aiLibraryService(store, storage) {
  const { db } = store;
  let createPromise = null;

  function vectorStoreId() {
    return db.prepare("SELECT vector_store_id FROM ai_library_state WHERE id=1").get()?.vector_store_id || null;
  }

  async function ensureVectorStore(key) {
    const current = vectorStoreId();
    if (current) return current;
    if (!createPromise) {
      createPromise = (async () => {
        const created = await request(key, "/vector_stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "رُزمة — المكتبة الدائمة للمدرس الذكي" }),
        });
        if (!created.id) fail(502, "لم تُرجع خدمة OpenAI معرّف مكتبة الملفات");
        const timestamp = now();
        db.prepare(
          "INSERT INTO ai_library_state(id,vector_store_id,created_at,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET vector_store_id=excluded.vector_store_id,updated_at=excluded.updated_at",
        ).run(created.id, timestamp, timestamp);
        store.audit(null, "ai_library.create", created.id);
        return created.id;
      })();
    }
    try {
      return await createPromise;
    } finally {
      createPromise = null;
    }
  }

  async function uploadFile(key, asset, stream) {
    const boundary = "----RuzmahAI" + randomUUID().replace(/-/g, "");
    const extension = extname(asset.name).toLowerCase();
    const safeFallback = "ruzmah-source" + extension;
    const safeName = cleanText(asset.name, 180).replace(/[\r\n"]/g, "_");
    const prefix = Buffer.from(
      "--" + boundary +
      "\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\nassistants\r\n" +
      "--" + boundary +
      "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" +
      safeFallback + "\"; filename*=UTF-8''" + encodeURIComponent(safeName) +
      "\r\nContent-Type: " + asset.mime + "\r\n\r\n",
    );
    const suffix = Buffer.from("\r\n--" + boundary + "--\r\n");
    async function* body() {
      yield prefix;
      for await (const chunk of stream) yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      yield suffix;
    }
    const length = prefix.length + asset.size + suffix.length;
    return request(key, "/files", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=" + boundary,
        "Content-Length": String(length),
      },
      body: Readable.from(body()),
      duplex: "half",
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
  }

  async function list(user) {
    requireOwner(user);
    const rows = db.prepare(
      "SELECT a.id,a.name,a.mime,a.size,a.status AS asset_status,a.created_at," +
      "f.openai_file_id,f.status AS index_status,f.usage_bytes,f.error AS index_error,f.updated_at AS indexed_at " +
      "FROM assets a LEFT JOIN ai_library_files f ON f.asset_id=a.id " +
      "WHERE a.status='ready' AND a.mime NOT LIKE 'video/%' AND a.mime NOT LIKE 'image/%' " +
      "ORDER BY a.created_at DESC LIMIT 500"
    ).all();
    const state = db.prepare(
      "SELECT vector_store_id FROM ai_library_state WHERE id=1"
    ).get();
    const summary = db.prepare(
      "SELECT count(*) AS total,sum(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS ready," +
      "sum(CASE WHEN status IN ('uploading','in_progress') THEN 1 ELSE 0 END) AS processing," +
      "coalesce(sum(usage_bytes),0) AS usage_bytes FROM ai_library_files"
    ).get();
    return {
      files: rows.map((row) => ({
        ...row,
        indexed: !!row.openai_file_id,
      })),
      summary: {
        total: summary.total || 0,
        ready: summary.ready || 0,
        processing: summary.processing || 0,
        usageBytes: summary.usage_bytes || 0,
      },
      configured: !!state?.vector_store_id,
    };
  }

  async function index(user, assetId) {
    requireOwner(user);
    const asset = db.prepare(
      "SELECT * FROM assets WHERE id=? AND status='ready'"
    ).get(assetId);
    if (!asset) fail(404, "الملف غير موجود أو لم يكتمل رفعه");
    const extension = extname(asset.name).toLowerCase();
    if (!supported.has(extension))
      fail(415, "صيغة الملف غير مدعومة في البحث. استخدم PDF أو Word أو PowerPoint أو TXT أو MD أو HTML أو JSON أو ملفات الكود المدعومة.");
    if (asset.mime !== mimeByExtension[extension])
      fail(415, "نوع الملف لا يطابق امتداده. أعد رفع الملف بصيغته الصحيحة.");
    if (asset.size > MAX_FILE_BYTES)
      fail(413, "الملف أكبر من حد OpenAI البالغ 512 ميجابايت للملف الواحد.");
    const existing = db.prepare(
      "SELECT * FROM ai_library_files WHERE asset_id=?"
    ).get(assetId);
    if (existing && ["completed", "in_progress"].includes(existing.status))
      return { status: existing.status, alreadyIndexed: true };

    const key = apiKey(store);
    const currentVectorId = vectorStoreId();
    if (existing?.openai_file_id && currentVectorId) {
      await request(
        key,
        "/vector_stores/" + encodeURIComponent(currentVectorId) + "/files/" + encodeURIComponent(existing.openai_file_id),
        { method: "DELETE" },
      ).catch(() => {});
      await request(key, "/files/" + encodeURIComponent(existing.openai_file_id), {
        method: "DELETE",
      }).catch(() => {});
    }
    const vectorId = await ensureVectorStore(key);
    const timestamp = now();
    db.prepare(
      "INSERT INTO ai_library_files(asset_id,status,created_at,updated_at) VALUES(?,'uploading',?,?) " +
      "ON CONFLICT(asset_id) DO UPDATE SET openai_file_id=NULL,status='uploading',usage_bytes=0,error=NULL,updated_at=excluded.updated_at"
    ).run(assetId, timestamp, timestamp);

    let uploadedFileId = null;
    try {
      const opened = await storage.openForAI(user, assetId);
      const uploaded = await uploadFile(key, opened.asset, opened.stream);
      if (!uploaded.id) fail(502, "لم تُرجع خدمة OpenAI معرّف الملف");
      uploadedFileId = uploaded.id;
      db.prepare(
        "UPDATE ai_library_files SET openai_file_id=?,updated_at=? WHERE asset_id=?"
      ).run(uploadedFileId, now(), assetId);

      const attached = await request(key, "/vector_stores/" + encodeURIComponent(vectorId) + "/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: uploadedFileId,
          attributes: {
            source: "ruzmah",
            asset_id: assetId,
            original_name: safeNameAttribute(asset.name),
          },
        }),
      });
      const status = ["completed", "in_progress", "failed"].includes(attached.status)
        ? attached.status
        : "in_progress";
      db.prepare(
        "UPDATE ai_library_files SET status=?,usage_bytes=?,error=?,updated_at=? WHERE asset_id=?"
      ).run(
        status,
        Number(attached.usage_bytes) || 0,
        attached.last_error?.message ? cleanText(attached.last_error.message, 300) : null,
        now(),
        assetId,
      );
      store.audit(user.id, "ai_library.index", assetId, { openaiFileId: uploadedFileId, status });
      return { status, fileId: assetId };
    } catch (err) {
      if (uploadedFileId) {
        await request(key, "/files/" + encodeURIComponent(uploadedFileId), {
          method: "DELETE",
        }).catch(() => {});
      }
      db.prepare(
        "UPDATE ai_library_files SET status='failed',error=?,updated_at=? WHERE asset_id=?"
      ).run(cleanText(err.message || "فشلت الفهرسة", 300), now(), assetId);
      throw err;
    }
  }

  function safeNameAttribute(value) {
    return cleanText(value || "source", 500);
  }

  async function refresh(user) {
    requireOwner(user);
    const vectorId = vectorStoreId();
    if (!vectorId) return { refreshed: 0 };
    const key = apiKey(store);
    const rows = db.prepare(
      "SELECT asset_id,openai_file_id,status FROM ai_library_files WHERE openai_file_id IS NOT NULL AND status IN ('uploading','in_progress')"
    ).all();
    let refreshed = 0;
    for (const row of rows) {
      try {
        const status = await request(
          key,
          "/vector_stores/" + encodeURIComponent(vectorId) + "/files/" + encodeURIComponent(row.openai_file_id),
        );
        const next = ["completed", "in_progress", "failed", "cancelled"].includes(status.status)
          ? (status.status === "cancelled" ? "failed" : status.status)
          : row.status;
        db.prepare(
          "UPDATE ai_library_files SET status=?,usage_bytes=?,error=?,updated_at=? WHERE asset_id=?"
        ).run(
          next,
          Number(status.usage_bytes) || 0,
          status.last_error?.message ? cleanText(status.last_error.message, 300) : null,
          now(),
          row.asset_id,
        );
      } catch (err) {
        if (err.status === 404) {
          db.prepare(
            "UPDATE ai_library_files SET status='failed',error=?,updated_at=? WHERE asset_id=?"
          ).run("تعذر العثور على الملف المفهرس لدى OpenAI. أعد فهرسته.", now(), row.asset_id);
        } else {
          throw err;
        }
      }
      refreshed++;
    }
    return { refreshed };
  }

  async function remove(user, assetId) {
    requireOwner(user);
    const row = db.prepare(
      "SELECT * FROM ai_library_files WHERE asset_id=?"
    ).get(assetId);
    if (!row) fail(404, "الملف غير موجود في مكتبة المدرس الذكي");
    const key = apiKey(store);
    const vectorId = vectorStoreId();
    if (row.openai_file_id && vectorId) {
      await request(
        key,
        "/vector_stores/" + encodeURIComponent(vectorId) + "/files/" + encodeURIComponent(row.openai_file_id),
        { method: "DELETE" },
      ).catch((err) => {
        if (err.status !== 404) throw err;
      });
      await request(key, "/files/" + encodeURIComponent(row.openai_file_id), {
        method: "DELETE",
      }).catch((err) => {
        if (err.status !== 404) throw err;
      });
    }
    db.prepare("DELETE FROM ai_library_files WHERE asset_id=?").run(assetId);
    store.audit(user.id, "ai_library.remove", assetId);
    return { ok: true };
  }

  function context() {
    const id = vectorStoreId();
    if (!id) return null;
    const ready = db.prepare(
      "SELECT count(*) AS n FROM ai_library_files WHERE status='completed'"
    ).get().n;
    return ready ? { vectorStoreId: id, fileCount: ready } : null;
  }

  return { list, index, refresh, remove, context };
}
