// ===== Brain ⚡ Bolt — App.js v3.14.1 (premium MATCH FX pass) =====
const CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6725qpD0gRYajBJaOjxcSpTFxJtS2fBzrT1XAjp9t5SHnBJCrLFuHY4C51HFV0A4MK-4c6t7jTKGG/pub?gid=1410250735&single=true&output=csv";

const QUESTION_TIME_MS = 10000;
const QUESTION_TICK_MS = 100;

// 36-per-day support
const TOTAL_QUESTIONS = 36;
const ROUND_SIZE = 12;
const TOTAL_ROUNDS = Math.ceil(TOTAL_QUESTIONS / ROUND_SIZE);

// Match mode (Round 2)
const MATCH_PAIRS = 6; // from 12 questions
const MATCH_TIME_MS = 45000; // 45s for the whole match round (tunable)

// ---------------- State ----------------
let questions = [];
let roundQuestions = [];
let currentIndex = 0; // used for streak indexing + redemption logic
let roundIndex = 0;
let score = 0;
let wrongTotal = 0;
let correctSinceLastWrong = 0;

let elapsed = 0;
let elapsedInterval = null;

let qTimer = null;
let qRemaining = QUESTION_TIME_MS;
let qLastTickSec = 3;

let soundOn = true;
let successAutoNav = null;

// Match mode state
let matchState = null;

// ---------------- Elements ----------------
const startBtn = document.getElementById("startBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const shareBtn = document.getElementById("shareBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

const qBox = document.getElementById("questionBox");
const choicesDiv = document.getElementById("choices");

const pillScore = document.getElementById("pillScore");
const progressLabel = document.getElementById("progressLabel");
const elapsedTimeEl = document.getElementById("elapsedTime");
const timerBar = document.getElementById("timerBar"); // overall timer

const countdownOverlay = document.getElementById("countdownOverlay");
const countNum = document.getElementById("countNum");

const successSplash = document.getElementById("successSplash");
const gameOverBox = document.getElementById("gameOverBox");
const gameOverText = document.getElementById("gameOverText");

const soundBtn = document.getElementById("soundBtn");
const setLabel = document.getElementById("setLabel");

// Streak container
const streakBar = document.getElementById("streakBar");

// qTimerBar injected
let qTimerBar = document.getElementById("qTimerBar");

// Guard: non-quiz pages
if (!qBox || !choicesDiv) {
    soundBtn?.addEventListener("click", () => {
        soundOn = !soundOn;
        if (soundBtn) soundBtn.textContent = soundOn ? "🔊" : "🔇";
    });
} else {
    // ---------------- Helpers ----------------
    const setText = (el, txt) => {
        if (el) el.textContent = txt;
    };
    const setStyle = (el, p, v) => {
        if (el && el.style) el.style[p] = v;
    };
    const show = (el, on = true) => {
        if (el) el.style.display = on ? "" : "none";
    };
    const addCls = (el, c) => {
        if (el) el.classList.add(c);
    };
    const remCls = (el, c) => {
        if (el) el.classList.remove(c);
    };

    function showCountdown(on) {
        if (!countdownOverlay) return;
        countdownOverlay.hidden = !on;
        if (on) addCls(countdownOverlay, "show");
        else remCls(countdownOverlay, "show");
    }

    function getModeForRound(rIdx) {
        // Round 2 = match mode; others trivia
        return rIdx === 1 ? "match" : "trivia";
    }

    function modeLabel() {
        return getModeForRound(roundIndex) === "match" ? "MATCH ⚡" : "TRIVIA";
    }

    // ✅ Inject circular countdown wrapper if missing
    function ensureCountdownCircle() {
        if (!countdownOverlay || !countNum) return;
        const existingDot = countdownOverlay.querySelector(".countdown-dot");
        if (existingDot) return;

        const dot = document.createElement("div");
        dot.className = "countdown-dot";

        // move countNum inside dot
        const parent = countNum.parentElement;
        dot.appendChild(countNum);
        if (parent) parent.appendChild(dot);
        else countdownOverlay.appendChild(dot);
    }

    // ✅ Inject 10-second per-question timer bar if missing
    function ensureQuestionTimerBar() {
        if (qTimerBar) return;

        const overallWrapper = document.querySelector(".timer-wrapper");
        if (!overallWrapper) return;

        const wrap = document.createElement("div");
        wrap.className = "qtimer-wrapper";

        const bar = document.createElement("div");
        bar.id = "qTimerBar";
        bar.className = "qtimer-bar";

        wrap.appendChild(bar);
        overallWrapper.insertAdjacentElement("afterend", wrap);

        qTimerBar = bar;
        setStyle(qTimerBar, "width", "100%");
    }

    function asText(v) {
        return String(v ?? "").trim();
    }
    function norm(v) {
        return asText(v).toLowerCase();
    }
    function formatTime(s) {
        const m = Math.floor(s / 60);
        const x = s % 60;
        return `${m}:${x < 10 ? "0" : ""}${x}`;
    }
    function shuffleArray(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ---------------- Splash (auto-dismiss) ----------------
    function killStartSplash() {
        const s = document.getElementById("startSplash");
        if (!s || s.dataset.dismissed === "1") return;
        s.dataset.dismissed = "1";
        addCls(s, "hiding");
        setTimeout(() => s.remove(), 420);
    }
    document.addEventListener("DOMContentLoaded", () => {
        ensureCountdownCircle();
        ensureQuestionTimerBar();
        showCountdown(false);
        setTimeout(killStartSplash, 900);
    });
    window.addEventListener("load", () => setTimeout(killStartSplash, 900));
    setTimeout(killStartSplash, 4000);

    // ---------------- Audio ----------------
    function beep(f = 600, d = 0.25) {
        if (!soundOn) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = "sine";
            o.frequency.value = f;
            o.connect(g);
            g.connect(ctx.destination);
            g.gain.value = 0.25;
            const t = ctx.currentTime;
            o.start(t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            o.stop(t + d + 0.02);
        } catch { }
    }
    const beepTick = () => beep(620, 0.22);
    const beepGo = () => beep(950, 0.28);
    const sfxCorrect = () => beep(1020, 0.18);
    const sfxIncorrect = () => beep(220, 0.2);
    const tickSoft = () => beep(740, 0.08);

    function vibrate(ms = 100) {
        if (navigator.vibrate) navigator.vibrate(ms);
    }

    // ---------------- CSV ----------------
    function fetchCSV() {
        return new Promise((resolve, reject) => {
            Papa.parse(CSV_URL, {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: (r) => resolve(r.data || []),
                error: (e) => reject(e),
            });
        });
    }

    function resolveCorrectText(q) {
        if (!q) return "";
        const Q = (k) => q[k] ?? q[k?.toLowerCase?.()] ?? q[k?.toUpperCase?.()];
        const ans = norm(Q("Answer"));
        const M = { a: "OptionA", b: "OptionB", c: "OptionC", d: "OptionD" };
        if (["a", "b", "c", "d"].includes(ans)) return Q(M[ans]) ?? "";
        if (["optiona", "optionb", "optionc", "optiond"].includes(ans)) {
            const k = "Option" + ans.slice(-1).toUpperCase();
            return Q(k) ?? "";
        }
        return Q("Answer") ?? "";
    }

    function isValidRow(row) {
        if (!row) return false;
        const get = (k) => row[k] ?? row[k?.toLowerCase?.()] ?? row[k?.toUpperCase?.()];
        const hasQ = !!norm(get("Question"));
        const opts = ["OptionA", "OptionB", "OptionC", "OptionD"].map(get).filter(Boolean);
        return hasQ && opts.length >= 2;
    }

    // ---------------- Streak ----------------
    function buildStreakBar() {
        if (!streakBar) return;
        streakBar.classList.add("streak-vis");
        streakBar.innerHTML = "";
        for (let i = 0; i < ROUND_SIZE; i++) {
            const d = document.createElement("div");
            d.className = "streak-dot";
            d.dataset.index = String(i);
            streakBar.appendChild(d);
        }
    }

    function markStreak(i, ok) {
        const d = streakBar?.querySelector(`.streak-dot[data-index="${i}"]`);
        if (!d) return;
        d.classList.remove("is-correct", "is-wrong");
        d.classList.add(ok ? "is-correct" : "is-wrong");
    }

    function redeemOneWrongDot() {
        if (!streakBar) return;
        const wrongs = [...streakBar.querySelectorAll(".streak-dot.is-wrong")];
        if (!wrongs.length) return;
        const target =
            wrongs
                .slice()
                .reverse()
                .find((d) => Number(d.dataset.index) < currentIndex) || wrongs[0];

        target.classList.add("redeem");
        setTimeout(() => {
            target.classList.remove("is-wrong", "redeem");
        }, 900);
    }

    // ---------------- Timers ----------------
    function startModeTimer(durationMs, onTimeout) {
        ensureQuestionTimerBar();
        stopQuestionTimer();

        qRemaining = durationMs;
        qLastTickSec = 3;

        qTimerBar?.classList.remove("warn");
        setStyle(qTimerBar, "width", "100%");

        qTimer = setInterval(() => {
            qRemaining -= QUESTION_TICK_MS;

            const pct = Math.max(0, qRemaining / durationMs) * 100;
            setStyle(qTimerBar, "width", pct + "%");

            const secsLeft = Math.ceil(qRemaining / 1000);
            if (qRemaining <= 3000) {
                qTimerBar?.classList.add("warn");
                if (secsLeft > 0 && secsLeft < qLastTickSec + 1) {
                    tickSoft();
                    qLastTickSec = secsLeft;
                }
            }

            if (qRemaining <= 0) {
                stopQuestionTimer();
                onTimeout?.();
            }
        }, QUESTION_TICK_MS);
    }

    function startQuestionTimer(onTimeout) {
        startModeTimer(QUESTION_TIME_MS, onTimeout);
    }

    function stopQuestionTimer() {
        if (qTimer) {
            clearInterval(qTimer);
            qTimer = null;
        }
    }

    function resetQuestionTimerUI() {
        ensureQuestionTimerBar();
        qTimerBar?.classList.remove("warn");
        setStyle(qTimerBar, "width", "100%");
    }

    // ---------------- Labels ----------------
    function setProgressLabel() {
        const r = Math.min(roundIndex + 1, TOTAL_ROUNDS);

        if (getModeForRound(roundIndex) === "match") {
            const done = Math.min(currentIndex, MATCH_PAIRS);
            setText(progressLabel, `Round ${r}/${TOTAL_ROUNDS} • Match ${done}/${MATCH_PAIRS}`);
            return;
        }

        const q = Math.min(currentIndex + 1, ROUND_SIZE);
        setText(progressLabel, `Round ${r}/${TOTAL_ROUNDS} • Q ${q}/${ROUND_SIZE}`);
    }

    function resetTopBar() {
        setText(pillScore, `Score ${score}`);
        setText(setLabel, "Ready");
        setText(progressLabel, `Round 1/${TOTAL_ROUNDS} • Q 0/${ROUND_SIZE}`);
    }

    // ---------------- MATCH FX (safe, no layout changes) ----------------
    let __matchFxInjected = false;

    function ensureMatchFxStyles() {
        if (__matchFxInjected) return;
        __matchFxInjected = true;

        const style = document.createElement("style");
        style.setAttribute("data-match-fx", "1");
        style.textContent = `
      @keyframes bbMatchShake {
        0% { transform: translateX(0); }
        20% { transform: translateX(-3px); }
        40% { transform: translateX(3px); }
        60% { transform: translateX(-2px); }
        80% { transform: translateX(2px); }
        100% { transform: translateX(0); }
      }
    `;
        document.head.appendChild(style);
    }

    function shakeEl(el) {
        if (!el) return;
        ensureMatchFxStyles();

        // Don’t clobber existing WAAPI animations; use classless inline animation
        el.style.animation = "none";
        // force reflow
        void el.offsetWidth;
        el.style.animation = "bbMatchShake 220ms ease-out";
        setTimeout(() => {
            el.style.animation = "";
        }, 260);
    }

    function pulseGlow(el) {
        if (!el?.animate) return;
        // A tiny premium "lock" pulse
        el.animate(
            [
                { transform: "scale(1)", boxShadow: "0 0 0 rgba(41,255,161,0)", filter: "none" },
                { transform: "scale(1.02)", boxShadow: "0 0 16px rgba(41,255,161,.35)", filter: "brightness(1.05)" },
                { transform: "scale(1)", boxShadow: "0 0 0 rgba(41,255,161,0)", filter: "none" },
            ],
            { duration: 260, easing: "cubic-bezier(.2,.9,.2,1)", fill: "both" }
        );
    }

    // Draw a tiny “connection” glow line between two buttons (temporary overlay)
    function flashConnectionLine(leftBtn, rightBtn) {
        if (!leftBtn || !rightBtn) return;
        if (!matchState?.wrapEl) return;

        const wrap = matchState.wrapEl;
        const wrapRect = wrap.getBoundingClientRect();
        const a = leftBtn.getBoundingClientRect();
        const b = rightBtn.getBoundingClientRect();

        // Points: center-right of left tile -> center-left of right tile
        const x1 = (a.right - wrapRect.left);
        const y1 = (a.top - wrapRect.top) + a.height / 2;
        const x2 = (b.left - wrapRect.left);
        const y2 = (b.top - wrapRect.top) + b.height / 2;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.max(0, Math.sqrt(dx * dx + dy * dy));
        const ang = Math.atan2(dy, dx) * (180 / Math.PI);

        const line = document.createElement("div");
        line.style.position = "absolute";
        line.style.left = `${x1}px`;
        line.style.top = `${y1}px`;
        line.style.width = `${len}px`;
        line.style.height = "3px";
        line.style.transformOrigin = "0 50%";
        line.style.transform = `rotate(${ang}deg) translateZ(0)`;
        line.style.borderRadius = "99px";
        line.style.pointerEvents = "none";
        line.style.zIndex = "5";
        line.style.background =
            "linear-gradient(90deg, rgba(41,255,161,0), rgba(41,255,161,.95), rgba(255,255,255,.85), rgba(41,255,161,.95), rgba(41,255,161,0))";
        line.style.filter = "blur(0.2px)";
        line.style.opacity = "0";

        wrap.appendChild(line);

        if (line.animate) {
            line.animate(
                [
                    { opacity: 0, transform: `rotate(${ang}deg) scaleX(.92)` },
                    { opacity: 1, transform: `rotate(${ang}deg) scaleX(1)` },
                    { opacity: 0, transform: `rotate(${ang}deg) scaleX(1.02)` },
                ],
                { duration: 320, easing: "ease-out", fill: "both" }
            );
        } else {
            line.style.opacity = "1";
        }

        setTimeout(() => line.remove(), 360);
    }

    // ---------------- Game flow ----------------
    async function startGame() {
        clearTimeout(successAutoNav);

        try {
            ensureCountdownCircle();
            ensureQuestionTimerBar();
            resetQuestionTimerUI();

            successSplash?.classList.remove("show");
            show(gameOverBox, false);
            show(playAgainBtn, false);
            playAgainBtn?.classList.remove("pulse");

            setText(setLabel, "Loading…");
            setText(qBox, "Loading today’s set…");
            if (choicesDiv) choicesDiv.innerHTML = "";

            const data = await fetchCSV();
            const safe = data.filter(isValidRow);
            if (!safe.length) throw new Error("No valid questions in LIVE feed.");

            questions = shuffleArray(safe.slice()).slice(0, TOTAL_QUESTIONS);

            score = 0;
            elapsed = 0;
            roundIndex = 0;

            beginRound(0, { doCountdown: true });
        } catch (e) {
            console.error(e);
            setText(setLabel, "Error");
            setText(qBox, "Could not load today’s quiz. Please try again later.");
        }
    }

    function beginRound(rIndex, { doCountdown } = { doCountdown: false }) {
        roundIndex = rIndex;

        const start = roundIndex * ROUND_SIZE;
        const end = start + ROUND_SIZE;
        roundQuestions = questions.slice(start, end);

        currentIndex = 0;
        wrongTotal = 0;
        correctSinceLastWrong = 0;

        matchState = null;

        buildStreakBar();
        setText(pillScore, `Score ${score}`);
        setText(setLabel, "Ready");
        setText(qBox, "Press Start to Play");
        if (choicesDiv) choicesDiv.innerHTML = "";
        setProgressLabel();

        // Start overall timer only once at first round
        if (roundIndex === 0) {
            elapsed = 0;
            setText(elapsedTimeEl, "0:00");
            setStyle(timerBar, "width", "0%");
            clearInterval(elapsedInterval);
            elapsedInterval = setInterval(() => {
                elapsed++;
                setText(elapsedTimeEl, formatTime(elapsed));
                setStyle(timerBar, "width", Math.min(100, (elapsed / 300) * 100) + "%");
            }, 1000);
        }

        resetQuestionTimerUI();

        if (doCountdown) {
            runCountdown(() => {
                setText(setLabel, `Round ${roundIndex + 1} start`);
                startRoundPlay();
            });
        } else {
            startRoundPlay();
        }
    }

    function startRoundPlay() {
        if (getModeForRound(roundIndex) === "match") return startMatchRound();
        return showQuestion();
    }

    function runCountdown(onDone) {
        ensureCountdownCircle();
        showCountdown(true);

        let n = 3;
        setText(countNum, n);
        countNum.style.animation = "none";
        void countNum.offsetWidth;
        countNum.style.animation = "popIn .4s ease";
        beepTick();

        const int = setInterval(() => {
            n--;
            if (n > 0) {
                setText(countNum, n);
                countNum.style.animation = "none";
                void countNum.offsetWidth;
                countNum.style.animation = "popIn .4s ease";
                beepTick();
            } else {
                clearInterval(int);
                setText(countNum, "GO");
                countNum.style.animation = "none";
                void countNum.offsetWidth;
                countNum.style.animation = "popIn .4s ease";
                beepGo();
                setTimeout(() => {
                    showCountdown(false);
                    onDone?.();
                }, 200);
            }
        }, 700);
    }

    // ---------------- TRIVIA ----------------
    function showQuestion() {
        resetQuestionTimerUI();

        if (!Array.isArray(roundQuestions) || currentIndex >= roundQuestions.length) return endRound();

        const q = roundQuestions[currentIndex];
        if (!q) {
            currentIndex++;
            return showQuestion();
        }

        const Q = (k) => q[k] ?? q[k?.toLowerCase?.()] ?? q[k?.toUpperCase?.()];
        const correctText = resolveCorrectText(q);

        setText(qBox, Q("Question") || "—");
        choicesDiv.innerHTML = "";

        let opts = [];
        ["OptionA", "OptionB", "OptionC", "OptionD"].forEach((k) => {
            const v = Q(k);
            if (!v) return;
            const ok = norm(v) === norm(correctText);
            opts.push({ text: String(v), isCorrect: ok });
        });

        if (!opts.some((o) => o.isCorrect) && opts.length > 0) opts[0].isCorrect = true;
        if (opts.length < 2) {
            currentIndex++;
            return showQuestion();
        }

        opts = shuffleArray(opts);
        opts.forEach((o) => {
            const b = document.createElement("button");
            b.textContent = o.text;
            b.onclick = () => handleAnswer(b, o.isCorrect);
            choicesDiv.appendChild(b);
        });

        setProgressLabel();
        setText(setLabel, `Round ${roundIndex + 1}/${TOTAL_ROUNDS} • ${modeLabel()}`);
        startQuestionTimer(() => handleTimeout());
    }

    function handleTimeout() {
        sfxIncorrect();
        vibrate(160);
        registerWrong();
        advanceOrEnd();
    }

    function handleAnswer(btn, isCorrect) {
        stopQuestionTimer();
        [...choicesDiv.querySelectorAll("button")].forEach((b) => (b.disabled = true));

        if (isCorrect) {
            btn.classList.add("correct");
            sfxCorrect();
            vibrate(60);
            score++;
            setText(pillScore, `Score ${score}`);
            registerCorrect();
        } else {
            btn.classList.add("incorrect");
            sfxIncorrect();
            vibrate(160);
            registerWrong();
        }

        setTimeout(() => advanceOrEnd(), 800);
    }

    function registerCorrect() {
        markStreak(currentIndex, true);
        correctSinceLastWrong++;
        if (correctSinceLastWrong >= 3 && wrongTotal > 0) {
            redeemOneWrongDot();
            wrongTotal--;
            correctSinceLastWrong = 0;
        }
    }

    function registerWrong() {
        markStreak(currentIndex, false);
        wrongTotal++;
        correctSinceLastWrong = 0;
    }

    function advanceOrEnd() {
        if (wrongTotal >= 3) return endGame("3 incorrect — game over!");
        currentIndex++;
        if (currentIndex >= ROUND_SIZE) endRound();
        else showQuestion();
    }

    // ---------------- MATCH MODE (Round 2) ----------------
    function makePairsFromRoundQuestions(qs12) {
        const pairs = [];
        const safe = (qs12 || []).filter(Boolean);

        for (let i = 0; i < safe.length; i++) {
            const q = safe[i];
            const questionText = asText(q?.Question ?? q?.question ?? q?.QUESTION);
            const answerText = asText(resolveCorrectText(q));
            if (!questionText || !answerText) continue;
            pairs.push({ pairId: `p${pairs.length}`, left: questionText, right: answerText });
            if (pairs.length >= MATCH_PAIRS) break;
        }
        return pairs;
    }

    function startMatchRound() {
        resetQuestionTimerUI();

        const pairs = makePairsFromRoundQuestions(roundQuestions);
        if (pairs.length < MATCH_PAIRS) {
            setText(setLabel, "Match unavailable — running trivia");
            currentIndex = 0;
            return showQuestion();
        }

        matchState = {
            pairs,
            solved: new Set(),
            selectedLeft: null,
            selectedRight: null,
            leftTiles: shuffleArray(pairs.map((p) => ({ side: "L", pairId: p.pairId, text: p.left }))),
            rightTiles: shuffleArray(pairs.map((p) => ({ side: "R", pairId: p.pairId, text: p.right }))),
            locked: false,
            wrapEl: null, // NEW: match grid wrapper for connection line
        };

        setText(qBox, "Match the pairs");
        setText(setLabel, `Round ${roundIndex + 1}/${TOTAL_ROUNDS} • MATCH ⚡`);
        currentIndex = 0;
        setProgressLabel();
        renderMatchGrid();

        startModeTimer(MATCH_TIME_MS, () => onMatchTimeout());
    }

    function onMatchTimeout() {
        sfxIncorrect();
        vibrate(160);

        if (currentIndex < ROUND_SIZE) {
            registerWrong();
            currentIndex++;
        }

        if (wrongTotal >= 3) return endGame("Time’s up — game over!");
        endRound();
    }

    function renderMatchGrid() {
        if (!choicesDiv || !matchState) return;

        choicesDiv.innerHTML = "";

        const wrap = document.createElement("div");
        wrap.style.display = "grid";
        wrap.style.gridTemplateColumns = "1fr 1fr";
        wrap.style.gap = "10px";
        wrap.style.alignItems = "start";
        wrap.style.position = "relative"; // allows connection line overlay
        wrap.style.overflow = "visible";

        matchState.wrapEl = wrap;

        const colL = document.createElement("div");
        const colR = document.createElement("div");
        colL.style.display = "grid";
        colL.style.gap = "10px";
        colR.style.display = "grid";
        colR.style.gap = "10px";

        matchState.leftTiles.forEach((t) => colL.appendChild(makeMatchButton(t)));
        matchState.rightTiles.forEach((t) => colR.appendChild(makeMatchButton(t)));

        wrap.appendChild(colL);
        wrap.appendChild(colR);
        choicesDiv.appendChild(wrap);

        syncMatchSelectionStyles();
    }

    function makeMatchButton(tile) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = tile.text;

        b.dataset.side = tile.side;
        b.dataset.pairId = tile.pairId;

        b.style.textAlign = "left";
        b.style.lineHeight = "1.15";
        b.style.padding = "12px 12px";
        b.style.minHeight = "44px";

        if (matchState?.solved?.has(tile.pairId)) {
            b.disabled = true;
            b.classList.add("correct");
            b.style.opacity = "0.7";
        }

        b.onclick = () => onMatchTap(b);
        return b;
    }

    function onMatchTap(btn) {
        if (!matchState || matchState.locked) return;
        if (btn.disabled) return;

        const side = btn.dataset.side;
        const pairId = btn.dataset.pairId;

        if (side === "L") matchState.selectedLeft = pairId;
        else matchState.selectedRight = pairId;

        syncMatchSelectionStyles();

        if (!matchState.selectedLeft || !matchState.selectedRight) return;

        matchState.locked = true;

        const isCorrect = matchState.selectedLeft === matchState.selectedRight;

        const all = [...choicesDiv.querySelectorAll("button")];
        const leftBtn = all.find((b) => b.dataset.side === "L" && b.dataset.pairId === matchState.selectedLeft);
        const rightBtn = all.find((b) => b.dataset.side === "R" && b.dataset.pairId === matchState.selectedRight);

        if (isCorrect) {
            // ✅ Premium FX: connection line + subtle lock pulse
            flashConnectionLine(leftBtn, rightBtn);
            pulseGlow(leftBtn);
            pulseGlow(rightBtn);

            leftBtn?.classList.add("correct");
            rightBtn?.classList.add("correct");
            sfxCorrect();
            vibrate(60);

            registerCorrect();
            score++;
            setText(pillScore, `Score ${score}`);

            matchState.solved.add(pairId);

            if (leftBtn) leftBtn.disabled = true;
            if (rightBtn) rightBtn.disabled = true;

            currentIndex++;
            setProgressLabel();

            matchState.selectedLeft = null;
            matchState.selectedRight = null;
            syncMatchSelectionStyles();

            if (matchState.solved.size >= MATCH_PAIRS || currentIndex >= MATCH_PAIRS) {
                stopQuestionTimer();
                resetQuestionTimerUI();
                matchState.locked = false;
                return endRound();
            }

            matchState.locked = false;
            return;
        }

        // ❌ Wrong: micro shake on both tiles
        shakeEl(leftBtn);
        shakeEl(rightBtn);

        leftBtn?.classList.add("incorrect");
        rightBtn?.classList.add("incorrect");
        sfxIncorrect();
        vibrate(160);

        registerWrong();
        currentIndex++;
        setProgressLabel();

        setTimeout(() => {
            leftBtn?.classList.remove("incorrect");
            rightBtn?.classList.remove("incorrect");

            matchState.selectedLeft = null;
            matchState.selectedRight = null;

            syncMatchSelectionStyles();
            matchState.locked = false;

            if (wrongTotal >= 3) return endGame("3 incorrect — game over!");
            if (currentIndex >= MATCH_PAIRS) {
                stopQuestionTimer();
                resetQuestionTimerUI();
                return endRound();
            }
        }, 520);
    }

    function syncMatchSelectionStyles() {
        if (!choicesDiv || !matchState) return;
        const all = [...choicesDiv.querySelectorAll("button")];

        all.forEach((b) => {
            if (b.disabled) return;

            b.style.outline = "none";
            b.style.boxShadow = "";

            const side = b.dataset.side;
            const pid = b.dataset.pairId;

            const selected =
                (side === "L" && matchState.selectedLeft === pid) ||
                (side === "R" && matchState.selectedRight === pid);

            if (selected) {
                b.style.outline = "2px solid rgba(41,255,161,0.8)";
                b.style.boxShadow = "0 0 0 3px rgba(41,255,161,0.12)";
            }
        });
    }

    // ---------------- Round end / game end ----------------
    function endRound() {
        stopQuestionTimer();
        resetQuestionTimerUI();

        const isLastRound = roundIndex >= TOTAL_ROUNDS - 1;

        if (!isLastRound) {
            successSplash?.classList.remove("show");
            void successSplash?.offsetWidth;
            successSplash?.classList.add("show");

            clearTimeout(successAutoNav);
            successAutoNav = setTimeout(() => {
                successSplash?.classList.remove("show");
                beginRound(roundIndex + 1, { doCountdown: true });
            }, 1200);
            return;
        }

        endGame("");
    }

    function endGame(msg = "") {
        clearInterval(elapsedInterval);
        stopQuestionTimer();
        showCountdown(false);
        resetQuestionTimerUI();

        if (msg) {
            setText(gameOverText, msg);
            show(gameOverBox, true);
            show(playAgainBtn, true);
            addCls(playAgainBtn, "pulse");
            setText(setLabel, "Game Over");
            return;
        }

        successSplash?.removeAttribute("aria-hidden");
        successSplash?.classList.remove("show");
        void successSplash?.offsetWidth;
        successSplash?.classList.add("show");

        clearTimeout(successAutoNav);
        successAutoNav = setTimeout(() => {
            successSplash?.classList.remove("show");
            setText(qBox, "Press Start to Play");
            setText(setLabel, "Ready");
            setText(pillScore, "Score 0");
            setText(progressLabel, `Round 1/${TOTAL_ROUNDS} • Q 0/${ROUND_SIZE}`);
            setStyle(timerBar, "width", "0%");
            resetQuestionTimerUI();
            buildStreakBar();
        }, 3000);
    }

    // ---------------- Wire UI ----------------
    startBtn?.addEventListener("click", startGame);

    shuffleBtn?.addEventListener("click", () => {
        const mode = getModeForRound(roundIndex);

        if (mode === "match") {
            if (!roundQuestions?.length) return;
            wrongTotal = 0;
            correctSinceLastWrong = 0;
            currentIndex = 0;
            buildStreakBar();
            startMatchRound();
            return;
        }

        roundQuestions = shuffleArray(roundQuestions.slice());
        currentIndex = 0;
        wrongTotal = 0;
        correctSinceLastWrong = 0;
        buildStreakBar();
        showQuestion();
    });

    shareBtn?.addEventListener("click", () => {
        const answered = roundIndex * ROUND_SIZE + (getModeForRound(roundIndex) === "match" ? currentIndex : currentIndex);
        const text = `I'm playing Brain ⚡ Bolt! Score: ${score}/${TOTAL_QUESTIONS} (Progress ${answered}/${TOTAL_QUESTIONS})`;
        if (navigator.share) {
            navigator.share({ title: "Brain ⚡ Bolt", text, url: location.href }).catch(() => { });
        } else {
            navigator.clipboard?.writeText(`${text} - ${location.href}`).catch(() => { });
        }
    });

    playAgainBtn?.addEventListener("click", startGame);

    soundBtn?.addEventListener("click", () => {
        soundOn = !soundOn;
        soundBtn.textContent = soundOn ? "🔊" : "🔇";
    });

    // Boot UI state
    resetTopBar();
    ensureQuestionTimerBar();
    resetQuestionTimerUI();
    buildStreakBar();
}
