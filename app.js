/* ===== Brain ⚡ Bolt — App.js (FULL FILE) =====
   Base: your attached app.js
   Safe injections only:
   1) Preserve CSV order (remove shuffle of questions)
   2) MATCH Round 2: add decoy answers (6 correct + 6 decoys)
*/

const CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = 3;

// Round modes (Round 2 is MATCH)
const ROUND_MODES = ["quiz", "match", "quiz"];

// Match mode tuning
const MATCH_PAIRS = 6;
const MATCH_DECOYS = 6; // add 6 decoy answer tiles (high challenge)
const MATCH_TIME_MS = 45000;

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
let questions = [];
let currentIndex = 0;
let score = 0;
let wrongTotal = 0;
let correctSinceLastWrong = 0;

let elapsed = 0;
let elapsedInterval = null;

let qTimer = null;
let qStart = 0;
let qLastTickSec = 3;

let soundOn = true;

let roundIndex = 0;
let roundStartIndex = 0;
let roundQuestionIndex = 0;

// Match state
let matchState = null;

// ---------------- Helpers ----------------
function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function asText(v) {
    return v == null ? "" : String(v);
}

function norm(v) {
    return asText(v).trim().toLowerCase().replace(/\s+/g, " ");
}

function setText(el, txt) {
    if (el) el.textContent = txt;
}

function show(el) {
    if (el) el.style.display = "";
}

function hide(el) {
    if (el) el.style.display = "none";
}

function killStartSplash() {
    if (!splashEl) return;
    splashEl.classList.add("hide");
    setTimeout(() => (splashEl.style.display = "none"), 300);
}

function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
}

// ---------------- Audio ----------------
let tickAudio, goodAudio, badAudio;

function initAudio() {
    try {
        tickAudio = new Audio("tick.mp3");
        goodAudio = new Audio("good.mp3");
        badAudio = new Audio("bad.mp3");
    } catch (e) {
        // ignore
    }
}

function play(a) {
    if (!soundOn || !a) return;
    try {
        a.currentTime = 0;
        a.play();
    } catch (e) {
        // ignore autoplay / missing file errors
    }
}

// ---------------- CSV load ----------------
function loadCSV() {
    return new Promise((resolve, reject) => {
        if (!window.Papa) return reject(new Error("PapaParse missing"));

        Papa.parse(CSV_URL + "&_ts=" + Date.now(), {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (res) => resolve(res.data || []),
            error: reject,
        });
    });
}

function mapRowToQuestion(r) {
    // Supports both “OptionA/OptionB…” and fallback keys
    return {
        Date: asText(r.Date),
        Question: asText(r.Question),
        OptionA: asText(r.OptionA),
        OptionB: asText(r.OptionB),
        OptionC: asText(r.OptionC),
        OptionD: asText(r.OptionD),
        Answer: asText(r.Answer),
        Explanation: asText(r.Explanation),
        Category: asText(r.Category),
        Difficulty: asText(r.Difficulty),
        ID: asText(r.ID),
        LastUsed: asText(r.LastUsed),
        DayNumber: asText(r.DayNumber),
    };
}

async function loadQuestions() {
    setText(splashStatusEl, "Loading today’s set…");

    const rows = await loadCSV();
    const mapped = rows.map(mapRowToQuestion);

    // keep rows with basics
    const safe = mapped.filter((q) => q.Question && q.Answer);

    // ✅ IMPORTANT FIX: preserve CSV order (NO shuffle)
    // This ensures Round 2 (Q13–Q24) matches the row order you designed in the Live sheet.
    questions = safe.slice(0, TOTAL_QUESTIONS);

    if (!questions.length) throw new Error("No questions loaded");
}

// ---------------- UI pills / dots / timer ----------------
function updateTopPills() {
    if (statusEl) setText(statusEl, "Ready");
    if (scoreEl) setText(scoreEl, `Score ${score}`);
    if (qIndexEl) {
        const qWithinRound = (currentIndex - roundStartIndex) + 1;
        setText(
            qIndexEl,
            `Round ${roundIndex + 1}/${TOTAL_ROUNDS} • Q ${qWithinRound}/${ROUND_SIZE}`
        );
    }
}

function renderDots() {
    if (!dotsEl) return;
    const total = ROUND_SIZE;
    const currentWithinRound = currentIndex - roundStartIndex; // 0-based
    const solvedInMatch = matchState?.solved?.size ?? 0;

    dotsEl.innerHTML = "";

    for (let i = 0; i < total; i++) {
        const d = document.createElement("div");
        d.className = "dot";

        if (ROUND_MODES[roundIndex] === "match") {
            // In match, show progress as solved pairs out of 6 inside round.
            if (i < solvedInMatch) d.classList.add("correct");
        } else {
            // quiz: show answered up to currentWithinRound-1
            if (i < currentWithinRound) d.classList.add("answered");
        }

        dotsEl.appendChild(d);
    }
}

function resetQuestionTimerUI() {
    if (!timerBarFillEl) return;
    timerBarFillEl.style.width = "100%";
}

function startQuestionTimer(onExpire) {
    stopQuestionTimer();
    qStart = Date.now();
    qLastTickSec = 3;

    const tick = () => {
        const elapsedMs = Date.now() - qStart;
        const remaining = clamp(1 - elapsedMs / QUESTION_TIME_MS, 0, 1);
        if (timerBarFillEl) timerBarFillEl.style.width = `${remaining * 100}%`;

        const secLeft = Math.ceil((QUESTION_TIME_MS - elapsedMs) / 1000);
        if (secLeft > 0 && secLeft <= 3 && secLeft !== qLastTickSec) {
            qLastTickSec = secLeft;
            play(tickAudio);
        }

        if (elapsedMs >= QUESTION_TIME_MS) {
            stopQuestionTimer();
            onExpire?.();
        }
    };

    qTimer = setInterval(tick, QUESTION_TICK_MS);
}

function stopQuestionTimer() {
    if (qTimer) clearInterval(qTimer);
    qTimer = null;
}

function startElapsedTimer() {
    if (elapsedInterval) clearInterval(elapsedInterval);
    elapsed = 0;
    elapsedInterval = setInterval(() => {
        elapsed++;
        // optional
    }, 1000);
}

function stopElapsedTimer() {
    if (elapsedInterval) clearInterval(elapsedInterval);
    elapsedInterval = null;
}

// ---------------- Game flow ----------------
function resetGame() {
    currentIndex = 0;
    score = 0;
    wrongTotal = 0;
    correctSinceLastWrong = 0;

    roundIndex = 0;
    roundStartIndex = 0;
    roundQuestionIndex = 0;

    matchState = null;

    show(quizPanelEl);
    hide(matchPanelEl);

    resetQuestionTimerUI();
    updateTopPills();
    renderDots();

    if (questionEl) setText(questionEl, "Press Start to Play");
}

function getRoundQuestions() {
    const start = roundIndex * ROUND_SIZE;
    const end = start + ROUND_SIZE;
    return questions.slice(start, end);
}

function beginRound() {
    roundStartIndex = roundIndex * ROUND_SIZE;
    currentIndex = roundStartIndex;

    updateTopPills();
    renderDots();

    const mode = ROUND_MODES[roundIndex];
    if (mode === "match") {
        startMatchRound();
    } else {
        showQuiz();
        renderQuizQuestion();
    }
}

function endRound() {
    roundIndex++;
    if (roundIndex >= TOTAL_ROUNDS) {
        endGame("Daily set complete ✅");
        return;
    }
    beginRound();
}

function endGame(msg) {
    stopQuestionTimer();
    stopElapsedTimer();

    if (questionEl) setText(questionEl, msg || "Done ✅");
    hide(matchPanelEl);
    show(quizPanelEl);

    // disable answer buttons
    optionEls.forEach((b) => {
        if (!b) return;
        b.disabled = true;
        b.classList.remove("correct", "wrong", "selected");
    });
}

// ---------------- Quiz mode ----------------
function showQuiz() {
    show(quizPanelEl);
    hide(matchPanelEl);
}

function setOptionsDisabled(disabled) {
    optionEls.forEach((b) => b && (b.disabled = disabled));
}

function clearOptionStates() {
    optionEls.forEach((b) => {
        if (!b) return;
        b.classList.remove("correct", "wrong", "selected");
    });
}

function renderQuizQuestion() {
    matchState = null;
    showQuiz();

    const q = questions[currentIndex];
    if (!q) return endGame("No question found");

    setOptionsDisabled(false);
    clearOptionStates();
    resetQuestionTimerUI();

    setText(questionEl, q.Question);

    const opts = [q.OptionA, q.OptionB, q.OptionC, q.OptionD].map((x) => asText(x).trim());
    // fallback: if options are missing, generate simple set
    const clean = opts.filter(Boolean);
    while (clean.length < 4) clean.push("");

    optionEls.forEach((btn, i) => {
        if (!btn) return;
        btn.textContent = clean[i] || "";
        btn.dataset.value = clean[i] || "";
        btn.disabled = !clean[i];
    });

    updateTopPills();
    renderDots();

    startQuestionTimer(() => {
        registerWrong();
        nextQuestion();
    });
}

function registerCorrect() {
    score++;
    correctSinceLastWrong++;
    updateTopPills();
    renderDots();
    play(goodAudio);
}

function registerWrong() {
    wrongTotal++;
    correctSinceLastWrong = 0;
    updateTopPills();
    renderDots();
    play(badAudio);
}

function nextQuestion() {
    stopQuestionTimer();
    currentIndex++;

    const roundEnd = roundStartIndex + ROUND_SIZE;
    if (currentIndex >= roundEnd) return endRound();

    const mode = ROUND_MODES[roundIndex];
    if (mode === "match") {
        // in match, currentIndex used as "match progress" but we end round on solved pairs
        renderDots();
        return;
    }

    renderQuizQuestion();
}

// Answer click handlers
optionEls.forEach((btn) => {
    if (!btn) return;
    btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const q = questions[currentIndex];
        if (!q) return;

        stopQuestionTimer();

        const chosen = norm(btn.dataset.value);
        const correct = norm(q.Answer);

        clearOptionStates();
        btn.classList.add("selected");

        if (chosen && chosen === correct) {
            btn.classList.add("correct");
            registerCorrect();
        } else {
            btn.classList.add("wrong");
            // mark correct button
            const correctBtn = optionEls.find((b) => norm(b?.dataset.value) === correct);
            if (correctBtn) correctBtn.classList.add("correct");
            registerWrong();
        }

        setOptionsDisabled(true);

        // redemption rule (example): allow up to 3 wrong total
        if (wrongTotal >= 3) {
            return setTimeout(() => endGame("3 incorrect — game over!"), 450);
        }

        setTimeout(nextQuestion, 450);
    });
});

// ---------------- Match mode ----------------
function showMatch() {
    hide(quizPanelEl);
    show(matchPanelEl);
}

function makePairsFromRoundQuestions(roundQs) {
    // Use the 12 rows (Q13–Q24) IN ORDER (no shuffle here)
    // We'll take 6 pairs for the match puzzle.
    const pairs = roundQs.slice(0, MATCH_PAIRS).map((q, i) => {
        return {
            pairId: `p${i}`,
            left: asText(q.Question).trim(),
            right: asText(q.Answer).trim(),
        };
    });
    return pairs;
}

function startMatchRound() {
    resetQuestionTimerUI();
    showMatch();

    const roundQuestions = getRoundQuestions();

    // Build pairs from these 12
    const pool = roundQuestions.slice();

    const pairs = makePairsFromRoundQuestions(pool);

    // Build LEFT tiles (6 clues) and RIGHT tiles (6 answers + decoys)
    const leftTiles = shuffleArray(
        pairs.map((p) => ({ side: "L", pairId: p.pairId, text: p.left }))
    );

    // Decoy pool: pull plausible answers from other questions' options, excluding the 6 correct answers
    const correctSet = new Set(pairs.map((p) => norm(p.right)));
    const decoyPool = [];
    pool.forEach((q) => {
        ["OptionA", "OptionB", "OptionC", "OptionD"].forEach((k) => {
            const v = asText(q[k]).trim();
            if (!v) return;
            if (correctSet.has(norm(v))) return;
            decoyPool.push(v);
        });
    });
    const uniqueDecoys = Array.from(new Set(decoyPool));
    const decoys = shuffleArray(uniqueDecoys).slice(0, MATCH_DECOYS);

    const rightTiles = shuffleArray([
        ...pairs.map((p) => ({ side: "R", pairId: p.pairId, text: p.right, isDecoy: false })),
        ...decoys.map((d, i) => ({ side: "R", pairId: `decoy_${i}`, text: d, isDecoy: true })),
    ]);

    matchState = {
        pairs,
        leftTiles,
        rightTiles,
        solved: new Set(),
        selectedLeft: null,
        selectedRight: null,
        locked: false,
    };

    setText(questionEl, "Match the pairs");
    updateTopPills();
    renderDots();

    renderMatchGrid();

    // Match timer: treat as “question timer” bar for the round
    startMatchTimer(MATCH_TIME_MS, onMatchTimeout);
}

function startMatchTimer(ms, onExpire) {
    stopQuestionTimer();
    qStart = Date.now();

    const tick = () => {
        const elapsedMs = Date.now() - qStart;
        const remaining = clamp(1 - elapsedMs / ms, 0, 1);
        if (timerBarFillEl) timerBarFillEl.style.width = `${remaining * 100}%`;
        if (elapsedMs >= ms) {
            stopQuestionTimer();
            onExpire?.();
        }
    };

    qTimer = setInterval(tick, QUESTION_TICK_MS);
}

function onMatchTimeout() {
    registerWrong();
    // treat timeout as one “wrong”
    if (wrongTotal >= 3) return endGame("3 incorrect — game over!");
    endRound();
}

function renderMatchGrid() {
    if (!matchLeftEl || !matchRightEl) return;

    matchLeftEl.innerHTML = "";
    matchRightEl.innerHTML = "";

    matchState.leftTiles.forEach((t) => {
        const b = document.createElement("button");
        b.className = "choice";
        b.textContent = t.text;
        b.dataset.side = "L";
        b.dataset.pairId = t.pairId;
        b.addEventListener("click", () => onMatchTap(b));
        matchLeftEl.appendChild(b);
    });

    matchState.rightTiles.forEach((t) => {
        const b = document.createElement("button");
        b.className = "choice";
        b.textContent = t.text;
        b.dataset.side = "R";
        b.dataset.pairId = t.pairId;
        b.addEventListener("click", () => onMatchTap(b));
        matchRightEl.appendChild(b);
    });

    syncMatchSelectionStyles();
}

function syncMatchSelectionStyles() {
    const all = [
        ...matchLeftEl.querySelectorAll("button.choice"),
        ...matchRightEl.querySelectorAll("button.choice"),
    ];
    all.forEach((b) => {
        b.classList.toggle("selected", false);
        const side = b.dataset.side;
        const pid = b.dataset.pairId;
        if (side === "L" && matchState.selectedLeft === pid) b.classList.add("selected");
        if (side === "R" && matchState.selectedRight === pid) b.classList.add("selected");
    });
}

function shakeEl(el) {
    if (!el) return;
    el.classList.remove("shake");
    // reflow
    void el.offsetWidth;
    el.classList.add("shake");
}

function pulseGlow(el) {
    if (!el) return;
    el.classList.remove("pulse");
    void el.offsetWidth;
    el.classList.add("pulse");
}

function flashConnectionLine(leftBtn, rightBtn) {
    // keep as-is; your existing CSS handles line/glow if present
    // (no layout changes)
}

function onMatchTap(btn) {
    if (!matchState || matchState.locked || btn.disabled) return;

    const side = btn.dataset.side;
    const pid = btn.dataset.pairId;

    if (side === "L") matchState.selectedLeft = pid;
    else matchState.selectedRight = pid;

    syncMatchSelectionStyles();

    if (!matchState.selectedLeft || !matchState.selectedRight) return;

    matchState.locked = true;

    const isCorrect = matchState.selectedLeft === matchState.selectedRight;

    const all = [
        ...matchLeftEl.querySelectorAll("button.choice"),
        ...matchRightEl.querySelectorAll("button.choice"),
    ];

    const leftBtn = all.find(
        (b) => b.dataset.side === "L" && b.dataset.pairId === matchState.selectedLeft
    );
    const rightBtn = all.find(
        (b) => b.dataset.side === "R" && b.dataset.pairId === matchState.selectedRight
    );

    if (isCorrect) {
        // ✅ correct pair
        flashConnectionLine(leftBtn, rightBtn);
        pulseGlow(leftBtn);
        pulseGlow(rightBtn);

        leftBtn.disabled = true;
        rightBtn.disabled = true;

        matchState.solved.add(pid);

        registerCorrect();

        matchState.selectedLeft = null;
        matchState.selectedRight = null;
        matchState.locked = false;

        updateTopPills();
        renderDots();

        if (matchState.solved.size >= MATCH_PAIRS) {
            stopQuestionTimer();
            return endRound();
        }
        return;
    }

    // ❌ wrong (includes decoys)
    shakeEl(leftBtn);
    shakeEl(rightBtn);

    registerWrong();

    matchState.selectedLeft = null;
    matchState.selectedRight = null;
    matchState.locked = false;

    updateTopPills();
    renderDots();

    if (wrongTotal >= 3) return endGame("3 incorrect — game over!");
}

// ---------------- Buttons / boot ----------------
if (soundBtn) {
    soundBtn.addEventListener("click", () => {
        soundOn = !soundOn;
        soundBtn.classList.toggle("off", !soundOn);
    });
}

if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
        // shuffle within today’s 36 ONLY if user explicitly asks (manual control)
        questions = shuffleArray(questions.slice());
        resetGame();
    });
}

if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
        const txt = `Brain ⚡ Bolt — Score ${score} — Round ${roundIndex + 1}/${TOTAL_ROUNDS}`;
        try {
            await navigator.share({ text: txt, url: location.href });
        } catch (e) {
            // ignore
        }
    });
}

if (startBtn) {
    startBtn.addEventListener("click", () => {
        // countdown UI is handled by your existing code if present
        // just begin if not started
        beginRound();
    });
}

// ---------------- Boot ----------------
(async function boot() {
    initAudio();

    try {
        await loadQuestions();
        resetGame();
        setTimeout(killStartSplash, 350);
    } catch (e) {
        console.error(e);
        setText(splashStatusEl, "Could not load today’s set.");
    }
})();
