import { account } from "./api.js";
import { escape as e } from "./data.js";
import { icon, logo } from "./ui.js";

export const studentRoutes = ["dashboard","welcome","choose","journey","learning-settings","bank","tests","quiz","results","mistakes","plan","progress","tutor","leaks","scratch","lesson","subscription"];
export const inStudentSpace = (route) => studentRoutes.includes(route) && !!account.user && (account.entitled || account.user.role === "admin");

const groups = [
  ["مساحة التعلّم", [["dashboard","shapes","الرئيسية"],["choose","book","دوراتي"],["sections","layers","المواد والمسارات"]]],
  ["التدريب والاختبارات", [["bank","target","بنك الأسئلة"],["tests","clock","الاختبارات"],["mistakes","error","دفتر الأخطاء"],["leaks","file","التسريبات"]]],
  ["أدوات الدراسة", [["tutor","spark","المدرّس الذكي"],["scratch","pen","دفتر الملاحظات"],["plan","calendar","خطة المذاكرة"],["progress","chart","إنجازاتي"]]]
];
const tabs = [["dashboard","shapes","الرئيسية"],["choose","book","دوراتي"],["tutor","spark","المدرّس"],["leaks","file","التسريبات"],["subscription","user","حسابي"]];
const activeOf = (r) => ({journey:"dashboard",progress:"dashboard",welcome:"dashboard","learning-settings":"dashboard",quiz:"tests",results:"tests",lesson:"choose"})[r] || r;
const initial = () => e((account.user?.name || "ط").trim().slice(0,1));

export function studentHeader(){
 const admin=account.user?.role==="admin";
 return `<header class="rz-topbar"><a class="rz-brand" href="#/dashboard">${logo()}</a><div class="rz-top-context"><span class="rz-live-dot"></span><span>مساحة تعلّمك</span></div><div class="rz-top-actions">${admin?`<a class="rz-icon-link" href="#/admin" aria-label="الإدارة">${icon("settings")}</a>`:""}<button class="rz-icon-link theme-toggle" data-action="theme" aria-label="تبديل الوضع الليلي">${icon(document.documentElement.dataset.theme==="dark"?"sun":"moon")}</button><a class="rz-profile" href="#/subscription"><span class="rz-avatar">${initial()}</span><span class="rz-profile-name">${e(account.user?.name||"حسابي")}</span></a></div></header>`;
}
export function studentSidebar(active){
 const current=activeOf(active);
 return `<aside class="rz-sidebar" id="app-side"><div class="rz-side-caption">القائمة الرئيسية</div><nav>${groups.map(([title,items])=>`<section class="rz-nav-group"><h2>${title}</h2>${items.map(([id,ico,label])=>`<a href="#/${id}" class="${current===id?"is-active":""}" ${current===id?'aria-current="page"':""}>${icon(ico)}<span>${label}</span>${current===id?'<i></i>':""}</a>`).join("")}</section>`).join("")}</nav><div class="rz-sidebar-bottom"><a href="#/subscription">${icon("user")}<span>الاشتراك والحساب</span></a><a href="#/learning-settings">${icon("sliders")}<span>إعدادات التعلّم</span></a><a href="#/">${icon("home")}<span>العودة إلى رُزمة</span></a><button data-action="logout">${icon("logout")}<span>تسجيل الخروج</span></button></div></aside>`;
}
export function studentTabbar(active){
 const current=activeOf(active);
 return `<nav class="rz-mobile-nav" aria-label="التنقل السريع">${tabs.map(([id,ico,label])=>`<a href="#/${id}" class="${current===id?"is-active":""}" ${current===id?'aria-current="page"':""}>${icon(ico)}<span>${label}</span></a>`).join("")}</nav>`;
}
export function studentFrame(content,active){
 return `<div class="rz-student-app">${studentHeader()}<div class="rz-workspace">${studentSidebar(active)}<main id="main" tabindex="-1" class="rz-main"><div class="rz-main-inner">${content}</div></main></div>${studentTabbar(active)}<button class="rz-mobile-scrim" data-action="student-menu" aria-label="إغلاق القائمة" tabindex="-1"></button></div>`;
}
