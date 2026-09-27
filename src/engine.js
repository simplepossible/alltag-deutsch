import { LEVELS, placementItems, scenes } from "./content.js";

export { LEVELS, placementItems, scenes };

export function localDay(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function levelInfo(id) {
  return LEVELS.find((level) => level.id === id) ?? LEVELS[0];
}

function hash(text) {
  let h = 2166136261;
  for (const char of text) {
    h = Math.imul(h ^ char.codePointAt(0), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rand) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function scorePlacement(self, checks) {
  const [bill, order, , duration, connection] = checks;
  let supported = 1;
  if (bill && order) supported = 2;
  if (supported === 2 && duration) supported = 3;
  if (supported === 3 && connection) supported = 4;

  let level = supported;
  if (self < supported) level = Math.min(supported, self + 1);
  if (self > supported) level = supported;
  return Math.max(1, Math.min(4, level));
}

function staleness(id, recent) {
  const index = recent.indexOf(id);
  return index === -1 ? Infinity : recent.length - index;
}

function isKnown(profile, id) {
  return Boolean(profile.phraseStats?.[id]?.known);
}

export function levelMastery(profile, level = profile.level) {
  const at = scenes.filter((scene) => scene.level === level);
  let known = 0;
  let total = 0;
  let scenesKnown = 0;
  for (const scene of at) {
    let sceneOk = scene.phrases.length > 0;
    for (const phrase of scene.phrases) {
      total += 1;
      if (isKnown(profile, phrase.id)) known += 1;
      else sceneOk = false;
    }
    if (sceneOk) scenesKnown += 1;
  }
  return { known, total, scenesKnown, scenesTotal: at.length };
}

function unknownCount(profile, scene) {
  return scene.phrases.filter((phrase) => !isKnown(profile, phrase.id)).length;
}

function pickScene(profile, rand) {
  let pool = scenes.filter((scene) => scene.level === profile.level);
  if (profile.ease && profile.level > 1) {
    const easier = scenes.filter((scene) => scene.level === profile.level - 1);
    if (easier.length) pool = easier;
  }
  const ranked = pool.map((scene) => ({
    scene,
    unknown: unknownCount(profile, scene),
    stale: staleness(scene.id, profile.recentSceneIds),
  }));
  const withGaps = ranked.filter((item) => item.unknown > 0);
  const source = withGaps.length ? withGaps : ranked;
  const mostUnknown = Math.max(...source.map((item) => item.unknown));
  const needy = source.filter((item) => item.unknown === mostUnknown);
  const best = Math.max(...needy.map((item) => item.stale));
  const top = needy.filter((item) => item.stale === best).map((item) => item.scene);
  return top[Math.floor(rand() * top.length)];
}

export function shakyPhrase(profile) {
  const stats = Object.entries(profile.phraseStats ?? {})
    .map(([id, stat]) => ({ id, ...stat }))
    .filter((stat) => stat.wrong > 0 && stat.wrong >= stat.correct)
    .sort((a, b) => b.wrong - a.wrong || a.id.localeCompare(b.id));
  for (const stat of stats) {
    for (const scene of scenes) {
      if (scene.level > profile.level) continue;
      const phrase = scene.phrases.find((item) => item.id === stat.id);
      if (phrase) return phrase;
    }
  }
  return null;
}

export function buildLesson(profile, { nonce = 0, now = new Date() } = {}) {
  const day = localDay(now);
  const rand = mulberry32(
    hash(
      `${day}|${profile.level}|${nonce}|${profile.ease ? "ease" : "level"}|${profile.recentSceneIds.join(".")}`,
    ),
  );
  const scene = pickScene(profile, rand);
  const seenBefore = profile.sessions.some((session) => session.sceneId === scene.id);
  const info = levelInfo(profile.level);
  const mastery = levelMastery(profile);
  const gap = unknownCount(profile, scene);
  let why = `${info.de}: ${mastery.known} of ${mastery.total} lines. This scene still has lines to learn.`;
  if (profile.ease && scene.level < profile.level) {
    why = "Last time was shaky, so today steps back to a situation you can use cleanly.";
  } else if (gap === 0) {
    why = "You already know these lines. They stay here so they do not fade.";
  } else if (seenBefore) {
    why = `${gap} ${gap === 1 ? "line" : "lines"} in this scene ${gap === 1 ? "is" : "are"} not yours yet. Spell them, and they count.`;
  }

  return {
    id: `${scene.id}:${day}:${nonce}`,
    sceneId: scene.id,
    title: scene.title,
    deTitle: scene.deTitle,
    place: scene.place,
    goal: scene.goal,
    canDo: scene.canDo,
    register: scene.register,
    level: scene.level,
    learnerLevel: profile.level,
    why,
    hideEnglish: seenBefore && !profile.ease,
    lines: scene.phrases.slice(0, 5),
    checks: scene.checks.slice(0, 3).map((check) => ({
      ...check,
      options: shuffle(check.options, rand),
    })),
  };
}

function average(numbers) {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function applySession(profile, { lesson, answers, spelledIds = [], now = new Date() }) {
  const next = structuredClone(profile);
  const correct = answers.filter((answer) => answer.correct).length;
  const accuracy = answers.length ? correct / answers.length : 0;
  const promotes = lesson.level === profile.level;
  next.ease = accuracy < 0.5;

  const failed = new Set();
  for (const answer of answers) {
    const check = lesson.checks.find((item) => item.id === answer.checkId);
    if (!check) continue;
    const stat = next.phraseStats[check.phraseId] ?? { correct: 0, wrong: 0 };
    if (answer.correct) stat.correct += 1;
    else {
      stat.wrong += 1;
      stat.known = false;
      failed.add(check.phraseId);
    }
    next.phraseStats[check.phraseId] = stat;
  }

  for (const id of spelledIds) {
    const stat = next.phraseStats[id] ?? { correct: 0, wrong: 0 };
    stat.known = !failed.has(id);
    next.phraseStats[id] = stat;
  }

  const session = {
    at: new Date(now).toISOString(),
    day: localDay(now),
    sceneId: lesson.sceneId,
    title: lesson.title,
    canDo: lesson.canDo,
    levelAt: profile.level,
    sceneLevel: lesson.level,
    promotes,
    accuracy,
    lineCount: lesson.lines.length,
  };

  const before = levelInfo(profile.level);
  let leveledUp = false;

  session.levelAfter = next.level;
  next.sessions = [...next.sessions, session];
  next.recentSceneIds = [
    lesson.sceneId,
    ...next.recentSceneIds.filter((id) => id !== lesson.sceneId),
  ].slice(0, 12);
  next.active = null;
  next.queued = null;

  const missed = answers
    .filter((answer) => !answer.correct)
    .map((answer) => {
      const check = lesson.checks.find((item) => item.id === answer.checkId);
      return lesson.lines.find((line) => line.id === check?.phraseId);
    })
    .filter(Boolean)
    .map((line) => line.de);

  const result = {
    lesson,
    accuracy,
    correct,
    total: answers.length,
    missed,
    leveledUp,
    levelBefore: profile.level,
    levelAfter: next.level,
    note: progressNote(next, { leveledUp, promotes, finished: before }),
    canDo: lesson.canDo,
  };
  next.lastResult = result;
  return { profile: next, result };
}

function progressNote(profile, { leveledUp }) {
  if (leveledUp) return `Now ${levelInfo(profile.level).de}. ${masterySentence(profile)}`;
  return masterySentence(profile);
}

function masterySentence(profile) {
  const mastery = levelMastery(profile);
  const info = levelInfo(profile.level);
  if (mastery.total > 0 && mastery.known === mastery.total) {
    return `All ${mastery.total} ${info.de} lines.`;
  }
  return `${mastery.known} of ${mastery.total} ${info.de} lines.`;
}

export function learnedWords(profile) {
  const seen = new Set();
  for (const scene of scenes) {
    for (const phrase of scene.phrases) {
      if (!isKnown(profile, phrase.id)) continue;
      const tokens = phrase.de.toLocaleLowerCase("de").match(/[a-zäöüß]+/g) || [];
      for (const token of tokens) {
        if (token.length >= 3) seen.add(token);
      }
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "de"));
}

export function homeNote(profile) {
  return masterySentence(profile);
}

export function learnedScenes(profile) {
  const ids = [];
  for (const session of [...(profile.sessions || [])].reverse()) {
    if (session.sceneId && !ids.includes(session.sceneId)) ids.push(session.sceneId);
  }
  for (const [id, stat] of Object.entries(profile.phraseStats || {})) {
    if (!stat?.known) continue;
    const scene = scenes.find((item) => item.phrases.some((phrase) => phrase.id === id));
    if (scene && !ids.includes(scene.id)) ids.push(scene.id);
  }
  return ids.map((id) => scenes.find((scene) => scene.id === id)).filter(Boolean);
}

export function weekRecord(profile, now = new Date()) {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  const weekday = cursor.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const log = profile.minutesByDay || {};
  const todayKey = localDay(now);
  const days = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + mondayOffset + index);
    const key = localDay(date);
    days.push({
      key,
      label: names[index],
      minutes: log[key] || 0,
      today: key === todayKey,
    });
  }
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  return { days, total };
}

export function weekDays(sessions, now = new Date()) {
  const names = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = localDay(date);
    const count = sessions.filter((session) => session.day === key).length;
    days.push({ key, label: names[date.getDay()], count, today: offset === 0 });
  }
  return days;
}

export function daysSummary(profile, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const recent = profile.sessions.filter((session) => new Date(session.at) >= start);
  const lines = recent.reduce((sum, session) => sum + session.lineCount, 0);
  const canDos = [];
  for (const session of [...recent].reverse()) {
    if (session.canDo && !canDos.includes(session.canDo)) canDos.push(session.canDo);
  }
  const avg = average(recent.map((session) => session.accuracy));
  return {
    scenes: recent.length,
    lines,
    canDos: canDos.slice(0, 4),
    accuracy: recent.length ? avg : null,
    days: weekDays(profile.sessions, now),
  };
}

export function sessionsOnDay(profile, now = new Date()) {
  const day = localDay(now);
  return profile.sessions.filter((session) => session.day === day).length;
}
