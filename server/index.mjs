import { canReadLesson, isPreview } from "../dist/course-policy.js";
import { learningService } from "./learning.mjs";
import {
  courseVisible,
  questionVisible,
  testVisible,
} from "./learning-model.mjs";
import http from "node:http";
import { readFile, stat, mkdir, readdir, unlink } from "node:fs/promises";
import { resolve, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, randomBytes } from "node:crypto";
import { config } from "./config.mjs";
import { openDatabase, saveContent, PLANS } from "./database.mjs";
import {
  token,
  hash,
  fail,
  passwordHash,
  passwordVerify,
  jsonBody,
  rawBody,
  cleanText,
  email,
  equal,
} from "./security.mjs";
import { checkout, handleStripeWebhook, testPayment } from "./payments.mjs";
import { testAI, tutor } from "./ai.mjs";
import { storageService } from "./storage.mjs";
import { frame, codeInput, saveCode } from "./custom.mjs";
const staticRoot = fileURLToPath(new URL("../dist/", import.meta.url));
const safeUser = (u) =>
  u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null;
const now = () => new Date().toISOString();
export function createApp(cfg = config()) {
  const store = openDatabase(cfg),
    { db } = store,
    storage = storageService(store);
  storage.resume();
  const learning = learningService(store);
  const rate = (key, max = 20, window = 60000) => {
    const r = db.prepare("SELECT * FROM rate_limits WHERE key=?").get(key);
    if (r && r.expires > Date.now()) {
      if (r.count >= max)
        fail(429, "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.");
      db.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").run(key);
    } else
      db.prepare(
        "INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,expires=excluded.expires",
      ).run(key, Date.now() + window);
  };
  function authenticate(req) {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("ruzmah_session="))
      ?.split("=")[1];
    if (!cookie) return {};
    const session = db
      .prepare("SELECT * FROM sessions WHERE hash=? AND expires>?")
      .get(hash(cookie), Date.now());
    if (!session) return {};
    const user = db
      .prepare("SELECT * FROM users WHERE id=? AND disabled=0")
      .get(session.user_id);
    return user ? { user, session } : {};
  }
  const required = (user) => {
    if (!user) fail(401, "سجّل الدخول للمتابعة");
    return user;
  };
  const admin = (user) => {
    required(user);
    if (user.role !== "admin") fail(403, "هذه العملية خاصة بمالك المنصة");
  };
  function state(user) {
    const raw = JSON.parse(user.state || "{}");
    const attempts = db
      .prepare(
        "SELECT result FROM attempts WHERE user_id=? AND result IS NOT NULL ORDER BY started",
      )
      .all(user.id)
      .map((r) => JSON.parse(r.result));
    const subscriptions = db
      .prepare(
        "SELECT * FROM subscriptions WHERE user_id=? ORDER BY end_at DESC",
      )
      .all(user.id);
    return {
      completed: [],
      tasks: [],
      mistakes: [],
      answers: {},
      feedback: {},
      lastLesson: null,
      ...raw,
      attempts,
      name: user.name,
      subscription:
        subscriptions.find(
          (s) =>
            s.status === "active" && s.start_at <= now() && s.end_at > now(),
        ) || null,
      subscriptions,
    };
  }
  function saveState(user, value) {
    db.prepare("UPDATE users SET state=? WHERE id=?").run(
      JSON.stringify(value),
      user.id,
    );
    user.state = JSON.stringify(value);
  }
  function contentFor(user) {
    const value = store.getContent();
    value.instructors = learning.catalog(user).instructors;
    value.services = {
      ai: !!store.setting("ai").enabled,
      payment: !!store.setting("payment").enabled,
      paymentMode: store.setting("payment").mode,
      paymentProvider: store.setting("payment").provider,
    };
    if (user?.role === "admin") return value;
    const full = store.entitled(user);
    const availableTests = (value.tests || []).filter((t) =>
      testVisible(value, t),
    );
    value.services = {
      ai: !!store.setting("ai").enabled,
      payment: !!store.setting("payment").enabled,
      paymentMode: store.setting("payment").mode,
      paymentProvider: store.setting("payment").provider,
    };
    value.courses = value.courses
      .filter((c) => courseVisible(value, c))
      .map((c) => ({
        ...c,
        lessons: c.lessons
          .filter((l) => l.visible !== false)
          .map((l) => ({
            ...l,
            preview: isPreview(c, l),
            free: isPreview(c, l) || c.access === "free",
            video: !!(l.videoAssetId || l.videoUrl),
            attachmentCount: (l.fileAssetIds || []).length,
            attachmentNames: (l.fileAssetIds || []).map(
              (id) =>
                db.prepare("SELECT name FROM assets WHERE id=?").get(id)
                  ?.name || "ملف تعليمي",
            ),
            requiresLogin: !user,
            videoStatus: l.videoAssetId
              ? db
                  .prepare("SELECT status FROM assets WHERE id=?")
                  .get(l.videoAssetId)?.status
              : null,
            ...(!canReadLesson(c, l, user, full)
              ? {
                  body: "",
                  example: "",
                  videoUrl: "",
                  videoAssetId: "",
                  fileAssetIds: [],
                  posterAssetId: "",
                  locked: true,
                }
              : { locked: false }),
          })),
      }));
    value.questions = value.questions.filter(
      (q) => (q.access === "free" || full) && questionVisible(value, q),
    );
    value.tests = availableTests.map((t) => ({
      ...t,
      questionIds: undefined,
      count: t.questionIds.length,
      locked: t.access !== "free" && !full,
    }));
    value.updates = value.updates.filter(
      (u) =>
        u.visible !== false &&
        (!u.sectionId ||
          value.sections.some((s) => s.id === u.sectionId && s.visible)),
    );
    value.tracks = (value.tracks || []).filter(
      (t) =>
        t.visible &&
        value.sections.some((s) => s.id === t.sectionId && s.visible),
    );
    value.sections = value.sections.filter((s) => s.visible);
    value.files = value.files.filter((f) => f.free || full);
    value.students = [];
    value.subscriptions = [];
    return value;
  }
  function sessionResponse(user, session) {
    return {
      user: safeUser(user),
      csrf: session?.csrf || null,
      entitled: store.entitled(user),
      student: user ? state(user) : null,
      learning: user ? learning.me(user) : null,
    };
  }
  async function route(req, res) {
    const url = new URL(req.url, cfg.origin),
      path = url.pathname,
      method = req.method;
    const clientIp =
      cfg.trustProxy && typeof req.headers["x-real-ip"] === "string"
        ? req.headers["x-real-ip"]
        : req.socket.remoteAddress;
    const { user, session } = authenticate(req);
    const send = (value, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    if (path.startsWith("/api/")) {
      if (path === "/api/payments/webhook" && method === "POST") {
        rate("webhook:" + clientIp, 120);
        return send(
          await handleStripeWebhook(
            store,
            await rawBody(req),
            req.headers["stripe-signature"],
          ),
        );
      }
      if (!["GET", "HEAD"].includes(method)) {
        const origin = req.headers.origin;
        if (origin && origin !== cfg.origin) fail(403, "مصدر الطلب غير موثوق");
        if (!origin && cfg.production) fail(403, "يتطلب الطلب Origin");
        if (session && !equal(req.headers["x-csrf-token"], session.csrf))
          fail(403, "رمز حماية الجلسة غير صالح");
      }
      if (path.startsWith("/api/admin/")) admin(user);
      if (
        path.startsWith("/api/learning/") ||
        path.startsWith("/api/admin/learning/") ||
        path.startsWith("/api/instructors")
      ) {
        if (user && method !== "GET") rate("learning:" + user.id, 120);
        if (await learning.handle({ path, method, url, req, user, send }))
          return;
      }
      if (path === "/api/health") return send({ ok: true, version: "3.1.0" });
      if (path === "/api/session" && method === "GET")
        return send(sessionResponse(user, session));
      if (path === "/api/content" && method === "GET")
        return send(contentFor(user));
      if (
        ["/api/auth/login", "/api/auth/register"].includes(path) &&
        method === "POST"
      ) {
        rate("auth:" + clientIp, 12, 900000);
        const b = await jsonBody(req, 16000),
          mail = email(b.email);
        let u;
        if (path.endsWith("register")) {
          const name = cleanText(b.name, 80);
          if (!name) fail(400, "أدخل اسم العرض");
          const pass = await passwordHash(b.password);
          try {
            db.prepare(
              "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
            ).run(randomUUID(), mail, name, pass, "student", now());
          } catch {
            fail(400, "تعذر إنشاء الحساب بهذا البريد. جرّب تسجيل الدخول.");
          }
          u = db.prepare("SELECT * FROM users WHERE email=?").get(mail);
          store.audit(u.id, "auth.register", u.id);
        } else {
          u = db
            .prepare("SELECT * FROM users WHERE email=? AND disabled=0")
            .get(mail);
          if (!u || !(await passwordVerify(b.password, u.password_hash)))
            fail(401, "البريد الإلكتروني أو كلمة المرور غير صحيحة");
          store.audit(u.id, "auth.login", u.id);
        }
        db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
        const t = token(),
          csrf = token(),
          expires = Date.now() + 7 * 86400000;
        db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
          hash(t),
          u.id,
          csrf,
          expires,
        );
        res.setHeader(
          "Set-Cookie",
          `ruzmah_session=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${cfg.production ? "; Secure" : ""}`,
        );
        return send(sessionResponse(u, { csrf }));
      }
      if (path === "/api/auth/logout" && method === "POST") {
        if (session)
          db.prepare("DELETE FROM sessions WHERE hash=?").run(session.hash);
        res.setHeader(
          "Set-Cookie",
          "ruzmah_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" +
            (cfg.production ? "; Secure" : ""),
        );
        return send({ ok: true });
      }
      if (path === "/api/student/state" && method === "PUT") {
        required(user);
        const b = await jsonBody(req, 200000),
          s = state(user),
          content = store.getContent();
        const tasks = Array.isArray(b.tasks) ? b.tasks : [];
        if (
          tasks.length > 200 ||
          tasks.some(
            (t) =>
              typeof t.id !== "string" ||
              typeof t.text !== "string" ||
              t.text.length > 120 ||
              typeof t.done !== "boolean",
          )
        )
          fail(400, "قائمة مهام غير صالحة");
        const allowedLessons = content.courses
          .filter((c) => c.visible)
          .flatMap((c) =>
            c.lessons
              .filter(
                (l) =>
                  l.visible !== false &&
                  canReadLesson(c, l, user, store.entitled(user)),
              )
              .map((l) => l.id),
          );
        s.tasks = tasks;
        s.completed = (b.completed || []).filter((id) =>
          allowedLessons.includes(id),
        );
        s.lastLesson =
          b.lastLesson && allowedLessons.includes(b.lastLesson.id)
            ? {
                id: b.lastLesson.id,
                course: cleanText(b.lastLesson.course, 100),
                title: cleanText(b.lastLesson.title, 200),
              }
            : s.lastLesson;
        s.selectedPlan = PLANS.some((p) => p.id === b.selectedPlan)
          ? b.selectedPlan
          : null;
        delete s.attempts;
        delete s.subscriptions;
        delete s.subscription;
        saveState(user, s);
        return send({ ok: true });
      }
      if (path === "/api/practice" && method === "POST") {
        required(user);
        rate("practice:" + user.id, 120);
        const b = await jsonBody(req, 10000),
          content = store.getContent(),
          q = content.questions.find(
            (q) => q.id === b.id && questionVisible(content, q),
          );
        if (!q) fail(404, "السؤال غير موجود");
        if (q.access !== "free" && !store.entitled(user))
          fail(403, "السؤال يتطلب اشتراكًا");
        if (!Number.isInteger(b.choice) || b.choice < 0 || b.choice > 3)
          fail(400, "اختر إجابة صالحة");
        const s = state(user);
        s.answers[q.id] = b.choice;
        s.feedback[q.id] = { correct: q.correct, explanation: q.explanation };
        if (q.correct !== b.choice && !s.mistakes.includes(q.id))
          s.mistakes.push(q.id);
        delete s.attempts;
        delete s.subscriptions;
        saveState(user, s);
        learning.recordPractice(user, q, b.choice);
        return send({
          correct: q.correct,
          explanation: q.explanation,
          student: state(user),
        });
      }
      if (path === "/api/mistakes" && method === "DELETE") {
        required(user);
        const b = await jsonBody(req),
          s = state(user);
        s.mistakes = s.mistakes.filter((id) => id !== b.id);
        saveState(user, s);
        return send({ ok: true });
      }
      if (path === "/api/tests/start" && method === "POST") {
        required(user);
        rate("tests:" + user.id, 30, 3600000);
        const b = await jsonBody(req),
          content = store.getContent(),
          t = content.tests.find(
            (t) => t.id === b.id && testVisible(content, t),
          );
        if (!t) fail(404, "الاختبار غير متاح");
        if (t.access !== "free" && !store.entitled(user))
          fail(403, "الاختبار يتطلب اشتراكًا نشطًا");
        const questions = t.questionIds
          .map((id) => content.questions.find((q) => q.id === id))
          .filter(Boolean);
        if (!questions.length) fail(400, "لم تُضف أسئلة للاختبار");
        const id = randomUUID(),
          started = Date.now(),
          deadline = started + t.duration * 1000;
        db.prepare(
          "INSERT INTO attempts(id,user_id,test_id,questions,deadline,started) VALUES(?,?,?,?,?,?)",
        ).run(id, user.id, t.id, JSON.stringify(questions), deadline, started);
        store.audit(user.id, "test.start", t.id);
        return send({
          id,
          questions: questions.map(({ correct, explanation, ...q }) => q),
          answers: {},
          index: 0,
          started,
          deadline,
          points: t.points,
        });
      }
      if (path === "/api/attempts/current" && method === "GET") {
        required(user);
        const a = db
          .prepare(
            "SELECT * FROM attempts WHERE user_id=? AND result IS NULL ORDER BY started DESC LIMIT 1",
          )
          .get(user.id);
        if (!a) return send(null);
        return send({
          id: a.id,
          questions: JSON.parse(a.questions).map(
            ({ correct, explanation, ...q }) => q,
          ),
          answers: JSON.parse(a.answers),
          index: 0,
          deadline: a.deadline,
          started: a.started,
        });
      }
      if (path === "/api/student/drawing" && method === "PUT") {
        required(user);
        const b = await jsonBody(req, 1024 * 1024);
        if (
          !Array.isArray(b.strokes) ||
          b.strokes.length > 2000 ||
          b.strokes.some(
            (s) =>
              !/^#[0-9a-f]{6}$/i.test(s.color) ||
              !Number.isFinite(s.size) ||
              s.size < 1 ||
              s.size > 16 ||
              !Array.isArray(s.points) ||
              s.points.length > 50000 ||
              s.points.some(
                (p) =>
                  !Number.isFinite(p.x) ||
                  !Number.isFinite(p.y) ||
                  p.x < 0 ||
                  p.x > 1 ||
                  p.y < 0 ||
                  p.y > 1,
              ),
          )
        )
          fail(400, "بيانات المسودة غير صالحة");
        const stateData = state(user);
        stateData.drawing = b.strokes;
        saveState(user, stateData);
        return send({ ok: true });
      }
      const attemptMatch = /^\/api\/attempts\/([\w-]+)\/(answer|finish)$/.exec(
        path,
      );
      if (attemptMatch && method === "POST") {
        required(user);
        const a = db
          .prepare("SELECT * FROM attempts WHERE id=? AND user_id=?")
          .get(attemptMatch[1], user.id);
        if (!a) fail(404, "المحاولة غير موجودة");
        if (a.result)
          return send({ result: JSON.parse(a.result), student: state(user) });
        const qs = JSON.parse(a.questions),
          answers = JSON.parse(a.answers);
        if (attemptMatch[2] === "answer") {
          if (Date.now() > a.deadline) fail(409, "انتهى وقت الاختبار");
          const b = await jsonBody(req);
          if (
            !qs.some((q) => q.id === b.id) ||
            !Number.isInteger(b.choice) ||
            b.choice < 0 ||
            b.choice > 3
          )
            fail(400, "إجابة غير صالحة");
          answers[b.id] = b.choice;
          db.prepare("UPDATE attempts SET answers=? WHERE id=?").run(
            JSON.stringify(answers),
            a.id,
          );
          return send({ ok: true });
        }
        const s = state(user);
        let correct = 0;
        const review = qs.map((q) => {
          const choice = answers[q.id] ?? null;
          if (choice === q.correct) correct++;
          else if (!s.mistakes.includes(q.id)) s.mistakes.push(q.id);
          s.answers[q.id] = choice;
          return {
            id: q.id,
            text: q.text,
            options: q.options,
            correct: q.correct,
            choice,
            explanation: q.explanation,
            trackId: q.trackId || "",
            topicId: q.topicId || "",
          };
        });
        const t = store.getContent().tests.find((t) => t.id === a.test_id);
        const result = {
          id: a.id,
          date: now(),
          correct,
          total: qs.length,
          points: (t?.points || 1) * correct,
          elapsed: Math.max(
            0,
            Math.min(
              Math.round((a.deadline - a.started) / 1000),
              Math.round((Date.now() - a.started) / 1000),
            ),
          ),
          review,
        };
        db.prepare(
          "UPDATE attempts SET result=? WHERE id=? AND result IS NULL",
        ).run(JSON.stringify(result), a.id);
        delete s.attempts;
        saveState(user, s);
        learning.afterAssessment(user, a.test_id);
        return send({ result, student: state(user) });
      }
      if (path === "/api/checkout" && method === "POST") {
        required(user);
        rate("checkout:" + user.id, 10, 600000);
        const b = await jsonBody(req);
        if (b.consent !== true) fail(400, "أكد مراجعة طلبك");
        return send(await checkout(store, user, b.planId));
      }
      const orderMatch = /^\/api\/orders\/([\w-]+)$/.exec(path);
      if (orderMatch && method === "GET") {
        required(user);
        const order = db
          .prepare(
            "SELECT id,plan_id,amount,status,mode,created_at,paid_at FROM orders WHERE id=? AND user_id=?",
          )
          .get(orderMatch[1], user.id);
        if (!order) fail(404, "الطلب غير موجود");
        return send({ order, entitled: store.entitled(user) });
      }
      if (path === "/api/tutor" && method === "POST") {
        required(user);
        rate("ai:" + user.id, 15, 60000);
        return send(
          await tutor(
            store,
            user,
            await jsonBody(req, 20000),
            learning.permittedContext(user),
          ),
        );
      }
      if (path === "/api/conversations" && method === "GET") {
        required(user);
        return send(
          db
            .prepare(
              "SELECT id,created_at FROM conversations WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
            )
            .all(user.id),
        );
      }
      const convMatch = /^\/api\/conversations\/([\w-]+)$/.exec(path);
      if (convMatch && method === "GET") {
        required(user);
        if (
          !db
            .prepare("SELECT id FROM conversations WHERE id=? AND user_id=?")
            .get(convMatch[1], user.id)
        )
          fail(404, "المحادثة غير موجودة");
        return send(
          db
            .prepare(
              "SELECT role,content,created_at FROM messages WHERE conversation_id=? AND user_id=? ORDER BY id",
            )
            .all(convMatch[1], user.id),
        );
      }
      const mediaMatch = /^\/api\/media\/([\w-]+)$/.exec(path);
      if (mediaMatch && method === "GET") {
        const a = db
          .prepare("SELECT * FROM assets WHERE id=?")
          .get(mediaMatch[1]);
        if (!a) fail(404, "الملف غير موجود");
        return storage.media(a, user, req, res);
      }
      if (path === "/api/events" && method === "POST") {
        rate("views:" + clientIp, 100);
        const b = await jsonBody(req, 2000);
        if (!/^[a-z-]{1,30}$/.test(b.page)) fail(400, "صفحة غير صالحة");
        store.audit(user?.id || null, "page.view", b.page);
        return send({ ok: true });
      }
      if (path === "/api/leaks" && method === "GET") {
        required(user);
        if (user.role !== "admin" && !store.entitled(user))
          fail(403, "قسم التسريبات متاح ضمن اشتراك رُزمة");
        const rows = db
          .prepare(
            "SELECT id,track,subject,public_topic AS topic,public_description AS description,exam_date,created_at,(SELECT count(*) FROM leak_flags f WHERE f.leak_id=leak_reports.id) AS report_count FROM leak_reports WHERE status='approved' AND public_topic IS NOT NULL AND public_description IS NOT NULL ORDER BY created_at DESC LIMIT 200",
          )
          .all();
        const counts = new Map();
        for (const row of rows) {
          const key = [row.track, row.subject, row.topic.trim().toLocaleLowerCase()].join("\u0000");
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        return send({
          items: rows.map((row) => ({
            ...row,
            similarCount: counts.get(
              [row.track, row.subject, row.topic.trim().toLocaleLowerCase()].join("\u0000"),
            ) || 1,
          })),
        });
      }
      if (path === "/api/leaks" && method === "POST") {
        required(user);
        if (user.role !== "admin" && !store.entitled(user))
          fail(403, "إرسال الإفادات متاح ضمن اشتراك رُزمة");
        rate("leaks:create:" + user.id, 5, 3600000);
        const b = await jsonBody(req, 6000);
        const track = cleanText(b.track, 20),
          subject = cleanText(b.subject, 30),
          topic = cleanText(b.topic, 100),
          description = cleanText(b.description, 1200),
          examDate = b.examDate ? cleanText(b.examDate, 10) : null;
        if (!["qudrat", "tahsili", "step"].includes(track))
          fail(400, "اختر مسارًا تعليميًا صحيحًا");
        if (
          !["quantitative", "verbal", "math", "physics", "chemistry", "biology", "english", "other"].includes(subject)
        )
          fail(400, "اختر تصنيفًا صحيحًا");
        if (topic.length < 2 || description.length < 25)
          fail(400, "اكتب موضوعًا ووصفًا واضحًا لا يقل عن ٢٥ حرفًا");
        if (examDate && (!/^\\d{4}-\\d{2}-\\d{2}$/.test(examDate) || Number.isNaN(Date.parse(examDate + "T00:00:00Z"))))
          fail(400, "تاريخ التجربة غير صالح");
        if (b.rightsConfirmed !== true)
          fail(400, "أكد أن المشاركة لا تتضمن نصًا أو صورة سرية أو محمية");
        const id = randomUUID();
        db.prepare(
          "INSERT INTO leak_reports(id,user_id,track,subject,topic,description,exam_date,rights_confirmed,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        ).run(id, user.id, track, subject, topic, description, examDate, 1, now());
        store.audit(user.id, "leak.submit", id, { track, subject });
        return send({ id, status: "pending" }, 201);
      }
      const leakFlagMatch = /^\/api\/leaks\/([\w-]+)\/report$/.exec(path);
      if (leakFlagMatch && method === "POST") {
        required(user);
        if (user.role !== "admin" && !store.entitled(user))
          fail(403, "الإبلاغ متاح ضمن اشتراك رُزمة");
        rate("leaks:report:" + user.id, 10, 3600000);
        const b = await jsonBody(req, 1000),
          reason = cleanText(b.reason || "", 100);
        if (!["inaccurate", "privacy", "copyright", "other"].includes(reason))
          fail(400, "اختر سببًا صحيحًا للإبلاغ");
        const id = randomUUID();
        try {
          db.prepare(
            "INSERT INTO leak_flags(id,leak_id,user_id,reason,created_at) SELECT ?,id,?,?,? FROM leak_reports WHERE id=? AND status='approved'",
          ).run(id, user.id, reason, now(), leakFlagMatch[1]);
        } catch {
          fail(409, "سبق أن أبلغت عن هذه المشاركة");
        }
        const flag = db.prepare("SELECT changes() AS n").get();
        if (!flag.n) fail(404, "المشاركة غير موجودة");
        store.audit(user.id, "leak.report", leakFlagMatch[1], { reason });
        return send({ ok: true });
      }
      if (path === "/api/admin/leaks" && method === "GET") {
        return send(
          db.prepare(
            "SELECT r.*,u.name AS submitter,(SELECT count(*) FROM leak_flags f WHERE f.leak_id=r.id) AS report_count FROM leak_reports r LEFT JOIN users u ON u.id=r.user_id ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'needs_changes' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,r.created_at DESC LIMIT 300",
          ).all(),
        );
      }
      const leakReviewMatch = /^\/api\/admin\/leaks\/([\w-]+)\/review$/.exec(path);
      if (leakReviewMatch && method === "POST") {
        const b = await jsonBody(req, 4000),
          status = cleanText(b.status, 20),
          note = cleanText(b.note || "", 500);
        if (!["approved", "rejected", "needs_changes", "hidden"].includes(status))
          fail(400, "حالة مراجعة غير صالحة");
        let publicTopic = null,
          publicDescription = null;
        if (status === "approved") {
          publicTopic = cleanText(b.publicTopic || "", 100);
          publicDescription = cleanText(b.publicDescription || "", 1200);
          if (publicTopic.length < 2 || publicDescription.length < 25)
            fail(400, "اكتب عنوانًا ووصفًا منقحين قبل اعتماد المشاركة");
        }
        const update = db.prepare(
          "UPDATE leak_reports SET status=?,public_topic=?,public_description=?,review_note=?,reviewed_at=?,reviewed_by=? WHERE id=? AND rights_confirmed=1",
        ).run(status, publicTopic, publicDescription, note, now(), user.id, leakReviewMatch[1]);
        if (!update.changes) fail(404, "المشاركة غير موجودة أو لم تؤكد شروط النشر");
        store.audit(user.id, "leak.review." + status, leakReviewMatch[1]);
        return send({ ok: true, status });
      }
      if (path === "/api/custom" && method === "GET")
        return send(
          db
            .prepare(
              "SELECT a.scope,v.id,v.height FROM custom_active a JOIN custom_versions v ON v.id=a.version_id",
            )
            .all(),
        );
      if (path === "/api/admin/content" && method === "GET")
        return send(store.getContent());
      if (path === "/api/admin/content" && method === "PUT") {
        const b = await jsonBody(req);
        return send(saveContent(store, b, b.revision, user.id));
      }
      if (path === "/api/admin/stats" && method === "GET") {
        const active = "status='active' AND start_at<=? AND end_at>?";
        return send({
          students: db
            .prepare("SELECT count(*) n FROM users WHERE role='student'")
            .get().n,
          active: db
            .prepare(
              `SELECT count(DISTINCT user_id) n FROM subscriptions WHERE ${active}`,
            )
            .get(now(), now()).n,
          expired: db
            .prepare("SELECT count(*) n FROM subscriptions WHERE end_at<=?")
            .get(now()).n,
          subscribers: db
            .prepare("SELECT count(DISTINCT user_id) n FROM subscriptions")
            .get().n,
          total: db
            .prepare(
              "SELECT coalesce(sum(amount),0) total FROM orders WHERE status='paid' AND mode='live'",
            )
            .get().total,
          payments: db
            .prepare(
              "SELECT o.*,u.name,u.email FROM orders o JOIN users u ON o.user_id=u.id ORDER BY created_at DESC LIMIT 20",
            )
            .all(),
          views: db
            .prepare("SELECT count(*) n FROM audit WHERE action='page.view'")
            .get().n,
          tests: db
            .prepare("SELECT count(*) n FROM attempts WHERE result IS NOT NULL")
            .get().n,
          ai: db
            .prepare(
              "SELECT count(*) requests,coalesce(sum(input_tokens),0) inputTokens,coalesce(sum(output_tokens),0) outputTokens,sum(cost) cost FROM ai_usage WHERE status IN ('success','test')",
            )
            .get(),
        });
      }
      if (path === "/api/admin/users" && method === "GET") {
        const search =
          "%" + cleanText(url.searchParams.get("q") || "", 100) + "%";
        return send(
          db
            .prepare(
              "SELECT id,email,name,role,disabled,created_at FROM users WHERE role='student' AND (email LIKE ? OR name LIKE ?) ORDER BY created_at DESC LIMIT 200",
            )
            .all(search, search)
            .map((u) => ({
              ...u,
              subscriptions: db
                .prepare(
                  "SELECT * FROM subscriptions WHERE user_id=? ORDER BY end_at DESC",
                )
                .all(u.id),
              payments: db
                .prepare(
                  "SELECT id,plan_id,amount,status,mode,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
                )
                .all(u.id),
            })),
        );
      }
      if (path === "/api/admin/subscriptions" && method === "POST") {
        const b = await jsonBody(req),
          u = db
            .prepare("SELECT id FROM users WHERE id=? AND role='student'")
            .get(b.userId);
        if (!u) fail(404, "الطالب غير موجود");
        const p = PLANS.find((p) => p.id === b.planId);
        if (!p) fail(400, "اختر مدة صحيحة");
        const days = Number(b.days);
        if (!Number.isInteger(days) || days < 1 || days > 3650)
          fail(400, "مدة التفعيل غير صالحة");
        const latest = db
          .prepare(
            "SELECT end_at FROM subscriptions WHERE user_id=? AND status='active' AND end_at>? ORDER BY end_at DESC LIMIT 1",
          )
          .get(u.id, now());
        const end = new Date(latest?.end_at || now());
        end.setUTCDate(end.getUTCDate() + days);
        const id = randomUUID();
        db.prepare("INSERT INTO subscriptions VALUES(?,?,?,?,?,?,NULL)").run(
          id,
          u.id,
          p.id,
          now(),
          end.toISOString(),
          "active",
        );
        store.audit(user.id, "subscription.grant", u.id, {
          days,
          planId: p.id,
        });
        return send({ ok: true });
      }
      const subMatch = /^\/api\/admin\/subscriptions\/([\w-]+)$/.exec(path);
      if (subMatch && method === "DELETE") {
        db.prepare("UPDATE subscriptions SET status='stopped' WHERE id=?").run(
          subMatch[1],
        );
        store.audit(user.id, "subscription.stop", subMatch[1]);
        return send({ ok: true });
      }
      if (path === "/api/admin/assets" && method === "GET")
        return send(
          db
            .prepare("SELECT * FROM assets ORDER BY created_at DESC LIMIT 300")
            .all(),
        );
      if (path === "/api/admin/assets/init" && method === "POST")
        return send(await storage.init(user, await jsonBody(req, 16000)));
      const uploadMatch =
        /^\/api\/admin\/assets\/([\w-]+)\/(bytes|complete|link)$/.exec(path);
      if (uploadMatch) {
        if (uploadMatch[2] === "bytes" && method === "PUT")
          return send(await storage.writeLocal(user, uploadMatch[1], req));
        if (uploadMatch[2] === "complete" && method === "POST")
          return send(
            await storage.complete(
              user,
              uploadMatch[1],
              (await jsonBody(req)).parts,
            ),
          );
        if (uploadMatch[2] === "link" && method === "POST") {
          const b = await jsonBody(req),
            content = store.getContent(),
            c = content.courses.find((c) => c.id === b.courseId),
            l = c?.lessons.find((l) => l.id === b.lessonId),
            a = db
              .prepare("SELECT * FROM assets WHERE id=?")
              .get(uploadMatch[1]);
          if (!c || !a || (!l && !a.mime.startsWith("image/")))
            fail(400, "اختر دورة ودرسًا وملفًا صالحًا");
          db.prepare(
            "UPDATE assets SET course_id=?,lesson_id=?,section_id=?,thumbnail_id=? WHERE id=?",
          ).run(c.id, l?.id || null, c.sectionId, b.thumbnailId || null, a.id);
          if (
            b.thumbnailId &&
            !db
              .prepare(
                "SELECT id FROM assets WHERE id=? AND mime LIKE 'image/%' AND status='ready'",
              )
              .get(b.thumbnailId)
          )
            fail(400, "الصورة المصغرة غير صالحة");
          if (a.mime.startsWith("video/")) {
            l.videoAssetId = a.id;
            l.posterAssetId = b.thumbnailId || "";
            delete l.videoUrl;
          } else if (a.mime === "application/pdf") {
            l.fileAssetIds = [...new Set([...(l.fileAssetIds || []), a.id])];
          } else if (a.mime.startsWith("image/")) {
            if (l) l.posterAssetId = a.id;
            else if (a.public) c.thumbnailAssetId = a.id;
            else fail(400, "صورة الدورة يجب أن تكون متاحة للعامة");
          }
          saveContent(store, content, content.revision, user.id);
          return send({ ok: true });
        }
      }
      const probeMatch = /^\/api\/admin\/assets\/([\w-]+)\/probe$/.exec(path);
      if (probeMatch && method === "POST")
        return send(await storage.probe(user, probeMatch[1]));
      const assetMatch = /^\/api\/admin\/assets\/([\w-]+)$/.exec(path);
      if (assetMatch && method === "DELETE") {
        const result = await storage.remove(user, assetMatch[1]);
        const content = store.getContent();
        for (const c of content.courses) {
          if (c.thumbnailAssetId === assetMatch[1]) c.thumbnailAssetId = "";
          for (const l of c.lessons) {
            if (l.videoAssetId === assetMatch[1]) l.videoAssetId = "";
            if (l.posterAssetId === assetMatch[1]) l.posterAssetId = "";
            l.fileAssetIds = (l.fileAssetIds || []).filter(
              (id) => id !== assetMatch[1],
            );
          }
        }
        saveContent(store, content, content.revision, user.id);
        return send(result);
      }
      if (path === "/api/admin/storage/test" && method === "POST") {
        try {
          return send(await storage.test());
        } catch (err) {
          if (err.status) throw err;
          fail(502, "فشل اختبار التخزين. راجع إعدادات S3/R2 وصلاحيات الحاوية.");
        }
      }
      if (path === "/api/admin/storage" && method === "GET")
        return send({
          driver: cfg.storage,
          configured:
            cfg.storage === "local" ||
            !!(
              cfg.s3.endpoint &&
              cfg.s3.bucket &&
              cfg.s3.accessKeyId &&
              cfg.s3.secretAccessKey
            ),
          maxUpload: cfg.maxUpload,
        });
      const settingMatch = /^\/api\/admin\/settings\/(ai|payment)$/.exec(path);
      if (settingMatch) {
        const name = settingMatch[1],
          s = store.setting(name);
        if (method === "GET") {
          const { secrets, ...publicData } = s;
          return send({
            ...publicData,
            hasSecrets: Object.fromEntries(
              Object.keys(secrets).map((k) => [k, true]),
            ),
            envKey:
              name === "ai"
                ? !!process.env.OPENAI_API_KEY
                : !!process.env.STRIPE_SECRET_KEY,
          });
        }
        if (method === "PUT") {
          const b = await jsonBody(req, 40000),
            secrets = { ...s.secrets };
          for (const key of name === "ai"
            ? ["apiKey"]
            : ["secretKey", "webhookSecret"]) {
            if (b[key]) secrets[key] = cleanText(b[key], 1000);
            if (b["clear_" + key] === true) delete secrets[key];
          }
          let value;
          if (name === "ai") {
            const daily = Number(b.dailyLimit),
              max = Number(b.maxTokens);
            if (
              !Number.isInteger(daily) ||
              daily < 1 ||
              daily > 1000 ||
              !Number.isInteger(max) ||
              max < 32 ||
              max > 16000 ||
              !/^[a-zA-Z0-9._:-]{1,100}$/.test(b.model)
            )
              fail(400, "إعدادات النموذج أو حدود الاستخدام غير صالحة");
            value = {
              provider: "openai",
              enabled: !!b.enabled,
              model: b.model,
              dailyLimit: daily,
              maxTokens: max,
              temperature:
                b.temperature === "" || b.temperature === null
                  ? null
                  : Number(b.temperature),
              instructions: cleanText(b.instructions, 20000),
              inputPrice:
                b.inputPrice === "" || b.inputPrice == null
                  ? null
                  : Number(b.inputPrice),
              outputPrice:
                b.outputPrice === "" || b.outputPrice == null
                  ? null
                  : Number(b.outputPrice),
              connection: null,
            };
            if (
              value.temperature !== null &&
              (!Number.isFinite(value.temperature) ||
                value.temperature < 0 ||
                value.temperature > 2)
            )
              fail(400, "Temperature يجب أن تكون بين ٠ و٢");
          } else {
            if (
              !["stripe", "external"].includes(b.provider) ||
              !["test", "live"].includes(b.mode)
            )
              fail(400, "إعدادات بوابة الدفع غير صالحة");
            value = {
              provider: b.provider,
              name: cleanText(b.name, 100),
              mode: b.mode,
              enabled: !!b.enabled,
              publicKey: cleanText(b.publicKey || "", 500),
              externalUrl: cleanText(b.externalUrl || "", 2000),
              successPath: "/#/payment/success",
              cancelPath: "/#/payment/failure",
              connection: null,
            };
            if (value.externalUrl && !/^https:\/\//.test(value.externalUrl))
              fail(400, "رابط الدفع الخارجي يجب أن يكون HTTPS");
          }
          store.saveSetting(name, value, secrets);
          store.audit(user.id, "settings.update", name);
          return send({ ok: true });
        }
      }
      if (
        (path === "/api/admin/ai/test" && method === "POST") ||
        (path === "/api/admin/payment/test" && method === "POST")
      ) {
        rate("connection:" + user.id, 5, 60000);
        const name = path.includes("/ai/") ? "ai" : "payment",
          result =
            name === "ai"
              ? await testAI(store, user)
              : await testPayment(store);
        const s = store.setting(name),
          { secrets, ...pub } = s;
        store.saveSetting(name, { ...pub, connection: result }, secrets);
        return send(result);
      }
      if (path === "/api/admin/ai/usage" && method === "GET")
        return send(
          db
            .prepare(
              "SELECT a.day,a.model,a.status,count(*) requests,sum(input_tokens) inputTokens,sum(output_tokens) outputTokens,sum(cost) cost FROM ai_usage a GROUP BY a.day,a.model,a.status ORDER BY day DESC LIMIT 100",
            )
            .all(),
        );
      if (path === "/api/admin/custom" && method === "GET")
        return send({
          versions: db
            .prepare(
              "SELECT id,scope,height,status,created_at FROM custom_versions ORDER BY created_at DESC LIMIT 100",
            )
            .all(),
          active: db.prepare("SELECT * FROM custom_active").all(),
        });
      if (path === "/api/admin/custom" && method === "POST") {
        const b = await jsonBody(req, 400000);
        return send(
          saveCode(store, user, b, b.publish === true ? "published" : "draft"),
        );
      }
      if (path === "/api/admin/custom/preview" && method === "POST") {
        const b = codeInput(await jsonBody(req, 400000)),
          t = token();
        db.prepare("DELETE FROM custom_previews WHERE expires<?").run(
          Date.now(),
        );
        db.prepare("INSERT INTO custom_previews VALUES(?,?,?)").run(
          t,
          JSON.stringify(b),
          Date.now() + 300000,
        );
        return send({ url: "/custom/preview/" + t });
      }
      const codeMatch = /^\/api\/admin\/custom\/([\w-]+)$/.exec(path);
      if (codeMatch && method === "GET") {
        const v = db
          .prepare("SELECT * FROM custom_versions WHERE id=?")
          .get(codeMatch[1]);
        if (!v) fail(404, "النسخة غير موجودة");
        return send(v);
      }
      if (codeMatch && method === "POST") {
        const v = db
          .prepare("SELECT * FROM custom_versions WHERE id=?")
          .get(codeMatch[1]);
        if (!v) fail(404, "النسخة غير موجودة");
        return send(saveCode(store, user, v, "published"));
      }
      if (path === "/api/admin/audit" && method === "GET")
        return send(
          db
            .prepare(
              "SELECT a.id,a.action,a.target,a.created_at,u.name FROM audit a LEFT JOIN users u ON a.actor=u.id ORDER BY a.id DESC LIMIT 200",
            )
            .all(),
        );
      if (path === "/api/admin/backup" && method === "POST") {
        const name = "manual-" + Date.now() + ".sqlite",
          dir = join(cfg.dataDir, "backups");
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await store.backupTo(join(dir, name));
        store.audit(user.id, "backup.create", name);
        return send({
          ok: true,
          file: name,
          message:
            "حُفظت النسخة على قرص الخادم. نزّلها مع APP_KEY باستخدام قناة إدارة الاستضافة الآمنة.",
        });
      }
      fail(404, "واجهة API غير موجودة");
    }
    const frameMatch = /^\/custom\/(published|preview)\/([\w-]+)$/.exec(path);
    if (frameMatch) {
      let code;
      if (frameMatch[1] === "preview") {
        const r = db
          .prepare(
            "SELECT json FROM custom_previews WHERE token=? AND expires>?",
          )
          .get(frameMatch[2], Date.now());
        if (r) code = JSON.parse(r.json);
      } else
        code = db
          .prepare(
            "SELECT v.* FROM custom_versions v JOIN custom_active a ON a.version_id=v.id WHERE v.id=?",
          )
          .get(frameMatch[2]);
      if (!code) fail(404, "المعاينة غير موجودة");
      const out = frame(code);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": out.csp,
        "Cache-Control": "no-store",
      });
      res.end(out.html);
      return;
    }
    if (!["GET", "HEAD"].includes(method)) fail(405, "طريقة الطلب غير مسموحة");
    let requested;
    try {
      requested = decodeURIComponent(path);
    } catch {
      fail(400, "مسار غير صالح");
    }
    if (requested.includes("\0")) fail(400, "مسار غير صالح");
    let file = resolve(staticRoot, "." + requested);
    if (
      file !== resolve(staticRoot) &&
      !file.startsWith(resolve(staticRoot) + sep)
    )
      fail(403, "مسار غير صالح");
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const data = await readFile(file);
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
          ".ttf": "font/ttf",
          ".woff2": "font/woff2",
        }[extname(file)] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control":
          extname(file) === ".html" ? "no-cache" : "public,max-age=3600",
      });
      res.end(method === "HEAD" ? undefined : data);
    } catch {
      fail(404, "الصفحة غير موجودة");
    }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; media-src 'self' https:; connect-src 'self' https:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    );
    if (cfg.production)
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    try {
      await route(req, res);
    } catch (err) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = err.status || 500;
      if (status === 500) console.error("Server error:", err.code || err.name);
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify({
          error:
            status === 500
              ? "حدث خطأ في الخادم. راجع سجل الاستضافة."
              : err.message,
        }),
      );
    }
  });
  server.requestTimeout = 15 * 60 * 1000;
  server.headersTimeout = 30000;
  const backupTimer = setInterval(async () => {
    try {
      const dir = join(cfg.dataDir, "backups");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await store.backupTo(join(dir, "scheduled-" + Date.now() + ".sqlite"));
      for (const name of await readdir(dir)) {
        const p = join(dir, name);
        if ((await stat(p)).mtimeMs < Date.now() - cfg.retention * 86400000)
          await unlink(p);
      }
    } catch {
      console.error("Scheduled backup failed");
    }
  }, cfg.backupInterval);
  backupTimer.unref();
  server.on("close", () => {
    clearInterval(backupTimer);
    // Let an in-flight transcode finish its database updates before closing SQLite.
    storage.drain().then(() => store.close());
  });
  return { server, store };
}
export function startServer(cfg = config()) {
  const app = createApp(cfg);
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log("Stopping رُزمة; draining requests and media processing.");
    app.server.close();
    app.server.closeIdleConnections();
    // Stay within the container's 30-second termination grace period.
    setTimeout(() => process.exit(1), 25000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  app.server.listen(cfg.port, cfg.host, () =>
    console.log(`رُزمة: ${cfg.origin} — Admin: ${cfg.origin}/#/admin`),
  );
  return app;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startServer();
}
