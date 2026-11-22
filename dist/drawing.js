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

// Floating lesson pen: fixed launcher with drawing, selection, crop and capture tools.
export function mountLessonTools(toast) {
  const root = document.querySelector(".lesson-content");
  if (!root || document.querySelector("#lesson-tools-fab")) return () => {};
  root.style.position = "relative";
  const canvas = document.createElement("canvas");
  canvas.className = "lesson-floating-canvas";
  canvas.setAttribute("aria-label", "قلم وملاحظات الدرس");
  root.appendChild(canvas);
  const fab = document.createElement("button");
  fab.id = "lesson-tools-fab"; fab.className = "lesson-tools-fab"; fab.type = "button"; fab.textContent = "✎"; fab.setAttribute("aria-label","أدوات القلم");
  const panel = document.createElement("div"); panel.id="lesson-tools-panel"; panel.className="lesson-tools-panel"; panel.hidden=true;
  panel.innerHTML = '<div class="lesson-tools-head"><b>أدوات الدرس</b><button type="button" data-ltool="close" aria-label="إغلاق">×</button></div><div class="lesson-tools-grid"><button type="button" data-mode="pen">✎ قلم</button><button type="button" data-mode="marker">تمييز</button><button type="button" data-mode="select">تحديد</button><button type="button" data-mode="eraser">ممحاة</button><button type="button" data-ltool="undo">تراجع</button><button type="button" data-ltool="clear">مسح الكل</button><button type="button" data-ltool="crop">قص التحديد</button><button type="button" data-ltool="capture">تصوير الشاشة</button><button type="button" data-ltool="save">حفظ في الدفتر</button><button type="button" data-ltool="send">إرسال للمدرّس</button></div><p class="lesson-tools-hint">اختر القلم ثم اكتب على الدرس. أداة التحديد ترسم إطارًا حول الجزء المطلوب قصّه.</p>';
  document.body.append(fab,panel);
  const ctx=canvas.getContext("2d"); let strokes=Array.isArray(student.drawing)?student.drawing.slice():[],active=null,mode="view",selection=null,selectStart=null,snapshot=null;
  const point=ev=>{const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(ev.clientY-r.top)/r.height))};};
  function paint(){const r=root.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));canvas.style.width=r.width+"px";canvas.style.height=r.height+"px";ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.lineCap="round";ctx.lineJoin="round";for(const s of strokes){ctx.save();ctx.globalCompositeOperation=s.kind==="eraser"?"destination-out":"source-over";ctx.globalAlpha=s.kind==="marker"?.28:1;ctx.strokeStyle=s.color||"#594775";ctx.lineWidth=s.size||3;ctx.beginPath();(s.points||[]).forEach((p,i)=>i?ctx.lineTo(p.x*r.width,p.y*r.height):ctx.moveTo(p.x*r.width,p.y*r.height));ctx.stroke();ctx.restore();}if(selection){ctx.save();ctx.strokeStyle="#6a55b5";ctx.lineWidth=2;ctx.setLineDash([6,5]);ctx.strokeRect(selection.x*r.width,selection.y*r.height,selection.w*r.width,selection.h*r.height);ctx.fillStyle="#6a55b522";ctx.fillRect(selection.x*r.width,selection.y*r.height,selection.w*r.width,selection.h*r.height);ctx.restore();}}
  function persist(){student.drawing=strokes;try{localStorage.setItem("ruzmah-lesson-ink",JSON.stringify(strokes.slice(-250)));}catch{}if(account.user)void api("/api/student/drawing",{method:"PUT",body:{strokes}}).catch(err=>toast(err.message));}
  function setMode(next){mode=next;canvas.style.pointerEvents=next==="view"?"none":"auto";panel.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===next));}
  canvas.addEventListener("pointerdown",ev=>{if(mode==="view")return;ev.preventDefault();canvas.setPointerCapture(ev.pointerId);const p=point(ev);if(mode==="select"){selectStart=p;selection={x:p.x,y:p.y,w:0,h:0};paint();return;}active={kind:mode,color:mode==="marker"?"#f0c84b":"#594775",size:mode==="marker"?16:mode==="eraser"?24:3,points:[p]};strokes.push(active);paint();});
  canvas.addEventListener("pointermove",ev=>{if(mode==="select"&&selectStart){const p=point(ev);selection={x:Math.min(selectStart.x,p.x),y:Math.min(selectStart.y,p.y),w:Math.abs(p.x-selectStart.x),h:Math.abs(p.y-selectStart.y)};paint();return;}if(active){active.points.push(point(ev));paint();}});
  const finish=()=>{if(active){active=null;persist();}if(selectStart)selectStart=null;};canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",finish);
  async function capture(){try{if(navigator.mediaDevices?.getDisplayMedia){const stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:"browser"},audio:false});const video=document.createElement("video");video.srcObject=stream;await video.play();const shot=document.createElement("canvas");shot.width=video.videoWidth||1280;shot.height=video.videoHeight||720;shot.getContext("2d").drawImage(video,0,0,shot.width,shot.height);stream.getTracks().forEach(t=>t.stop());snapshot=shot;toast("تم التقاط الشاشة. حدّد الجزء الذي تريد قصّه.");return;}}catch(err){if(err.name!=="NotAllowedError")toast("تعذر تصوير الشاشة في هذا المتصفح.");return;}const video=root.querySelector("video");if(video&&video.readyState>=2){const shot=document.createElement("canvas");shot.width=video.videoWidth;shot.height=video.videoHeight;shot.getContext("2d").drawImage(video,0,0);snapshot=shot;toast("تم التقاط إطار الفيديو.");}else toast("تصوير الشاشة غير مدعوم هنا. يمكنك استخدام القلم والتحديد داخل الدرس.");}
  function crop(){if(!selection||selection.w<.02||selection.h<.02){toast("اختر مساحة من الدرس أولًا.");return null;}const source=snapshot||canvas;const sx=Math.round(selection.x*source.width),sy=Math.round(selection.y*source.height),sw=Math.max(1,Math.round(selection.w*source.width)),sh=Math.max(1,Math.round(selection.h*source.height));const out=document.createElement("canvas");out.width=sw;out.height=sh;out.getContext("2d").drawImage(source,sx,sy,sw,sh,0,0,sw,sh);selection=null;paint();return out.toDataURL("image/png");}
  function saveImage(data){if(!data){toast("التقط الشاشة أو حدّد جزءًا أولًا.");return;}let items=[];try{items=JSON.parse(localStorage.getItem("ruzmah-lesson-notebook")||"[]");}catch{}items.push({title:"قصاصة من الدرس",createdAt:new Date().toISOString(),image:data});try{localStorage.setItem("ruzmah-lesson-notebook",JSON.stringify(items.slice(-20)));toast("حُفظت القصاصة في دفتر هذا المتصفح.");}catch{toast("تعذر الحفظ؛ مساحة التخزين ممتلئة.");}}
  fab.addEventListener("click",()=>{panel.hidden=!panel.hidden;});
  panel.addEventListener("click",async ev=>{const b=ev.target.closest("button");if(!b)return;if(b.dataset.mode){setMode(b.dataset.mode);return;}const action=b.dataset.ltool;if(action==="close"){panel.hidden=true;setMode("view");}if(action==="undo"){strokes.pop();paint();persist();}if(action==="clear"){strokes=[];selection=null;paint();persist();}if(action==="capture")await capture();if(action==="crop"){const data=crop();if(data){snapshot=null;saveImage(data);}}if(action==="save"){saveImage(snapshot?snapshot.toDataURL("image/png"):canvas.toDataURL("image/png"));}if(action==="send"){const data=selection?crop():(snapshot?snapshot.toDataURL("image/png"):canvas.toDataURL("image/png"));if(!data){toast("التقط الشاشة أو حدّد جزءًا أولًا.");return;}try{localStorage.setItem("ruzmah-pending-tutor-image",data);location.hash="#/tutor";}catch{toast("تعذر تجهيز الصورة للإرسال.");}}});
  const observer=new ResizeObserver(paint);observer.observe(root);paint();setMode("view");
  return ()=>{observer.disconnect();fab.remove();panel.remove();canvas.remove();};
}
