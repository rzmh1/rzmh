// Review build: local preview only. This flag never relaxes API authorization.
export const PREVIEW_ONLY = true;
export function makePreviewAdmin(courses, questions) {
  const now = new Date().toISOString();
  const content = courses.map(c => ({id:c.id,kind:'course',status:'published',created:now,updated:now,data:{...structuredClone(c),body:c.desc}}));
  for (const q of questions) content.push({id:q.id,kind:'question',status:'published',created:now,updated:now,data:{title:q.text,body:q.explanation,track:q.track,section:q.section,options:[...q.options],answer:q.answer}});
  const q=questions[0];
  content.push({id:'preview-leak',kind:'leak',status:'published',created:now,updated:now,data:{title:q.text,body:q.explanation,track:q.track,section:q.section,options:[...q.options],answer:q.answer}});
  content.push({id:'preview-source',kind:'source',status:'published',created:now,updated:now,data:{title:'فريق رُزمة · محتوى تعريفي',body:'مصدر توضيحي لتجربة إضافة المصادر وتعديلها.',track:'قدرات',section:'كمي'}});
  return {schema:2,content,students:[{id:'preview-student',name:'طالب المعاينة',email:'student@example.test',role:'student',created:now}],asks:[],logs:[]};
}
