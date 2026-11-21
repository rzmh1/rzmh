import { randomUUID } from "node:crypto";
import { cleanText, fail } from "./security.mjs";

const tracks = ["qudrat", "tahsili"];
const subjects = ["quantitative", "verbal", "math", "physics", "chemistry", "biology", "other"];
const reasons = ["spam", "inappropriate", "wrong", "privacy", "other"];

function access(store, user) {
  if (!user) fail(401, "سجّل الدخول للوصول إلى مجتمع رُزمة.");
  if (user.role !== "admin" && !store.entitled(user))
    fail(403, "مجتمع رُزمة متاح للمشتركين النشطين.");
}

function visiblePost(store, id) {
  const row = store.db.prepare("SELECT * FROM community_posts WHERE id=? AND status='visible'").get(id);
  if (!row) fail(404, "السؤال غير موجود أو لم يعد متاحًا.");
  return row;
}

export function listCommunityPosts(store, user, filters = {}) {
  access(store, user);
  const where = ["p.status='visible'"];
  const params = [];
  const track = filters.track || "all";
  const subject = filters.subject || "all";
  const query = cleanText(filters.q || "", 80);
  if (track !== "all") {
    if (!tracks.includes(track)) fail(400, "اختر مسارًا صحيحًا.");
    where.push("p.track=?");
    params.push(track);
  }
  if (subject !== "all") {
    if (!subjects.includes(subject)) fail(400, "اختر تصنيفًا صحيحًا.");
    where.push("p.subject=?");
    params.push(subject);
  }
  if (query) {
    where.push("(p.title LIKE ? OR p.body LIKE ?)");
    params.push("%" + query + "%", "%" + query + "%");
  }
  return store.db.prepare(
    "SELECT p.id,p.track,p.subject,p.title,p.body,p.created_at,p.updated_at,p.accepted_answer_id," +
    "COALESCE(u.name,'طالب سابق') AS author_name," +
    "(SELECT count(*) FROM community_answers a WHERE a.post_id=p.id AND a.status='visible') AS answer_count," +
    "(SELECT max(a.created_at) FROM community_answers a WHERE a.post_id=p.id AND a.status='visible') AS last_answer_at," +
    "(SELECT count(*) FROM community_flags f WHERE f.target_type='post' AND f.target_id=p.id) AS report_count " +
    "FROM community_posts p LEFT JOIN users u ON u.id=p.user_id WHERE " + where.join(" AND ") +
    " ORDER BY COALESCE(last_answer_at,p.updated_at,p.created_at) DESC LIMIT 100"
  ).all(...params);
}

export function getCommunityPost(store, user, id) {
  access(store, user);
  const post = store.db.prepare(
    "SELECT p.id,p.user_id,p.track,p.subject,p.title,p.body,p.status,p.created_at,p.updated_at,p.accepted_answer_id," +
    "COALESCE(u.name,'طالب سابق') AS author_name " +
    "FROM community_posts p LEFT JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.status='visible'"
  ).get(id);
  if (!post) fail(404, "السؤال غير موجود أو لم يعد متاحًا.");
  const answers = store.db.prepare(
    "SELECT a.id,a.user_id,a.body,a.created_at,a.updated_at,COALESCE(u.name,'طالب سابق') AS author_name," +
    "CASE WHEN p.accepted_answer_id=a.id THEN 1 ELSE 0 END AS accepted," +
    "(SELECT count(*) FROM community_flags f WHERE f.target_type='answer' AND f.target_id=a.id) AS report_count " +
    "FROM community_answers a JOIN community_posts p ON p.id=a.post_id " +
    "LEFT JOIN users u ON u.id=a.user_id WHERE a.post_id=? AND a.status='visible' AND p.status='visible' " +
    "ORDER BY accepted DESC,a.created_at ASC"
  ).all(id);
  return { post, answers };
}

export function createCommunityPost(store, user, input) {
  access(store, user);
  const track = cleanText(input.track || "", 20);
  const subject = cleanText(input.subject || "", 30);
  const title = cleanText(input.title || "", 120);
  const body = cleanText(input.body || "", 2000);
  if (!tracks.includes(track)) fail(400, "اختر القدرات أو التحصيلي.");
  if (!subjects.includes(subject)) fail(400, "اختر تصنيفًا صحيحًا.");
  if (title.length < 5 || body.length < 10)
    fail(400, "اكتب عنوانًا واضحًا وتفاصيل كافية للسؤال.");
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  store.db.prepare(
    "INSERT INTO community_posts(id,user_id,track,subject,title,body,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'visible',?,?)"
  ).run(id, user.id, track, subject, title, body, timestamp, timestamp);
  store.audit(user.id, "community.post.create", id, { track, subject });
  return { id, status: "visible", created_at: timestamp };
}

export function answerCommunityPost(store, user, postId, input) {
  access(store, user);
  visiblePost(store, postId);
  const body = cleanText(input.body || "", 1500);
  if (body.length < 2) fail(400, "اكتب إجابة قبل الإرسال.");
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  store.db.prepare(
    "INSERT INTO community_answers(id,post_id,user_id,body,status,created_at,updated_at) VALUES(?,?,?,?,'visible',?,?)"
  ).run(id, postId, user.id, body, timestamp, timestamp);
  store.db.prepare("UPDATE community_posts SET updated_at=? WHERE id=?").run(timestamp, postId);
  store.audit(user.id, "community.answer.create", id, { postId });
  return { id, status: "visible", created_at: timestamp };
}

export function acceptCommunityAnswer(store, user, postId, answerId) {
  access(store, user);
  const post = visiblePost(store, postId);
  if (post.user_id !== user.id) fail(403, "اعتماد أفضل إجابة متاح لصاحب السؤال فقط.");
  const answer = store.db.prepare(
    "SELECT id FROM community_answers WHERE id=? AND post_id=? AND status='visible'"
  ).get(answerId, postId);
  if (!answer) fail(404, "الإجابة غير موجودة أو لم تعد متاحة.");
  store.db.prepare("UPDATE community_posts SET accepted_answer_id=?,updated_at=? WHERE id=?")
    .run(answerId, new Date().toISOString(), postId);
  store.audit(user.id, "community.answer.accept", answerId, { postId });
  return { ok: true, acceptedAnswerId: answerId };
}

export function reportCommunityContent(store, user, input) {
  access(store, user);
  const targetType = cleanText(input.targetType || "", 10);
  const targetId = cleanText(input.targetId || "", 80);
  const reason = cleanText(input.reason || "", 20);
  if (!["post", "answer"].includes(targetType) || !reasons.includes(reason) || !/^[\w-]{1,80}$/.test(targetId))
    fail(400, "بيانات البلاغ غير صحيحة.");
  const exists = targetType === "post"
    ? store.db.prepare("SELECT id FROM community_posts WHERE id=? AND status='visible'").get(targetId)
    : store.db.prepare(
        "SELECT a.id FROM community_answers a JOIN community_posts p ON p.id=a.post_id WHERE a.id=? AND a.status='visible' AND p.status='visible'"
      ).get(targetId);
  if (!exists) fail(404, "المحتوى غير موجود أو لم يعد متاحًا.");
  try {
    store.db.prepare(
      "INSERT INTO community_flags(id,target_type,target_id,user_id,reason,created_at) VALUES(?,?,?,?,?,?)"
    ).run(randomUUID(), targetType, targetId, user.id, reason, new Date().toISOString());
  } catch {
    fail(409, "سبق أن أبلغت عن هذا المحتوى.");
  }
  store.audit(user.id, "community.content.report", targetId, { targetType, reason });
  return { ok: true };
}

export function listCommunityForAdmin(store) {
  const posts = store.db.prepare(
    "SELECT p.id,p.user_id,p.track,p.subject,p.title,p.body,p.status,p.created_at,p.updated_at,p.accepted_answer_id," +
    "COALESCE(u.name,'حساب محذوف') AS author_name," +
    "(SELECT count(*) FROM community_answers a WHERE a.post_id=p.id) AS answer_count," +
    "(SELECT count(*) FROM community_flags f WHERE f.target_type='post' AND f.target_id=p.id) AS report_count " +
    "FROM community_posts p LEFT JOIN users u ON u.id=p.user_id " +
    "ORDER BY CASE p.status WHEN 'hidden' THEN 0 WHEN 'visible' THEN 1 ELSE 2 END,p.updated_at DESC LIMIT 200"
  ).all();
  return posts.map((post) => ({
    ...post,
    answers: store.db.prepare(
      "SELECT a.id,a.body,a.status,a.created_at,COALESCE(u.name,'حساب محذوف') AS author_name," +
      "(SELECT count(*) FROM community_flags f WHERE f.target_type='answer' AND f.target_id=a.id) AS report_count " +
      "FROM community_answers a LEFT JOIN users u ON u.id=a.user_id WHERE a.post_id=? ORDER BY a.created_at ASC"
    ).all(post.id),
  }));
}

export function moderateCommunityPost(store, user, id, input) {
  const status = cleanText(input.status || "", 20);
  if (!["visible", "hidden", "removed"].includes(status)) fail(400, "حالة الإشراف غير صحيحة.");
  const result = store.db.prepare(
    "UPDATE community_posts SET status=?,updated_at=? WHERE id=?"
  ).run(status, new Date().toISOString(), id);
  if (!result.changes) fail(404, "السؤال غير موجود.");
  store.audit(user.id, "community.post.moderate", id, { status });
  return { ok: true, status };
}

export function moderateCommunityAnswer(store, user, id, input) {
  const status = cleanText(input.status || "", 20);
  if (!["visible", "hidden", "removed"].includes(status)) fail(400, "حالة الإشراف غير صحيحة.");
  const result = store.db.prepare(
    "UPDATE community_answers SET status=?,updated_at=? WHERE id=?"
  ).run(status, new Date().toISOString(), id);
  if (!result.changes) fail(404, "الإجابة غير موجودة.");
  if (status !== "visible")
    store.db.prepare("UPDATE community_posts SET accepted_answer_id=NULL WHERE accepted_answer_id=?").run(id);
  store.audit(user.id, "community.answer.moderate", id, { status });
  return { ok: true, status };
}
