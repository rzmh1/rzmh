import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_RULES, normalizeContent } from "./learning-model.mjs";
export function backupBeforeLearning(db, cfg, existed) {
  if (!existed) return null;
  const marker = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='app_migrations'",
    )
    .get();
  if (
    marker &&
    db.prepare("SELECT id FROM app_migrations WHERE id='learning-v1'").get()
  )
    return null;
  const dir = join(cfg.dataDir, "backups");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(
    dir,
    "before-learning-" +
      Date.now() +
      "-" +
      randomUUID().slice(0, 8) +
      ".sqlite",
  );
  db.prepare("VACUUM INTO ?").run(path);
  chmodSync(path, 0o600);
  return path;
}
export function migrateLearning(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS app_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  if (db.prepare("SELECT id FROM app_migrations WHERE id='learning-v1'").get())
    return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS instructors(id TEXT PRIMARY KEY,name TEXT NOT NULL,bio TEXT NOT NULL,specialty TEXT NOT NULL,kind TEXT NOT NULL,image_asset_id TEXT,image_url TEXT,section_ids TEXT NOT NULL DEFAULT '[]',published INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS learning_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS learning_selections(user_id TEXT REFERENCES users(id),course_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,course_id));
 CREATE TABLE IF NOT EXISTS learning_plans(user_id TEXT PRIMARY KEY REFERENCES users(id),version INTEGER NOT NULL,summary TEXT NOT NULL,generated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS learning_tasks(user_id TEXT REFERENCES users(id),id TEXT NOT NULL,plan_version INTEGER NOT NULL,course_id TEXT,lesson_id TEXT,track_id TEXT,stage TEXT,kind TEXT NOT NULL,title TEXT NOT NULL,seconds INTEGER NOT NULL,source TEXT NOT NULL,scheduled_date TEXT,status TEXT NOT NULL,completed_at TEXT,created_at TEXT NOT NULL,PRIMARY KEY(user_id,id));
 CREATE INDEX IF NOT EXISTS learning_task_day ON learning_tasks(user_id,scheduled_date,status);
 CREATE TABLE IF NOT EXISTS learning_lesson_progress(user_id TEXT REFERENCES users(id),course_id TEXT NOT NULL,lesson_id TEXT NOT NULL,ranges TEXT NOT NULL DEFAULT '[]',read_completed INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,course_id,lesson_id));
 CREATE TABLE IF NOT EXISTS learning_practice(id INTEGER PRIMARY KEY,user_id TEXT REFERENCES users(id),question_id TEXT NOT NULL,choice INTEGER NOT NULL,correct INTEGER NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS learning_study_sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),task_id TEXT,started INTEGER NOT NULL,last_seen INTEGER NOT NULL,ended INTEGER,seconds INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS learning_study_user ON learning_study_sessions(user_id,started);`);
    const columns = db
      .prepare("PRAGMA table_info(assets)")
      .all()
      .map((c) => c.name);
    for (const [name, type] of [
      ["duration_seconds", "REAL"],
      ["video_width", "INTEGER"],
      ["video_height", "INTEGER"],
    ])
      if (!columns.includes(name))
        db.exec(`ALTER TABLE assets ADD COLUMN ${name} ${type}`);
    db.prepare("INSERT OR IGNORE INTO settings(name,json) VALUES(?,?)").run(
      "scheduler",
      JSON.stringify(DEFAULT_RULES),
    );
    const row = db.prepare("SELECT * FROM content WHERE id=1").get();
    if (row) {
      const before = JSON.parse(row.json),
        after = normalizeContent(before);
      db.prepare("UPDATE content SET json=?,version=version+1 WHERE id=1").run(
        JSON.stringify(after),
      );
    }
    db.prepare("INSERT INTO app_migrations VALUES(?,?)").run(
      "learning-v1",
      new Date().toISOString(),
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
