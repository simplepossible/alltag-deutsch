# Alltag Deutsch

A browser app for everyday German, from A1 to B2. The lines are the ones you can use the same day: a bakery, a ticket, a neighbor, a delay, a mix-up. It is not an exam course.

There is no account and no server-side profile. The app runs in the browser and keeps progress on that device.

## A sitting

One scene at a time. A scene is five lines and three checks.

1. Hear the German line. **Slower** plays it more slowly.
2. Spell that line. The next line stays closed until the spelling matches.
3. After the five lines, answer three short checks.

A weak set of checks (under half correct) serves an easier scene next time. The level itself does not drop.

## Levels

| Id | Level | What it covers |
| -- | ----- | -------------- |
| 1 | A1 | Greet, order, pay, ask where something is |
| 2 | A2 | Get around, short counter exchanges, ask for a time |
| 3 | B1 | Explain a problem, keep a conversation going, a delay or a doctor |
| 4 | B2 | Soften a request, fix a mix-up, say what you mean |

A short starting check places you on one of these. It does not jump you ahead of what the checks support.

Each level currently has 10 scenes, 50 lines. A line counts as known only after you spell it in a finished scene, and only if you do not miss it on a check. A missed check clears that line, so it has to be spelled again. The level moves only when every line of every scene at the current level is known. At B2 it stays there.

The home page shows three blocks:

- **Level** — current band, how many lines are known, and a way to take the starting check again.
- **Scene** — the scene for this sitting. **Learned** opens the scenes you have already finished, newest first, with **Hear** on each line.
- **This week** — minutes from Monday through Sunday. Time is counted while a scene is open and saved when you leave or finish it. Finished scenes from before that clock existed count as six minutes each.

**Start over** clears the saved profile on this device.

## Where progress lives

The profile is one JSON value in `localStorage`, under the key `alltag-deutsch-v1`. It holds the level, finished scenes, which lines are known, the week’s minutes, and a scene left in the middle.

That data stays in the browser that wrote it. Another phone, another browser, or a cleared site data store starts empty. The GitHub repository stores the code, not anyone’s progress.

## German audio

**Hear it** prefers a real German voice from the browser. This project’s dev server also proxies German speech at `GET /api/speak?text=`, because many machines have no German voice and a direct request to the speech service is blocked by the browser.

Audio works with `npm run dev` and `npm run preview`. Opening the built files by themselves does not include that proxy.

## Run it

```bash
npm install
npm run dev
```

Vite prints a local address, usually http://localhost:5173/. The layout fits a phone, including an iPhone 17 (402×874), but the page has to be reachable from that phone. `localhost` on this computer is not.

```bash
npm run check    # scenes, placement, and level movement
npm run build    # static files in dist/
npm run preview  # serve the build, including German audio
```

## Project files

| Path | Role |
| ---- | ---- |
| `index.html` | Page shell and fonts |
| `src/main.js` | Screens: home, lesson, review, result |
| `src/engine.js` | Which scene comes next, what “known” means, the week |
| `src/content.js` | Original scenes, level names, starting check |
| `src/extra-scenes.js` | More scenes, merged in `content.js` |
| `src/storage.js` | Load and save the browser profile |
| `src/style.css` | Layout |
| `vite.config.js` | Dev server and the `/api/speak` proxy |
| `scripts/check-lessons.js` | Checks that the scenes and promotion rules hold |

## Add a scene

Put a new object in `src/extra-scenes.js`. It is already part of the scene list, so the app will offer it on its level.

- `level` is `1` (A1), `2` (A2), `3` (B1), or `4` (B2).
- `id` must be unique, and so must every phrase id.
- Five phrases. Each has German (`de`), English (`en`), and a `tip`.
- Three checks. Each `phraseId` must be one of those five lines, and exactly one option is `correct`.

Adding scenes lengthens that level: it moves only after the new lines are known too.

`npm run check` expects 10 scenes on each level. After you add some, update that count in `scripts/check-lessons.js`.
