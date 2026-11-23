import test from "node:test";
import assert from "node:assert/strict";
import { validateGeneratedPractice } from "../server/ai.mjs";

const question = {
  text: "ما ناتج ٢ + ٣؟",
  options: ["٣", "٤", "٥", "٦"],
  correct: 2,
  explanation: "٢ + ٣ = ٥.",
  sourcePage: 4,
};

test("accepts a complete generated four-option question", () => {
  const result = validateGeneratedPractice({ questions: [question] }, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].correct, 2);
  assert.equal(result[0].sourcePage, 4);
});

test("rejects a generated set with the wrong question count", () => {
  assert.throws(
    () => validateGeneratedPractice({ questions: [] }, 1),
    /العدد المطلوب/,
  );
});

test("rejects a question without exactly four options", () => {
  assert.throws(
    () => validateGeneratedPractice({
      questions: [{ ...question, options: ["أ", "ب", "ج"] }],
    }, 1),
    /غير مكتملة أو غير صالحة/,
  );
});

test("rejects an answer index outside the four options", () => {
  assert.throws(
    () => validateGeneratedPractice({
      questions: [{ ...question, correct: 4 }],
    }, 1),
    /غير مكتملة أو غير صالحة/,
  );
});

test("rejects a missing or invalid PDF source page", () => {
  assert.throws(
    () => validateGeneratedPractice({
      questions: [{ ...question, sourcePage: 0 }],
    }, 1),
    /غير مكتملة أو غير صالحة/,
  );
});
