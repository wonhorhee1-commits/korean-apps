# Korean Learning Apps — Monorepo

Two Korean learning web apps sharing a common library, deployed via GitHub Pages.

## Project Structure

```
docs/
  korean-core.js              — Shared library (~450 lines)
  beginner/
    index.html                — Beginner app (~1,850 lines)
    sw.js                     — Service worker
    data/vocab.json, grammar.json, error_drills.json, reading_drills.json, dialogue_drills.json
  advanced/
    index.html                — Advanced app (~1,880 lines)
    sw.js                     — Service worker
    data/vocab.json, grammar.json, error_drills.json, grammar_context.json, reading_drills.json, register_drills.json, dialogue_drills.json
```

URLs:
- https://wonhorhee1-commits.github.io/korean-apps/beginner/
- https://wonhorhee1-commits.github.io/korean-apps/advanced/

## Architecture

- Single-file web apps (HTML/CSS/JS, no build step)
- SM-2 spaced repetition (Anki-style), Firebase anonymous auth + Firestore sync
- `korean-core.js` loaded via `<script src="../korean-core.js">` before each app's inline script
- Apps destructure what they need: `const { Card, SRSEngine, DrillEngine, ... } = KoreanCore;`
- App-specific config via `KoreanCore.init({...})` and `createFirebaseSync({...})`

### korean-core.js (shared)

Contains: Card, SRSEngine, DrillEngine, TTS, Timer, Streak, Firebase sync factory, utilities (shuffle, escHtml, safeSave, normalizeKorean, highlightWord, validateVocab), pool building, drill helpers, showSummary.

### App-specific code (~1,000 lines each)

Each app keeps: showMenu, showCategorySelect, showProgress, all drill start/render functions, getDistractors, SESSION/TIMER constants, data loading.

## Data Formats

### Vocab Entry
```json
{"korean": "...", "english": "...", "example": "...", "example_en": "...", "notes": "..."}
```
Advanced also has: hanja, breakdown (for 한자어/사자성어 categories)

### SRS Card IDs
- Vocab: `vocab:category:index`, Grammar: `grammar:category:index`
- Error: `err:index`, Reading: `read:index`, Dialogue: `dlg:index`
- Advanced also: `gramCtx:index`, `reg:index`

## Key Config Differences

| Setting | Beginner | Advanced |
|---|---|---|
| SRS storage key | `beginner_korean_srs` | `korean_coach_srs` |
| Streak key | `beginner_korean_streak` | `korean_coach_streak` |
| Firebase collection | `beginner_users` | `users` |
| Vocab count | ~2,000 | ~5,000 |
| Theme | Light (dark mode toggle) | Dark |
| Drill modes | 10 (incl. MC, Listening) | 11 (incl. Register, Grammar Context, Sentence Production) |

## Development Rules

- **Large file edits**: Use incremental Edit, never Write the whole index.html
- **Service worker cache**: Bump version in BOTH sw.js files on EVERY push
- **Push to main directly**, no PRs needed
- **Always commit and push after changes**
- Firebase config is in each index.html (do not commit real credentials to public repos)

## Deployment

GitHub Pages deploys from `docs/` on `main` branch. After any change:
1. Bump SW cache version in both `docs/beginner/sw.js` and `docs/advanced/sw.js`
2. Commit and push to `main`
