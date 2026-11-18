import { api } from "./api.js";

// Record a deliberately started, visible study session. It does not mark a lesson
// watched or infer understanding. The server expires a missing heartbeat.
export function mountLessonStudy(toast) {
  const root = document.querySelector("#lesson-study");
  if (!root) return () => {};
  root.innerHTML =
    '<div class="study-timer"><div><b>وقت مذاكرة الدرس</b><span id="lesson-study-clock">00:00</span></div><button type="button" class="btn btn-outline btn-sm" data-lesson-study>ابدأ توقيت مذاكرتي</button><small>يُحفظ الوقت في خطتك. يتوقف عند إخفاء الصفحة أو مغادرة الدرس؛ لا يثبت المشاهدة أو الإتقان.</small></div>';
  let id = null,
    started = 0,
    tick = null,
    heartbeat = null,
    disposed = false,
    busy = false;
  const button = root.querySelector("button");
  const reset = () => {
    clearInterval(tick);
    clearInterval(heartbeat);
    tick = null;
    heartbeat = null;
    if (!disposed) button.textContent = "ابدأ توقيت مذاكرتي";
  };
  const stop = async () => {
    const current = id;
    id = null;
    reset();
    if (!current) return;
    try {
      const result = await api("/api/learning/study/" + current + "/stop", {
        method: "POST",
        body: {},
        keepalive: true,
      });
      if (!disposed) {
        root.querySelector("#lesson-study-clock").textContent =
          Math.floor(result.seconds / 60) +
          ":" +
          String(result.seconds % 60).padStart(2, "0");
        toast("حُفظ وقت المذاكرة في خطتك.");
      }
    } catch (err) {
      if (!disposed) toast(err.message);
    }
  };
  const click = async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      if (id) {
        await stop();
        return;
      }
      const s = await api("/api/learning/study/start", {
        method: "POST",
        body: {},
      });
      id = s.id;
      if (disposed || document.hidden) {
        await stop();
        return;
      }
      started = Date.now();
      button.textContent = "أنهِ التوقيت واحفظ";
      tick = setInterval(() => {
        const n = Math.floor((Date.now() - started) / 1000);
        root.querySelector("#lesson-study-clock").textContent =
          Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
      }, 1000);
      heartbeat = setInterval(async () => {
        const current = id;
        if (!current) return;
        try {
          const result = await api("/api/learning/study/" + current + "/ping", {
            method: "POST",
            body: {},
          });
          if (result.expired && current === id) {
            id = null;
            reset();
            if (!disposed)
              toast("توقّف التوقيت لانقطاع الاتصال. يمكنك بدء جلسة جديدة.");
          }
        } catch (err) {
          if (current === id) {
            id = null;
            reset();
            if (!disposed) toast(err.message);
          }
        }
      }, 20000);
    } catch (err) {
      if (!disposed) toast(err.message);
    } finally {
      busy = false;
      if (!disposed) button.disabled = false;
    }
  };
  const hide = () => {
    if (document.hidden) void stop();
  };
  button.addEventListener("click", click);
  document.addEventListener("visibilitychange", hide);
  return () => {
    disposed = true;
    void stop();
    button.removeEventListener("click", click);
    document.removeEventListener("visibilitychange", hide);
  };
}
