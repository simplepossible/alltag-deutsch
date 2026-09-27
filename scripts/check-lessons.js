import {
  applySession,
  buildLesson,
  scenes,
  scorePlacement,
  weekRecord,
  learnedScenes,
  learnedWords,
  levelMastery,
} from "../src/engine.js";

const ids = new Set();
const phraseIds = new Set();

for (const scene of scenes) {
  if (scene.phrases.length !== 5) throw new Error(`${scene.id} should have 5 phrases`);
  if (scene.checks.length !== 3) throw new Error(`${scene.id} should have 3 checks`);
  if (scene.level !== 1) throw new Error(`${scene.id} is outside A1`);
  if (ids.has(scene.id)) throw new Error(`duplicate scene ${scene.id}`);
  ids.add(scene.id);
  for (const phrase of scene.phrases) {
    if (!phrase.de || !phrase.en || !phrase.tip) throw new Error(`thin phrase ${phrase.id}`);
    if (phraseIds.has(phrase.id)) throw new Error(`duplicate phrase ${phrase.id}`);
    phraseIds.add(phrase.id);
    if (/\b(the|please|hello)\b/i.test(phrase.de)) {
      throw new Error(`English slipped into ${phrase.id}: ${phrase.de}`);
    }
  }
  for (const check of scene.checks) {
    const correct = check.options.filter((option) => option.correct);
    if (correct.length !== 1) throw new Error(`${check.id} needs one correct option`);
    if (!scene.phrases.some((phrase) => phrase.id === check.phraseId)) {
      throw new Error(`${check.id} missing phrase ${check.phraseId}`);
    }
  }
}

if (scenes.length < 100) throw new Error(`A1 needs at least 100 scenes, got ${scenes.length}`);

function profileAt(level, extra = {}) {
  return {
    level,
    xp: 0,
    ease: false,
    sessions: [],
    phraseStats: {},
    recentSceneIds: [],
    ...extra,
  };
}

const now = new Date("2026-09-26T12:00:00");
const lesson = buildLesson(profileAt(1), { nonce: 0, now });
if (lesson.lines.length !== 5) throw new Error("lesson line count");
if (lesson.checks.length !== 3) throw new Error("lesson check count");
if (lesson.level !== 1) throw new Error("a scene must stay on A1");
const again = buildLesson(profileAt(1), { nonce: 0, now });
if (again.id !== lesson.id) throw new Error("lesson should stay stable for the day");
for (const check of lesson.checks) {
  if (check.options.filter((option) => option.correct).length !== 1) {
    throw new Error("shuffled check lost its answer");
  }
}

const easier = buildLesson(profileAt(1, { ease: true }), { nonce: 1, now });
if (easier.level !== 1) throw new Error(`A1 has no easier band, got ${easier.level}`);

if (scorePlacement(5, [false, false, false, false, false]) !== 1) {
  throw new Error("failed basics should stay at the start");
}
if (scorePlacement(1, [true, true, true, true, true]) !== 2) {
  throw new Error("a modest claim should only rise one step");
}
if (scorePlacement(4, [true, true, true, true, true]) !== 4) {
  throw new Error("a strong check can place at B2");
}
if (scorePlacement(5, [true, true, true, false, true]) !== 2) {
  throw new Error("a connection guess cannot skip the neighbor line");
}

function lessonFrom(scene) {
  return {
    id: scene.id,
    sceneId: scene.id,
    title: scene.title,
    canDo: scene.canDo,
    level: scene.level,
    lines: scene.phrases,
    checks: scene.checks,
  };
}

let state = profileAt(1);
for (let i = 0; i < 3; i += 1) {
  const lesson = buildLesson(state, { nonce: i, now: new Date(2026, 8, 26 + i, 12) });
  const answers = lesson.checks.map((check) => ({ checkId: check.id, correct: true }));
  state = applySession(state, {
    lesson,
    answers,
    spelledIds: lesson.lines.map((line) => line.id),
    now: new Date(2026, 8, 26 + i, 12),
  }).profile;
}
if (state.level !== 1) throw new Error(`three scenes must not move the level, got ${state.level}`);

const a1 = scenes.filter((scene) => scene.level === 1);
let mastering = profileAt(1);
for (const scene of a1.slice(0, -1)) {
  const lesson = lessonFrom(scene);
  mastering = applySession(mastering, {
    lesson,
    answers: lesson.checks.map((check) => ({ checkId: check.id, correct: true })),
    spelledIds: lesson.lines.map((line) => line.id),
    now,
  }).profile;
}
if (mastering.level !== 1) throw new Error("almost all of A1 must not move the level");

const last = lessonFrom(a1.at(-1));
mastering = applySession(mastering, {
  lesson: last,
  answers: last.checks.map((check, index) => ({ checkId: check.id, correct: index !== 0 })),
  spelledIds: last.lines.map((line) => line.id),
  now,
}).profile;
if (mastering.level !== 1) throw new Error("a missed check must block the level");

mastering = applySession(mastering, {
  lesson: last,
  answers: last.checks.map((check) => ({ checkId: check.id, correct: true })),
  spelledIds: last.lines.map((line) => line.id),
  now: new Date("2026-09-27T12:00:00"),
}).profile;
if (mastering.level !== 1) {
  throw new Error(`A1 stays A1 when every line is known, got ${mastering.level}`);
}
if (levelMastery(mastering).scenesKnown !== a1.length) {
  throw new Error("every finished scene should count as learned");
}

const shaky = buildLesson(profileAt(1), { nonce: 3, now });
const mixed = applySession(profileAt(1), {
  lesson: shaky,
  answers: shaky.checks.map((check, index) => ({ checkId: check.id, correct: index === 0 })),
  now,
}).profile;
if (!mixed.ease) throw new Error("a weak scene should lighten the next one");
const next = buildLesson(mixed, { nonce: 4, now: new Date("2026-09-27T12:00:00") });
if (next.level !== 1) throw new Error("the next scene stays on A1");

const week = weekRecord(
  { minutesByDay: { "2026-09-21": 6, "2026-09-26": 12 } },
  new Date(2026, 8, 26, 12),
);
if (week.days.map((day) => day.label).join() !== "Mon,Tue,Wed,Thu,Fri,Sat,Sun") {
  throw new Error("week should run Monday to Sunday");
}
if (week.days[0].minutes !== 6 || !week.days[5].today || week.total !== 18) {
  throw new Error("week minutes should land on the right days");
}
const sunday = weekRecord({ minutesByDay: {} }, new Date(2026, 8, 27, 12));
if (!sunday.days[6].today || sunday.days[0].key !== "2026-09-21") {
  throw new Error("a Sunday should stay in the same Monday week");
}

const learned = learnedScenes({
  sessions: [
    { sceneId: "a1-hello" },
    { sceneId: "a1-bakery" },
    { sceneId: "a1-hello" },
  ],
  phraseStats: { "a1-market-1": { known: true } },
});
if (learned.map((scene) => scene.id).join() !== "a1-hello,a1-bakery,a1-market") {
  throw new Error(`learned scenes should be newest first, got ${learned.map((scene) => scene.id).join()}`);
}

const words = learnedWords({ phraseStats: { "a1-hello-1": { known: true } } });
if (!words.includes("guten") || !words.includes("morgen")) {
  throw new Error(`known lines should count their words, got ${words.join(" ")}`);
}

console.log(`ok — ${scenes.length} scenes, placement and level movement checked`);
