import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import { account } from "../dist/api.js";
import { db } from "../dist/data.js";
import { mountLearning, learningPage, teacherCard, courseGroupName } from "../dist/learning.js";
import { coursePage, lessonPage } from "../dist/pages.js";
import { mountLessonStudy } from "../dist/lesson-study.js";

test("onboarding auto-advances in one viewport and teacher stages can be selected or skipped", async () => {
  const keys = ["document", "fetch", "FormData", "location"], previous = Object.fromEntries(keys.map(k => [k, globalThis[k]])), oldUser = account.user;
  const root={innerHTML:""},error={textContent:""},events={},requests=[];
  let profile={onboardingStep:0,sectionId:null,foundationStarted:null,foundationCompleted:null,selfLevel:"unknown",targetScore:null,examDate:null,dailyMinutes:null,studyDays:[],aiContextConsent:false,onboardingCompleted:false},selected=[];
  const form={id:"welcome-form",dataset:{},values:[],reportValidity:()=>true,querySelector:()=>({disabled:false})};
  const catalog={sections:[{id:"qudrat",title:"القدرات"}],tracks:[{id:"qudrat-quant",title:"الكمي",sectionId:"qudrat",visible:true},{id:"qudrat-verbal",title:"اللفظي",sectionId:"qudrat",visible:true}],instructors:Array.from({length:4},(_,i)=>({id:"source-"+i,name:"المصدر "+i,specialty:"كمي"})),courses:Array.from({length:4},(_,i)=>({id:"choice-"+i,title:"دورة "+i,description:"محتوى منشور",trackId:i<2?"qudrat-quant":"qudrat-verbal",stage:i%2?"training":"foundation",instructorId:"source-"+i,metrics:{videoCount:3,lessonCount:3,videoSeconds:1800,estimatedSeconds:0,unknownVideoCount:0}}))};
  globalThis.document={hidden:false,querySelector:s=>s==="#learning-root"?root:s==="#welcome-form"?form:s==="#learning-form-error"?error:null,addEventListener:(n,fn)=>events[n]=fn,removeEventListener:n=>delete events[n]};
  globalThis.FormData=class{constructor(f){this.values=f.values||[]}get(k){return this.values.find(([n])=>n===k)?.[1]??null}getAll(k){return this.values.filter(([n])=>n===k).map(([,v])=>v)}has(k){return this.values.some(([n])=>n===k)}};
  globalThis.location={hash:"#/welcome"};account.user={id:"student",name:"طالب"};
  globalThis.fetch=async(path,options)=>{const body=options.body?JSON.parse(options.body):null;requests.push({path,body});let value;if(path==="/api/learning/catalog")value=catalog;else if(path==="/api/learning/me")value={profile,selectedCourseIds:selected};else if(path==="/api/learning/profile"){profile={...profile,...body};value={profile};}else if(path==="/api/learning/selections"){selected=body.courseIds;value={version:1};}else throw Error("Unexpected route "+path);return{ok:true,json:async()=>structuredClone(value)}};
  let dispose=()=>{};
  try{
    const errors=[];dispose=mountLearning("welcome",null,s=>errors.push(s),()=>{});
    for(let i=0;i<10&&!root.innerHTML.includes("وش اختبارك؟");i++)await setImmediate();
    assert(root.innerHTML.includes("1 / 3"));assert(!root.innerHTML.includes("التالي"));
    form.values=[["sectionId","qudrat"]];events.change({target:{name:"sectionId"}});await setImmediate();
    assert(root.innerHTML.includes("وش تحتاج في رحلتك؟"));
    form.values=[["studyMode","both"]];events.change({target:{name:"studyMode"}});await setImmediate();
    assert(root.innerHTML.includes("متى اختبارك؟"));assert(!root.innerHTML.includes("التالي"));
    form.values=[["examDate","2027-01-01"],["hours","2"]];await events.submit({target:form,preventDefault(){}});
    assert.equal(profile.sectionId,"qudrat");assert.equal(profile.dailyMinutes,120);assert.equal(profile.examDate,"2027-01-01");
    assert.equal(profile.selfLevel,"intermediate");assert.equal(profile.onboardingCompleted,true);assert.equal(location.hash,"#/choose");
    dispose();root.innerHTML="";dispose=mountLearning("choose",null,s=>errors.push(s),()=>{});
    for(let i=0;i<10&&!root.innerHTML.includes("data-choice-teacher");i++)await setImmediate();
    for(let i=0;i<4;i++){const id="source-"+i;assert(root.innerHTML.includes('data-choice-teacher="'+id+'"'));await events.click({target:{closest:()=>({dataset:{choiceTeacher:id},hasAttribute:()=>false})}});}
    assert.deepEqual(selected,["choice-0","choice-1","choice-2","choice-3"]);assert.equal(location.hash,"#/journey");
    assert.equal(requests.filter(r=>r.path==="/api/learning/profile").length,3);assert.deepEqual(errors,[]);
  }finally{dispose();account.user=oldUser;for(const k of keys)if(previous[k]===undefined)delete globalThis[k];else globalThis[k]=previous[k];}
});

test("learning pages retain source identity, actual clip duration, linked practice and responsive theme styles", async () => {
  const original = structuredClone(db),
    oldDoc = globalThis.document,
    oldUser = account.user;
  try {
    globalThis.document = { documentElement: { dataset: { theme: "light" } } };
    db.instructors = [
      { id: "owned-source", name: "مصدر منشور", published: true },
    ];
    const c = db.courses[0];
    c.instructorId = "owned-source";
    c.stage = "training";
    c.lessons[0].durationSeconds = 1234;
    c.lessons[0].practiceQuestionIds = ["q1", "q2"];
    const html = coursePage(c.id);
    c.groupTitle = "زبدة المصدر";
    assert.equal(courseGroupName(c), "زبدة المصدر");
    assert(teacherCard({ id: "owned-source", name: "مصدر منشور", specialty: "كمي", courseIds: [], videoCount: 0 }, "qudrat-quant").includes("#/instructor/owned-source?track=qudrat-quant"));
    assert(html.includes("مصدر منشور"));
    assert(html.includes("20:34"));
    assert(html.includes("#/pricing"));
    account.user = { id: "student", name: "طالب" };
    const lesson = lessonPage(c.id, c.lessons[0].id);
    assert(lesson.includes("questions=q1%2Cq2"));
    assert(lesson.includes('id="lesson-study"'));
    for (const kind of [
      "welcome",
      "choose",
      "journey",
      "instructors",
      "instructor",
      "track",
      "discover",
      "settings",
    ]) {
      const output = learningPage(kind);
      assert(!output.includes("undefined"));
      assert.equal((output.match(/id="learning-root"/g) || []).length, 1);
    }
    const css = await readFile(
      new URL("../dist/learning.css", import.meta.url),
      "utf8",
    );
    await transform(css, { loader: "css" });
    assert(css.includes("prefers-reduced-motion"));
    assert(/max-width:\s*640px/.test(css));
    assert(css.includes("44px"));
  } finally {
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, original);
    account.user = oldUser;
    globalThis.document = oldDoc;
  }
});

test("lesson study timer saves on hidden page and navigation without marking content mastered", async () => {
  const oldDoc = globalThis.document,
    oldFetch = globalThis.fetch,
    events = {},
    calls = [],
    clock = { textContent: "" },
    button = {
      textContent: "",
      disabled: false,
      addEventListener: (_, fn) => (events.click = fn),
      removeEventListener: () => delete events.click,
    },
    root = {
      innerHTML: "",
      querySelector: (s) => (s === "button" ? button : clock),
    };
  globalThis.document = {
    hidden: false,
    querySelector: () => root,
    addEventListener: (_, fn) => (events.hide = fn),
    removeEventListener: () => delete events.hide,
  };
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return {
      ok: true,
      json: async () =>
        path.endsWith("/start")
          ? { id: "session-" + calls.length }
          : { seconds: 125 },
    };
  };
  let cleanup = () => {};
  try {
    cleanup = mountLessonStudy(() => {});
    await events.click();
    assert(button.textContent.includes("احفظ"));
    document.hidden = true;
    events.hide();
    await setImmediate();
    assert.equal(clock.textContent, "2:05");
    assert(calls[1].path.endsWith("/stop"));
    assert.equal(calls[1].options.keepalive, true);
    document.hidden = false;
    await events.click();
    cleanup();
    await setImmediate();
    assert(calls.at(-1).path.endsWith("/stop"));
    assert(!calls.some((c) => c.path.includes("/complete")));
  } finally {
    cleanup();
    globalThis.document = oldDoc;
    globalThis.fetch = oldFetch;
  }
});
