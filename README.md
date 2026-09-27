# Alltag Deutsch

A browser app for everyday German at A1, the band tested by Goethe-Zertifikat A1: Start Deutsch 1. There are 141 scenes and 705 lines. They cover greetings, personal details, numbers, the clock, home, food, shopping, town, health, and the grammar those situations use.

Some scenes follow the exam tasks themselves: a phone message or announcement, a note, an ad, or a sign, a form, a short message, and the speaking tasks (introduce yourself, spell a word, ask a question, make a request). Practice here is in that band. It does not replace the test, and finishing the scenes does not by itself mean a pass. The exam uses new texts, and the writing and speaking scores depend on German you produce yourself.

There is no account and no server-side profile. The app runs in the browser and keeps progress on that device.

## A sitting

One scene at a time. A scene is five lines and three checks.

1. Hear the German line. **Slower** plays it more slowly.
2. Spell that line. The next line stays closed until the spelling matches.
3. After the five lines, answer three short checks.

A weak set of checks (under half correct) marks the next scene as lighter. The course stays on A1. Knowing every line does not open another level.

A line counts as known only after you spell it in a finished scene, and only if you do not miss it on a check. A missed check clears that line, so it has to be spelled again. A scene counts as learned when all five of its lines are known. A word counts when it appears in a known line and is at least three letters long.

## The home page

Three blocks, in this order:

- **Level** — A1, a short welcome, and how many lines are known.
- **Scene** — the scene for this sitting. **Learned** opens finished scenes, newest first, with **Hear** on each line, plus the words from lines you know.
- **Progress** — the current week, Monday through Sunday, then today, this week, scenes learned, and words learned.

Time is counted while a scene is open and saved when you leave or finish it. A stretch under 20 seconds is ignored, and one sitting counts at most 45 minutes. Finished scenes from before that clock existed count as six minutes each.

**Start over** clears the saved profile on this device.

## Where progress lives

The profile is one JSON value in `localStorage`, under the key `alltag-deutsch-v1`. It holds the level, finished scenes, which lines are known, the week’s minutes, and a scene left in the middle.

That data stays in the browser that wrote it. Another phone, another browser, or a cleared site data store starts empty. The GitHub repository stores the code, not anyone’s progress.

## German audio

**Hear it** prefers a real German voice from the browser. This project’s dev server also proxies German speech at `GET /api/speak?text=`, because many machines have no German voice and a direct request to the speech service is blocked by the browser.

Audio works with `npm run dev` and `npm run preview`. A published page, including GitHub Pages, does not include that proxy. **Hear it** there needs a German voice on the device.

The page loads `src/style.css` and `src/main.js` with relative paths, so a project site such as `https://<user>.github.io/alltag-deutsch/` can find them.

## Run it

```bash
npm install
npm run dev
```

Vite prints a local address, usually http://localhost:5173/. The layout fits a phone, including an iPhone 17 (402×874), but the page has to be reachable from that phone. `localhost` on this computer is not.

```bash
npm run check    # 141 A1 scenes, placement, and level rules
npm run build    # static files in dist/
npm run preview  # serve the build, including German audio
```

## Project files

| Path | Role |
| ---- | ---- |
| `index.html` | Page shell, fonts, and relative asset paths |
| `src/main.js` | Screens: home, lesson, review, result |
| `src/engine.js` | Which scene comes next, what “known” means, the week, learned words |
| `src/content.js` | The active scene list, the A1 label, and the starting check |
| `src/a1/course.js` | Joins the A1 scene files into the course |
| `src/a1/build.js` | Builds one scene: five lines and three checks |
| `src/a1/people.js` | People, contact, numbers, and time |
| `src/a1/daily.js` | Home, food, health, weather, and clothes |
| `src/a1/town.js` | Town, shopping, transport, work, and free time |
| `src/a1/grammar.js` | A1 grammar in short situations |
| `src/a1/exam.js` | Listening, reading, writing, and speaking tasks |
| `src/storage.js` | Load and save the browser profile |
| `src/style.css` | Layout |
| `vite.config.js` | Dev server and the `/api/speak` proxy |
| `scripts/check-lessons.js` | Checks that every scene and the A1 rules hold |

Older scene lists in `src/content.js` and `src/extra-scenes.js` are not part of the course.

## Add a scene

Add it with `scene()` in one of the files under `src/a1/`, and include that list in `src/a1/course.js`.

- The course is A1, so `scene()` sets the level.
- `id` must be unique, and so must every phrase id.
- Five lines. Each has German, English, and a short tip.
- Three checks. Each one points at one of those five lines, and the first answer is the correct one.

`npm run check` expects at least 100 scenes, all on A1.
