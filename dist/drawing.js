import { read, student } from "./data.js";
import { api, account } from "./api.js";
export function mountDrawing(toast) {
  const canvas = document.querySelector("#scratch-canvas");
  if (!canvas) return () => {};
  const ctx = canvas.getContext("2d");
  let strokes = account.user
      ? student.drawing || []
      : read("ruzmah-drawing-v1", []),
    active = null;
  const color = document.querySelector("#pen-color"),
    size = document.querySelector("#pen-size");
  const paint = () => {
    const dpr = window.devicePixelRatio || 1,
      rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of strokes) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        let x = p.x * rect.width,
          y = p.y * rect.height;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      if (s.points.length === 1) {
        const p = s.points[0];
        ctx.arc(
          p.x * rect.width,
          p.y * rect.height,
          s.size / 2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else ctx.stroke();
    }
  };
  const point = (ev) => {
    let r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)),
    };
  };
  const save = () => {
    try {
      if (account.user) {
        student.drawing = strokes;
        void api("/api/student/drawing", {
          method: "PUT",
          body: { strokes },
        }).catch((err) => toast(err.message));
      } else localStorage.setItem("ruzmah-drawing-v1", JSON.stringify(strokes));
    } catch {
      toast("مساحة التخزين ممتلئة. احفظ المسودة كصورة.");
    }
  };
  canvas.onpointerdown = (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    active = {
      color: color.value,
      size: Number(size.value),
      points: [point(ev)],
      pointer: ev.pointerId,
    };
    strokes.push(active);
    canvas.setPointerCapture(ev.pointerId);
    paint();
  };
  canvas.onpointermove = (ev) => {
    if (!active || active.pointer !== ev.pointerId) return;
    const points = ev.getCoalescedEvents?.() || [ev];
    for (const v of points) active.points.push(point(v));
    paint();
  };
  const end = (ev) => {
    if (!active || active.pointer !== ev.pointerId) return;
    active = null;
    save();
  };
  canvas.onpointerup = end;
  canvas.onpointercancel = end;
  canvas.onlostpointercapture = end;
  const click = (ev) => {
    const action = ev.target.closest("[data-draw]")?.dataset.draw;
    if (!action) return;
    if (action === "undo") {
      strokes.pop();
      paint();
      save();
    }
    if (action === "clear") {
      if (strokes.length) {
        strokes = [];
        paint();
        save();
        toast("تم مسح المسودة");
      }
    }
    if (action === "download") {
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      let x = exportCanvas.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      x.drawImage(canvas, 0, 0);
      const a = document.createElement("a");
      a.download = "ruzmah-notes.png";
      a.href = exportCanvas.toDataURL("image/png");
      a.click();
      toast("تم تجهيز صورة المسودة");
    }
  };
  document.addEventListener("click", click);
  const observer = new ResizeObserver(paint);
  observer.observe(canvas);
  paint();
  return () => {
    observer.disconnect();
    document.removeEventListener("click", click);
  };
}
