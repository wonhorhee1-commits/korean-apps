// korean-core.js — Shared library for Korean learning apps
// Both beginner and advanced apps load this via <script src="../korean-core.js">

(function() {
'use strict';

// ===== SRS CONSTANTS =====
const AGAIN = 0, HARD = 2, GOOD = 3, EASY = 5;

// ===== CARD CLASS =====
class Card {
  constructor(data = {}) {
    this.card_id = data.card_id || '';
    this.ease_factor = data.ease_factor || 2.5;
    this.interval_days = data.interval_days || 0;
    this.repetitions = data.repetitions || 0;
    this.next_review = data.next_review || 0;
    this.last_review = data.last_review || 0;
    this.total_reviews = data.total_reviews || 0;
    this.correct_count = data.correct_count || 0;
  }

  get accuracy() {
    return this.total_reviews === 0 ? 0 : this.correct_count / this.total_reviews;
  }

  review(quality) {
    const now = Date.now() / 1000;
    this.last_review = now;
    this.total_reviews++;
    if (quality >= GOOD) this.correct_count++;

    if (quality < GOOD) {
      this.repetitions = 0;
      this.interval_days = 0.007;
    } else {
      if (this.repetitions === 0) this.interval_days = 0.04;
      else if (this.repetitions === 1) this.interval_days = 1;
      else if (this.repetitions === 2) this.interval_days = 3;
      else this.interval_days *= this.ease_factor;
      this.repetitions++;
    }

    this.ease_factor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    this.ease_factor = Math.max(1.3, this.ease_factor);
    this.next_review = now + this.interval_days * 86400;
  }
}

// ===== SRS ENGINE =====
class SRSEngine {
  constructor(storageKey, syncFn) {
    this._storageKey = storageKey;
    this._syncFn = syncFn;
    this.cards = {};
    this._load();
  }

  _load() {
    try {
      const data = JSON.parse(localStorage.getItem(this._storageKey) || '{}');
      for (const [id, d] of Object.entries(data)) this.cards[id] = new Card(d);
    } catch(e) { console.error('SRS load error:', e); }
  }

  save() {
    safeSave(this._storageKey, JSON.stringify(this.cards));
    if (this._syncFn) this._syncFn();
  }

  getCard(id) {
    if (!this.cards[id]) this.cards[id] = new Card({card_id: id});
    return this.cards[id];
  }

  getDueCards(ids) {
    const now = Date.now() / 1000;
    const due = [], newCards = [];
    for (const id of ids) {
      if (!this.cards[id]) newCards.push(id);
      else if (this.cards[id].next_review <= now) due.push(id);
    }
    due.sort((a, b) => this.cards[a].next_review - this.cards[b].next_review);
    return [...due, ...newCards];
  }

  recordReview(id, quality) {
    _cfg.recordStudyDay();
    this.getCard(id).review(quality);
    this.save();
  }

  getStats() {
    const now = Date.now() / 1000;
    const cards = Object.values(this.cards);
    const total = cards.length;
    if (total === 0) return {total: 0, due: 0, learning: 0, mature: 0, accuracy: 0};
    return {
      total,
      due: cards.filter(c => c.next_review <= now).length,
      learning: cards.filter(c => c.interval_days < 7).length,
      mature: cards.filter(c => c.interval_days >= 7).length,
      accuracy: cards.reduce((s,c) => s + c.correct_count, 0) / Math.max(1, cards.reduce((s,c) => s + c.total_reviews, 0))
    };
  }
}

// ===== UTILITIES =====
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function safeSave(key, val) {
  try { localStorage.setItem(key, val); } catch(e) { console.warn('Storage full'); }
}

function notesAreRedundant(english, notes) {
  if (!notes || !english) return false;
  const engWords = new Set(english.toLowerCase().split(/\s+/));
  const noteWords = notes.toLowerCase().split(/\s+/);
  const overlap = noteWords.filter(w => engWords.has(w)).length;
  // Notes must mostly consist of english words (>70% of note words overlap)
  // AND english words must be well-represented in notes (>50%)
  return overlap > engWords.size * 0.5 && overlap > noteWords.length * 0.7;
}

function showToast(msg, duration) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration || 3000);
}

function smoothScrollTop() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
}

function normalizeKorean(s) {
  return s.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').toLowerCase();
}

function highlightWord(sentence, word) {
  if (!sentence || !word) return escHtml(sentence);
  const esc = escHtml(sentence);
  const escW = escHtml(word);
  return esc.split(escW).join(`<mark>${escW}</mark>`);
}

function validateVocab(data) {
  for (const [cat, entries] of Object.entries(data)) {
    if (!Array.isArray(entries)) throw new Error(`Bad category: ${cat}`);
    for (const e of entries) {
      if (!e.korean || !e.english) throw new Error(`Missing fields in ${cat}`);
    }
  }
}

// ===== TTS =====
let koVoice = null;

function initTTS() {
  if (!('speechSynthesis' in window)) return;
  const findKo = () => { koVoice = speechSynthesis.getVoices().find(v => v.lang.startsWith('ko')); };
  findKo();
  speechSynthesis.onvoiceschanged = findKo;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 0.85;
  if (koVoice) u.voice = koVoice;
  // Find matching TTS button and pulse it
  let btn = null;
  document.querySelectorAll('.tts-btn').forEach(b => { if (b.dataset.tts === text) btn = b; });
  if (btn) btn.classList.add('tts-speaking');
  const cleanup = () => { if (btn) btn.classList.remove('tts-speaking'); };
  u.onend = cleanup;
  u.onerror = cleanup;
  speechSynthesis.speak(u);
}

function ttsBtn(text) {
  return `<button class="tts-btn" data-tts="${escHtml(text)}" onclick="event.stopPropagation();KoreanCore.speak(this.dataset.tts)" aria-label="Play audio">&#128264;</button>`;
}

// ===== TIMER =====
let activeTimer = null;

function startTimer(seconds, onExpire) {
  clearTimer();
  const start = Date.now();
  const ms = seconds * 1000;
  const fill = document.getElementById('timer-fill');
  const label = document.getElementById('timer-label');
  if (!fill) return;
  activeTimer = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct = Math.max(0, 100 - (elapsed / ms * 100));
    const remaining = Math.max(0, Math.ceil((ms - elapsed) / 1000));
    fill.style.width = pct + '%';
    fill.style.background = pct > 30 ? 'var(--blue)' : pct > 10 ? 'var(--orange)' : 'var(--red)';
    if (label) label.textContent = remaining + 's';
    if (elapsed >= ms) { clearTimer(); if (label) label.textContent = '0s'; onExpire(); }
  }, 100);
}

function clearTimer() {
  if (activeTimer) { clearInterval(activeTimer); activeTimer = null; }
}

function timerHtml(seconds) {
  if (!_cfg.getTimedMode()) return '';
  return `<div class="timer-label" id="timer-label">${seconds}s</div>
    <div class="timer-bar"><div class="timer-fill" id="timer-fill" style="width:100%;background:var(--blue)"></div></div>`;
}

// ===== INTERVAL PREDICTION =====
function getNextInterval(card, quality) {
  if (quality < GOOD) return 0.007;
  const r = card ? card.repetitions : 0;
  const ef = card ? card.ease_factor : 2.5;
  if (r === 0) return 0.04;
  if (r === 1) return 1;
  if (r === 2) return 3;
  return (card ? card.interval_days : 3) * ef;
}

function formatInterval(days) {
  if (days < 0.04) return '10m';
  if (days < 0.5) return Math.round(days * 24) + 'h';
  if (days < 30) return Math.round(days) + 'd';
  return Math.round(days / 30) + 'mo';
}

function ratingButtonsHtml(cardId, descs) {
  const d = descs || {again: "didn't know", hard: 'struggled', good: 'knew it', easy: 'effortless'};
  const srs = _cfg.srs;
  const card = srs.cards[cardId] || null;
  const intervals = {
    [AGAIN]: formatInterval(getNextInterval(card, AGAIN)),
    [HARD]: formatInterval(getNextInterval(card, HARD)),
    [GOOD]: formatInterval(getNextInterval(card, GOOD)),
    [EASY]: formatInterval(getNextInterval(card, EASY)),
  };
  return `
    <div class="rating">
      <button class="btn-again" data-q="${AGAIN}"><div class="interval">${intervals[AGAIN]}</div><div class="label">Again</div><div class="desc">${d.again}</div></button>
      <button class="btn-hard" data-q="${HARD}"><div class="interval">${intervals[HARD]}</div><div class="label">Hard</div><div class="desc">${d.hard}</div></button>
      <button class="btn-good" data-q="${GOOD}"><div class="interval">${intervals[GOOD]}</div><div class="label">Good</div><div class="desc">${d.good}</div></button>
      <button class="btn-easy" data-q="${EASY}"><div class="interval">${intervals[EASY]}</div><div class="label">Easy</div><div class="desc">${d.easy}</div></button>
    </div>
    <div class="shortcuts">1=Again  2=Hard  3=Good  4=Easy</div>`;
}

// ===== STREAK TRACKING =====
function getStreak() {
  const data = JSON.parse(localStorage.getItem(_cfg.streakKey) || '{"count":0,"lastDate":""}');
  const today = new Date().toISOString().slice(0, 10);
  if (data.lastDate === today) return data.count;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (data.lastDate === yesterday) return data.count;
  return 0;
}

function recordStudyDay() {
  const data = JSON.parse(localStorage.getItem(_cfg.streakKey) || '{"count":0,"lastDate":"","days":[]}');
  const today = new Date().toISOString().slice(0, 10);
  if (data.lastDate === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (data.lastDate === yesterday) {
    data.count++;
  } else {
    data.count = 1;
  }
  data.lastDate = today;
  if (!data.days) data.days = [];
  if (!data.days.includes(today)) data.days.push(today);
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  data.days = data.days.filter(d => d >= cutoff);
  safeSave(_cfg.streakKey, JSON.stringify(data));
}

function showStreakCalendar() {
  const data = JSON.parse(localStorage.getItem(_cfg.streakKey) || '{"count":0,"lastDate":"","days":[]}');
  const days = new Set(data.days || []);
  const streak = getStreak();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const start = new Date(today);
  start.setDate(start.getDate() - 55);
  while (start.getDay() !== 1) start.setDate(start.getDate() - 1);

  let cells = '';
  const headers = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  headers.forEach(h => { cells += `<div class="cal-header">${h}</div>`; });

  const d = new Date(start);
  while (d <= today) {
    const ds = d.toISOString().slice(0, 10);
    const isToday = ds === todayStr;
    const studied = days.has(ds);
    cells += `<div class="cal-day${studied ? ' studied' : ''}${isToday ? ' today' : ''}">${d.getDate()}</div>`;
    d.setDate(d.getDate() + 1);
  }

  const overlay = document.createElement('div');
  overlay.className = 'cal-overlay';
  overlay.innerHTML = `<div class="cal-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:1em">${streak > 0 ? `\u{1F525} ${streak} day streak` : 'Start your streak today!'}</h3>
      <button onclick="this.closest('.cal-overlay').remove()" style="background:none;border:none;font-size:1.2em;cursor:pointer;color:var(--dim)">\u2715</button>
    </div>
    <div class="cal-grid">${cells}</div>
    <div style="margin-top:8px;display:flex;gap:12px;justify-content:center;font-size:0.75em;color:var(--dim)">
      <span>\u{1F7E2} studied</span><span>\u{1F535} today</span>
    </div>
  </div>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// ===== FIREBASE SYNC FACTORY =====
function createFirebaseSync({ collectionName, srsStorageKey, uidStorageKey, firebaseConfig }) {
  let db = null, userId = null, syncEnabled = false;
  let syncTimeout = null;

  function updateSyncStatus(cls, text) {
    const el = document.getElementById('sync-status');
    if (el) { el.className = 'sync-status ' + cls; el.textContent = text; }
  }

  async function pushToFirestore() {
    if (!syncEnabled || !db || !userId) return;
    try {
      updateSyncStatus('syncing', 'Syncing...');
      const data = JSON.parse(localStorage.getItem(srsStorageKey) || '{}');
      await db.collection(collectionName).doc(userId).set({
        srs: JSON.stringify(data),
        updated: firebase.firestore.FieldValue.serverTimestamp()
      });
      updateSyncStatus('synced', 'Synced');
    } catch(e) {
      console.error('Firestore push failed:', e);
      updateSyncStatus('offline', 'Sync failed');
    }
  }

  async function pullFromFirestore(srsEngine) {
    if (!syncEnabled || !db || !userId) return;
    try {
      const doc = await db.collection(collectionName).doc(userId).get();
      if (doc.exists && doc.data().srs) {
        const remote = JSON.parse(doc.data().srs);
        const local = JSON.parse(localStorage.getItem(srsStorageKey) || '{}');
        const merged = {...local};
        for (const [id, rCard] of Object.entries(remote)) {
          if (!merged[id] || (rCard.last_review || 0) > (merged[id].last_review || 0)) {
            merged[id] = rCard;
          }
        }
        safeSave(srsStorageKey, JSON.stringify(merged));
        srsEngine._load();
      }
    } catch(e) {
      console.error('Firestore pull failed:', e);
    }
  }

  function debouncedSync() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(pushToFirestore, 2000);
  }

  async function initFirebase(srsEngine) {
    if (!firebaseConfig || !firebaseConfig.apiKey) return;
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      const auth = firebase.auth();
      const cred = await auth.signInAnonymously();
      userId = cred.user.uid;
      safeSave(uidStorageKey, userId);
      syncEnabled = true;
      updateSyncStatus('synced', 'Synced');
      await pullFromFirestore(srsEngine);
    } catch(e) {
      console.warn('Firebase init failed, using local only:', e);
      updateSyncStatus('offline', 'Local only');
    }
  }

  return { initFirebase, pushToFirestore, debouncedSync, updateSyncStatus, get syncEnabled() { return syncEnabled; } };
}

// ===== KEY HANDLER =====
function setKeyHandler(fn) {
  document.onkeydown = fn ? (e => {
    if (e.repeat) return;
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
    fn(e);
  }) : null;
}

// ===== POOL BUILDING =====
function buildPool(type, category) {
  const data = type === 'vocab' ? _cfg.vocabData() : _cfg.grammarData();
  const cats = category ? [category] : Object.keys(data);
  const pool = [];
  for (const cat of cats) {
    if (!data[cat]) continue;
    for (let i = 0; i < data[cat].length; i++) {
      pool.push({id: `${type}:${cat}:${i}`, type, cat, entry: data[cat][i]});
    }
  }
  return pool;
}

function prioritizeCards(pool, limit) {
  const srs = _cfg.srs;
  const ids = pool.map(p => p.id);
  const dueSet = new Set(srs.getDueCards(ids));
  const due = shuffle(pool.filter(p => dueSet.has(p.id))).slice(0, limit);
  if (due.length < limit) {
    const rest = shuffle(pool.filter(p => !dueSet.has(p.id)));
    due.push(...rest.slice(0, limit - due.length));
  }
  return due;
}

// ===== DRILL ENGINE =====
function DrillEngine({ session, renderCard, renderReveal, ratingDescs, onRate }) {
  let idx = 0, correct = 0, reviewed = 0;
  const mistakes = [];
  const ratings = { [AGAIN]: 0, [HARD]: 0, [GOOD]: 0, [EASY]: 0 };
  const sessionStart = Date.now();

  function showCard() {
    smoothScrollTop();
    setKeyHandler(null);
    clearTimer();
    if (idx >= session.length) { showSummary(reviewed, correct, mistakes, ratings, sessionStart); return; }
    renderCard(session[idx], progress(), showReveal);
  }

  function showReveal(result) {
    clearTimer();
    const skip = renderReveal(session[idx], result, progress());
    if (skip !== false) setupRating(session[idx].id);
  }

  function setupRating(id) {
    document.querySelectorAll('.rating button').forEach(btn => {
      btn.onclick = () => { disableRating(); rate(id, parseInt(btn.dataset.q)); };
    });
    const ratingDiv = document.querySelector('.rating');
    if (ratingDiv) {
      ratingDiv.insertAdjacentHTML('afterend', '<div class="skip-rating"><button id="next-skip">Next \u2192</button></div>');
      document.getElementById('next-skip').onclick = () => { disableRating(); rate(id, GOOD); };
    }
    setKeyHandler(e => {
      const map = {'1': AGAIN, '2': HARD, '3': GOOD, '4': EASY};
      if (map[e.key] !== undefined) { e.preventDefault(); disableRating(); rate(id, map[e.key]); }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); disableRating(); rate(id, GOOD); }
      if (e.key === 'Escape') _cfg.showMenu();
    });
  }

  function disableRating() {
    document.querySelectorAll('.rating button').forEach(b => b.disabled = true);
    setKeyHandler(null);
  }

  function rate(id, quality) {
    if (quality <= HARD) mistakes.push(session[idx]);
    if (onRate) onRate(session[idx], quality);
    ratings[quality] = (ratings[quality] || 0) + 1;
    _cfg.srs.recordReview(id, quality);
    reviewed++;
    if (quality >= GOOD) correct++;
    idx++;
    showCard();
  }

  function progress() {
    return { num: idx + 1, total: session.length, pct: ((idx) / session.length * 100).toFixed(0) };
  }

  function advance() { reviewed++; idx++; showCard(); }

  function manualRate(id, quality) {
    disableRating();
    if (onRate) onRate(session[idx], quality);
    _cfg.srs.recordReview(id, quality);
    if (quality >= GOOD) correct++;
    advance();
  }

  function autoGrade(id, isCorrect) {
    if (!isCorrect) mistakes.push(session[idx]);
    const q = isCorrect ? GOOD : AGAIN;
    ratings[q] = (ratings[q] || 0) + 1;
    _cfg.srs.recordReview(id, q);
    reviewed++;
    if (isCorrect) correct++;
  }

  function autoAdvance() { idx++; showCard(); }

  function getRatingHtml(id) {
    return ratingButtonsHtml(id, ratingDescs);
  }

  showCard();
  return { showCard, showReveal, setupRating, manualRate, autoGrade, autoAdvance, getRatingHtml, progress, advance };
}

function drillHeader(title, prog) {
  return `<button class="back-btn" onclick="KoreanCore._cfg.showMenu()">&#8592; Quit</button>
    <div class="counter">${escHtml(title)} &nbsp; ${prog.num}/${prog.total}</div>
    <div class="progress-bar"><div class="progress-fill" style="width:${prog.pct}%"></div></div>`;
}

// ===== DRILL HELPERS =====
function setupOptionHandlers(onSelect, extraKeys) {
  let fired = false;
  const btns = document.querySelectorAll('.option-btn');
  const n = btns.length;
  const fire = (idx) => {
    if (fired) return;
    fired = true;
    setKeyHandler(null);
    btns.forEach(b => b.disabled = true);
    clearTimer();
    onSelect(idx);
  };
  btns.forEach(btn => {
    btn.onclick = () => { const idx = parseInt(btn.dataset.idx); if (!isNaN(idx)) fire(idx); };
  });
  setKeyHandler(e => {
    const num = parseInt(e.key);
    if (num >= 1 && num <= n) fire(num - 1);
    else if (e.key === 'Escape') { clearTimer(); _cfg.showMenu(); }
    else if (extraKeys) extraKeys(e);
  });
  // Add keyboard hint below option grid
  const grid = document.querySelector('.option-grid');
  if (grid && !grid.nextElementSibling?.classList?.contains('shortcuts')) {
    grid.insertAdjacentHTML('afterend', `<div class="shortcuts">Press 1\u2013${n} to choose</div>`);
  }
  return fire;
}

function setupNextButton(engine) {
  document.getElementById('next-btn').onclick = () => engine.autoAdvance();
  setKeyHandler(e => {
    if (e.key === 'Enter' || e.key === ' ') engine.autoAdvance();
    if (e.key === 'Escape') _cfg.showMenu();
  });
}

function setupTextInput(onReveal, timerSeconds) {
  const input = _cfg.app.querySelector('.answer-input');
  input.focus();
  const reveal = () => { clearTimer(); onReveal(input.value.trim()); };
  if (_cfg.getTimedMode() && timerSeconds) startTimer(timerSeconds, reveal);
  const showBtn = document.getElementById('show-answer');
  if (showBtn) showBtn.onclick = reveal;
  input.onkeydown = e => {
    if (e.key === 'Enter') reveal();
    if (e.key === 'Escape') { clearTimer(); _cfg.showMenu(); }
  };
}

// ===== SHOW SUMMARY =====
function showSummary(reviewed, correct, mistakes, ratings, sessionStart) {
  mistakes = mistakes || [];
  ratings = ratings || {};
  const acc = reviewed > 0 ? correct / reviewed : 0;
  const accPct = Math.round(acc * 100);
  const tone = _cfg.toneConfig || {};
  const comments = tone.comments || [
    {min: 0.9, text: 'Amazing work!', color: 'var(--green)', ring: '#4ade80'},
    {min: 0.7, text: 'Great job! Keep it up!', color: 'var(--blue)', ring: '#60a5fa'},
    {min: 0.5, text: 'Getting there! Practice makes perfect.', color: 'var(--orange)', ring: '#fb923c'},
    {min: 0, text: "Don't worry, these will come back for more practice!", color: 'var(--red)', ring: '#f87171'}
  ];
  let comment, ringColor;
  for (const c of comments) {
    if (acc >= c.min) { comment = c.text; ringColor = c.ring; break; }
  }

  // Session duration
  let durationHtml = '';
  if (sessionStart) {
    const secs = Math.round((Date.now() - sessionStart) / 1000);
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    durationHtml = `<div class="summary-stat"><div class="value">${mins > 0 ? mins + 'm ' : ''}${remSecs}s</div><div class="label">Duration</div></div>`;
  }

  // Rating breakdown
  const rAgain = ratings[AGAIN] || 0, rHard = ratings[HARD] || 0, rGood = ratings[GOOD] || 0, rEasy = ratings[EASY] || 0;
  const hasRatings = rAgain + rHard + rGood + rEasy > 0;
  const ratingBreakdown = hasRatings ? `<div style="display:flex;justify-content:center;gap:16px;margin:12px 0;font-size:0.85em;flex-wrap:wrap">
    ${rAgain ? `<span style="color:var(--red)">Again: ${rAgain}</span>` : ''}
    ${rHard ? `<span style="color:var(--orange)">Hard: ${rHard}</span>` : ''}
    ${rGood ? `<span style="color:var(--green)">Good: ${rGood}</span>` : ''}
    ${rEasy ? `<span style="color:var(--cyan)">Easy: ${rEasy}</span>` : ''}
  </div>` : '';

  const streak = getStreak();
  const streakMsg = streak > 0 ? `<div style="margin-top:12px"><span class="streak-badge" onclick="KoreanCore.showStreakCalendar()">\u{1F525} ${streak} day${streak > 1 ? 's' : ''} streak</span></div>` : '';

  const r = 50, circ = 2 * Math.PI * r;
  const offset = circ * (1 - acc);

  _cfg.app.innerHTML = `
    <div class="summary">
      <h2>Session Complete</h2>
      <div style="display:flex;justify-content:center;margin:15px 0">
        <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="Accuracy: ${accPct}%">
          <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="8"/>
          <circle cx="65" cy="65" r="${r}" fill="none" stroke="${ringColor}" stroke-width="8"
            stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
            transform="rotate(-90 65 65)" style="transition: stroke-dashoffset 1s ease-out"/>
          <text x="65" y="65" text-anchor="middle" dominant-baseline="central"
            fill="${ringColor}" font-size="28" font-weight="bold" class="acc-number">${accPct}%</text>
        </svg>
      </div>
      <div class="summary-stats">
        <div class="summary-stat"><div class="value count-up" data-target="${reviewed}">${reviewed}</div><div class="label">Reviewed</div></div>
        <div class="summary-stat"><div class="value count-up" data-target="${correct}">${correct}</div><div class="label">Correct</div></div>
        ${durationHtml}
      </div>
      ${ratingBreakdown}
      <div class="comment">${comment}</div>
      ${streakMsg}
    </div>
    ${mistakes.length > 0 ? `<div style="margin:15px 0;padding:15px;background:var(--surface);border:1px solid var(--border);border-radius:12px">
      <h3 style="margin-bottom:8px;color:var(--dim);font-size:0.95em">Cards to review</h3>
      ${mistakes.map(m => `<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:0.9em">
        <span style="color:var(--text)">${escHtml(m.entry.korean || m.entry.pattern || m.entry.incorrect || m.entry.given || '')}</span>
        <span style="color:var(--dim);margin-left:8px">${escHtml(m.entry.english || m.entry.meaning || m.entry.correct || '')}</span>
      </div>`).join('')}
    </div>` : ''}
    <div style="display:flex;gap:10px">
      ${mistakes.length > 0 ? `<button class="btn" onclick="KoreanCore._cfg.showMenu()" style="flex:1">Study Again</button>` : ''}
      <button class="btn btn-primary" onclick="KoreanCore._cfg.showMenu()" style="flex:1">Back to Menu</button>
    </div>`;

  requestAnimationFrame(() => {
    const ring = _cfg.app.querySelector('circle:nth-child(2)');
    if (ring) ring.style.strokeDashoffset = offset;
  });

  const duration = 600;
  const start = performance.now();
  function animateCountUp(ts) {
    const elapsed = ts - start;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    _cfg.app.querySelectorAll('.count-up').forEach(el => {
      el.textContent = Math.round(ease * parseInt(el.dataset.target));
    });
    const accEl = _cfg.app.querySelector('.acc-number');
    if (accEl) accEl.textContent = Math.round(ease * accPct) + '%';
    if (t < 1) requestAnimationFrame(animateCountUp);
  }
  requestAnimationFrame(animateCountUp);

  setKeyHandler(e => { if (e.key === 'Enter' || e.key === 'Escape') _cfg.showMenu(); });
}

// ===== CONFIG =====
let _cfg = {
  app: null,
  srs: null,
  showMenu: () => {},
  getTimedMode: () => false,
  streakKey: '',
  vocabData: () => ({}),
  grammarData: () => ({}),
  toneConfig: null,
  recordStudyDay: recordStudyDay
};

function init(config) {
  _cfg = { ..._cfg, ...config, recordStudyDay: recordStudyDay };
}

// ===== PUBLIC API =====
window.KoreanCore = {
  // Constants
  AGAIN, HARD, GOOD, EASY,
  // Classes
  Card, SRSEngine,
  // Utilities
  shuffle, escHtml, safeSave, showToast, smoothScrollTop, normalizeKorean, highlightWord, validateVocab, notesAreRedundant,
  // TTS
  initTTS, speak, ttsBtn,
  // Timer
  startTimer, clearTimer, timerHtml,
  // Interval prediction
  getNextInterval, formatInterval, ratingButtonsHtml,
  // Streak
  getStreak, recordStudyDay, showStreakCalendar,
  // Firebase
  createFirebaseSync,
  // Key handler
  setKeyHandler,
  // Pool building
  buildPool, prioritizeCards,
  // Drill engine
  DrillEngine, drillHeader,
  // Drill helpers
  setupOptionHandlers, setupNextButton, setupTextInput,
  // Summary
  showSummary,
  // Config
  init,
  get _cfg() { return _cfg; }
};

})();
