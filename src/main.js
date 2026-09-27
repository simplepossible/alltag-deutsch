import {
  applySession,
  buildLesson,
  homeNote,
  learnedScenes,
  learnedWords,
  levelInfo,
  levelMastery,
  localDay,
  scenes,
  weekRecord,
  placementItems,
  scorePlacement,
  shakyPhrase,
} from "./engine.js";
import { loadProfile, saveProfile } from "./storage.js";

const app = document.querySelector("#app");
let profile = loadProfile();

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stepsFor(lesson) {
  return [
    { type: "intro" },
    ...lesson.lines.map((line, index) => ({ type: "line", line, index })),
    { type: "dialogue" },
    ...lesson.checks.map((check, index) => ({ type: "check", check, index })),
  ];
}

function freshActive(lesson) {
  return { lesson, step: 0, picks: {}, revealed: {}, spells: {}, heard: {}, needChoice: false, needLine: "" };
}

function withQueue(current) {
  if (!current.level || current.active || current.queued) return current;
  return {
    ...current,
    queued: buildLesson(current, { nonce: current.sessions.length }),
  };
}

function seedMinutes(current) {
  if (current.minutesSeeded) return current;
  const log = { ...(current.minutesByDay || {}) };
  for (const session of current.sessions || []) {
    if (!session.day) continue;
    log[session.day] = (log[session.day] || 0) + 6;
  }
  return { ...current, minutesByDay: log, minutesSeeded: true };
}

function beginStudy(current) {
  if (current.studyStartedAt) return current;
  return { ...current, studyStartedAt: new Date().toISOString() };
}

function flushStudy(current) {
  if (!current.studyStartedAt) return current;
  const elapsed = Date.now() - new Date(current.studyStartedAt).getTime();
  const ms = Math.max(0, Math.min(elapsed, 45 * 60 * 1000));
  const next = { ...current, studyStartedAt: null };
  if (ms < 20000) return next;
  const day = localDay(new Date());
  const log = { ...(current.minutesByDay || {}) };
  log[day] = Math.round(((log[day] || 0) + ms / 60000) * 10) / 10;
  next.minutesByDay = log;
  return next;
}

function settleStudy(current) {
  if (current.screen !== "lesson") return current;
  const started = current.studyStartedAt ? new Date(current.studyStartedAt).getTime() : 0;
  const age = started ? Date.now() - started : Infinity;
  if (started && age <= 45 * 60 * 1000) return current;
  return { ...current, studyStartedAt: new Date().toISOString() };
}

function lessonIsCurrent(lesson) {
  const id = lesson?.sceneId;
  return Boolean(id && scenes.some((scene) => scene.id === id));
}

function normalize(current) {
  let next = { ...current };
  if (next.level > 1) next.level = 1;
  if (next.queued && !lessonIsCurrent(next.queued)) next.queued = null;
  if (next.active && !lessonIsCurrent(next.active.lesson)) next.active = null;
  next = seedMinutes(next);
  if (next.level && next.screen === "welcome") next.screen = "home";
  if (next.screen === "lesson" && !next.active) next.screen = "home";
  if (next.screen === "result" && !next.lastResult) next.screen = "home";
  next = settleStudy(next);
  if (next.screen === "home") next = withQueue(next);
  return next;
}

profile = normalize(profile);
saveProfile(profile);

let speakRun = 0;
let player = null;

function stopSpeech() {
  speakRun += 1;
  haltAudio();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function haltAudio() {
  if (!player) return;
  const resolve = player.__resolve;
  player.onended = null;
  player.onerror = null;
  player.pause();
  player = null;
  if (resolve) resolve(false);
}

function bestGermanVoice(voices) {
  const german = voices.filter((voice) => (voice.lang || "").toLowerCase().startsWith("de"));
  const score = (voice) => {
    const lang = voice.lang.toLowerCase();
    const name = voice.name.toLowerCase();
    let value = 0;
    if (lang === "de-de") value += 5;
    if (/neural|natural|premium/.test(name)) value += 4;
    if (/katja|hedda|stefan|google/.test(name)) value += 2;
    return value;
  };
  return german.sort((a, b) => score(b) - score(a))[0] ?? null;
}

function ensureVoices() {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  const ready = speechSynthesis.getVoices();
  if (ready.length) return Promise.resolve(ready);
  return new Promise((resolve) => {
    const finish = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
    speechSynthesis.getVoices();
    window.setTimeout(finish, 500);
  });
}

function germanAudioUrl(text) {
  return `/api/speak?text=${encodeURIComponent(text)}`;
}

function showSpeechNote(message) {
  const note = document.querySelector("#speech-note");
  if (note) note.textContent = message;
}

function playGermanClip(text, rate, run) {
  return new Promise((resolve) => {
    let timer = 0;
    const finish = (ok) => {
      window.clearTimeout(timer);
      if (player && player.__resolve === finish) player.__resolve = null;
      resolve(ok);
    };
    const audio = new Audio(germanAudioUrl(text));
    audio.__resolve = finish;
    player = audio;
    const speed = rate <= 0.85 ? 0.8 : 1;
    audio.addEventListener("loadedmetadata", () => {
      audio.playbackRate = speed;
    });
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    audio.play().catch(() => finish(false));
    timer = window.setTimeout(() => {
      if (run !== speakRun) finish(false);
    }, 20000);
  });
}

function speakWithGermanVoice(text, rate, voice, run) {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    utterance.voice = voice;
    utterance.rate = rate;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    window.setTimeout(() => {
      if (run !== speakRun) {
        resolve(false);
        return;
      }
      speechSynthesis.speak(utterance);
    }, 40);
  });
}

async function sayGerman(text, rate, run) {
  haltAudio();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const voice = bestGermanVoice(await ensureVoices());
  if (run !== speakRun) return false;
  if (voice) {
    const ok = await speakWithGermanVoice(text, rate, voice, run);
    if (run !== speakRun) return false;
    if (ok) return true;
  }
  const played = await playGermanClip(text, rate, run);
  if (run !== speakRun) return false;
  if (played) showSpeechNote("");
  else showSpeechNote("German audio did not start. Try Hear it once more.");
  return Boolean(played);
}

function speak(text, rate = 0.94, lineId = null) {
  const run = ++speakRun;
  sayGerman(text, rate, run).then((ok) => {
    if (!ok || !lineId || !profile.active) return;
    profile.active.heard = profile.active.heard || {};
    profile.active.heard[lineId] = true;
    profile.active.needLine = "";
    saveProfile(profile);
    render();
  });
}

function speakAll(lines) {
  const run = ++speakRun;
  (async () => {
    for (const line of lines) {
      if (run !== speakRun) return;
      await sayGerman(line.de, 0.94, run);
    }
  })();
}

if ("speechSynthesis" in window) speechSynthesis.getVoices();

function spellProgress(typed, target) {
  const chars = [...target];
  const input = [...typed];
  let matched = 0;
  while (
    matched < input.length &&
    matched < chars.length &&
    input[matched].toLowerCase() === chars[matched].toLowerCase()
  ) {
    matched += 1;
  }
  const wrong = matched < input.length;
  const done = !wrong && input.length === chars.length && chars.length > 0;
  const ok = esc(chars.slice(0, matched).join(""));
  const rest = esc(chars.slice(matched).join(""));
  return {
    done,
    wrong,
    html: `<span class="ok">${ok}</span><span class="rest">${rest}</span>`,
  };
}

function shell(body, { narrow = false } = {}) {
  return `<div class="wrap ${narrow ? "narrow" : ""}">
    <header class="top"><button class="brand" type="button" data-action="go-home">Alltag Deutsch</button></header>
    ${body}
  </div>`;
}

function levelPanel(current) {
  const info = levelInfo(current.level);
  const shaky = shakyPhrase(current);
  const shakyBlock = shaky
    ? `<p class="shaky"><span class="de" translate="no">${esc(shaky.de)}</span><br><span class="fine">${esc(shaky.en)}</span></p>`
    : "";

  return `<aside class="card compact">
    <div class="compact-head">
      <p class="kicker">Level</p>
    </div>
    <h2>${esc(info.de)}</h2>
    <p>${esc(info.can)}</p>
    <p>${esc(homeNote(current))}</p>
    ${shakyBlock}
  </aside>`;
}

function renderWelcome() {
  return shell(`<main>
    <h1>Alltag Deutsch</h1>
    <p>A1, for an official test such as Start Deutsch 1. ${scenes.length} scenes, one at a time.</p>
    <div class="actions"><button class="primary" type="button" data-action="start-course">Start</button></div>
  </main>`, { narrow: true });
}

function renderPlacement() {
  const item = placementItems[profile.placementStep];
  const total = placementItems.length;
  const picked = profile.placementPick;
  const options = item.options
    .map((option, index) => {
      const locked = Boolean(picked);
      const cls = locked ? (option.correct ? "is-right" : index === picked?.index ? "is-wrong" : "") : "";
      const action = item.type === "self" ? "placement-self" : "placement-choose";
      const extra = item.type === "self" ? `data-level="${option.level}"` : `data-index="${index}"`;
      return `<button class="option ${cls}" type="button" data-action="${action}" ${extra} ${locked ? "disabled" : ""}>${esc(option.text)}</button>`;
    })
    .join("");
  const why = picked && item.why ? `<p class="why">${esc(item.why)}</p>` : "";
  const nextLabel = profile.placementStep === total - 1 ? "See your starting point" : "Next";
  return shell(
    `<main>
      <div class="bar" aria-hidden="true"><span style="width:${((profile.placementStep + (picked ? 1 : 0)) / total) * 100}%"></span></div>
      <p class="kicker">Starting check · ${profile.placementStep + 1} of ${total}</p>
      <h1>${esc(item.prompt)}</h1>
      <div class="options">${options}</div>
      ${why}
      <div class="actions">
        ${picked || item.type === "self" ? "" : ""}
        ${picked ? `<button class="primary" type="button" data-action="placement-next">${nextLabel}</button>` : ""}
        ${profile.placementStep > 0 ? `<button class="ghost" type="button" data-action="placement-back">Back</button>` : ""}
      </div>
    </main>`,
    { narrow: true },
  );
}

function sceneCard(lesson, { continuing }) {
  const stepLabel = continuing ? continueLabel(lesson, profile.active.step) : "";
  return `<section class="card main">
    <div class="compact-head">
      <p class="kicker">Scene</p>
    </div>
    <h1>${esc(lesson.title)}</h1>
    <p class="line-de" translate="no">${esc(lesson.deTitle)}</p>
    <p>${esc(lesson.place)}</p>
    <p>${esc(lesson.goal)}</p>
    ${stepLabel ? `<p class="fine">${esc(stepLabel)}</p>` : ""}
    <div class="actions">
      <button class="primary" type="button" data-action="start-lesson">${continuing ? "Continue" : "Start"}</button>
      <button class="ghost" type="button" data-action="open-review">Learned</button>
    </div>
  </section>`;
}

function continueLabel(lesson, step) {
  const current = stepsFor(lesson)[step];
  if (!current || current.type === "intro") return "Ready to start";
  if (current.type === "line") return `Stopped on line ${current.index + 1} of ${lesson.lines.length}`;
  if (current.type === "dialogue") return "Stopped on the conversation";
  return `Stopped on check ${current.index + 1} of ${lesson.checks.length}`;
}

function minuteLabel(minutes) {
  const rounded = Math.round(minutes);
  return rounded > 0 ? `${rounded}m` : "–";
}

function minuteWords(minutes) {
  return `${Math.round(minutes)} min`;
}

function progressBlock(current) {
  const week = weekRecord(current);
  const today = week.days.find((day) => day.today);
  const mastery = levelMastery(current);
  const words = learnedWords(current);
  const days = week.days
    .map(
      (day) => `<li class="${day.minutes > 0 ? "has" : ""} ${day.today ? "today" : ""}">
        <span class="day">${esc(day.label)}</span>
        <span class="time">${minuteLabel(day.minutes)}</span>
      </li>`,
    )
    .join("");
  return `<section class="card compact week-card">
    <div class="compact-head">
      <p class="kicker">Progress</p>
    </div>
    <ol class="week">${days}</ol>
    <ul class="meter">
      <li><span>Today</span><strong>${minuteWords(today?.minutes || 0)}</strong></li>
      <li><span>This week</span><strong>${minuteWords(week.total)}</strong></li>
      <li><span>Scenes</span><strong>${mastery.scenesKnown} of ${mastery.scenesTotal}</strong></li>
      <li><span>Words</span><strong>${words.length}</strong></li>
    </ul>
  </section>`;
}

function renderHome() {
  const continuing = Boolean(profile.active);
  const lesson = profile.active?.lesson ?? profile.queued;
  const today = lesson ? sceneCard(lesson, { continuing }) : "";
  const reset = profile.confirmReset
    ? `<div class="footer-note">
        <p>This clears your level and scenes on this device.</p>
        <div class="actions">
          <button class="ghost" type="button" data-action="reset-yes">Clear it</button>
          <button class="ghost" type="button" data-action="reset-no">Keep going</button>
        </div>
      </div>`
    : `<div class="footer-note"><button class="textish" type="button" data-action="reset-ask">Start over</button></div>`;
  return shell(`<main class="home-grid">${levelPanel(profile)}${today}${progressBlock(profile)}${reset}</main>`, { narrow: true });
}

function lineReady(active, line) {
  const heard = Boolean(active.heard?.[line.id]);
  const spelled = spellProgress(active.spells?.[line.id] ?? "", line.de).done;
  return heard && spelled;
}

function spellBox(line, active) {
  const typed = active.spells?.[line.id] ?? "";
  const heard = Boolean(active.heard?.[line.id]);
  const progress = spellProgress(typed, line.de);
  const note = !heard
    ? "Listen to the line. Then spell it to continue."
    : progress.done
      ? "That's the line."
      : progress.wrong
        ? "That letter isn't next."
        : "Spell the line you just heard.";
  const keys = ["ä", "ö", "ü", "ß"]
    .map((char) => `<button type="button" data-action="insert" data-char="${char}">${char}</button>`)
    .join("");
  return `<div class="spell">
    <p class="kicker">Spell it</p>
    <p class="spell-live" data-spell-live="${esc(line.id)}" translate="no">${progress.html}</p>
    <div class="umlauts">${keys}</div>
    <input data-spell="${esc(line.id)}" value="${esc(typed)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Spell the German line"${progress.done ? ' class="is-done"' : ""}${heard ? "" : " disabled"} />
    <p class="fine spell-note" data-spell-note="${esc(line.id)}">${esc(note)}</p>
  </div>`;
}

function paintSpell(input) {
  const line = profile.active?.lesson.lines.find((item) => item.id === input.dataset.spell);
  if (!line) return;
  profile.active.spells = profile.active.spells || {};
  profile.active.spells[line.id] = input.value;
  saveProfile(profile);
  const progress = spellProgress(input.value, line.de);
  const live = app.querySelector(`[data-spell-live="${CSS.escape(line.id)}"]`);
  if (live) live.innerHTML = progress.html;
  const note = app.querySelector(`[data-spell-note="${CSS.escape(line.id)}"]`);
  const heard = Boolean(profile.active.heard?.[line.id]);
  if (note) {
    note.textContent = !heard
      ? "Listen to the line. Then spell it to continue."
      : progress.done
        ? "That's the line."
        : progress.wrong
          ? "That letter isn't next."
          : "Spell the line you just heard.";
  }
  input.classList.toggle("is-done", progress.done);
  if (progress.done && heard) {
    saveProfile(profile);
    render();
  }
}

function renderLesson() {
  const active = profile.active;
  const lesson = active.lesson;
  const steps = stepsFor(lesson);
  const current = steps[Math.min(active.step, steps.length - 1)];
  const width = (active.step / (steps.length - 1)) * 100;
  let body = "";
  if (current.type === "intro") {
    body = `<p class="kicker">${esc(lesson.deTitle)}</p>
      <h1>${esc(lesson.title)}</h1>
      <p>${esc(lesson.place)}</p>
      <p>${esc(lesson.goal)}</p>
      <p>${esc(lesson.register)}</p>
      <div class="actions"><button class="primary" type="button" data-action="next-step">Start</button></div>`;
  } else if (current.type === "line") {
    const line = current.line;
    const shown = !lesson.hideEnglish || active.revealed[line.id];
    body = `<p class="kicker">Line ${current.index + 1} of ${lesson.lines.length}</p>
      <p class="tag">${line.kind === "hear" ? "You will hear this" : "You say this"}${line.speaker === "You" ? "" : ` · ${esc(line.speaker)}`}</p>
      <p class="line-de" translate="no">${esc(line.de)}</p>
      <div class="hear-row">
        <button class="ghost" type="button" data-action="hear" data-id="${esc(line.id)}" data-rate="0.94">Hear it</button>
        <button class="ghost" type="button" data-action="hear" data-id="${esc(line.id)}" data-rate="0.78">Slower</button>
      </div>
      ${shown ? `<p>${esc(line.en)}</p><p class="tip">${esc(line.tip)}</p>` : `<button class="ghost" type="button" data-action="reveal" data-id="${esc(line.id)}">Show the meaning</button>`}
      ${line.sound ? `<p class="sound">${esc(line.sound)}</p>` : ""}
      <p class="fine" id="speech-note"></p>
      ${spellBox(line, active)}
      ${
        lineReady(active, line)
          ? `<div class="actions"><button class="primary" type="button" data-action="next-step">${current.index === lesson.lines.length - 1 ? "Continue" : "Next line"}</button></div>`
          : active.needLine
            ? `<p class="warn">${esc(active.needLine)}</p>`
            : ""
      }`;
  } else if (current.type === "dialogue") {
    const bubbles = lesson.lines
      .map((line) => {
        const mine = line.speaker === "You";
        return `<div class="bubble ${mine ? "you" : "them"}">
          <p class="who">${esc(line.speaker)}</p>
          <p class="de" translate="no">${esc(line.de)}</p>
          <p class="en">${esc(line.en)}</p>
        </div>`;
      })
      .join("");
    body = `<div class="actions"><button class="ghost" type="button" data-action="hear-all">Hear the scene</button></div>
      <p class="fine" id="speech-note"></p>
      <div class="dialogue">${bubbles}</div>
      <div class="actions"><button class="primary" type="button" data-action="next-step">Try three checks</button></div>`;
  } else {
    const check = current.check;
    const pick = active.picks[check.id];
    const options = check.options
      .map((option, index) => {
        const cls = pick ? (option.correct ? "is-right" : index === pick.index ? "is-wrong" : "") : "";
        return `<button class="option ${cls}" type="button" data-action="pick" data-index="${index}" ${pick ? "disabled" : ""}>${esc(option.text)}</button>`;
      })
      .join("");
    const last = current.index === lesson.checks.length - 1;
    body = `<p class="kicker">Check ${current.index + 1} of ${lesson.checks.length}</p>
      <h1>${esc(check.prompt)}</h1>
      <div class="options">${options}</div>
      ${pick ? `<p class="why">${esc(check.why)}</p>` : ""}
      ${active.needChoice ? `<p class="warn">Choose one first.</p>` : ""}
      <div class="actions">${pick ? `<button class="primary" type="button" data-action="next-step">${last ? "See where you are" : "Next"}</button>` : ""}</div>`;
  }
  return shell(
    `<main>
      <div class="bar" aria-hidden="true"><span style="width:${width}%"></span></div>
      ${body}
      <p class="tiny"><button class="textish" type="button" data-action="go-home">Stop for now</button></p>
    </main>`,
    { narrow: true },
  );
}

function renderResult() {
  const result = profile.lastResult;
  const info = levelInfo(result.levelAfter);
  const before = levelInfo(result.levelBefore);
  const lines = result.lesson.lines
    .map(
      (line, index) => `<li>
        <span class="de" translate="no">${esc(line.de)}</span>
        <button class="ghost" type="button" data-action="hear-result" data-index="${index}">Hear</button>
        <span class="en">${esc(line.en)}</span>
      </li>`,
    )
    .join("");
  const missed = result.missed?.length
    ? `<p class="why">Still unsteady: ${result.missed.map((line) => `„${esc(line)}“`).join(" ")}</p>`
    : `<p>All three checks were clear.</p>`;
  const another = profile.queued
    ? `<button class="ghost" type="button" data-action="another-scene">One more short scene</button>`
    : "";
  return shell(
    `<main>
      ${result.leveledUp ? `<p class="banner">${esc(before.de)} → ${esc(info.de)}</p>` : ""}
      <h1>${esc(info.de)}</h1>
      <p>${esc(result.note)}</p>
      <p>${result.correct} of ${result.total} checks.</p>
      ${missed}
      <div class="card" style="margin-top:16px">
        <ul class="pocket">${lines}</ul>
      </div>
      <div class="actions">
        <button class="primary" type="button" data-action="enough">That’s enough for today</button>
        ${another}
      </div>
    </main>`,
    { narrow: true },
  );
}

function renderReview() {
  const learned = learnedScenes(profile);
  const words = learnedWords(profile);
  const mastery = levelMastery(profile);
  const wordBlock = words.length
    ? `<section class="card review-scene">
        <h1>Words</h1>
        <p>${words.length} from scenes you know.</p>
        <p class="word-list" translate="no">${words.map((word) => esc(word)).join(" · ")}</p>
      </section>`
    : "";
  const body = learned.length
    ? learned
        .map((scene) => {
          const lines = scene.phrases
            .map(
              (line) => `<li>
                <span class="de" translate="no">${esc(line.de)}</span>
                <button class="ghost" type="button" data-action="hear-learned" data-id="${esc(line.id)}">Hear</button>
                <span class="en">${esc(line.en)}</span>
              </li>`,
            )
            .join("");
          return `<section class="card review-scene">
            <h1>${esc(scene.title)}</h1>
            <p class="line-de" translate="no">${esc(scene.deTitle)}</p>
            <ul class="pocket">${lines}</ul>
          </section>`;
        })
        .join("")
    : `<p>Nothing saved yet. Finish a scene and the lines will be here.</p>`;
  return shell(
    `<main class="home-grid">
      <div class="actions review-back"><button class="ghost" type="button" data-action="go-home">Back</button></div>
      <h1>Learned</h1>
      <p>${mastery.scenesKnown} of ${mastery.scenesTotal} scenes · ${words.length} words</p>
      ${wordBlock}
      ${body}
    </main>`,
    { narrow: true },
  );
}

function render() {
  stopSpeech();
  const view =
    profile.screen === "placement"
      ? renderPlacement()
      : profile.screen === "lesson"
        ? renderLesson()
        : profile.screen === "result"
          ? renderResult()
          : profile.screen === "review"
            ? renderReview()
            : profile.screen === "home"
              ? renderHome()
              : renderWelcome();
  app.innerHTML = view;
}

function persist() {
  saveProfile(profile);
  render();
}

function finishPlacement() {
  scorePlacement(profile.placementSelf, profile.placementChecks);
  profile.level = 1;
  profile.xp = 0;
  profile.ease = false;
  profile.queued = null;
  profile.active = null;
  profile.placementStep = 0;
  profile.placementPick = null;
  profile.placementChecks = [];
  profile.placementSelf = null;
  profile.screen = "home";
  profile = withQueue(profile);
  persist();
}

function finishLesson() {
  profile = flushStudy(profile);
  const lesson = profile.active.lesson;
  const answers = lesson.checks.map((check) => ({
    checkId: check.id,
    correct: Boolean(profile.active.picks[check.id]?.correct),
  }));
  const spelledIds = lesson.lines.map((line) => line.id);
  const applied = applySession(profile, { lesson, answers, spelledIds });
  profile = applied.profile;
  profile.screen = "result";
  profile.queued = buildLesson(profile, { nonce: profile.sessions.length });
  persist();
}

const actions = {
  "go-home"() {
    if (profile.screen === "placement" && profile.level) {
      profile.placementStep = 0;
      profile.placementPick = null;
      profile.placementChecks = [];
      profile.placementSelf = null;
    }
    if (!profile.level) {
      profile.screen = "welcome";
      profile.confirmReset = false;
      persist();
      return;
    }
    profile = flushStudy(profile);
    profile.screen = "home";
    profile.confirmReset = false;
    profile = withQueue(profile);
    persist();
  },
  "start-course"() {
    profile.level = 1;
    profile.xp = 0;
    profile.ease = false;
    profile.screen = "home";
    profile.queued = null;
    profile = withQueue(profile);
    persist();
  },
  "start-placement"() {
    profile.screen = "placement";
    profile.placementStep = 0;
    profile.placementPick = null;
    profile.placementChecks = [];
    profile.placementSelf = null;
    persist();
  },
  "placement-self"(button) {
    profile.placementSelf = Number(button.dataset.level);
    profile.placementStep += 1;
    profile.placementPick = null;
    persist();
  },
  "placement-choose"(button) {
    if (profile.placementPick) return;
    const item = placementItems[profile.placementStep];
    const index = Number(button.dataset.index);
    profile.placementPick = { index, correct: Boolean(item.options[index].correct) };
    persist();
  },
  "placement-next"() {
    if (!profile.placementPick) return;
    profile.placementChecks.push(profile.placementPick.correct);
    profile.placementPick = null;
    if (profile.placementStep >= placementItems.length - 1) {
      finishPlacement();
      return;
    }
    profile.placementStep += 1;
    persist();
  },
  "placement-back"() {
    if (profile.placementPick) {
      profile.placementPick = null;
      persist();
      return;
    }
    if (profile.placementStep === 0) return;
    profile.placementStep -= 1;
    if (profile.placementStep === 0) profile.placementSelf = null;
    else profile.placementChecks.pop();
    persist();
  },
  "start-lesson"() {
    if (profile.active) {
      profile.screen = "lesson";
      profile = beginStudy(profile);
      persist();
      return;
    }
    profile = withQueue(profile);
    if (!profile.queued) return;
    profile.active = freshActive(profile.queued);
    profile.screen = "lesson";
    profile = beginStudy(profile);
    persist();
  },
  "next-step"() {
    const steps = stepsFor(profile.active.lesson);
    const current = steps[profile.active.step];
    if (current.type === "check" && !profile.active.picks[current.check.id]) {
      profile.active.needChoice = true;
      persist();
      return;
    }
    if (current.type === "line" && !lineReady(profile.active, current.line)) {
      const heard = Boolean(profile.active.heard?.[current.line.id]);
      profile.active.needLine = heard
        ? "Spell the line before you continue."
        : "Listen to the line, then spell it.";
      persist();
      return;
    }
    profile.active.needChoice = false;
    profile.active.needLine = "";
    if (profile.active.step >= steps.length - 1) {
      finishLesson();
      return;
    }
    profile.active.step += 1;
    persist();
  },
  pick(button) {
    const steps = stepsFor(profile.active.lesson);
    const current = steps[profile.active.step];
    if (current.type !== "check" || profile.active.picks[current.check.id]) return;
    const index = Number(button.dataset.index);
    const option = current.check.options[index];
    profile.active.picks[current.check.id] = { index, correct: Boolean(option.correct) };
    profile.active.needChoice = false;
    persist();
  },
  hear(button) {
    const line = profile.active.lesson.lines.find((item) => item.id === button.dataset.id);
    if (line) speak(line.de, Number(button.dataset.rate) || 0.94, line.id);
  },
  "hear-all"() {
    speakAll(profile.active.lesson.lines);
  },
  "hear-result"(button) {
    const line = profile.lastResult?.lesson.lines[Number(button.dataset.index)];
    if (line) speak(line.de, 0.94);
  },
  insert(button) {
    const input = app.querySelector("[data-spell]");
    if (!input || input.disabled) return;
    const char = button.dataset.char;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + char + input.value.slice(end);
    const pos = start + char.length;
    input.focus();
    input.setSelectionRange(pos, pos);
    paintSpell(input);
  },
  reveal(button) {
    profile.active.revealed[button.dataset.id] = true;
    persist();
  },
  enough() {
    profile.screen = "home";
    profile = withQueue(profile);
    persist();
  },
  "another-scene"() {
    if (!profile.queued) return;
    profile.active = freshActive(profile.queued);
    profile.screen = "lesson";
    profile = beginStudy(profile);
    persist();
  },
  "open-review"() {
    profile.screen = "review";
    profile.confirmReset = false;
    persist();
  },
  "hear-learned"(button) {
    for (const scene of learnedScenes(profile)) {
      const line = scene.phrases.find((item) => item.id === button.dataset.id);
      if (line) {
        speak(line.de, 0.94);
        return;
      }
    }
  },
  retake() {
    profile.screen = "placement";
    profile.placementStep = 0;
    profile.placementPick = null;
    profile.placementChecks = [];
    profile.placementSelf = null;
    persist();
  },
  "reset-ask"() {
    profile.confirmReset = true;
    persist();
  },
  "reset-no"() {
    profile.confirmReset = false;
    persist();
  },
  "reset-yes"() {
    localStorage.removeItem("alltag-deutsch-v1");
    profile = normalize(loadProfile());
    persist();
  },
};

app.addEventListener("mousedown", (event) => {
  if (event.target.closest("[data-action='insert']")) event.preventDefault();
});

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-spell]")) paintSpell(event.target);
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || !app.contains(button)) return;
  const action = actions[button.dataset.action];
  if (action) action(button);
});

render();
