import { db, escape as e } from "./data.js";
import { icon, btn, empty } from "./ui.js";
export function trackDoors() {
  const tracks = (db.tracks || []).filter(
    (t) => t.visible && t.sectionId === "qudrat",
  );
  return tracks.length
    ? `<section class="path-doors"><div class="container"><div class="section-heading"><div><span class="eyebrow">مساران. واختياراتك مستقلة.</span><h2>الكمي واللفظي.<br>كل مرحلة، بمصدر يناسبك.</h2></div><a class="text-link" href="#/choose">اختر مصادر خطتك ${icon("arrow")}</a></div><div class="path-door-grid">${tracks.map((t) => `<a class="path-door" href="#/track/${t.id}"><span>${icon(t.id === "qudrat-quant" ? "shapes" : "book")}</span><h3>${e(t.title)}</h3><p>تأسيس، تدريب، مدرسون، أسئلة واختبارات ومراجعة أخطاء.</p><small>${t.id === "qudrat-verbal" ? "المفردات · استيعاب المقروء · مهارات اللفظي" : "مفاهيم كمية · تطبيقات · قياس ومراجعة"}</small><b>استكشف المسار ${icon("arrow")}</b></a>`).join("")}</div></div></section>`
    : "";
}
export function instructorsSpotlight() {
  const sources = (db.instructors || []).filter(
    (t) => t.published && !t.deleted,
  );
  return `<section class="sources-section"><div class="container"><div class="section-heading"><div><span class="eyebrow">مصادر متعددة. وطريقتك أنت.</span><h2>تختار من يشرح لك.<br>ولكل مرحلة اختيار جديد.</h2></div><a href="#/instructors" class="text-link">جميع المدرسين والمصادر ${icon("arrow")}</a></div>${
    sources.length
      ? `<div class="source-tiles">${sources
          .slice(0, 6)
          .map(
            (t) =>
              `<a href="#/instructor/${t.id}" class="source-tile"><span>${t.imageAssetId ? `<img src="/api/media/${e(t.imageAssetId)}" alt="${e(t.name)}" loading="lazy">` : t.imageUrl ? `<img src="${e(t.imageUrl)}" alt="${e(t.name)}" loading="lazy">` : e(t.name.slice(0, 1))}</span><h3>${e(t.name)}</h3><p>${e(t.specialty)}</p><small>${t.courseIds.length} دورات منشورة</small>${icon("arrow")}</a>`,
          )
          .join("")}</div>`
      : empty(
          "مساحة لكل مصدر يستحق ثقتك.",
          "لم تُنشر ملفات المدرسين بعد. تقدر تتصفح الدورات المستقلة المتاحة، وستظهر المصادر عند إضافتها من الإدارة.",
          "user",
          btn("تصفح الدورات المتاحة", "#/sections", "outline"),
        )
  }</div></section>`;
}
export function scheduledAssessments() {
  const tests = (db.tests || []).filter(
    (t) => t.visible && ["daily", "weekly"].includes(t.level),
  );
  const weekly = db.updates.filter(
    (u) => u.visible !== false && /تكرار|أسبوع/.test(u.type),
  );
  return `<section class="assessment-hub"><div class="container"><div class="grid-two"><article class="panel"><span class="eyebrow">مراجعة تركّز على المهم</span><h2>الأسئلة الأكثر تكرارًا.</h2>${
    weekly.length
      ? weekly
          .slice(0, 2)
          .map(
            (u) =>
              `<a class="list-row" href="#/updates"><span><b>${e(u.title)}</b><small>${new Date(u.updatedAt).toLocaleDateString("ar-SA")}</small></span>${icon("arrow")}</a>`,
          )
          .join("")
      : "<p>لم يُنشر ملخص أسبوعي بعد. لا نعرض تكرارًا أو أرقامًا غير موثّقة.</p>"
  }<a class="text-link spaced" href="#/updates">مركز التحديثات ${icon("arrow")}</a></article><article class="panel"><span class="eyebrow">قياس يساعدك تراجع</span><h2>اختبارات يومية وأسبوعية.</h2>${
    tests.length
      ? tests
          .slice(0, 4)
          .map(
            (t) =>
              `<a class="list-row" href="#/tests/${t.id}"><span><b>${e(t.title)}</b><small>${t.level === "weekly" ? "أسبوعي" : "يومي"} · ${t.count ?? t.questionIds?.length ?? 0} أسئلة · ${Math.ceil(t.duration / 60)} دقائق</small></span>${icon("arrow")}</a>`,
          )
          .join("")
      : "<p>تظهر الاختبارات بعد نشرها. لا يوجد اختبار يومي أو أسبوعي منشور حاليًا.</p>"
  }<a class="text-link spaced" href="#/tests">جميع الاختبارات ${icon("arrow")}</a></article></div></div></section>`;
}
