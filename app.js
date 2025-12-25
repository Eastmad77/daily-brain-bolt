// ===== Brain ⚡ Bolt — App.js v3.16.0 (Round2 MATCH + Decoys + stable CSV order) =====

// ✅ Use the published CSV (this one is correct)
const CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

// 36-per-day support
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = 3;

// Round modes (keep as you had it)
const ROUND_MODES = ["quiz", "match", "quiz"];

// Match settings
const MATCH_PAIRS = 6;       // how many correct pairs to solve
const MATCH_DECOYS = 6;      // decoy tiles added on the RIGHT (high challenge)
const MATCH_TIME_MS = 45000; // match round timer

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);

const splashEl = $("splash");
const splashStatusEl = $("splashStatus");

const statusEl = $("status");
const scoreEl = $("score");
const qIndexEl = $("qIndex");

const questionEl = $("question");
const optionEls = [$("option1"), $("option2"), $("option3"), $("option4")];

const startBtn = $("startBtn");
const shuffleBtn = $("shuffleBtn");
const shareBtn = $("shareBtn");
const dotsEl = $("dots");
const timerBarFillEl = $("timerFill");

const quizPanelEl = $("quizPanel");
const matchPanelEl = $("matchPanel");
const matchLeftEl = $("matchLeft");
const matchRightEl = $("matchRight");
const matchHintEl = $("matchHint");

const countdownEl = $("countdown");
const countdownRingEl = $("countdownRing");
const countdownNumEl = $("countdownNum");

const soundBtn = $("soundBtn");

// ---------------- State ----------------
let questions = []; // loaded in CSV order (do not shuffle by default)

let roundIndex = 0;
let roundStartIndex = 0;
let roundQuestions = [];
let roundQuestionIndex = 0;

let currentIndex = 0; // within round (0..11)
let score = 0;

let wrongTotal = 0;
let correctSinceLastWrong = 0;

let playing = false;

let elapsedInterval = null;
let qTimer = null;
let qStart = 0;

let soundOn = true;

// Match mode state
let matchState = null;
let matchTimer = null;
let matchStart = 0;

// ---------------- Utilities ----------------
function setText(el, txt) {
    if (el) el.textContent = txt;
}

function show(el) {
    if (el) el.style.display = "";
}

function hide(el) {
    if (el) el.style.display = "none";
}

function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function normStr(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function safeNow() {
    return Date.now();
}

// ---------------- Audio (never blocks UI) ----------------
let tickAudio = null,
    goodAudio = null,
    badAudio = null;

function initAudio() {
    try {
        // These may 404; that's OK — we never await them
        tickAudio = new Audio("tick.mp3");
        goodAudio = new Audio("good.mp3");
        badAudio = new Audio("bad.mp3");
    } catch (e) {
        tickAudio = goodAudio = badAudio = null;
    }
}

function playAudio(a) {
    if (!soundOn || !a) return;
    try {
        a.currentTime = 0;
        a.play().catch(() => { });
    } catch (_) { }
}

// ---------------- Splash ----------------
function hideSplashSoon() {
    if (!splashEl) return;
    splashEl.classList.add("hide");
    setTimeout(() => {
        if (splashEl) splashEl.style.display = "none";
    }, 250);
}

// ---------------- CSV load (stable order, no shuffle) ----------------
async function loadQuestions() {
    setText(splashStatusEl, "Loading today’s set…");

    // ✅ cache-buster + no-store (plus SW bypass rule)
    const url = CSV_URL + "&_ts=" + safeNow();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("CSV fetch failed: " + res.status);

    const csvText = await res.text();

    if (!window.Papa) throw new Error("PapaParse missing");

    const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
    });

    const rows = (parsed && parsed.data) || [];

    // Keep CSV row order exactly as delivered
    const mapped = rows
        .map((r) => ({
            Date: r.Date,
            Question: r.Question,
            OptionA: r.OptionA,
            OptionB: r.OptionB,
            OptionC: r.OptionC,
            OptionD: r.OptionD,
            Answer: r.Answer,
            Explanation: r.Explanation,
            Category: r.Category,
            Difficulty: r.Difficulty,
            ID: r.ID,
            LastUsed: r.LastUsed,
            DayNumber: r.DayNumber,
        }))
        .filter((q) => q.Question && q.Answer);

    questions = mapped.slice(0, TOTAL_QUESTIONS);

    if (questions.length < TOTAL_QUESTIONS) {
        // still allow play, but warn
        console.warn("Loaded fewer than expected questions:", questions.length);
    }

    return questions;
}

// ---------------- UI: status/header ----------------
function updateHeader() {
    // status line is something like: Ready / Playing
    setText(statusEl, playing ? "Playing" : "Ready");
    setText(scoreEl, "Score " + score);

    const qNum = clamp(currentIndex + 1, 1, ROUND_SIZE);
    const roundLabel = `${roundIndex + 1}/${TOTAL_ROUNDS}`;

    // Keep your existing display style:
    // "Round 1/3 • Q 0/12" etc.
    setText(qIndexEl, `Round ${roundLabel} • Q ${currentIndex}/${ROUND_SIZE}`);
}

// ---------------- Timer bar ----------------
function resetTimerBar() {
    if (!timerBarFillEl) return;
    timerBarFillEl.style.width = "0%";
}

function renderTimerBar(elapsedMs) {
    if (!timerBarFillEl) return;
    const pct = clamp((elapsedMs / QUESTION_TIME_MS) * 100, 0, 100);
    timerBarFillEl.style.width = pct + "%";
}

// ---------------- Dots (streak indicators) ----------------
function ensureDots() {
    if (!dotsEl) return;
    if (dotsEl.children && dotsEl.children.length >= ROUND_SIZE) return;

    dotsEl.innerHTML = "";
    for (let i = 0; i < ROUND_SIZE; i++) {
        const d = document.createElement("div");
        d.className = "dot";
        dotsEl.appendChild(d);
    }
}

function setDotState(idx, state) {
    if (!dotsEl) return;
    const el = dotsEl.children[idx];
    if (!el) return;
    el.classList.remove("dot-correct", "dot-wrong", "dot-redeemed");
    if (state === "correct") el.classList.add("dot-correct");
    if (state === "wrong") el.classList.add("dot-wrong");
    if (state === "redeemed") el.classList.add("dot-redeemed");
}

function redeemOneWrongDot() {
    if (!dotsEl) return false;
    // find earliest wrong dot and flip it to redeemed
    for (let i = 0; i < dotsEl.children.length; i++) {
        const d = dotsEl.children[i];
        if (d && d.classList.contains("dot-wrong")) {
            d.classList.remove("dot-wrong");
            d.classList.add("dot-redeemed");
            return true;
        }
    }
    return false;
}

// ---------------- Countdown (3..2..1) ----------------
function showCountdown(onDone) {
    if (!countdownEl || !countdownNumEl) {
        onDone && onDone();
        return;
    }

    show(countdownEl);
    let n = 3;

    const tick = () => {
        setText(countdownNumEl, String(n));
        // ring effect: set CSS var if present
        if (countdownRingEl) {
            // simple pulse by toggling a class
            countdownRingEl.classList.remove("pulse");
            // force reflow
            void countdownRingEl.offsetWidth;
            countdownRingEl.classList.add("pulse");
        }
        playAudio(tickAudio);

        n--;
        if (n === 0) {
            setText(countdownNumEl, "GO");
            playAudio(tickAudio);
            setTimeout(() => {
                hide(countdownEl);
                onDone && onDone();
            }, 300);
        } else {
            setTimeout(tick, 650);
        }
    };

    tick();
}

// ---------------- Game flow ----------------
function resetGame() {
    playing = false;

    roundIndex = 0;
    roundStartIndex = 0;
    roundQuestionIndex = 0;
    currentIndex = 0;

    score = 0;
    wrongTotal = 0;
    correctSinceLastWrong = 0;

    matchState = null;

    stopTimers();
    ensureDots();
    for (let i = 0; i < ROUND_SIZE; i++) setDotState(i, null);

    resetTimerBar();
    updateHeader();

    // show quiz panel by default
    if (quizPanelEl && matchPanelEl) {
        show(quizPanelEl);
        hide(matchPanelEl);
    }

    setText(questionEl, "Press Start to Play");
    optionEls.forEach((b) => {
        if (!b) return;
        b.disabled = false;
        b.classList.remove("correct", "wrong", "selected");
        b.textContent = "";
    });
}

function beginRound() {
    roundStartIndex = roundIndex * ROUND_SIZE;
    roundQuestions = questions.slice(roundStartIndex, roundStartIndex + ROUND_SIZE);

    // Important: keep CSV order as-is (no randomisation here)
    roundQuestionIndex = 0;
    currentIndex = 0;

    ensureDots();
    for (let i = 0; i < ROUND_SIZE; i++) setDotState(i, null);

    updateHeader();

    const mode = ROUND_MODES[roundIndex] || "quiz";
    if (mode === "match") {
        startMatchRound();
    } else {
        showQuiz();
        renderQuizQuestion();
    }
}

function endRound() {
    stopTimers();

    roundIndex++;
    if (roundIndex >= TOTAL_ROUNDS) {
        playing = false;
        updateHeader();
        setText(questionEl, "Daily set complete ✅");
        optionEls.forEach((b) => b && (b.disabled = true));
        return;
    }

    // start next round after a short beat
    setTimeout(() => beginRound(), 350);
}

function endGame(msg) {
    stopTimers();
    playing = false;
    updateHeader();
    setText(questionEl, msg || "Game over");
    optionEls.forEach((b) => b && (b.disabled = true));
    if (matchLeftEl) matchLeftEl.innerHTML = "";
    if (matchRightEl) matchRightEl.innerHTML = "";
}

// ---------------- Quiz mode ----------------
function showQuiz() {
    if (quizPanelEl && matchPanelEl) {
        show(quizPanelEl);
        hide(matchPanelEl);
    }
}

function resolveOptions(q) {
    const a = String(q.OptionA || "").trim();
    const b = String(q.OptionB || "").trim();
    const c = String(q.OptionC || "").trim();
    const d = String(q.OptionD || "").trim();
    return [a, b, c, d].filter(Boolean);
}

function resolveAnswerText(q) {
    // Prefer explicit Answer text
    return String(q.Answer || "").trim();
}

function renderQuizQuestion() {
    stopQuestionTimerOnly();
    resetTimerBar();

    const q = roundQuestions[roundQuestionIndex];
    if (!q) {
        endRound();
        return;
    }

    // question
    setText(questionEl, String(q.Question || "").trim());

    // options
    const opts = resolveOptions(q);
    // If sheet sometimes has Answer duplicated in OptionA/B etc, still fine.

    // Ensure exactly 4 button texts
    for (let i = 0; i < optionEls.length; i++) {
        const btn = optionEls[i];
        if (!btn) continue;
        btn.disabled = false;
        btn.classList.remove("correct", "wrong", "selected");
        btn.textContent = opts[i] || "";
        btn.onclick = () => onPickOption(i);
    }

    // start timer
    qStart = safeNow();
    qTimer = setInterval(() => {
        const elapsed = safeNow() - qStart;
        renderTimerBar(elapsed);

        const secLeft = Math.ceil((QUESTION_TIME_MS - elapsed) / 1000);
        // tick sound last 3 seconds
        if (secLeft <= 3 && secLeft >= 1) {
            // prevent spam: only play when sec changes
            // cheap gate using width updates: use secLeft changes by time threshold
            // (we’ll simply play once per second-ish)
            if ((elapsed % 1000) < QUESTION_TICK_MS) playAudio(tickAudio);
        }

        if (elapsed >= QUESTION_TIME_MS) {
            clearInterval(qTimer);
            qTimer = null;
            onTimeout();
        }
    }, QUESTION_TICK_MS);
}

function stopQuestionTimerOnly() {
    if (qTimer) {
        clearInterval(qTimer);
        qTimer = null;
    }
}

function stopTimers() {
    stopQuestionTimerOnly();
    if (elapsedInterval) {
        clearInterval(elapsedInterval);
        elapsedInterval = null;
    }
    if (matchTimer) {
        clearInterval(matchTimer);
        matchTimer = null;
    }
}

function registerWrong() {
    wrongTotal++;
    correctSinceLastWrong = 0;

    if (wrongTotal >= 3) {
        endGame("3 incorrect — game over!");
        return;
    }
}

function registerCorrect() {
    score++;
    correctSinceLastWrong++;

    // ✅ redemption rule: every 3 correct since last wrong redeems ONE strike
    if (correctSinceLastWrong >= 3 && wrongTotal > 0) {
        const redeemed = redeemOneWrongDot();
        wrongTotal = Math.max(0, wrongTotal - 1);
        correctSinceLastWrong = 0;
        if (redeemed) setText(statusEl, "Redeemed ⚡");
    }
}

function onTimeout() {
    // mark dot wrong
    setDotState(currentIndex, "wrong");
    playAudio(badAudio);
    registerWrong();

    // advance
    roundQuestionIndex++;
    currentIndex++;
    updateHeader();

    if (!playing) return;
    if (currentIndex >= ROUND_SIZE) {
        endRound();
    } else {
        renderQuizQuestion();
    }
}

function onPickOption(idx) {
    if (!playing) return;

    const q = roundQuestions[roundQuestionIndex];
    if (!q) return;

    stopQuestionTimerOnly();

    const answer = normStr(resolveAnswerText(q));
    const picked = normStr(optionEls[idx]?.textContent || "");

    const isCorrect = picked && answer && picked === answer;

    // UI feedback
    optionEls.forEach((b, i) => {
        if (!b) return;
        b.disabled = true;
        if (i === idx) b.classList.add("selected");
    });

    if (isCorrect) {
        playAudio(goodAudio);
        setDotState(currentIndex, "correct");
        registerCorrect();
        // small glow
        optionEls[idx]?.classList.add("correct");
    } else {
        playAudio(badAudio);
        setDotState(currentIndex, "wrong");
        registerWrong();
        optionEls[idx]?.classList.add("wrong");

        // also show correct option subtly
        for (let i = 0; i < optionEls.length; i++) {
            const btn = optionEls[i];
            if (!btn) continue;
            if (normStr(btn.textContent) === answer) btn.classList.add("correct");
        }
    }

    // advance after beat
    setTimeout(() => {
        if (!playing) return;

        roundQuestionIndex++;
        currentIndex++;
        updateHeader();

        if (currentIndex >= ROUND_SIZE) {
            endRound();
        } else {
            renderQuizQuestion();
        }
    }, 450);
}

// ---------------- MATCH mode (Round 2) ----------------
function showMatch() {
    if (quizPanelEl && matchPanelEl) {
        hide(quizPanelEl);
        show(matchPanelEl);
    }
}

function resetMatchUI() {
    if (matchLeftEl) matchLeftEl.innerHTML = "";
    if (matchRightEl) matchRightEl.innerHTML = "";
    if (matchHintEl) setText(matchHintEl, "");
}

function shortenClue(s) {
    // Medium-style helper: makes the left side feel more puzzle-like
    // without changing layout (just text shortening).
    const t = String(s || "").trim();
    if (!t) return "";
    // remove leading question words and punctuation
    return t
        .replace(/^(which|what|who|where|when|in which|the|a)\b\s*/i, "")
        .replace(/\?+$/g, "")
        .trim();
}

function startMatchTimer() {
    resetTimerBar();
    matchStart = safeNow();

    matchTimer = setInterval(() => {
        const elapsed = safeNow() - matchStart;
        renderTimerBar(elapsed);

        const secLeft = Math.ceil((MATCH_TIME_MS - elapsed) / 1000);
        if (secLeft <= 3 && secLeft >= 1) {
            if ((elapsed % 1000) < QUESTION_TICK_MS) playAudio(tickAudio);
        }

        if (elapsed >= MATCH_TIME_MS) {
            clearInterval(matchTimer);
            matchTimer = null;
            // treat timeout as a wrong strike
            setText(matchHintEl, "Time!");
            playAudio(badAudio);
            registerWrong();

            // advance round as failed/ended
            endRound();
        }
    }, QUESTION_TICK_MS);
}

function buildDecoyPoolFromRound(qs, correctAnswerSet) {
    const pool = [];

    qs.forEach((q) => {
        const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD]
            .map((v) => String(v || "").trim())
            .filter(Boolean);

        opts.forEach((v) => {
            if (!v) return;
            const n = normStr(v);
            if (!correctAnswerSet.has(n)) pool.push(v);
        });

        // also allow answers from other questions to be decoys
        const ans = String(q.Answer || "").trim();
        if (ans && !correctAnswerSet.has(normStr(ans))) pool.push(ans);
    });

    // unique
    const uniq = [];
    const seen = new Set();
    for (const v of pool) {
        const k = normStr(v);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        uniq.push(v);
    }
    return uniq;
}

function startMatchRound() {
    stopTimers();
    showMatch();
    resetMatchUI();

    // Round 2 should use Q13–Q24 (rows 12..23) exactly, in CSV order
    // because players (and you) are designing that block as a puzzle set.
    // roundQuestions already equals the 12 for this round.
    const pool12 = roundQuestions.slice(0, 12);

    // Choose 6 correct pairs (use first 6 for stability)
    const selected = pool12.slice(0, MATCH_PAIRS);

    const pairs = selected.map((q, i) => ({
        pairId: "p" + i,
        leftText: shortenClue(q.Question),
        rightText: String(q.Answer || "").trim(),
    }));

    const correctAnswerSet = new Set(pairs.map((p) => normStr(p.rightText)));

    // Build decoys from the full 12-question round (options + other answers)
    const decoyPool = buildDecoyPoolFromRound(pool12, correctAnswerSet);
    const decoys = shuffle(decoyPool).slice(0, MATCH_DECOYS);

    // Left tiles: 6 clues
    const leftTiles = shuffle(
        pairs.map((p) => ({
            text: p.leftText,
            pairId: p.pairId,
        }))
    );

    // Right tiles: 6 correct + decoys
    const rightTiles = shuffle([
        ...pairs.map((p) => ({
            text: p.rightText,
            pairId: p.pairId,
            isDecoy: false,
        })),
        ...decoys.map((d, i) => ({
            text: d,
            pairId: "decoy_" + i,
            isDecoy: true,
        })),
    ]);

    matchState = {
        leftTiles,
        rightTiles,
        solvedPairs: new Set(),
        selectedLeft: null,
        selectedRight: null,
        locked: false,
    };

    setText(questionEl, "Match the pairs");
    setText(matchHintEl, "Tap a clue, then tap an answer.");

    renderMatchGrid();
    startMatchTimer();

    // header
    updateHeader();
}

function renderMatchGrid() {
    if (!matchLeftEl || !matchRightEl || !matchState) return;

    matchLeftEl.innerHTML = "";
    matchRightEl.innerHTML = "";

    matchState.leftTiles.forEach((t) => {
        const b = document.createElement("button");
        b.className = "choice";
        b.textContent = t.text;
        b.dataset.side = "L";
        b.dataset.pairId = t.pairId;
        b.onclick = () => onMatchTap(b);
        matchLeftEl.appendChild(b);
    });

    matchState.rightTiles.forEach((t) => {
        const b = document.createElement("button");
        b.className = "choice";
        b.textContent = t.text;
        b.dataset.side = "R";
        b.dataset.pairId = t.pairId;
        b.dataset.decoy = t.isDecoy ? "1" : "0";
        b.onclick = () => onMatchTap(b);
        matchRightEl.appendChild(b);
    });
}

function clearMatchSelections() {
    if (!matchLeftEl || !matchRightEl) return;
    [...matchLeftEl.querySelectorAll("button"), ...matchRightEl.querySelectorAll("button")].forEach((b) => {
        b.classList.remove("selected");
    });
}

function markSelected(btn) {
    btn.classList.add("selected");
}

function addShake(btn) {
    if (!btn) return;
    btn.classList.remove("shake");
    void btn.offsetWidth;
    btn.classList.add("shake");
}

function addConnectionGlow(leftBtn, rightBtn) {
    // Tiny “connection” effect without layout change:
    // briefly add a class to both buttons.
    if (leftBtn) {
        leftBtn.classList.remove("connect");
        void leftBtn.offsetWidth;
        leftBtn.classList.add("connect");
    }
    if (rightBtn) {
        rightBtn.classList.remove("connect");
        void rightBtn.offsetWidth;
        rightBtn.classList.add("connect");
    }
}

function onMatchTap(btn) {
    if (!matchState || matchState.locked || btn.disabled) return;

    const side = btn.dataset.side;
    const pairId = btn.dataset.pairId;

    // prevent selecting already-solved left clues
    if (side === "L" && matchState.solvedPairs.has(pairId)) return;

    // mark selection
    if (side === "L") matchState.selectedLeft = pairId;
    else matchState.selectedRight = pairId;

    clearMatchSelections();
    markSelected(btn);

    // if both selected, resolve
    if (!matchState.selectedLeft || !matchState.selectedRight) return;

    matchState.locked = true;

    // find actual button elements for both sides
    const leftBtn = [...matchLeftEl.querySelectorAll("button")].find(
        (b) => b.dataset.pairId === matchState.selectedLeft
    );
    const rightBtn = [...matchRightEl.querySelectorAll("button")].find(
        (b) => b.dataset.pairId === matchState.selectedRight
    );

    const isCorrect = matchState.selectedLeft === matchState.selectedRight;

    if (isCorrect) {
        playAudio(goodAudio);
        addConnectionGlow(leftBtn, rightBtn);

        leftBtn.classList.add("correct");
        rightBtn.classList.add("correct");
        leftBtn.disabled = true;
        rightBtn.disabled = true;

        matchState.solvedPairs.add(matchState.selectedLeft);

        // Update progress within round (treat each solved pair as a "question" for dots)
        // We’ll fill dots from left to right.
        const solvedCount = matchState.solvedPairs.size;
        const dotIdx = clamp(solvedCount - 1, 0, ROUND_SIZE - 1);
        setDotState(dotIdx, "correct");
        registerCorrect();

        matchState.selectedLeft = null;
        matchState.selectedRight = null;
        matchState.locked = false;

        setText(matchHintEl, `Solved ${solvedCount}/${MATCH_PAIRS}`);

        updateHeader();

        if (matchState.solvedPairs.size >= MATCH_PAIRS) {
            stopTimers();
            setTimeout(() => endRound(), 400);
        }
        return;
    }

    // Wrong: decoy or mismatched
    playAudio(badAudio);

    if (leftBtn) leftBtn.classList.add("wrong");
    if (rightBtn) rightBtn.classList.add("wrong");
    if (leftBtn) addShake(leftBtn);
    if (rightBtn) addShake(rightBtn);

    registerWrong();

    // mark a wrong dot for feedback (use currentIndex pointer)
    setDotState(clamp(currentIndex, 0, ROUND_SIZE - 1), "wrong");
    currentIndex++;
    updateHeader();

    setTimeout(() => {
        if (leftBtn) leftBtn.classList.remove("wrong", "selected");
        if (rightBtn) rightBtn.classList.remove("wrong", "selected");
        matchState.selectedLeft = null;
        matchState.selectedRight = null;
        matchState.locked = false;

        if (!playing) return;
        if (wrongTotal >= 3) return; // endGame already called
    }, 260);
}

// ---------------- Buttons ----------------
function onStart() {
    if (!questions.length) return;

    if (!playing) {
        playing = true;
        updateHeader();

        showCountdown(() => {
            beginRound();
        });
    }
}

function onShuffle() {
    // Shuffle only within the CURRENT round and CURRENT mode
    if (!playing) return;

    const mode = ROUND_MODES[roundIndex] || "quiz";
    if (mode === "match") {
        // reshuffle tile layout, keep pairs/decoys
        if (matchState) {
            matchState.leftTiles = shuffle(matchState.leftTiles);
            matchState.rightTiles = shuffle(matchState.rightTiles);
            renderMatchGrid();
        }
        return;
    }

    // quiz mode shuffle answer choices only for this question (no order changes to questions)
    const q = roundQuestions[roundQuestionIndex];
    if (!q) return;

    const opts = resolveOptions(q);
    const shuffled = shuffle(opts);

    for (let i = 0; i < optionEls.length; i++) {
        const btn = optionEls[i];
        if (!btn) continue;
        btn.textContent = shuffled[i] || "";
    }
}

function onShare() {
    // Keep it simple; uses whatever share logic you already had in HTML/CSS
    const text = `Brain ⚡ Bolt — Score ${score} — Round ${roundIndex + 1}/${TOTAL_ROUNDS}`;
    if (navigator.share) {
        navigator.share({ text }).catch(() => { });
    } else {
        navigator.clipboard?.writeText(text).catch(() => { });
        setText(statusEl, "Copied ✅");
        setTimeout(() => setText(statusEl, playing ? "Playing" : "Ready"), 900);
    }
}

function onToggleSound() {
    soundOn = !soundOn;
    if (soundBtn) soundBtn.classList.toggle("off", !soundOn);
}

// ---------------- Boot ----------------
(async function boot() {
    initAudio();

    try {
        await loadQuestions();

        // wire buttons
        if (startBtn) startBtn.onclick = onStart;
        if (shuffleBtn) shuffleBtn.onclick = onShuffle;
        if (shareBtn) shareBtn.onclick = onShare;
        if (soundBtn) soundBtn.onclick = onToggleSound;

        resetGame();

        // ✅ Always dismiss splash once loaded
        setTimeout(hideSplashSoon, 250);
    } catch (e) {
        console.error(e);
        setText(splashStatusEl, "Could not load today’s set.");
        // if something fails, keep splash visible so you can see the error
    }
})();
