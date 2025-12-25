// ===== Brain ⚡ Bolt — App.js v3.16.0 (Splash-safe + Level 2 restored + Near-miss decoys) =====
//
// Fixes your current issue:
// ✅ No longer crashes if index.html doesn’t have optA/optB/optC/optD buttons
// ✅ Works with your current DOM (questionBox + choices container)
// ✅ Splash will always dismiss (or shows an error message instead of freezing)
// ✅ Keeps 36 questions: 3 rounds of 12 (Round 2 = MATCH)
// ✅ Level 2 will not be skipped (guards + strict round slicing)
// ✅ Match round uses "Hard Mode Near-miss Decoys" (decoys feel plausibly correct)
//
// Notes:
// - This file does NOT require layout changes. It creates option buttons inside #choices if missing.
// - CSV is fetched with a cache-buster to avoid stale Sheets/Service Worker caches.

(() => {
  "use strict";

  // ---------------------------- CONFIG ----------------------------
  const TZ = "Pacific/Auckland";

  // Published sheet CSV (you confirmed working)
  const CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

  // Timers
  const QUESTION_TIME_MS = 10000; // 10s answer timer
  const QUESTION_TICK_MS = 100; // timer UI update frequency

  // Rounds
  const TOTAL_QUESTIONS = 36;
  const ROUND_SIZE = 12;
  const TOTAL_ROUNDS = 3;
  const ROUND_MODES = ["quiz", "match", "quiz"]; // Round 2 is MATCH

  // Match mode (Round 2)
  const MATCH_PAIRS = 6; // 6 left clues
  const MATCH_DECOYS = 6; // 6 right-side decoys (Hard mode)
  const MATCH_TOTAL_RIGHT = MATCH_PAIRS + MATCH_DECOYS;

  // Redemption rule (matches what you described earlier)
  // - 3 wrong ends run
  // - every 3 correct since last wrong removes 1 wrong (down to 0)
  const MAX_WRONG = 3;
  const REDEEM_STREAK = 3;

  // ---------------------------- DOM HELPERS ----------------------------
  const $ = (id) => document.getElementById(id);

  // "First match" getter for compatibility across older/newer HTML IDs
  const pickEl = (...ids) => {
    for (const id of ids) {
      const el = $(id);
      if (el) return el;
    }
    return null;
  };

  const splashEl = pickEl("startSplash", "splash");
  const splashMsgEl =
    splashEl?.querySelector(".splash-msg") || pickEl("splashStatus");

  const questionBox = pickEl("questionBox", "question");
  const choicesDiv = pickEl("choices");

  const startBtn = pickEl("startBtn");
  const shuffleBtn = pickEl("shuffleBtn");
  const soundBtn = pickEl("soundBtn");
  const shareBtn = pickEl("shareBtn");

  const setLabel = pickEl("setLabel");
  const progressLabel = pickEl("progressLabel");

  const pillScore = pickEl("pillScore");
  const pillWrong = pickEl("pillWrong");
  const pillStreak = pickEl("pillStreak");
  const pillRound = pickEl("pillRound");

  const timerBar = pickEl("timerBar");
  const elapsedTimeEl = pickEl("elapsedTime");

  const countdownOverlay = pickEl("countdownOverlay");
  const countdownNum = pickEl("countNum");

  // If timerBar has no internal fill element (it doesn’t), we create one safely
  let timerFill = null;
  function ensureTimerFill() {
    if (!timerBar) return null;
    timerBar.style.position = timerBar.style.position || "relative";
    timerBar.style.overflow = "hidden";
    timerFill = timerBar.querySelector(".timer-fill");
    if (!timerFill) {
      timerFill = document.createElement("div");
      timerFill.className = "timer-fill";
      // Inline styling so we don't rely on CSS changes
      Object.assign(timerFill.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        height: "100%",
        width: "0%",
        background: "rgba(255,255,255,0.22)",
        transition: "width 0.08s linear",
      });
      timerBar.appendChild(timerFill);
    }
    return timerFill;
  }

  function setText(el, t) {
    if (el) el.textContent = t == null ? "" : String(t);
  }

  function show(el) {
    if (el) el.style.display = "";
  }

  function hide(el) {
    if (el) el.style.display = "none";
  }

  function safeClass(el, cls, on) {
    if (!el) return;
    if (on) el.classList.add(cls);
    else el.classList.remove(cls);
  }

  // ---------------------------- AUDIO (resilient, never blocks) ----------------------------
  // IMPORTANT: Audio 404s must NOT freeze splash.
  // If mp3s are missing, we silently disable sound effects.
  let soundOn = true;
  let tickAudio = null,
    goodAudio = null,
    badAudio = null;

  function initAudio() {
    try {
      tickAudio = new Audio("tick.mp3");
      goodAudio = new Audio("good.mp3");
      badAudio = new Audio("bad.mp3");

      // Prevent errors from bubbling
      [tickAudio, goodAudio, badAudio].forEach((a) => {
        if (!a) return;
        a.preload = "auto";
        a.addEventListener("error", () => {
          // If files are missing, disable just that audio ref (do not crash)
          if (a === tickAudio) tickAudio = null;
          if (a === goodAudio) goodAudio = null;
          if (a === badAudio) badAudio = null;
        });
      });
    } catch {
      tickAudio = goodAudio = badAudio = null;
    }
  }

  function play(audio) {
    if (!soundOn || !audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  // ---------------------------- DATA LOAD ----------------------------
  function papaParseUrl(url) {
    return new Promise((resolve, reject) => {
      if (!window.Papa) {
        reject(new Error("PapaParse missing"));
        return;
      }
      window.Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (res) => resolve((res && res.data) || []),
        error: (err) => reject(err || new Error("CSV parse failed")),
      });
    });
  }

  function normaliseRow(r) {
    // Keep the bank headers you use
    const obj = {
      Date: r.Date ?? "",
      Question: r.Question ?? "",
      OptionA: r.OptionA ?? "",
      OptionB: r.OptionB ?? "",
      OptionC: r.OptionC ?? "",
      OptionD: r.OptionD ?? "",
      Answer: r.Answer ?? "",
      Explanation: r.Explanation ?? "",
      Category: r.Category ?? "",
      Difficulty: r.Difficulty ?? "",
      ID: r.ID ?? "",
      LastUsed: r.LastUsed ?? "",
      DayNumber: r.DayNumber ?? "",
    };
    // Trim common strings
    Object.keys(obj).forEach((k) => {
      if (typeof obj[k] === "string") obj[k] = obj[k].trim();
    });
    return obj;
  }

  async function loadQuestions() {
    setText(splashMsgEl, "Loading today’s set…");

    // ✅ Cache buster
    const url = CSV_URL + "&_ts=" + Date.now();

    const rows = await papaParseUrl(url);
    const cleaned = rows.map(normaliseRow).filter((r) => r.Question && r.Answer);

    // IMPORTANT: preserve CSV row order (do not shuffle globally)
    const first36 = cleaned.slice(0, TOTAL_QUESTIONS);

    if (first36.length < TOTAL_QUESTIONS) {
      throw new Error(
        `Only loaded ${first36.length}/${TOTAL_QUESTIONS} questions. Check LIVE sheet has 36 rows.`
      );
    }
    return first36;
  }

  // ---------------------------- GAME STATE ----------------------------
  let questions = [];
  let roundIndex = 0;

  let score = 0;
  let wrongTotal = 0;
  let correctSinceLastWrong = 0;

  let roundQuestions = [];
  let quizIndexInRound = 0; // 0..11 within quiz rounds

  let qTimer = null;
  let qStartMs = 0;
  let elapsedInterval = null;
  let elapsedSec = 0;

  // Level 2 match state
  let matchState = null;

  // ---------------------------- SPLASH ----------------------------
  function dismissSplash() {
    if (!splashEl) return;
    safeClass(splashEl, "hide", true);
    // In case CSS transitions differ, always hard-hide
    setTimeout(() => {
      try {
        splashEl.style.display = "none";
      } catch {}
    }, 350);
  }

  function splashError(msg) {
    setText(splashMsgEl, msg || "Could not load today’s set.");
    // Don’t dismiss; keep splash showing the error
  }

  // ---------------------------- UI: PILLS + PROGRESS ----------------------------
  function updatePills() {
    setText(pillScore, `Score: ${score}`);
    setText(pillWrong, `Wrong: ${wrongTotal}/${MAX_WRONG}`);
    setText(pillStreak, `Streak: ${correctSinceLastWrong}`);
    setText(pillRound, `Level: ${roundIndex + 1}/${TOTAL_ROUNDS}`);
  }

  function updateProgressLabel(extra = "") {
    const mode = ROUND_MODES[roundIndex] || "quiz";
    const labelMode = mode === "match" ? "MATCH ⚡" : "QUIZ";
    const base = `Round ${roundIndex + 1}/${TOTAL_ROUNDS} • ${labelMode}`;
    setText(setLabel, base);
    setText(
      progressLabel,
      extra ||
        (mode === "match"
          ? `Pairs: ${matchState?.solvedCount || 0}/${MATCH_PAIRS} • Wrong: ${wrongTotal}/${MAX_WRONG}`
          : `Q: ${quizIndexInRound + 1}/${ROUND_SIZE} • Wrong: ${wrongTotal}/${MAX_WRONG}`)
    );
    updatePills();
  }

  // ---------------------------- TIMER ----------------------------
  function stopQuestionTimer() {
    if (qTimer) clearInterval(qTimer);
    qTimer = null;
    qStartMs = 0;
    if (timerFill) timerFill.style.width = "0%";
  }

  function startQuestionTimer(onTimeout) {
    ensureTimerFill();
    stopQuestionTimer();
    qStartMs = Date.now();
    qTimer = setInterval(() => {
      const t = Date.now() - qStartMs;
      const pct = Math.min(1, t / QUESTION_TIME_MS);
      if (timerFill) timerFill.style.width = `${Math.floor(pct * 100)}%`;
      if (t >= QUESTION_TIME_MS) {
        stopQuestionTimer();
        onTimeout && onTimeout();
      }
    }, QUESTION_TICK_MS);
  }

  function startElapsedTimer() {
    if (elapsedInterval) clearInterval(elapsedInterval);
    elapsedSec = 0;
    setText(elapsedTimeEl, "0:00");
    elapsedInterval = setInterval(() => {
      elapsedSec++;
      const m = Math.floor(elapsedSec / 60);
      const s = elapsedSec % 60;
      setText(elapsedTimeEl, `${m}:${String(s).padStart(2, "0")}`);
    }, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedInterval) clearInterval(elapsedInterval);
    elapsedInterval = null;
  }

  // ---------------------------- COUNTDOWN (3-2-1 with ring feel) ----------------------------
  function ensureCountdownRing() {
    if (!countdownOverlay) return null;
    let ring = countdownOverlay.querySelector(".countdown-ring");
    if (!ring) {
      ring = document.createElement("div");
      ring.className = "countdown-ring";
      // Inline ring (no CSS changes needed)
      Object.assign(ring.style, {
        position: "absolute",
        width: "120px",
        height: "120px",
        borderRadius: "999px",
        border: "2px solid rgba(255,255,255,0.25)",
        boxShadow: "0 0 20px rgba(255,255,255,0.15)",
        inset: "0",
        margin: "auto",
        left: "0",
        right: "0",
        top: "0",
        bottom: "0",
        pointerEvents: "none",
      });
      countdownOverlay.style.position =
        countdownOverlay.style.position || "relative";
      countdownOverlay.appendChild(ring);
    }
    return ring;
  }

  async function runCountdown3() {
    if (!countdownOverlay || !countdownNum) return;
    const ring = ensureCountdownRing();

    show(countdownOverlay);

    const steps = [3, 2, 1];
    for (const n of steps) {
      setText(countdownNum, String(n));
      play(tickAudio);

      // pulse ring
      if (ring) {
        ring.animate(
          [
            { transform: "scale(0.96)", opacity: 0.55 },
            { transform: "scale(1.06)", opacity: 0.95 },
            { transform: "scale(1.0)", opacity: 0.75 },
          ],
          { duration: 500, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }

      await new Promise((r) => setTimeout(r, 650));
    }

    hide(countdownOverlay);
  }

  // ---------------------------- QUIZ MODE ----------------------------
  function getRoundSlice(idx) {
    const start = idx * ROUND_SIZE;
    return questions.slice(start, start + ROUND_SIZE);
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function norm(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function buildQuizOptions(q) {
    // Use A/B/C/D from sheet if present; otherwise build from answer + distractors
    const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD]
      .map((x) => String(x || "").trim())
      .filter(Boolean);

    // Guarantee answer exists in options
    const ans = String(q.Answer || "").trim();
    if (ans && !opts.some((o) => norm(o) === norm(ans))) opts.push(ans);

    // If duplicates, unique them
    const seen = new Set();
    const uniq = [];
    for (const o of opts) {
      const k = norm(o);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      uniq.push(o);
    }

    // Ensure 4 options (pad if bank row is malformed)
    while (uniq.length < 4) uniq.push(uniq[uniq.length - 1] || ans || "—");

    return shuffleArray(uniq.slice(0, 4));
  }

  function clearChoices() {
    if (!choicesDiv) return;
    choicesDiv.innerHTML = "";
    // keep existing classes; don’t overwrite layout
  }

  function renderQuizQuestion() {
    if (!questionBox || !choicesDiv) return;

    const q = roundQuestions[quizIndexInRound];
    if (!q) {
      // safety: end round if missing
      endRound();
      return;
    }

    clearChoices();
    setText(questionBox, q.Question);

    const opts = buildQuizOptions(q);

    // Build buttons dynamically in #choices
    opts.forEach((txt) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.type = "button";
      b.textContent = txt;
      b.addEventListener("click", () => onQuizAnswer(txt, q));
      choicesDiv.appendChild(b);
    });

    updateProgressLabel();
    startQuestionTimer(() => {
      // timeout counts as wrong
      registerWrong();
      nextQuizQuestion();
    });
  }

  function onQuizAnswer(selectedText, q) {
    stopQuestionTimer();

    const isCorrect = norm(selectedText) === norm(q.Answer);

    if (isCorrect) {
      registerCorrect();
      play(goodAudio);
      flashChoiceFeedback(true, selectedText);
    } else {
      registerWrong();
      play(badAudio);
      flashChoiceFeedback(false, selectedText, q.Answer);
    }

    // move on after short feedback
    setTimeout(() => {
      nextQuizQuestion();
    }, 520);
  }

  function flashChoiceFeedback(isCorrect, selected, answer) {
    if (!choicesDiv) return;
    const btns = Array.from(choicesDiv.querySelectorAll("button"));
    btns.forEach((b) => {
      const t = norm(b.textContent);
      if (t === norm(selected)) safeClass(b, isCorrect ? "correct" : "wrong", true);
      if (!isCorrect && answer && t === norm(answer)) safeClass(b, "correct", true);
      b.disabled = true;
    });
  }

  function nextQuizQuestion() {
    quizIndexInRound++;
    if (quizIndexInRound >= ROUND_SIZE) {
      endRound();
      return;
    }
    renderQuizQuestion();
  }

  // ---------------------------- REDEMPTION RULE + STREAK ----------------------------
  function registerCorrect() {
    score++;
    correctSinceLastWrong++;

    // redemption: every 3 correct since last wrong reduces wrongTotal by 1
    if (wrongTotal > 0 && correctSinceLastWrong >= REDEEM_STREAK) {
      wrongTotal = Math.max(0, wrongTotal - 1);
      correctSinceLastWrong = 0;
    }
    updatePills();
  }

  function registerWrong() {
    wrongTotal++;
    correctSinceLastWrong = 0;
    updatePills();

    if (wrongTotal >= MAX_WRONG) {
      endGame(`3 incorrect — game over!`);
    }
  }

  // ---------------------------- MATCH MODE (Hard Near-miss Decoys) ----------------------------
  function truncateClue(s) {
    const t = String(s || "").trim();
    if (t.length <= 44) return t;
    return t.slice(0, 42).trim() + "…";
  }

  function tokenise(s) {
    return norm(s)
      .split(" ")
      .map((x) => x.replace(/[^a-z0-9]/g, ""))
      .filter((x) => x.length >= 3);
  }

  function overlapScore(a, b) {
    const A = new Set(tokenise(a));
    const B = new Set(tokenise(b));
    let c = 0;
    for (const x of A) if (B.has(x)) c++;
    return c;
  }

  function collectDecoyPool(pool) {
    // Pull from other questions' options (A/B/C/D), explanations, answers
    const items = [];
    pool.forEach((q) => {
      [q.OptionA, q.OptionB, q.OptionC, q.OptionD, q.Answer]
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .forEach((x) => items.push(x));
    });

    // Unique
    const seen = new Set();
    const uniq = [];
    for (const x of items) {
      const k = norm(x);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      uniq.push(x);
    }
    return uniq;
  }

  function pickNearMissDecoys(correctAnswer, poolItems, excludeSet, needed) {
    // Prefer decoys that "feel" similar:
    // - shared tokens with correct answer (near-miss)
    // - similar length range
    const ans = String(correctAnswer || "").trim();
    const ansLen = ans.length;

    const candidates = poolItems
      .filter((x) => !excludeSet.has(norm(x)))
      .map((x) => ({
        text: x,
        score:
          overlapScore(ans, x) * 10 -
          Math.abs(ansLen - String(x).length) * 0.08,
      }))
      .sort((a, b) => b.score - a.score);

    const out = [];
    for (const c of candidates) {
      if (out.length >= needed) break;
      // Ensure decoys aren’t identical-ish
      const k = norm(c.text);
      if (excludeSet.has(k)) continue;
      excludeSet.add(k);
      out.push(c.text);
    }

    // If not enough, fill randomly
    if (out.length < needed) {
      const rest = poolItems.filter((x) => !excludeSet.has(norm(x)));
      const fill = shuffleArray(rest).slice(0, needed - out.length);
      fill.forEach((x) => {
        excludeSet.add(norm(x));
        out.push(x);
      });
    }

    return out;
  }

  function renderMatchUI(state) {
    if (!choicesDiv || !questionBox) return;
    clearChoices();

    // We keep layout by using the same #choices grid area.
    // We render left column then right column as one combined grid (like before).
    setText(questionBox, "Match the pairs");

    const wrap = document.createElement("div");
    wrap.className = "match-grid";
    // Do not clobber styles: only add a class the CSS already supports (if any),
    // otherwise it behaves like a normal div.
    Object.assign(wrap.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
      width: "100%",
    });

    const leftCol = document.createElement("div");
    const rightCol = document.createElement("div");
    Object.assign(leftCol.style, { display: "grid", gap: "10px" });
    Object.assign(rightCol.style, { display: "grid", gap: "10px" });

    state.leftTiles.forEach((t) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.type = "button";
      b.textContent = t.text;
      b.dataset.side = "L";
      b.dataset.pairId = t.pairId;
      b.addEventListener("click", () => onMatchTap(b));
      leftCol.appendChild(b);
    });

    state.rightTiles.forEach((t) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.type = "button";
      b.textContent = t.text;
      b.dataset.side = "R";
      b.dataset.pairId = t.pairId;
      b.dataset.isDecoy = t.isDecoy ? "1" : "0";
      b.addEventListener("click", () => onMatchTap(b));
      rightCol.appendChild(b);
    });

    wrap.appendChild(leftCol);
    wrap.appendChild(rightCol);
    choicesDiv.appendChild(wrap);
  }

  function startMatchRound() {
    stopQuestionTimer();

    // Take the 12 questions for this round (Q13–Q24 in LIVE)
    const pool = roundQuestions.slice();
    if (pool.length !== ROUND_SIZE) {
      // safety: ensure we never skip round 2 due to bad slicing
      endGame("Match round data missing (expected 12).");
      return;
    }

    // Choose 6 pairs from the 12
    const chosen = shuffleArray(pool).slice(0, MATCH_PAIRS);

    // Build pairs: left is clue, right is correct answer
    const pairs = chosen.map((q, i) => ({
      pairId: `p${i}`,
      // Make clues less obvious (harder): shorter + category removed
      left: truncateClue(q.Question),
      right: String(q.Answer || "").trim(),
    }));

    // Build decoys: near-miss decoys that feel plausible
    const exclude = new Set(pairs.map((p) => norm(p.right)));
    const poolItems = collectDecoyPool(pool);

    // “Hard mode near-miss” decoys are chosen relative to *each* correct answer.
    // We create a combined decoy list by sampling near-misses across the answers.
    const decoys = [];
    const perAnswer = Math.max(1, Math.floor(MATCH_DECOYS / MATCH_PAIRS));
    const remainder = MATCH_DECOYS - perAnswer * MATCH_PAIRS;

    pairs.forEach((p, idx) => {
      const need = perAnswer + (idx < remainder ? 1 : 0);
      const picked = pickNearMissDecoys(p.right, poolItems, exclude, need);
      decoys.push(...picked);
    });

    // Right tiles: 6 correct + 6 decoys (12 total)
    const rightTiles = shuffleArray([
      ...pairs.map((p) => ({
        text: p.right,
        pairId: p.pairId,
        isDecoy: false,
      })),
      ...decoys.slice(0, MATCH_DECOYS).map((d, i) => ({
        text: d,
        pairId: `decoy_${i}`,
        isDecoy: true,
      })),
    ]);

    // Left tiles: 6 clues
    const leftTiles = shuffleArray(
      pairs.map((p) => ({
        text: p.left,
        pairId: p.pairId,
      }))
    );

    matchState = {
      pairs,
      leftTiles,
      rightTiles,
      solved: new Set(),
      selectedLeft: null,
      selectedRight: null,
      locked: false,
      solvedCount: 0,
    };

    updateProgressLabel(`Pairs: 0/${MATCH_PAIRS} • Wrong: ${wrongTotal}/${MAX_WRONG}`);
    renderMatchUI(matchState);
  }

  function clearMatchSelectionStyles() {
    if (!choicesDiv) return;
    choicesDiv.querySelectorAll("button.choice.selected").forEach((b) => {
      b.classList.remove("selected");
    });
  }

  function setSelected(btn) {
    if (!btn) return;
    // Clear selection on same side
    const side = btn.dataset.side;
    const buttons = Array.from(choicesDiv.querySelectorAll("button.choice"));
    buttons
      .filter((b) => b.dataset.side === side)
      .forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  }

  function findButton(side, pairId) {
    const all = Array.from(choicesDiv.querySelectorAll("button.choice"));
    return all.find((b) => b.dataset.side === side && b.dataset.pairId === pairId);
  }

  function microShake(btn) {
    if (!btn) return;
    try {
      btn.animate(
        [
          { transform: "translateX(0px)" },
          { transform: "translateX(-4px)" },
          { transform: "translateX(4px)" },
          { transform: "translateX(-3px)" },
          { transform: "translateX(3px)" },
          { transform: "translateX(0px)" },
        ],
        { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
    } catch {}
  }

  function connectionGlow(aBtn, bBtn) {
    // Tiny premium "connection" glow when correct pair locks
    // Inline using a transient overlay line (no layout changes)
    if (!choicesDiv || !aBtn || !bBtn) return;

    const rectA = aBtn.getBoundingClientRect();
    const rectB = bBtn.getBoundingClientRect();
    const wrapRect = choicesDiv.getBoundingClientRect();

    const x1 = rectA.left + rectA.width;
    const y1 = rectA.top + rectA.height / 2;
    const x2 = rectB.left;
    const y2 = rectB.top + rectB.height / 2;

    const line = document.createElement("div");
    Object.assign(line.style, {
      position: "absolute",
      left: `${x1 - wrapRect.left}px`,
      top: `${y1 - wrapRect.top}px`,
      width: `${Math.max(10, x2 - x1)}px`,
      height: "2px",
      background:
        "linear-gradient(90deg, rgba(255,255,255,0.0), rgba(255,255,255,0.55), rgba(255,255,255,0.0))",
      filter: "drop-shadow(0 0 10px rgba(255,255,255,0.35))",
      transformOrigin: "left center",
      transform: `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`,
      pointerEvents: "none",
      opacity: "0",
      borderRadius: "2px",
      zIndex: "20",
    });

    // Ensure container can host absolute overlay
    choicesDiv.style.position = choicesDiv.style.position || "relative";
    choicesDiv.appendChild(line);

    try {
      line.animate(
        [{ opacity: 0, transform: line.style.transform }, { opacity: 1 }, { opacity: 0 }],
        { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
    } catch {}

    setTimeout(() => {
      try {
        line.remove();
      } catch {}
    }, 500);
  }

  function lockCorrectPair(leftBtn, rightBtn) {
    if (!leftBtn || !rightBtn) return;
    leftBtn.disabled = true;
    rightBtn.disabled = true;
    leftBtn.classList.remove("selected");
    rightBtn.classList.remove("selected");
    leftBtn.classList.add("correct");
    rightBtn.classList.add("correct");

    // glow pulse
    try {
      leftBtn.animate(
        [{ boxShadow: "0 0 0 rgba(255,255,255,0)" }, { boxShadow: "0 0 18px rgba(255,255,255,0.25)" }, { boxShadow: "0 0 0 rgba(255,255,255,0)" }],
        { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
      rightBtn.animate(
        [{ boxShadow: "0 0 0 rgba(255,255,255,0)" }, { boxShadow: "0 0 18px rgba(255,255,255,0.25)" }, { boxShadow: "0 0 0 rgba(255,255,255,0)" }],
        { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
    } catch {}
  }

  function onMatchTap(btn) {
    if (!matchState || matchState.locked) return;
    if (!btn || btn.disabled) return;

    const side = btn.dataset.side;
    const pairId = btn.dataset.pairId;

    // select
    if (side === "L") matchState.selectedLeft = pairId;
    else matchState.selectedRight = pairId;

    setSelected(btn);

    if (!matchState.selectedLeft || !matchState.selectedRight) return;

    matchState.locked = true;

    const leftBtn = findButton("L", matchState.selectedLeft);
    const rightBtn = findButton("R", matchState.selectedRight);

    const isCorrect = matchState.selectedLeft === matchState.selectedRight;

    if (isCorrect) {
      play(goodAudio);
      connectionGlow(leftBtn, rightBtn);
      lockCorrectPair(leftBtn, rightBtn);

      matchState.solved.add(matchState.selectedLeft);
      matchState.solvedCount = matchState.solved.size;

      registerCorrect();

      matchState.selectedLeft = null;
      matchState.selectedRight = null;
      matchState.locked = false;

      updateProgressLabel(
        `Pairs: ${matchState.solvedCount}/${MATCH_PAIRS} • Wrong: ${wrongTotal}/${MAX_WRONG}`
      );

      if (matchState.solvedCount >= MATCH_PAIRS) {
        // Completed match round
        setTimeout(() => endRound(), 380);
      }
      return;
    }

    // wrong: decoy or mismatch
    play(badAudio);
    microShake(leftBtn);
    microShake(rightBtn);

    // brief wrong flash
    if (leftBtn) leftBtn.classList.add("wrong");
    if (rightBtn) rightBtn.classList.add("wrong");

    registerWrong();

    setTimeout(() => {
      if (leftBtn) leftBtn.classList.remove("wrong", "selected");
      if (rightBtn) rightBtn.classList.remove("wrong", "selected");
      matchState.selectedLeft = null;
      matchState.selectedRight = null;
      matchState.locked = false;

      updateProgressLabel(
        `Pairs: ${matchState.solvedCount}/${MATCH_PAIRS} • Wrong: ${wrongTotal}/${MAX_WRONG}`
      );
    }, 260);
  }

  // ---------------------------- ROUND FLOW ----------------------------
  function beginRound(idx) {
    roundIndex = idx;

    // Strict slicing: never shuffle across rounds
    roundQuestions = getRoundSlice(roundIndex);

    // Guard: do not skip Level 2 even if questions array got shorter
    if (roundQuestions.length !== ROUND_SIZE) {
      endGame(
        `Round data missing (got ${roundQuestions.length}/${ROUND_SIZE}). Check LIVE sheet has 36 rows and app is loading latest CSV.`
      );
      return;
    }

    quizIndexInRound = 0;
    matchState = null;

    updatePills();

    const mode = ROUND_MODES[roundIndex];
    if (mode === "match") {
      startMatchRound();
      return;
    }

    renderQuizQuestion();
  }

  function endRound() {
    stopQuestionTimer();

    const next = roundIndex + 1;
    if (next >= TOTAL_ROUNDS) {
      endGame("Daily set complete ✅");
      return;
    }

    // Start next round after a tiny breath
    setTimeout(() => beginRound(next), 380);
  }

  function endGame(message) {
    stopQuestionTimer();
    stopElapsedTimer();

    if (questionBox) setText(questionBox, message);
    if (choicesDiv) {
      clearChoices();
      // Keep layout: show a soft end-state line
      const p = document.createElement("div");
      p.className = "end-state";
      p.textContent = "Come back tomorrow for a fresh set.";
      Object.assign(p.style, {
        opacity: "0.85",
        padding: "10px 0",
        textAlign: "center",
      });
      choicesDiv.appendChild(p);
    }

    updateProgressLabel("Run finished");
  }

  // ---------------------------- BUTTON WIRING (NEVER THROW) ----------------------------
  function wireButtons() {
    if (startBtn) {
      startBtn.addEventListener("click", async () => {
        // Don’t allow start before data is ready
        if (!questions || questions.length < TOTAL_QUESTIONS) return;

        // countdown with ring + ticks
        await runCountdown3();

        // start run
        startElapsedTimer();
        beginRound(0);
      });
    }

    if (shuffleBtn) {
      shuffleBtn.addEventListener("click", () => {
        // Shuffle options for current quiz question only (not the question order)
        const mode = ROUND_MODES[roundIndex];
        if (mode !== "quiz") return;
        renderQuizQuestion();
      });
    }

    if (soundBtn) {
      soundBtn.addEventListener("click", () => {
        soundOn = !soundOn;
        soundBtn.classList.toggle("off", !soundOn);
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener("click", async () => {
        const text = `BrainBolt — Score ${score}, Wrong ${wrongTotal}/${MAX_WRONG}`;
        try {
          if (navigator.share) {
            await navigator.share({ text, url: location.href });
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(`${text} — ${location.href}`);
          }
        } catch {}
      });
    }
  }

  // ---------------------------- BOOT ----------------------------
  async function boot() {
    ensureTimerFill();
    initAudio();
    wireButtons();
    updatePills();

    try {
      questions = await loadQuestions();

      // Auto-dismiss splash (no tap)
      // Keep a short delay so it feels intentional
      setTimeout(() => {
        dismissSplash();
      }, 350);

      // Optional: show ready hint
      // (Don’t force-run; user starts via Start button)
      setText(questionBox, "Ready for today’s set?");
      updateProgressLabel("Tap Start to begin");
    } catch (err) {
      console.error(err);
      splashError(
        "Could not load today’s questions. Check the LIVE sheet publish + your CSV URL, then refresh."
      );
    }
  }

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
