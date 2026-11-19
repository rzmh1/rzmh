export function recordAnswer(student, question, choice) {
  if (
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice >= question.options.length
  )
    throw Error("Invalid choice");
  student.answers[question.id] = choice;
  if (choice !== question.correct && !student.mistakes.includes(question.id))
    student.mistakes.push(question.id);
  return choice === question.correct;
}
export function createQuiz(questions, now = Date.now()) {
  if (!questions.length) throw Error("No questions");
  return {
    started: now,
    deadline: now + 180000,
    questions: structuredClone(questions),
    answers: {},
    index: 0,
  };
}
export function gradeQuiz(
  quiz,
  student,
  now = Date.now(),
  id = crypto.randomUUID(),
) {
  let correct = 0;
  const review = quiz.questions.map((q) => {
    const choice = quiz.answers[q.id] ?? null;
    if (choice === q.correct) correct++;
    else if (!student.mistakes.includes(q.id)) student.mistakes.push(q.id);
    student.answers[q.id] = choice;
    return {
      id: q.id,
      text: q.text,
      options: [...q.options],
      correct: q.correct,
      choice,
      explanation: q.explanation,
    };
  });
  const result = {
    id,
    date: new Date(now).toISOString(),
    correct,
    total: quiz.questions.length,
    elapsed: Math.min(
      180,
      Math.max(0, Math.round((now - quiz.started) / 1000)),
    ),
    review,
  };
  student.attempts.push(result);
  return result;
}
