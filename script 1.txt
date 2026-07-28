/* =====================================================
   CARD QUEST — Defeat the Boss!
   Card Flip RPG v1.0
   ===================================================== */
'use strict';

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════
const BOSS_MAX_HP    = 200;
const PLAYER_MAX_HP  = 100;
const CARDS_PER_ROUND = 4;
const BONUS_HEAL_AMT  = 50;
const DEFAULT_TIME    = 30; // seconds fallback

// Damage values assigned to the 4 cards each round
// Shuffled randomly each round so position varies
const DAMAGE_VALUES = [10, 15, 20, 25];

// Bonus round outcomes (shuffled each bonus round)
const BONUS_OUTCOMES = [
  { icon: '💀', label: 'BOSS HEALS!',    color: '#ff3344',
    text: `Boss heals +${BONUS_HEAL_AMT} HP!`,   type: 'boss_heal'    },
  { icon: '⚔️', label: 'BOSS HP HALVED!', color: '#ffd700',
    text: 'Boss HP cut in half!',                 type: 'boss_half'    },
  { icon: '😐', label: 'NO CHANGE',       color: '#7a8599',
    text: 'Nothing happens…',                     type: 'nothing'      },
];

// ═══════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════
let allQuestions    = [];   // full pool from JSON
let questionPool    = [];   // unused questions
let currentRound    = 0;
let questionsAnswered = 0;  // total answered (for bonus trigger)
let roundAnswered   = 0;    // answered this round (triggers bonus at 4)
let bossHP          = BOSS_MAX_HP;
let playerHP        = PLAYER_MAX_HP;
let score           = 0;
let correctCount    = 0;
let totalAnswered   = 0;
let katexReady      = false;
let activeCardIndex = -1;   // which card is currently flipped
let cardTimerInterval = null;
let roundCards      = [];   // [{question, damage}] for current 4 cards
let gameActive      = false;

// ═══════════════════════════════════════════════════════
//  DOM
// ═══════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

const ui = {
  loginScreen:   $('login-screen'),
  battleScreen:  $('battle-screen'),
  endScreen:     $('end-screen'),
  pinInput:      $('pin-input'),
  startBtn:      $('start-btn'),
  tryAgainBtn:   $('try-again-btn'),
  errorMsg:      $('error-msg'),
  scoreDisplay:  $('score-display'),
  roundNum:      $('round-num'),
  bossHPFill:    $('enemy-hp-fill'),
  playerHPFill:  $('player-hp-fill'),
  bossHPText:    $('enemy-hp-text'),
  playerHPText:  $('player-hp-text'),
  bossSprite:    $('boss-sprite'),
  playerSprite:  $('player-sprite'),
  bossRingFill:  $('boss-ring-fill'),
  cardGrid:      $('card-grid'),
  bonusArea:     $('bonus-area'),
  bonusGrid:     $('bonus-grid'),
  phaseLabel:    $('phase-label'),
  qAnsweredCount:$('q-answered-count'),
  particles:     $('particles'),
  damageNumber:  $('damage-number'),
  healDisplay:   $('heal-display'),
  effectDisplay: $('effect-display'),
  explosion:     $('explosion'),
  finalScore:    $('final-score'),
  finalCorrect:  $('final-correct'),
  finalAccuracy: $('final-accuracy'),
  finalRounds:   $('final-rounds'),
  finalBossHP:   $('final-boss-hp'),
  finalRank:     $('final-rank'),
  starRating:    $('star-rating'),
  badgesRow:     $('badges-row'),
  endIcon:       $('end-icon'),
  endTitle:      $('end-title'),
  endReason:     $('end-reason'),
};

// ═══════════════════════════════════════════════════════
//  VIEWPORT FIX
// ═══════════════════════════════════════════════════════
function fixVH() {
  document.documentElement.style.setProperty(
    '--vh', `${window.innerHeight * 0.01}px`
  );
}
fixVH();
window.addEventListener('resize', fixVH);
window.addEventListener('orientationchange', () => setTimeout(fixVH, 200));

document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - (document._lt || 0) < 300) e.preventDefault();
  document._lt = now;
}, { passive: false });

// ═══════════════════════════════════════════════════════
//  KATEX
// ═══════════════════════════════════════════════════════
function waitForKaTeX() {
  return new Promise(resolve => {
    if (typeof katex !== 'undefined' &&
        typeof renderMathInElement === 'function') {
      katexReady = true; resolve(); return;
    }
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (typeof katex !== 'undefined' &&
          typeof renderMathInElement === 'function') {
        clearInterval(t); katexReady = true; resolve();
      } else if (tries > 120) {
        clearInterval(t);
        console.warn('KaTeX unavailable — raw text mode');
        resolve();
      }
    }, 80);
  });
}

// ═══════════════════════════════════════════════════════
//  MATH PREPROCESSING
//  Converts teacher-friendly syntax → KaTeX LaTeX
//
//  Supported:
//    1/2        → \frac{1}{2}
//    2 3/4      → 2\frac{3}{4}   (mixed number)
//    x^2        → x^{2}
//    10^-3      → 10^{-3}
//    sqrt(x)    → \sqrt{x}
//    H2O        → \text{H}_{2}\text{O}  (chemical)
//    CO2, C6H12O6 etc.
//    x_1, a_n   → x_{1}
//    Bare $ (prices) escaped so KaTeX ignores them
// ═══════════════════════════════════════════════════════
function preprocessMath(raw) {
  if (!raw) return '';

  // 1. Protect explicit $...$ and $$...$$ blocks
  const blocks = [];
  let s = raw.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, m => {
    blocks.push(m); return `\x00B${blocks.length - 1}\x00`;
  });

  // 2. Escape lone $ (prices like $5.00)
  s = s.replace(/\$(?!\x00)(?!\d*[a-zA-Z^_{\\(])/g, '\\$');

  // 3. Chemical formulas: letters+digits pattern
  //    e.g. H2O CO2 C6H12O6 NaCl (only if mixed letters+digits)
  s = s.replace(/\b([A-Z][a-zA-Z0-9]{1,24})\b/g, match => {
    if (!/[A-Za-z]/.test(match) || !/\d/.test(match)) return match;
    // Build LaTeX: alternate text groups and subscript digits
    const latex = match
      .replace(/([A-Za-z]+)(\d+)/g, (_, L, D) => `\\text{${L}}_{${D}}`)
      .replace(/(\d+)([A-Za-z]+)/g, (_, D, L) => `${D}\\text{${L}}`);
    return `$${latex}$`;
  });

  // 4. Mixed numbers: "2 3/4" → $2\frac{3}{4}$
  //    Must come before simple fraction rule
  s = s.replace(
    /(?<!\w)(\d+)\s+(\d+)\/(\d+)(?!\w)/g,
    (_, w, n, d) => `$${w}\\frac{${n}}{${d}}$`
  );

  // 5. Simple fractions: "3/4" → $\frac{3}{4}$
  //    Avoid URLs, dates, already processed
  s = s.replace(
    /(?<![:/\d])(\d+)\/(\d+)(?![/\d\w])/g,
    (_, n, d) => `$\\frac{${n}}{${d}}$`
  );

  // 6. Powers: x^2  10^-3  2^{n+1}  a^n
  s = s.replace(
    /(?<!\$)([a-zA-Z0-9]+)\^(\{[^}]+\}|-?\d+(?:\.\d+)?|[a-zA-Z])/g,
    (_, base, exp) => {
      const e = exp.startsWith('{') ? exp : `{${exp}}`;
      return `$${base}^${e}$`;
    }
  );

  // 7. Square roots: sqrt(x)  sqrt(16)
  s = s.replace(
    /sqrt\(([^)]+)\)/gi,
    (_, inner) => `$\\sqrt{${inner}}$`
  );

  // 8. Subscripts: x_1  a_n  (outside chemical context)
  s = s.replace(
    /(?<!\$)([a-zA-Z])\^?_(\{[^}]+\}|\d+|[a-zA-Z])(?!\w)/g,
    (_, base, sub) => {
      const sv = sub.startsWith('{') ? sub : `{${sub}}`;
      return `$${base}_{${sv}}$`;
    }
  );

  // 9. Merge adjacent $...$$...$ to avoid triple-dollar
  s = s.replace(/\$([^$]+)\$\s*\$([^$]+)\$/g, '$$$1\\;$2$$$');

  // 10. Restore protected blocks
  s = s.replace(/\x00B(\d+)\x00/g, (_, i) => blocks[+i]);

  return s;
}

function renderMathIn(el) {
  if (!katexReady || !el) return;
  try {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true  },
        { left: '$',  right: '$',  display: false },
      ],
      throwOnError: false,
      errorColor:   '#ef4444',
      ignoredTags:  ['script','noscript','style','textarea','pre','code'],
    });
  } catch(e) {
    console.warn('KaTeX error:', e.message);
  }
}

function setMathContent(el, rawText) {
  if (!el) return;
  if (!rawText) { el.textContent = ''; return; }
  el.textContent = preprocessMath(rawText);
  renderMathIn(el);
}

function normalise(s) {
  return s ? s.trim().replace(/\s+/g,' ').toLowerCase() : '';
}

// ═══════════════════════════════════════════════════════
//  AUDIO
// ═══════════════════════════════════════════════════════
let audioCtx;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
    catch(e){}
  }
}
function tone(freq, type, dur, vol=0.15, delay=0) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur);
  } catch(e){}
}
function playSound(type) {
  if (!audioCtx) return;
  switch(type) {
    case 'flip':
      tone(300,'sine',0.08,0.1);
      tone(500,'sine',0.08,0.08,0.06);
      break;
    case 'correct':
      tone(523,'sine',0.12,0.18);
      tone(659,'sine',0.12,0.16,0.09);
      tone(784,'sine',0.18,0.14,0.18);
      break;
    case 'wrong':
      tone(280,'sawtooth',0.2,0.12);
      tone(150,'sawtooth',0.25,0.1,0.15);
      break;
    case 'hit':
      tone(160,'sine',0.2,0.2);
      tone(80,'sine',0.15,0.15,0.1);
      break;
    case 'boss_hurt':
      tone(200,'sawtooth',0.1,0.15);
      tone(120,'sawtooth',0.15,0.12,0.1);
      break;
    case 'bonus':
      tone(440,'triangle',0.1,0.18);
      tone(660,'triangle',0.1,0.16,0.1);
      tone(880,'triangle',0.2,0.14,0.2);
      break;
    case 'boss_heal':
      tone(250,'sawtooth',0.35,0.14);
      tone(150,'sawtooth',0.35,0.12,0.15);
      break;
    case 'halved':
      tone(523,'sine',0.1,0.18);
      tone(784,'sine',0.1,0.16,0.1);
      tone(1047,'sine',0.25,0.14,0.2);
      break;
    case 'timeout':
      tone(300,'sawtooth',0.35,0.14);
      break;
    case 'victory':
      [523,659,784,1047,1319].forEach((f,i)=>tone(f,'sine',0.2,0.15,i*0.12));
      break;
    case 'defeat':
      [400,300,200,120].forEach((f,i)=>tone(f,'sawtooth',0.3,0.12,i*0.18));
      break;
  }
}

// ═══════════════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════════════
ui.startBtn.addEventListener('click', attemptLogin);
ui.pinInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') attemptLogin();
});
ui.tryAgainBtn.addEventListener('click', restartGame);

// ═══════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════
async function attemptLogin() {
  initAudio();
  ui.errorMsg.classList.add('hidden');

  const pin = ui.pinInput.value.trim();
  if (!pin) { showError('Enter a Quest Code to begin.'); return; }

  ui.startBtn.disabled = true;
  ui.startBtn.textContent = '⏳ Loading…';

  try {
    await waitForKaTeX();
    const res = await fetch(`worksheets/${pin}.json`);
    if (!res.ok) throw new Error(`Quest "${pin}" not found! Check your code.`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0)
      throw new Error('Quest file is empty or invalid.');
    allQuestions = data;
    startGame();
  } catch(err) {
    showError(err.message);
    ui.startBtn.disabled = false;
    ui.startBtn.textContent = '⚔️ BEGIN QUEST';
  }
}

function showError(msg) {
  ui.errorMsg.textContent = msg;
  ui.errorMsg.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════
//  START / RESTART
// ═══════════════════════════════════════════════════════
function startGame() {
  bossHP          = BOSS_MAX_HP;
  playerHP        = PLAYER_MAX_HP;
  score           = 0;
  correctCount    = 0;
  totalAnswered   = 0;
  currentRound    = 0;
  questionsAnswered = 0;
  roundAnswered   = 0;
  activeCardIndex = -1;
  gameActive      = true;

  // Shuffle full pool
  questionPool = shuffle([...allQuestions]);

  updateBars();
  updateScoreDisplay();

  showScreen('battle');
  setTimeout(startNewRound, 300);
}

function restartGame() {
  clearCardTimer();
  gameActive = false;
  ui.startBtn.disabled = false;
  ui.startBtn.textContent = '⚔️ BEGIN QUEST';
  ui.pinInput.value = '';
  showScreen('login');
}

function showScreen(name) {
  ui.loginScreen.classList.toggle( 'hidden', name !== 'login');
  ui.battleScreen.classList.toggle('hidden', name !== 'battle');
  ui.endScreen.classList.toggle(  'hidden', name !== 'end');
}

// ═══════════════════════════════════════════════════════
//  ROUND MANAGEMENT
// ═══════════════════════════════════════════════════════
function startNewRound() {
  if (!gameActive) return;

  // Check if we've run out of questions
  if (questionPool.length === 0) {
    endGame('out_of_questions');
    return;
  }

  currentRound++;
  roundAnswered = 0;
  activeCardIndex = -1;

  ui.roundNum.textContent      = currentRound;
  ui.qAnsweredCount.textContent = '0';
  ui.phaseLabel.textContent    = 'PICK A CARD';

  // Hide bonus, show card grid
  ui.bonusArea.classList.add('hidden');
  ui.cardGrid.classList.remove('hidden');

  // Deal 4 cards — take questions from pool
  // (may have fewer than 4 if pool nearly empty)
  const dmgs = shuffle([...DAMAGE_VALUES]);
  roundCards = [];

  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    if (questionPool.length === 0) break;
    const q = questionPool.shift(); // take from front (already shuffled)
    roundCards.push({ question: q, damage: dmgs[i] || 10 });
  }

  // If we couldn't even get 1 question
  if (roundCards.length === 0) {
    endGame('out_of_questions');
    return;
  }

  // Render cards face down
  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    const card = $(`card-${i}`);
    if (!card) continue;

    // Reset card state
    card.classList.remove(
      'flipped','disabled','answered-correct','answered-wrong'
    );
    card.style.opacity  = '';
    card.style.pointerEvents = '';
    card.onclick = () => pickCard(i);

    // Clear back content
    const back = card.querySelector('.card-back');
    if (back) {
      back.querySelector('.card-dmg-badge').textContent  = '';
      back.querySelector('.card-question-text').textContent = '';
      back.querySelector('.card-options').innerHTML       = '';
      const tf = back.querySelector('.card-timer-fill');
      if (tf) { tf.style.width = '100%'; tf.style.background = 'var(--hp-green)'; }
    }

    // If this slot has no question (pool ran short), hide card
    if (i >= roundCards.length) {
      card.style.opacity = '0.15';
      card.style.pointerEvents = 'none';
    }
  }

  // Entrance animation — stagger cards
  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    const card = $(`card-${i}`);
    if (!card) continue;
    card.style.transform = 'translateY(40px)';
    card.style.opacity   = i >= roundCards.length ? '0.15' : '0';
    card.style.transition = 'none';
    setTimeout(() => {
      card.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
      card.style.transform  = '';
      card.style.opacity    = i >= roundCards.length ? '0.15' : '';
    }, i * 80 + 50);
  }
}

// ═══════════════════════════════════════════════════════
//  PICK CARD
// ═══════════════════════════════════════════════════════
function pickCard(index) {
  if (!gameActive) return;
  if (index >= roundCards.length) return;
  if (activeCardIndex !== -1) return; // already a card active

  activeCardIndex = index;
  const { question, damage } = roundCards[index];
  const card = $(`card-${index}`);
  if (!card) return;

  // Disable other cards during question
  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    if (i !== index) {
      const c = $(`card-${i}`);
      if (c) { c.style.pointerEvents = 'none'; c.onclick = null; }
    }
  }

  playSound('flip');

  // Populate card back BEFORE flip so it's ready
  const back         = card.querySelector('.card-back');
  const dmgBadge     = back.querySelector('.card-dmg-badge');
  const qTextEl      = back.querySelector('.card-question-text');
  const optsEl       = back.querySelector('.card-options');
  const timerFillEl  = back.querySelector('.card-timer-fill');

  dmgBadge.textContent = `⚔️ ${damage} DMG`;
  setMathContent(qTextEl, question.question || 'Question missing');

  // Build options (shuffled)
  optsEl.innerHTML = '';
  const opts = shuffle([...(question.options || [])]);
  const answerRaw = (question.answer || '').trim();

  opts.forEach(opt => {
    const raw = (opt || '').trim();
    const btn = document.createElement('button');
    btn.className   = 'card-opt';
    btn.dataset.raw = raw;
    setMathContent(btn, raw);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCardAnswer(btn, raw, answerRaw, damage, index);
    });
    optsEl.appendChild(btn);
  });

  // Flip card
  card.classList.add('flipped');
  card.onclick = null; // can't re-flip

  // Start timer after flip animation completes
  const timeLimit = (question.time && question.time > 0)
    ? question.time : DEFAULT_TIME;

  setTimeout(() => {
    startCardTimer(timerFillEl, timeLimit, () => {
      handleTimeout(answerRaw, damage, index);
    });
  }, 680);
}

// ═══════════════════════════════════════════════════════
//  CARD TIMER
// ═══════════════════════════════════════════════════════
function startCardTimer(fillEl, seconds, onTimeout) {
  clearCardTimer();
  const start = Date.now();
  const limitMs = seconds * 1000;

  if (fillEl) {
    fillEl.style.width = '100%';
    fillEl.style.background = 'var(--hp-green)';
  }

  cardTimerInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct = Math.max(0, 100 - (elapsed / limitMs * 100));

    if (fillEl) {
      fillEl.style.width = `${pct}%`;
      if      (pct < 20) fillEl.style.background = 'var(--hp-red)';
      else if (pct < 50) fillEl.style.background = '#ff8800';
      else               fillEl.style.background = 'var(--hp-green)';
    }

    if (pct <= 0) {
      clearCardTimer();
      onTimeout();
    }
  }, 80);
}

function clearCardTimer() {
  if (cardTimerInterval) {
    clearInterval(cardTimerInterval);
    cardTimerInterval = null;
  }
}

// ═══════════════════════════════════════════════════════
//  ANSWER HANDLING
// ═══════════════════════════════════════════════════════
function handleCardAnswer(btn, selected, correct, damage, cardIndex) {
  clearCardTimer();
  disableCardOptions(cardIndex);

  totalAnswered++;
  questionsAnswered++;
  roundAnswered++;
  ui.qAnsweredCount.textContent = roundAnswered;

  if (normalise(selected) === normalise(correct)) {
    // CORRECT
    btn.classList.add('correct');
    correctCount++;
    score += damage * 10;
    playSound('correct');
    updateScoreDisplay();

    // Mark card
    const card = $(`card-${cardIndex}`);
    if (card) card.classList.add('answered-correct');

    setTimeout(() => {
      doBossHit(damage, () => afterAnswer());
    }, 400);

  } else {
    // WRONG — reveal correct
    btn.classList.add('wrong');
    playSound('wrong');
    document.querySelectorAll(`#card-${cardIndex} .card-opt`).forEach(b => {
      if (normalise(b.dataset.raw) === normalise(correct))
        b.classList.add('correct');
    });

    const card = $(`card-${cardIndex}`);
    if (card) card.classList.add('answered-wrong');

    setTimeout(() => {
      doPlayerHit(damage, () => afterAnswer());
    }, 400);
  }
}

function handleTimeout(correct, damage, cardIndex) {
  if (!gameActive) return;
  disableCardOptions(cardIndex);

  // Reveal correct answer
  document.querySelectorAll(`#card-${cardIndex} .card-opt`).forEach(b => {
    if (normalise(b.dataset.raw) === normalise(correct))
      b.classList.add('correct');
  });

  totalAnswered++;
  questionsAnswered++;
  roundAnswered++;
  ui.qAnsweredCount.textContent = roundAnswered;

  playSound('timeout');
  showEffect('⏰ TIME UP!', '#ff3344');

  const card = $(`card-${cardIndex}`);
  if (card) card.classList.add('answered-wrong');

  setTimeout(() => {
    doPlayerHit(damage, () => afterAnswer());
  }, 600);
}

function disableCardOptions(cardIndex) {
  document.querySelectorAll(`#card-${cardIndex} .card-opt`).forEach(b => {
    b.disabled = true;
    b.onclick  = null;
  });
}

// ═══════════════════════════════════════════════════════
//  AFTER EACH ANSWER
// ═══════════════════════════════════════════════════════
function afterAnswer() {
  if (!gameActive) return;

  // Check boss dead
  if (bossHP <= 0) { endGame('victory'); return; }
  // Check player dead
  if (playerHP <= 0) { endGame('defeat'); return; }

  // Mark current card as disabled/used
  const card = $(`card-${activeCardIndex}`);
  if (card) card.classList.add('disabled');

  activeCardIndex = -1;

  // Recycle unchosen cards back into question pool
  // (already done by removing them from roundCards after answer)
  // → The 3 unchosen cards' questions go back to pool
  const usedIndex = roundCards.findIndex((_, i) =>
    $(`card-${i}`) && $(`card-${i}`).classList.contains('answered-correct') ||
    $(`card-${i}`) && $(`card-${i}`).classList.contains('answered-wrong')
  );

  // Return unanswered cards to pool
  roundCards.forEach((rc, i) => {
    const c = $(`card-${i}`);
    if (!c) return;
    if (!c.classList.contains('answered-correct') &&
        !c.classList.contains('answered-wrong') &&
        !c.classList.contains('disabled')) {
      questionPool.push(rc.question); // recycle
    }
  });

  // Shuffle recycled pool
  questionPool = shuffle(questionPool);

  // After every 4 questions answered → bonus round
  if (questionsAnswered % CARDS_PER_ROUND === 0) {
    setTimeout(startBonusRound, 700);
  } else {
    setTimeout(startNewRound, 700);
  }
}

// ═══════════════════════════════════════════════════════
//  BONUS ROUND
// ═══════════════════════════════════════════════════════
function startBonusRound() {
  if (!gameActive) return;

  ui.cardGrid.classList.add('hidden');
  ui.bonusArea.classList.remove('hidden');
  ui.phaseLabel.textContent = '✨ BONUS ROUND!';

  playSound('bonus');
  spawnParticles('center', '#ffd700', 18);

  // Shuffle outcomes
  const outcomes = shuffle([...BONUS_OUTCOMES]);

  // Set up 3 bonus cards
  for (let i = 0; i < 3; i++) {
    const bcard = $(`bcard-${i}`);
    if (!bcard) continue;

    bcard.classList.remove('flipped','disabled');
    bcard.style.opacity = '';
    bcard.style.pointerEvents = '';

    const back = bcard.querySelector('.bonus-back');
    if (back) {
      back.querySelector('.bonus-reveal-icon').textContent = '';
      back.querySelector('.bonus-reveal-text').textContent = '';
    }

    // Store outcome on element
    bcard.dataset.outcomeIdx = i;

    // Entrance animation
    bcard.style.transform  = 'translateY(30px)';
    bcard.style.opacity    = '0';
    bcard.style.transition = 'none';
    setTimeout(() => {
      bcard.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
      bcard.style.transform  = '';
      bcard.style.opacity    = '';
    }, i * 100 + 50);
  }

  // Store outcomes for pickup
  ui.bonusGrid._outcomes = outcomes;
}

// Exposed as global for onclick
window.pickBonusCard = function(index) {
  if (!gameActive) return;
  const bcard = $(`bcard-${index}`);
  if (!bcard || bcard.classList.contains('flipped')) return;

  const outcomes = ui.bonusGrid._outcomes;
  if (!outcomes) return;

  const outcome = outcomes[index];

  // Disable all bonus cards
  for (let i = 0; i < 3; i++) {
    const bc = $(`bcard-${i}`);
    if (bc) { bc.style.pointerEvents = 'none'; }
  }

  // Populate reveal
  playSound('flip');
  const back = bcard.querySelector('.bonus-back');
  if (back) {
    back.querySelector('.bonus-reveal-icon').textContent = outcome.icon;
    const rt = back.querySelector('.bonus-reveal-text');
    rt.textContent = outcome.label;
    rt.style.color = outcome.color;
  }

  // Flip
  bcard.classList.add('flipped');

  // Apply effect after flip
  setTimeout(() => {
    applyBonusOutcome(outcome);

    // Reveal other cards
    setTimeout(() => {
      for (let i = 0; i < 3; i++) {
        if (i === index) continue;
        const bc = $(`bcard-${i}`);
        const oc = outcomes[i];
        if (!bc || !oc) continue;
        const bk = bc.querySelector('.bonus-back');
        if (bk) {
          bk.querySelector('.bonus-reveal-icon').textContent = oc.icon;
          const rt = bk.querySelector('.bonus-reveal-text');
          rt.textContent = oc.label;
          rt.style.color = oc.color;
        }
        bc.classList.add('flipped');
        bc.classList.add('disabled');
      }

      // Move to next round after showing all
      setTimeout(startNewRound, 1800);
    }, 600);
  }, 700);
};

function applyBonusOutcome(outcome) {
  switch(outcome.type) {
    case 'boss_half':
      bossHP = Math.max(1, Math.floor(bossHP / 2));
      updateBars();
      playSound('halved');
      showEffect('⚔️ BOSS HP HALVED!', '#ffd700');
      spawnParticles('left', '#ffd700', 16);
      flashArena('#ffd700');
      break;

    case 'boss_heal':
      bossHP = Math.min(BOSS_MAX_HP, bossHP + BONUS_HEAL_AMT);
      updateBars();
      playSound('boss_heal');
      showEffect(`💀 BOSS HEALS +${BONUS_HEAL_AMT}!`, '#ff3344');
      spawnParticles('left', '#ff3344', 12);
      break;

    case 'nothing':
      showEffect('😐 Nothing happens…', '#7a8599');
      break;
  }
}

// ═══════════════════════════════════════════════════════
//  COMBAT ANIMATIONS
// ═══════════════════════════════════════════════════════
function doBossHit(damage, cb) {
  playSound('boss_hurt');

  // Damage number near boss
  ui.damageNumber.textContent = `−${damage}`;
  ui.damageNumber.style.color = '#ff5544';
  showFloatEl(ui.damageNumber, false);

  // Boss hit animation
  ui.bossSprite.classList.remove('anim-boss-hit');
  void ui.bossSprite.offsetWidth;
  ui.bossSprite.classList.add('anim-boss-hit');

  // Explosion near boss
  showExplosion('left');
  spawnParticles('left', '#ff8800', 10);
  flashArena('#ff2200');

  bossHP = Math.max(0, bossHP - damage);
  updateBars();

  setTimeout(() => {
    ui.bossSprite.classList.remove('anim-boss-hit');
    cb && cb();
  }, 700);
}

function doPlayerHit(damage, cb) {
  playSound('hit');

  // Damage near player
  ui.damageNumber.textContent = `−${damage}`;
  ui.damageNumber.style.color = '#ff3344';
  ui.damageNumber.style.left  = 'auto';
  ui.damageNumber.style.right = '12%';
  showFloatEl(ui.damageNumber, false);
  ui.damageNumber.style.left  = '';
  ui.damageNumber.style.right = '';

  ui.playerSprite.classList.remove('anim-player-hit');
  void ui.playerSprite.offsetWidth;
  ui.playerSprite.classList.add('anim-player-hit');

  showExplosion('right');
  spawnParticles('right', '#ff3344', 10);
  $('game-container').classList.add('anim-shake');

  playerHP = Math.max(0, playerHP - damage);
  updateBars();

  setTimeout(() => {
    ui.playerSprite.classList.remove('anim-player-hit');
    $('game-container').classList.remove('anim-shake');
    cb && cb();
  }, 700);
}

// ═══════════════════════════════════════════════════════
//  VISUAL EFFECTS
// ═══════════════════════════════════════════════════════
function showExplosion(side) {
  ui.explosion.style.left = side === 'left' ? '20%' : '65%';
  ui.explosion.style.top  = '30%';
  ui.explosion.classList.remove('hidden');
  setTimeout(() => ui.explosion.classList.add('hidden'), 450);
}

function spawnParticles(side, color, count=8) {
  const cx = side === 'left' ? 25 : side === 'right' ? 72 : 50;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = 3 + Math.random() * 6;
    p.style.cssText = `
      width:${size}px;height:${size}px;
      left:${cx}%;top:${28+Math.random()*30}%;
      background:${color};
      box-shadow:0 0 ${size}px ${color};
    `;
    p.style.setProperty('--px',`${(Math.random()-.5)*150}px`);
    p.style.setProperty('--py',`${(Math.random()-.5)*150}px`);
    ui.particles.appendChild(p);
    setTimeout(()=>p.remove(), 750);
  }
}

function flashArena(color='#ffffff') {
  const f = document.createElement('div');
  f.style.cssText = `
    position:absolute;inset:0;z-index:20;pointer-events:none;
    background:${color}33;
    animation:flashBang 0.35s ease-out forwards;
  `;
  $('arena').appendChild(f);
  setTimeout(()=>f.remove(), 380);
}

function showFloatEl(el, useCenter=true) {
  if (!el) return;
  el.classList.remove('hidden','anim-float-up','anim-float-center');
  void el.offsetWidth;
  el.classList.add(useCenter ? 'anim-float-center' : 'anim-float-up');
  el.classList.remove('hidden');
  setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('anim-float-up','anim-float-center');
  }, 1400);
}

function showEffect(text, color='#ffd700') {
  ui.effectDisplay.textContent = text;
  ui.effectDisplay.style.color = color;
  showFloatEl(ui.effectDisplay, true);
}

// ═══════════════════════════════════════════════════════
//  HP BARS & BOSS RING
// ═══════════════════════════════════════════════════════
function updateBars() {
  const bPct = Math.max(0, bossHP)   / BOSS_MAX_HP   * 100;
  const pPct = Math.max(0, playerHP) / PLAYER_MAX_HP * 100;

  ui.bossHPFill.style.width   = `${bPct}%`;
  ui.playerHPFill.style.width = `${pPct}%`;

  if (ui.bossHPText)   ui.bossHPText.textContent   = Math.ceil(bossHP);
  if (ui.playerHPText) ui.playerHPText.textContent = Math.ceil(playerHP);

  // Boss ring SVG (circumference of r=34 circle ≈ 213.6)
  const circ = 213.6;
  const offset = circ * (1 - bPct / 100);
  if (ui.bossRingFill) ui.bossRingFill.style.strokeDashoffset = offset;

  // Boss ring colour
  if (ui.bossRingFill) {
    ui.bossRingFill.style.stroke =
      bPct < 25 ? '#880000' :
      bPct < 50 ? '#cc4400' :
                  '#ff3344';
  }

  // Player bar colour
  ui.playerHPFill.style.background =
    pPct < 25 ? 'linear-gradient(90deg,#880000,var(--hp-red))' :
    pPct < 50 ? 'linear-gradient(90deg,#994400,#ff8800)' :
                'linear-gradient(90deg,#1d4ed8,var(--cyan))';

  // Boss sprite changes
  updateBossSprite();
}

function updateBossSprite() {
  const pct = bossHP / BOSS_MAX_HP * 100;
  if      (pct > 75) ui.bossSprite.textContent = '👹';
  else if (pct > 50) ui.bossSprite.textContent = '😤👹';
  else if (pct > 25) ui.bossSprite.textContent = '🔥👹';
  else if (pct > 0)  ui.bossSprite.textContent = '💢👹';
  else               ui.bossSprite.textContent = '💀';
}

function updateScoreDisplay() {
  ui.scoreDisplay.textContent = score;
}

// ═══════════════════════════════════════════════════════
//  END GAME
// ═══════════════════════════════════════════════════════
function endGame(result) {
  gameActive = false;
  clearCardTimer();

  playSound(result === 'victory' ? 'victory' : 'defeat');

  setTimeout(() => {
    showScreen('end');

    const acc = totalAnswered > 0
      ? Math.round(correctCount / totalAnswered * 100) : 0;

    ui.finalScore.textContent    = score;
    ui.finalCorrect.textContent  = `${correctCount}/${totalAnswered}`;
    ui.finalAccuracy.textContent = `${acc}%`;
    ui.finalRounds.textContent   = currentRound;
    ui.finalBossHP.textContent   = Math.ceil(bossHP);

    const rank = calcRank(acc, bossHP, result);
    ui.finalRank.textContent = rank.label;
    ui.finalRank.style.color = rank.color;

    if (result === 'victory') {
      ui.endIcon.textContent  = '🏆';
      ui.endTitle.textContent = 'BOSS DEFEATED!';
      ui.endTitle.style.color = 'var(--gold)';
      ui.endReason.textContent =
        'Your knowledge destroyed the boss! You are a true champion! ⚔️✨';
    } else if (result === 'defeat') {
      ui.endIcon.textContent  = '💀';
      ui.endTitle.textContent = 'QUEST FAILED';
      ui.endTitle.style.color = 'var(--hp-red)';
      ui.endReason.textContent =
        'The boss was too powerful this time. Study up and try again! 💪';
    } else {
      ui.endIcon.textContent  = '📚';
      ui.endTitle.textContent = 'QUESTIONS DONE';
      ui.endTitle.style.color = '#94a3b8';
      ui.endReason.textContent =
        `All questions used! Boss survived with ${Math.ceil(bossHP)} HP. Keep studying! 🐲`;
    }

    ui.starRating.textContent = buildStars(acc, result);
    buildBadges(acc, correctCount, totalAnswered, currentRound, result);

  }, 600);
}

function calcRank(acc, remainBoss, result) {
  if (result === 'victory' && acc === 100)
    return { label: 'S+', color: '#ffd700' };
  if (result === 'victory' && acc >= 80)
    return { label: 'S',  color: '#ffd700' };
  if (acc >= 80) return { label: 'A', color: '#22c55e' };
  if (acc >= 65) return { label: 'B', color: '#00d4ff' };
  if (acc >= 50) return { label: 'C', color: '#94a3b8' };
  return           { label: 'D', color: '#ef4444'  };
}

function buildStars(acc, result) {
  const n = result === 'victory' ? (acc === 100 ? 3 : acc >= 70 ? 2 : 1)
          : acc >= 60 ? 1 : 0;
  return '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

function buildBadges(acc, correct, total, rounds, result) {
  ui.badgesRow.innerHTML = '';
  const badges = [];
  if (result === 'victory')   badges.push('💀 Boss Slayer');
  if (acc === 100)            badges.push('🎯 Perfect Score');
  if (acc >= 80)              badges.push('🌟 High Achiever');
  if (rounds <= 9 && result === 'victory') badges.push('⚡ Speed Runner');
  if (playerHP >= 80)         badges.push('🛡️ Untouchable');
  if (correct >= 10)          badges.push('🧠 Knowledge Master');
  if (badges.length === 0)    badges.push('📚 Keep Studying!');
  badges.forEach(text => {
    const d = document.createElement('div');
    d.className = 'badge';
    d.textContent = text;
    ui.badgesRow.appendChild(d);
  });
}

// ═══════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Expose pickCard globally for inline onclick
window.pickCard = pickCard;