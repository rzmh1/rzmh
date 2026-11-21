import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { config } from "../server/config.mjs";
import { openDatabase } from "../server/database.mjs";
import { storageService } from "../server/storage.mjs";
import { aiLibraryService } from "../server/ai-library.mjs";
import { aiRequest } from "../server/ai.mjs";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ruzmah-ai-library-"));
  const cfg = config({
    DATA_DIR: dir,
    APP_KEY: randomBytes(32).toString("base64"),
    APP_ORIGIN: "http://127.0.0.1:3000",
  });
  const store = openDatabase(cfg);
  const admin = { id: randomUUID(), role: "admin", name: "مالك رُزمة" };
  const student = { id: randomUUID(), role: "student", name: "طالب" };
  for (const user of [admin, student]) {
    store.db.prepare(
      "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)"
    ).run(user.id, user.id + "@example.test", user.name, "test-hash", user.role, new Date().toISOString());
  }
  const media = join(dir, "media");
  await mkdir(media, { recursive: true });
  const bytes = Buffer.from("%PDF-1.7\nRuzmah test document\n%%EOF\n");
  await writeFile(join(media, "source.pdf"), bytes);
  const assetId = randomUUID();
  store.db.prepare(
    "INSERT INTO assets(id,owner_id,name,mime,size,storage,object_key,status,created_at) VALUES(?,?,?,?,?,'local',?,'ready',?)"
  ).run(assetId, admin.id, "Biology.pdf", "application/pdf", bytes.length, "source.pdf", new Date().toISOString());
  const ai = store.setting("ai");
  store.saveSetting("ai", ai, { apiKey: "test-key" });
  const storage = storageService(store);
  const library = aiLibraryService(store, storage);
  return {
    dir, store, admin, student, assetId, library,
    close: async () => {
      store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("permanent tutor library uploads, indexes, refreshes and removes files", async () => {
  const f = await fixture();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const method = options.method || "GET";
    calls.push({ path: parsed.pathname, method });
    if (parsed.pathname === "/v1/vector_stores" && method === "POST")
      return new Response(JSON.stringify({ id: "vs_ruzmah_test" }), { status: 200 });
    if (parsed.pathname === "/v1/files" && method === "POST") {
      const chunks = [];
      for await (const chunk of options.body) chunks.push(Buffer.from(chunk));
      const payload = Buffer.concat(chunks).toString("utf8");
      assert.match(payload, /name="purpose"/);
      assert.match(payload, /assistants/);
      assert.match(payload, /Biology\.pdf/);
      assert.match(payload, /%PDF-1\.7/);
      return new Response(JSON.stringify({ id: "file_ruzmah_test" }), { status: 200 });
    }
    if (parsed.pathname === "/v1/vector_stores/vs_ruzmah_test/files" && method === "POST")
      return new Response(JSON.stringify({
        id: "file_ruzmah_test",
        status: "in_progress",
        usage_bytes: 120,
      }), { status: 200 });
    if (parsed.pathname === "/v1/vector_stores/vs_ruzmah_test/files/file_ruzmah_test" && method === "GET")
      return new Response(JSON.stringify({
        id: "file_ruzmah_test",
        status: "completed",
        usage_bytes: 140,
      }), { status: 200 });
    if (parsed.pathname === "/v1/vector_stores/vs_ruzmah_test/files/file_ruzmah_test" && method === "DELETE")
      return new Response(JSON.stringify({ id: "file_ruzmah_test", deleted: true }), { status: 200 });
    if (parsed.pathname === "/v1/files/file_ruzmah_test" && method === "DELETE")
      return new Response(JSON.stringify({ id: "file_ruzmah_test", deleted: true }), { status: 200 });
    throw Error("Unexpected OpenAI request: " + method + " " + parsed.pathname);
  };
  try {
    const initial = await f.library.list(f.admin);
    assert.equal(initial.summary.total, 0);
    assert.equal(initial.files.length, 1);
    assert.equal(initial.files[0].name, "Biology.pdf");

    const indexed = await f.library.index(f.admin, f.assetId);
    assert.equal(indexed.status, "in_progress");
    assert.equal(f.library.context(), null);

    const refreshed = await f.library.refresh(f.admin);
    assert.equal(refreshed.refreshed, 1);
    assert.equal(f.library.context().vectorStoreId, "vs_ruzmah_test");
    assert.equal(f.library.context().fileCount, 1);

    const listed = await f.library.list(f.admin);
    assert.equal(listed.summary.ready, 1);
    assert.equal(listed.files[0].index_status, "completed");
    assert.equal(listed.files[0].usage_bytes, 140);

    await f.library.remove(f.admin, f.assetId);
    assert.equal(f.library.context(), null);
    assert.equal((await f.library.list(f.admin)).summary.total, 0);
    assert.ok(calls.some((call) => call.path === "/v1/vector_stores" && call.method === "POST"));
    assert.ok(calls.some((call) => call.path === "/v1/files" && call.method === "POST"));
  } finally {
    globalThis.fetch = originalFetch;
    await f.close();
  }
});

test("only the owner can access or index permanent tutor sources", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      () => f.library.list(f.student),
      (err) => err.status === 403,
    );
    await assert.rejects(
      () => f.library.index(f.student, f.assetId),
      (err) => err.status === 403,
    );
  } finally {
    await f.close();
  }
});


test("tutor attaches the permanent file search tool only when a library exists", () => {
  const settings = {
    model: "gpt-4.1-mini",
    instructions: "تعليمات رُزمة",
    maxTokens: 1200,
    temperature: null,
  };
  const withoutLibrary = aiRequest(settings, [{ role: "user", content: "اشرح النسبة" }]);
  assert.equal(withoutLibrary.tools, undefined);
  const withLibrary = aiRequest(
    settings,
    [{ role: "user", content: "اشرح النسبة" }],
    "مكتبة مصادر رُزمة",
    "vs_ruzmah_test",
  );
  assert.deepEqual(withLibrary.tools, [{
    type: "file_search",
    vector_store_ids: ["vs_ruzmah_test"],
    max_num_results: 6,
  }]);
});
