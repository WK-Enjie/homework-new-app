/* =====================================================
   CARD QUEST — Defeat the Boss!
   v4.0 — Optimised: Streaks, Combos, XP, File Upload
   ===================================================== */
'use strict';

// ════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════
const BOSS_MAX_HP     = 200;
const PLAYER_MAX_HP   = 100;
const CARDS_PER_ROUND = 4;
const BONUS_HEAL_AMT  = 50;
const DEFAULT_TIME    = 30;
const DAMAGE_VALUES   = [10, 15, 20, 25];

// XP thresholds per level (cumulative)
const XP_PER_LEVEL    = 100;
const XP_CORRECT_BASE = 20;
const XP_STREAK_BONUS = 10;   // extra per streak milestone
const XP_SPEED_BONUS  = 15;   // if answered in first 1/3 of time

// Combo multipliers: streak → multiplier
const COMBO_TABLE = [
  { min: 1,  mult: 1,   label: '×1' },
  { min: 3,  mult: 1.5, label: '×1.5' },
  { min: 5,  mult: 2,   label: '×2' },
  { min: 8,  mult: 3,   label: '×3' },
  { min: 12, mult: 5,   label: '×5' },
];

const STREAK_FIRES = ['','🔥','🔥🔥','🔥🔥🔥','⚡🔥⚡','💥🔥💥'];

const BONUS_OUTCOMES = [
  { icon:'⚔️',  label:'BOSS HP\nHALVED!', color:'#ffd700', type:'boss_half',  result:'Boss takes massive damage — HP halved!'         },
  { icon:'💀',  label:'BOSS HEALS\n+50 HP!', color:'#ff3344', type:'boss_heal', result:`The boss recovers ${BONUS_HEAL_AMT} HP!`       },
  { icon:'💊',  label:'HERO HEALS\n+25 HP!', color:'#00ff88', type:'hero_heal', result:'Your hero recovers 25 HP!'                     },
  { icon:'⚡',  label:'DOUBLE\nDAMAGE!',    color:'#a855f7', type:'double_dmg', result:'Next correct answer deals DOUBLE damage!'      },
  { icon:'😐',  label:'NO\nCHANGE',         color:'#7a8599', type:'nothing',    result:'Nothing happens this round…'                   },
];

// ════════════════════════════════════════════════════
//  GAME STATE
// ════════════════════════════════════════════════════
let allQuestions      = [];
let questionPool      = [];
let currentRound      = 0;
let questionsAnswered = 0;
let bossHP            = BOSS_MAX_HP;
let playerHP          = PLAYER_MAX_HP;
let score             = 0;
let correctCount      = 0;
let totalAnswered     = 0;
let katexReady        = false;
let activeSlot        = -1;
let cardTimerInterval = null;
let roundCards        = [];
let gameActive        = false;
let bonusOutcomes     = [];

// Streak / Combo / XP
let currentStreak     = 0;
let bestStreak        = 0;
let totalXP           = 0;
let currentLevel      = 1;
let xpInLevel         = 0;
let comboMultiplier   = 1;
let doubleDmgActive   = false;

// Timer tracking for speed bonus
let questionStartTime = 0;
let currentTimeLimitMs = DEFAULT_TIME * 1000;

// Uploaded file state
let uploadedData      = null;
let activeTab         = 'code';   // 'code' | 'upload'

// ════════════════════════════════════════════════════
//  DOM REFS
// ════════════════════════════════════════════════════
let ui = {};

// ════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════
function init() {
  const g = id => document.getElementById(id);

  ui = {
    // Screens
    loginScreen:    g('login-screen'),
    battleScreen:   g('battle-screen'),
    endScreen:      g('end-screen'),

    // Login
    pinInput:       g('pin-input'),
    startBtn:       g('start-btn'),
    tryAgainBtn:    g('try-again-btn'),
    errorMsg:       g('error-msg'),
    tabCode:        g('tab-code'),
    tabUpload:      g('tab-upload'),
    panelCode:      g('panel-code'),
    panelUpload:    g('panel-upload'),
    dropZone:       g('drop-zone'),
    fileInput:      g('file-input'),
    fileStatus:     g('file-status'),

    // HUD
    scoreDisplay:   g('score-display'),
    roundNum:       g('round-num'),
    bossHPFill:     g('enemy-hp-fill'),
    playerHPFill:   g('player-hp-fill'),
    bossHPText:     g('enemy-hp-text'),
    playerHPText:   g('player-hp-text'),

    // Streak / Combo / XP
    streakCount:    g('streak-count'),
    streakFire:     g('streak-fire'),
    comboMult:      g('combo-mult'),
    xpBarFill:      g('xp-bar-fill'),
    xpText:         g('xp-text'),

    // Arena
    bossSprite:     g('boss-sprite'),
    playerSprite:   g('player-sprite'),
    bossRingFill:   g('boss-ring-fill'),
    particles:      g('particles'),
    damageNumber:   g('damage-number'),
    healDisplay:    g('heal-display'),
    effectDisplay:  g('effect-display'),
    streakDisplay:  g('streak-display'),
    explosion:      g('explosion'),

    // Status bar
    phaseLabel:     g('phase-label'),
    qAnsweredCount: g('q-answered-count'),

    // Card row
    cardRow:        g('card-row'),

    // Question panel
    questionPanel:  g('question-panel'),
    qpDmgBadge:     g('qp-dmg-badge'),
    qpTimerFill:    g('qp-timer-fill'),
    qpTimerText:    g('qp-timer-text'),
    qpQuestion:     g('qp-question'),
    qpOptions:      g('qp-options'),
    qpStreakBadge:  g('qp-streak-badge'),

    // Bonus panel
    bonusPanel:     g('bonus-panel'),
    bonusResult:    g('bonus-result'),

    // End screen
    finalScore:     g('final-score'),
    finalCorrect:   g('final-correct'),
    finalAccuracy:  g('final-accuracy'),
    finalRounds:    g('final-rounds'),
    finalBossHP:    g('final-boss-hp'),
    finalRank:      g('final-rank'),
    finalStreak:    g('final-streak'),
    finalCombo:     g('final-combo'),
    finalXP:        g('final-xp'),
    starRating:     g('star-rating'),
    badgesRow:      g('badges-row'),
    endIcon:        g('end-icon'),
    endTitle:       g('end-title'),
    endReason:      g('end-reason'),
  };

  // Critical element check
  const critical = ['login-screen','start-btn','pin-input','battle-screen','end-screen'];
  for (const id of critical) {
    if (!g(id)) {
      document.body.innerHTML =
        `<div style="color:#ff4444;font-family:monospace;padding:20px;
          font-size:1rem;background:#000;height:100vh;display:flex;
          align-items:center;justify-content:center;text-align:center">
          ⚠️ Missing element: #${id}<br><br>Check your index.html file.
        </div>`;
      return;
    }
  }

  // ── Event listeners ──
  ui.startBtn.addEventListener('click', attemptLogin);
  ui.pinInput.addEventListener('keypress', e => { if (e.key === 'Enter') attemptLogin(); });
  ui.tryAgainBtn.addEventListener('click', restartGame);

  // Tab switching
  ui.tabCode.addEventListener('click',   () => switchTab('code'));
  ui.tabUpload.addEventListener('click', () => switchTab('upload'));

  // File upload
  setupFileUpload();

  // Card slots
  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    const slot = g(`slot-${i}`);
    if (slot) slot.addEventListener('click', (function(idx){ return () => pickCard(idx); })(i));
  }

  // Bonus slots
  for (let i = 0; i < 3; i++) {
    const bs = g(`bslot-${i}`);
    if (bs) bs.addEventListener('click', (function(idx){ return () => pickBonusCard(idx); })(i));
  }

  fixVH();
  window.addEventListener('resize', fixVH);
  window.addEventListener('orientationchange', () => setTimeout(fixVH, 250));

  // Prevent double-tap zoom
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - (document._lt || 0) < 300) e.preventDefault();
    document._lt = now;
  }, { passive: false });

  console.log('✅ Card Quest v4.0 ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ════════════════════════════════════════════════════
//  VIEWPORT FIX
// ════════════════════════════════════════════════════
function fixVH() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

// ════════════════════════════════════════════════════
//  TAB SWITCHING
// ════════════════════════════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  ui.tabCode.classList.toggle('active',   tab === 'code');
  ui.tabUpload.classList.toggle('active', tab === 'upload');
  ui.panelCode.classList.toggle('hidden', tab !== 'code');
  ui.panelUpload.classList.toggle('hidden', tab !== 'upload');
}

// ════════════════════════════════════════════════════
//  FILE UPLOAD
// ════════════════════════════════════════════════════
function setupFileUpload() {
  if (!ui.dropZone || !ui.fileInput) return;

  // Click to browse
  ui.dropZone.addEventListener('click', () => ui.fileInput.click());

  // File selected via picker
  ui.fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFileLoad(file);
  });

  // Drag & drop
  ui.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    ui.dropZone.classList.add('drag-over');
  });
  ui.dropZone.addEventListener('dragleave', () => {
    ui.dropZone.classList.remove('drag-over');
  });
  ui.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    ui.dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileLoad(file);
  });
}

function handleFileLoad(file) {
  if (!file.name.endsWith('.json')) {
    setFileStatus('⚠️ Please upload a .json file', 'err');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data) || data.length === 0) {
        setFileStatus('⚠️ File must be a JSON array with questions', 'err');
        uploadedData = null;
        return;
      }
      uploadedData = data;
      setFileStatus(`✅ ${file.name} — ${data.length} questions loaded`, 'ok');
    } catch(err) {
      setFileStatus('⚠️ Invalid JSON file — check syntax', 'err');
      uploadedData = null;
    }
  };
  reader.readAsText(file);
}

function setFileStatus(msg, type) {
  if (!ui.fileStatus) return;
  ui.fileStatus.textContent = msg;
  ui.fileStatus.className   = type; // 'ok' or 'err'
  ui.fileStatus.classList.remove('hidden');
}

// ════════════════════════════════════════════════════
//  KATEX LOADER
// ════════════════════════════════════════════════════
function waitForKaTeX() {
  return new Promise(resolve => {
    if (typeof katex !== 'undefined' && typeof renderMathInElement === 'function') {
      katexReady = true; resolve(); return;
    }
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (typeof katex !== 'undefined' && typeof renderMathInElement === 'function') {
        clearInterval(t); katexReady = true; resolve();
      } else if (tries > 120) {
        clearInterval(t);
        console.warn('KaTeX unavailable — raw text mode');
        resolve();
      }
    }, 80);
  });
}

// ════════════════════════════════════════════════════
//  MATH PREPROCESSING
//  Converts teacher-friendly shorthand → KaTeX LaTeX
//
//  Fractions:      3/4      → \frac{3}{4}
//                  2 3/4    → 2\frac{3}{4}   mixed number
//  Powers:         x^2      → x^{2}
//                  10^-3    → 10^{-3}
//                  x^{2n+1} → kept as-is
//  Square roots:   sqrt(x)  → \sqrt{x}
//  Subscripts:     x_1      → x_{1}
//  Chemicals:      H2O CO2  → \text{H}_{2}\text{O}
//  Prices:         $5.00    → \$5.00
//  Greek letters:  alpha beta gamma delta pi theta lambda sigma
//  Operators:      >= <=    → \geq \leq
//                  !=       → \neq
//                  ->       → \rightarrow
// ════════════════════════════════════════════════════
function preprocessMath(raw) {
  if (!raw) return '';

  // 1. Protect existing $...$ and $$...$$ blocks
  const blocks = [];
  let s = raw.replace(
    /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g,
    m => { blocks.push(m); return `\x00B${blocks.length - 1}\x00`; }
  );

  // 2. Protect money amounts FIRST — $360, $4,000, $5,304.50, $1,200
  const moneyBlocks = [];
  s = s.replace(
    /\$[\d,]+(?:\.\d{1,2})?/g,
    m => {
      moneyBlocks.push(m);
      return `\x00M${moneyBlocks.length - 1}\x00`;
    }
  );

  // 3. Greek letters (standalone words)
  const greekMap = {
    alpha:'\\alpha', beta:'\\beta', gamma:'\\gamma', delta:'\\delta',
    epsilon:'\\epsilon', theta:'\\theta', lambda:'\\lambda',
    mu:'\\mu', pi:'\\pi', sigma:'\\sigma', omega:'\\omega',
    Alpha:'A', Beta:'B', Gamma:'\\Gamma', Delta:'\\Delta',
    Theta:'\\Theta', Lambda:'\\Lambda', Pi:'\\Pi',
    Sigma:'\\Sigma', Omega:'\\Omega',
  };
  s = s.replace(
    /\b(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|omega|Alpha|Beta|Gamma|Delta|Theta|Lambda|Pi|Sigma|Omega)\b/g,
    m => greekMap[m] ? `$${greekMap[m]}$` : m
  );

  // 4. Relational operators
  s = s.replace(/>=/g,  '$\\geq$');
  s = s.replace(/<=(?!>)/g, '$\\leq$');
  s = s.replace(/!=(?!=)/g, '$\\neq$');
  s = s.replace(/->/g,  '$\\rightarrow$');
  s = s.replace(/<->/g, '$\\leftrightarrow$');

  // 5. Chemical formulas — Capital letter + digits
  s = s.replace(/\b([A-Z][a-zA-Z0-9]{1,24})\b/g, match => {
    if (!/[A-Za-z]/.test(match) || !/\d/.test(match)) return match;
    const latex = match
      .replace(/([A-Za-z]+)(\d+)/g, (_, L, D) => `\\text{${L}}_{${D}}`)
      .replace(/^(\d+)([A-Za-z]+)/,  (_, D, L) => `${D}\\text{${L}}`);
    return `$${latex}$`;
  });

  // 6. Mixed numbers: "2 3/4" → $2\dfrac{3}{4}$
  s = s.replace(
    /(?<!\w)(\d+)\s+(\d+)\/(\d+)(?!\w)/g,
    (_, w, n, d) => `$${w}\\dfrac{${n}}{${d}}$`
  );

  // 7. Simple fractions: "3/4" → $\dfrac{3}{4}$
  s = s.replace(
    /(?<![:/\d])(\d+)\/(\d+)(?![/\d\w])/g,
    (_, n, d) => `$\\dfrac{${n}}{${d}}$`
  );

  // 8. Powers: x^2  10^-3  a^{n+1}
  s = s.replace(
    /(?<!\$)([a-zA-Z0-9]+)\^(\{[^}]+\}|-?\d+(?:\.\d+)?|[a-zA-Z])/g,
    (_, base, exp) => {
      const e = exp.startsWith('{') ? exp : `{${exp}}`;
      return `$${base}^${e}$`;
    }
  );

  // 9. Square roots: sqrt(x)
  s = s.replace(
    /sqrt\(([^)]+)\)/gi,
    (_, inner) => `$\\sqrt{${inner}}$`
  );

  // 10. Subscripts: x_1  a_n
  s = s.replace(
    /(?<!\$)([a-zA-Z])_(\{[^}]+\}|\d+|[a-zA-Z])(?!\w)/g,
    (_, base, sub) => {
      const sv = sub.startsWith('{') ? sub : `{${sub}}`;
      return `$${base}_{${sv}}$`;
    }
  );

  // 11. Merge adjacent $x$$y$ → $x\;y$
  s = s.replace(/\$([^$]+)\$\s*\$([^$]+)\$/g, '$$$1\\;$2$$$');

  // 12. Restore protected KaTeX blocks
  s = s.replace(/\x00B(\d+)\x00/g, (_, i) => blocks[+i]);

  // 13. Restore money amounts — kept as plain text
  s = s.replace(/\x00M(\d+)\x00/g, (_, i) => moneyBlocks[+i]);

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
    console.warn('KaTeX render error:', e.message);
  }
}

function setMath(el, rawText) {
  if (!el) return;
  if (!rawText && rawText !== 0) { el.textContent = ''; return; }
  el.textContent = preprocessMath(String(rawText));
  renderMathIn(el);
}

function normalise(s) {
  return s ? s.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

// ════════════════════════════════════════════════════
//  QUESTION RENDERER
//
//  Format A — Background + table + stem:
//  { "question":"...", "table":{headers,rows}, "stem":"...", options, answer, time }
//
//  Format B — Background + bullets + stem:
//  { "question":"Background:\n- item\n- item", "stem":"...", options, answer, time }
//
//  Format C — Plain (backward compatible):
//  { "question":"Full question text", options, answer, time }
// ════════════════════════════════════════════════════
function renderQuestion(container, qObj) {
  container.innerHTML = '';

  // ── Background / context text ──
  if (qObj.question) {
    const paragraphs = qObj.question.split(/\n\n+/);
    paragraphs.forEach(para => {
      const trimmed = para.trim();
      if (!trimmed) return;

      const lines     = trimmed.split('\n');
      const bullets   = lines.filter(l => l.trim().startsWith('-'));
      const nonBullets = lines.filter(l => l.trim() && !l.trim().startsWith('-'));

      if (bullets.length > 0) {
        nonBullets.forEach(line => {
          const p = document.createElement('p');
          p.className = 'q-background';
          setMath(p, line.trim());
          container.appendChild(p);
        });
        const ul = document.createElement('ul');
        ul.className = 'q-bullet-list';
        bullets.forEach(line => {
          const li = document.createElement('li');
          setMath(li, line.trim().slice(1).trim());
          ul.appendChild(li);
        });
        container.appendChild(ul);
      } else {
        const p = document.createElement('p');
        p.className = 'q-background';
        setMath(p, trimmed);
        container.appendChild(p);
      }
    });
  }

  // ── Data table ──
  if (qObj.table &&
      Array.isArray(qObj.table.headers) &&
      Array.isArray(qObj.table.rows) &&
      qObj.table.rows.length > 0) {

    const wrapper = document.createElement('div');
    wrapper.className = 'q-table-wrap';

    const table = document.createElement('table');
    table.className = 'q-table';

    // Header row
    const thead = document.createElement('thead');
    const hrow  = document.createElement('tr');
    qObj.table.headers.forEach(h => {
      const th = document.createElement('th');
      setMath(th, String(h));
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    // Data rows
    const tbody = document.createElement('tbody');
    qObj.table.rows.forEach((row, ri) => {
      const tr = document.createElement('tr');
      tr.className = ri % 2 === 0 ? 'row-even' : 'row-odd';
      row.forEach(cell => {
        const td = document.createElement('td');
        setMath(td, String(cell));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }

  // ── Question stem ──
  if (qObj.stem) {
    const stemEl = document.createElement('p');
    stemEl.className = 'q-stem';
    setMath(stemEl, qObj.stem);
    container.appendChild(stemEl);
  }
}

// ════════════════════════════════════════════════════
//  AUDIO ENGINE
// ════════════════════════════════════════════════════
let audioCtx;

function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {}
  }
}

function tone(freq, type, dur, vol = 0.14, delay = 0) {
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
  } catch(e) {}
}

function playSound(type) {
  if (!audioCtx) return;
  const sounds = {
    flip:       () => { tone(300,'sine',0.07,0.1); tone(520,'sine',0.07,0.08,0.06); },
    correct:    () => { [523,659,784].forEach((f,i) => tone(f,'sine',0.14,0.16,i*0.09)); },
    wrong:      () => { [280,160,90].forEach((f,i)  => tone(f,'sawtooth',0.2,0.12,i*0.14)); },
    hit:        () => { tone(160,'sine',0.2,0.2); tone(80,'sine',0.16,0.15,0.1); },
    boss_hurt:  () => { tone(200,'sawtooth',0.12,0.15); tone(120,'sawtooth',0.18,0.12,0.1); },
    bonus:      () => { [440,660,880].forEach((f,i) => tone(f,'triangle',0.14,0.16,i*0.1)); },
    boss_heal:  () => { [300,200,140].forEach((f,i) => tone(f,'sawtooth',0.3,0.12,i*0.14)); },
    hero_heal:  () => { [440,550,660].forEach((f,i) => tone(f,'sine',0.12,0.15,i*0.1)); },
    halved:     () => { [523,784,1047].forEach((f,i) => tone(f,'sine',0.18,0.16,i*0.1)); },
    double_dmg: () => { [660,880,1100].forEach((f,i) => tone(f,'triangle',0.15,0.16,i*0.08)); },
    timeout:    () => { tone(300,'sawtooth',0.38,0.14); },
    victory:    () => { [523,659,784,1047,1319].forEach((f,i) => tone(f,'sine',0.2,0.15,i*0.12)); },
    defeat:     () => { [350,280,200,120].forEach((f,i) => tone(f,'sawtooth',0.3,0.12,i*0.18)); },
    streak3:    () => { [440,660,880,1100].forEach((f,i) => tone(f,'sine',0.15,0.18,i*0.08)); },
    streak5:    () => { [523,784,1047,1319].forEach((f,i) => tone(f,'triangle',0.18,0.2,i*0.07)); },
    levelup:    () => { [392,494,587,784].forEach((f,i) => tone(f,'sine',0.2,0.2,i*0.1)); },
  };
  if (sounds[type]) sounds[type]();
}

// ════════════════════════════════════════════════════
//  SCREEN SWITCHER
// ════════════════════════════════════════════════════
function showScreen(name) {
  ui.loginScreen.classList.toggle( 'hidden', name !== 'login');
  ui.battleScreen.classList.toggle('hidden', name !== 'battle');
  ui.endScreen.classList.toggle(   'hidden', name !== 'end');
}

// ════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════
async function attemptLogin() {
  initAudio();
  ui.errorMsg.classList.add('hidden');
  ui.errorMsg.textContent = '';

  ui.startBtn.disabled    = true;
  ui.startBtn.textContent = '⏳ Loading…';

  try {
    await waitForKaTeX();

    // ── Upload tab ──
    if (activeTab === 'upload') {
      if (!uploadedData) {
        throw new Error('Please upload a .json question file first!');
      }
      allQuestions = uploadedData;
      startGame();
      return;
    }

    // ── Code tab ──
    const pin = ui.pinInput.value.trim();
    if (!pin) {
      throw new Error('Enter a Quest Code to begin.');
    }

    const res = await fetch(`worksheets/${pin}.json`);
    if (!res.ok) {
      throw new Error(
        `Quest "${pin}" not found!\n` +
        `Place worksheets/${pin}.json in your project folder.`
      );
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Quest file is empty or not a valid JSON array.');
    }

    allQuestions = data;
    startGame();

  } catch(err) {
    showError(err.message);
    ui.startBtn.disabled    = false;
    ui.startBtn.textContent = '⚔️ BEGIN QUEST';
  }
}

function showError(msg) {
  ui.errorMsg.textContent = msg;
  ui.errorMsg.classList.remove('hidden');
}

// ════════════════════════════════════════════════════
//  START GAME
// ════════════════════════════════════════════════════
function startGame() {
  // Reset all state
  bossHP            = BOSS_MAX_HP;
  playerHP          = PLAYER_MAX_HP;
  score             = 0;
  correctCount      = 0;
  totalAnswered     = 0;
  currentRound      = 0;
  questionsAnswered = 0;
  activeSlot        = -1;
  gameActive        = true;
  currentStreak     = 0;
  bestStreak        = 0;
  totalXP           = 0;
  currentLevel      = 1;
  xpInLevel         = 0;
  comboMultiplier   = 1;
  doubleDmgActive   = false;

  questionPool = shuffle([...allQuestions]);

  updateBars();
  updateStreakUI();
  ui.scoreDisplay.textContent = '0';
  ui.roundNum.textContent     = '1';
  ui.xpBarFill.style.width    = '0%';
  ui.xpText.textContent       = '0';

  showScreen('battle');
  setTimeout(startNewRound, 300);
}

// ════════════════════════════════════════════════════
//  RESTART
// ════════════════════════════════════════════════════
function restartGame() {
  clearCardTimer();
  gameActive = false;
  uploadedData = null;
  if (ui.fileStatus) { ui.fileStatus.classList.add('hidden'); ui.fileStatus.className = 'hidden'; }
  if (ui.fileInput)  { ui.fileInput.value = ''; }
  ui.startBtn.disabled    = false;
  ui.startBtn.textContent = '⚔️ BEGIN QUEST';
  showScreen('login');
}

// ════════════════════════════════════════════════════
//  STREAK & COMBO SYSTEM
// ════════════════════════════════════════════════════
function getComboData(streak) {
  let best = COMBO_TABLE[0];
  for (const c of COMBO_TABLE) {
    if (streak >= c.min) best = c;
  }
  return best;
}

function onCorrectStreak() {
  currentStreak++;
  if (currentStreak > bestStreak) bestStreak = currentStreak;

  const combo = getComboData(currentStreak);
  comboMultiplier = combo.mult;

  // Animate streak counter
  ui.streakCount.textContent = currentStreak;
  ui.streakCount.classList.remove('pop');
  void ui.streakCount.offsetWidth;
  ui.streakCount.classList.add('pop');

  // Fire emoji
  const fireIdx = Math.min(currentStreak, STREAK_FIRES.length - 1);
  ui.streakFire.textContent = STREAK_FIRES[fireIdx];

  // Combo display
  ui.comboMult.textContent = combo.label;
  if (combo.mult > 1) {
    ui.comboMult.classList.remove('combo-up');
    void ui.comboMult.offsetWidth;
    ui.comboMult.classList.add('combo-up');
  }

  // Streak milestone sounds & displays
  if (currentStreak === 3) {
    playSound('streak3');
    showStreakDisplay('🔥 3 STREAK!', '#ff6b00');
  } else if (currentStreak === 5) {
    playSound('streak5');
    showStreakDisplay('⚡ 5 STREAK!', '#a855f7');
  } else if (currentStreak >= 8 && currentStreak % 4 === 0) {
    playSound('streak5');
    showStreakDisplay(`💥 ${currentStreak} STREAK!!`, '#ffd700');
  }

  // Update streak badge in question panel
  if (currentStreak >= 3) {
    ui.qpStreakBadge.textContent = `🔥×${currentStreak}`;
    ui.qpStreakBadge.classList.remove('hidden');
  }
}

function onWrongStreak() {
  currentStreak    = 0;
  comboMultiplier  = 1;

  ui.streakCount.textContent = '0';
  ui.streakFire.textContent  = '';
  ui.comboMult.textContent   = '×1';
  ui.qpStreakBadge.classList.add('hidden');
}

function updateStreakUI() {
  ui.streakCount.textContent = currentStreak;
  ui.comboMult.textContent   = getComboData(currentStreak).label;
  const fi = Math.min(currentStreak, STREAK_FIRES.length - 1);
  ui.streakFire.textContent  = currentStreak > 0 ? STREAK_FIRES[fi] : '';
}

// ════════════════════════════════════════════════════
//  XP SYSTEM
// ════════════════════════════════════════════════════
function awardXP(baseXP) {
  const oldLevel = currentLevel;
  totalXP  += baseXP;
  xpInLevel += baseXP;

  // Level up check
  while (xpInLevel >= XP_PER_LEVEL) {
    xpInLevel  -= XP_PER_LEVEL;
    currentLevel++;
  }

  // Update XP bar
  const pct = (xpInLevel / XP_PER_LEVEL) * 100;
  ui.xpBarFill.style.width = `${pct}%`;
  ui.xpText.textContent    = totalXP;

  // Level up effect
  if (currentLevel > oldLevel) {
    playSound('levelup');
    showEffect(`⬆️ LEVEL ${currentLevel}!`, '#00d4ff');
    spawnParticles('center', '#00d4ff', 15);
  }
}

// ════════════════════════════════════════════════════
//  ROUND MANAGEMENT
// ════════════════════════════════════════════════════
function startNewRound() {
  if (!gameActive) return;
  if (questionPool.length === 0) { endGame('out_of_questions'); return; }

  currentRound++;
  activeSlot = -1;

  ui.roundNum.textContent       = currentRound;
  ui.qAnsweredCount.textContent = '0';
  ui.phaseLabel.textContent     = 'PICK A CARD';

  ui.cardRow.style.display = '';
  ui.questionPanel.classList.add('hidden');
  ui.bonusPanel.classList.add('hidden');
  ui.qpStreakBadge.classList.add('hidden');

  // Update boss rage mode
  const bPct = (bossHP / BOSS_MAX_HP) * 100;
  const arena = document.getElementById('arena');
  if (arena) arena.classList.toggle('boss-rage', bPct <= 25);
  if (ui.bossSprite) ui.bossSprite.classList.toggle('boss-rage-anim', bPct <= 25);

  // Deal cards
  const dmgs = shuffle([...DAMAGE_VALUES]);
  roundCards = [];

  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    if (questionPool.length === 0) break;
    roundCards.push({
      question: questionPool.shift(),
      damage:   dmgs[i] || 10,
      answered: false,
    });
  }

  if (roundCards.length === 0) { endGame('out_of_questions'); return; }

  // Reset slots with flip-in animation
  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    const slot  = document.getElementById(`slot-${i}`);
    const dmgEl = document.getElementById(`slot-dmg-${i}`);
    if (!slot) continue;

    slot.className = 'card-slot';
    // Re-attach listener
    slot.onclick = null;
    slot.addEventListener('click', (function(idx){ return () => pickCard(idx); })(i));

    const icon = slot.querySelector('.slot-icon');
    if (icon)  icon.textContent = '🎴';
    if (dmgEl) dmgEl.textContent = '';

    if (i >= roundCards.length) {
      slot.classList.add('used');
      continue;
    }

    // Staggered flip-in
    slot.style.opacity = '0';
    setTimeout(() => {
      slot.style.opacity = '';
      slot.classList.add('flip-in');
      setTimeout(() => slot.classList.remove('flip-in'), 500);
    }, i * 90 + 40);
  }
}

// ════════════════════════════════════════════════════
//  PICK CARD
// ════════════════════════════════════════════════════
function pickCard(index) {
  if (!gameActive) return;
  if (index >= roundCards.length) return;
  if (activeSlot !== -1) return;
  if (roundCards[index].answered) return;

  const slot = document.getElementById(`slot-${index}`);
  if (!slot) return;
  if (slot.classList.contains('used') || slot.classList.contains('disabled')) return;

  activeSlot = index;
  const { question, damage } = roundCards[index];

  // Disable all slots
  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    const s = document.getElementById(`slot-${i}`);
    if (s) { s.classList.add('disabled'); s.onclick = null; }
  }

  // Highlight selected
  slot.classList.remove('disabled');
  slot.classList.add('selected');

  const icon = slot.querySelector('.slot-icon');
  if (icon) icon.textContent = '❓';

  const dmgEl = document.getElementById(`slot-dmg-${index}`);
  const effectiveDmg = doubleDmgActive ? damage * 2 : damage;
  if (dmgEl) dmgEl.textContent = doubleDmgActive ? `⚡${effectiveDmg}` : `⚔️${damage}`;

  playSound('flip');

  // Populate question panel
  const dmgLabel = doubleDmgActive
    ? `⚡ ${effectiveDmg} DAMAGE (×2!)`
    : `⚔️ ${damage} DAMAGE`;
  ui.qpDmgBadge.textContent = dmgLabel;
  if (doubleDmgActive) {
    ui.qpDmgBadge.style.background = 'linear-gradient(135deg,#6600cc,#a855f7)';
  } else {
    ui.qpDmgBadge.style.background = '';
  }

  // Show streak badge if active
  if (currentStreak >= 3) {
    ui.qpStreakBadge.textContent = `🔥×${currentStreak}`;
    ui.qpStreakBadge.classList.remove('hidden');
  }

  renderQuestion(ui.qpQuestion, question);

  // Build answer options with letter labels
  ui.qpOptions.innerHTML = '';
  const opts      = shuffle([...(question.options || [])]);
  const answerRaw = (question.answer || '').trim();
  const letters   = ['A','B','C','D','E'];

  opts.forEach((opt, idx) => {
    const raw = (opt || '').trim();
    const btn = document.createElement('button');
    btn.className   = 'qp-opt';
    btn.dataset.raw = raw;

    // Letter badge
    const letterSpan = document.createElement('span');
    letterSpan.className   = 'opt-letter';
    letterSpan.textContent = letters[idx] || '';
    btn.appendChild(letterSpan);

    // Math content
    const contentSpan = document.createElement('span');
    contentSpan.style.paddingLeft = '22px';
    setMath(contentSpan, raw);
    btn.appendChild(contentSpan);

    btn.addEventListener('click', () =>
      handleAnswer(btn, raw, answerRaw, damage, index)
    );
    ui.qpOptions.appendChild(btn);
  });

  ui.questionPanel.classList.remove('hidden');

  // Timer
  currentTimeLimitMs = ((question.time && question.time > 0) ? question.time : DEFAULT_TIME) * 1000;
  questionStartTime  = Date.now();

  setTimeout(() => {
    startCardTimer(
      currentTimeLimitMs / 1000,
      () => handleTimeout(answerRaw, damage, index)
    );
  }, 250);
}

// ════════════════════════════════════════════════════
//  CARD TIMER
// ════════════════════════════════════════════════════
function startCardTimer(seconds, onTimeout) {
  clearCardTimer();
  const start   = Date.now();
  const limitMs = seconds * 1000;

  ui.qpTimerFill.style.width      = '100%';
  ui.qpTimerFill.style.background = 'var(--hp-green)';
  ui.qpTimerFill.classList.remove('urgent');
  ui.qpTimerText.textContent      = `${seconds}s`;

  cardTimerInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct     = Math.max(0, 100 - (elapsed / limitMs * 100));
    const secLeft = Math.ceil((limitMs - elapsed) / 1000);

    ui.qpTimerFill.style.width     = `${pct}%`;
    ui.qpTimerText.textContent     = `${Math.max(0, secLeft)}s`;

    if (pct < 20) {
      ui.qpTimerFill.style.background = 'var(--hp-red)';
      ui.qpTimerFill.classList.add('urgent');
    } else if (pct < 50) {
      ui.qpTimerFill.style.background = '#ff8800';
      ui.qpTimerFill.classList.remove('urgent');
    } else {
      ui.qpTimerFill.style.background = 'var(--hp-green)';
      ui.qpTimerFill.classList.remove('urgent');
    }

    if (pct <= 0) { clearCardTimer(); onTimeout(); }
  }, 80);
}

function clearCardTimer() {
  if (cardTimerInterval) {
    clearInterval(cardTimerInterval);
    cardTimerInterval = null;
  }
  if (ui.qpTimerFill) ui.qpTimerFill.classList.remove('urgent');
}

// ════════════════════════════════════════════════════
//  ANSWER HANDLING
// ════════════════════════════════════════════════════
function handleAnswer(btn, selected, correct, damage, slotIdx) {
  clearCardTimer();
  disableOptions();

  totalAnswered++;
  questionsAnswered++;
  roundCards[slotIdx].answered = true;
  ui.qAnsweredCount.textContent = roundCards.filter(c => c.answered).length;

  const isCorrect = normalise(selected) === normalise(correct);

  // Speed bonus check (answered in first third of time)
  const elapsed       = Date.now() - questionStartTime;
  const isSpeedAnswer = isCorrect && elapsed < (currentTimeLimitMs / 3);

  if (isCorrect) {
    btn.classList.add('correct');
    correctCount++;

    // Calculate score with combo
    const effectiveDmg = doubleDmgActive ? damage * 2 : damage;
    const basePoints   = effectiveDmg * 10;
    const comboPoints  = Math.round(basePoints * comboMultiplier);
    const speedBonus   = isSpeedAnswer ? XP_SPEED_BONUS * 10 : 0;
    const totalPoints  = comboPoints + speedBonus;

    score += totalPoints;
    animateScore();

    // XP
    let xpGain = XP_CORRECT_BASE;
    if (currentStreak >= 3) xpGain += XP_STREAK_BONUS;
    if (isSpeedAnswer)      xpGain += XP_SPEED_BONUS;
    awardXP(xpGain);

    playSound('correct');
    markSlot(slotIdx, 'correct');
    spawnBurstRing(slotIdx);

    // Speed bonus display
    if (isSpeedAnswer) showEffect('⚡ FAST! +BONUS', '#00d4ff');

    // Streak
    onCorrectStreak();
    doubleDmgActive = false;

    setTimeout(() => doBossHit(effectiveDmg, afterAnswer), 350);

  } else {
    btn.classList.add('wrong');
    playSound('wrong');

    // Reveal correct
    ui.qpOptions.querySelectorAll('.qp-opt').forEach(b => {
      if (normalise(b.dataset.raw) === normalise(correct))
        b.classList.add('correct');
    });

    markSlot(slotIdx, 'wrong');
    onWrongStreak();

    setTimeout(() => doPlayerHit(damage, afterAnswer), 350);
  }
}

function handleTimeout(correct, damage, slotIdx) {
  if (!gameActive) return;
  clearCardTimer();
  disableOptions();

  ui.qpOptions.querySelectorAll('.qp-opt').forEach(b => {
    if (normalise(b.dataset.raw) === normalise(correct))
      b.classList.add('correct');
  });

  totalAnswered++;
  questionsAnswered++;
  roundCards[slotIdx].answered = true;
  ui.qAnsweredCount.textContent = roundCards.filter(c => c.answered).length;

  playSound('timeout');
  showEffect('⏰ TIME UP!', '#ff3344');
  markSlot(slotIdx, 'timeout');
  onWrongStreak();

  setTimeout(() => doPlayerHit(damage, afterAnswer), 700);
}

function disableOptions() {
  if (!ui.qpOptions) return;
  ui.qpOptions.querySelectorAll('.qp-opt').forEach(b => {
    b.disabled = true; b.onclick = null;
  });
}

function markSlot(idx, result) {
  const slot = document.getElementById(`slot-${idx}`);
  if (!slot) return;
  slot.classList.remove('selected');
  const icon = slot.querySelector('.slot-icon');
  if (result === 'correct') {
    slot.classList.add('correct-card');
    if (icon) icon.textContent = '✅';
  } else {
    slot.classList.add('wrong-card');
    if (icon) icon.textContent = result === 'timeout' ? '⏰' : '❌';
  }
}

// ════════════════════════════════════════════════════
//  AFTER ANSWER
// ════════════════════════════════════════════════════
function afterAnswer() {
  if (!gameActive) return;
  if (bossHP   <= 0) { endGame('victory'); return; }
  if (playerHP <= 0) { endGame('defeat');  return; }

  activeSlot = -1;

  setTimeout(() => {
    ui.questionPanel.classList.add('hidden');

    // Recycle unanswered questions
    roundCards.forEach((rc, i) => {
      if (!rc.answered) {
        questionPool.push(rc.question);
        const slot = document.getElementById(`slot-${i}`);
        if (slot) slot.classList.add('used');
      }
    });
    questionPool = shuffle(questionPool);

    if (questionsAnswered % CARDS_PER_ROUND === 0) {
      setTimeout(startBonusRound, 400);
    } else {
      setTimeout(startNewRound, 400);
    }
  }, 1500);
}

// ════════════════════════════════════════════════════
//  BONUS ROUND
// ════════════════════════════════════════════════════
function startBonusRound() {
  if (!gameActive) return;

  ui.cardRow.style.display = 'none';
  ui.questionPanel.classList.add('hidden');
  ui.bonusPanel.classList.remove('hidden');
  ui.bonusResult.classList.add('hidden');
  ui.phaseLabel.textContent = '✨ BONUS ROUND!';

  playSound('bonus');
  spawnParticles('center', '#ffd700', 22);

  bonusOutcomes = shuffle([...BONUS_OUTCOMES]);

  for (let i = 0; i < 3; i++) {
    const bs = document.getElementById(`bslot-${i}`);
    if (!bs) continue;

    bs.className = 'bonus-slot';
    bs.onclick   = null;
    bs.addEventListener('click', (function(idx){ return () => pickBonusCard(idx); })(i));

    const icon  = bs.querySelector('.bslot-icon');
    const label = bs.querySelector('.bslot-label');
    if (icon)  { icon.textContent  = '✨'; icon.style.fontSize = ''; }
    if (label) { label.textContent = '?';  label.style.color   = ''; }

    // Staggered entrance
    bs.style.opacity = '0';
    bs.style.transform = 'translateY(18px) scale(0.92)';
    bs.style.transition = 'none';
    setTimeout(() => {
      bs.style.transition =
        'opacity 0.35s ease, transform 0.38s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s, border-color 0.2s';
      bs.style.opacity   = '';
      bs.style.transform = '';
    }, i * 100 + 60);
  }
}

function pickBonusCard(index) {
  if (!gameActive) return;

  const bs = document.getElementById(`bslot-${index}`);
  if (!bs) return;
  if (bs.classList.contains('revealed') || bs.classList.contains('disabled')) return;

  // Lock all bonus slots
  for (let i = 0; i < 3; i++) {
    const b = document.getElementById(`bslot-${i}`);
    if (b) { b.classList.add('disabled'); b.onclick = null; }
  }

  const outcome = bonusOutcomes[index];
  playSound('flip');

  // Reveal chosen
  const icon  = bs.querySelector('.bslot-icon');
  const label = bs.querySelector('.bslot-label');
  if (icon)  icon.textContent    = outcome.icon;
  if (label) { label.textContent = outcome.label; label.style.color = outcome.color; }
  bs.classList.remove('disabled');
  bs.classList.add('revealed');

  setTimeout(() => {
    applyBonusOutcome(outcome);
    ui.bonusResult.textContent = outcome.result;
    ui.bonusResult.style.color = outcome.color;
    ui.bonusResult.classList.remove('hidden');

    // Reveal other cards
    setTimeout(() => {
      for (let i = 0; i < 3; i++) {
        if (i === index) continue;
        const b  = document.getElementById(`bslot-${i}`);
        const oc = bonusOutcomes[i];
        if (!b || !oc) continue;
        const ic = b.querySelector('.bslot-icon');
        const lb = b.querySelector('.bslot-label');
        if (ic) ic.textContent = oc.icon;
        if (lb) { lb.textContent = oc.label; lb.style.color = oc.color; }
        b.classList.remove('disabled');
        b.classList.add('revealed');
        b.style.opacity = '0.42';
      }
      setTimeout(() => {
        ui.bonusPanel.classList.add('hidden');
        ui.cardRow.style.display = '';
        startNewRound();
      }, 2200);
    }, 700);
  }, 650);
}

function applyBonusOutcome(outcome) {
  switch(outcome.type) {
    case 'boss_half':
      bossHP = Math.max(1, Math.floor(bossHP / 2));
      updateBars();
      playSound('halved');
      showEffect('⚔️ BOSS HP HALVED!', '#ffd700');
      spawnParticles('left', '#ffd700', 20);
      flashArena('rgba(255,215,0,0.18)');
      bossHitVisual();
      break;

    case 'boss_heal':
      bossHP = Math.min(BOSS_MAX_HP, bossHP + BONUS_HEAL_AMT);
      updateBars();
      playSound('boss_heal');
      showEffect(`💀 BOSS +${BONUS_HEAL_AMT} HP!`, '#ff3344');
      spawnParticles('left', '#ff3344', 14);
      break;

    case 'hero_heal':
      playerHP = Math.min(PLAYER_MAX_HP, playerHP + 25);
      updateBars();
      playSound('hero_heal');
      showEffect('💊 HERO +25 HP!', '#00ff88');
      spawnParticles('right', '#00ff88', 14);
      showHealFloat('+25');
      break;

    case 'double_dmg':
      doubleDmgActive = true;
      playSound('double_dmg');
      showEffect('⚡ DOUBLE DAMAGE READY!', '#a855f7');
      spawnParticles('center', '#a855f7', 18);
      flashArena('rgba(168,85,247,0.2)');
      break;

    case 'nothing':
      showEffect('😐 Nothing happens…', '#7a8599');
      break;
  }
}

// ════════════════════════════════════════════════════
//  COMBAT ANIMATIONS
// ════════════════════════════════════════════════════
function doBossHit(damage, cb) {
  playSound('boss_hurt');
  showDamageNum(`−${damage}`, '#ff5544');
  bossHitVisual();
  bossHP = Math.max(0, bossHP - damage);
  updateBars();
  showExplosion('left');
  spawnParticles('left', '#ff8800', 12);
  flashArena('rgba(255,34,0,0.15)');
  setTimeout(() => {
    ui.bossSprite.classList.remove('anim-boss-hit');
    cb && cb();
  }, 720);
}

function bossHitVisual() {
  ui.bossSprite.classList.remove('anim-boss-hit');
  void ui.bossSprite.offsetWidth;
  ui.bossSprite.classList.add('anim-boss-hit');
}

function doPlayerHit(damage, cb) {
  playSound('hit');
  showDamageNum(`−${damage}`, '#ff3344');
  ui.playerSprite.classList.remove('anim-player-hit');
  void ui.playerSprite.offsetWidth;
  ui.playerSprite.classList.add('anim-player-hit');
  showExplosion('right');
  spawnParticles('right', '#ff3344', 12);

  const gc = document.getElementById('game-container');
  if (gc) {
    // Scale shake with damage
    const intensity = damage >= 20 ? 2 : 1;
    for (let k = 0; k < intensity; k++) {
      setTimeout(() => {
        gc.classList.add('anim-shake');
        setTimeout(() => gc.classList.remove('anim-shake'), 550);
      }, k * 100);
    }
  }

  playerHP = Math.max(0, playerHP - damage);
  updateBars();
  setTimeout(() => {
    ui.playerSprite.classList.remove('anim-player-hit');
    cb && cb();
  }, 720);
}

// ════════════════════════════════════════════════════
//  VISUAL EFFECTS
// ════════════════════════════════════════════════════
function showDamageNum(text, color) {
  ui.damageNumber.textContent = text;
  ui.damageNumber.style.color = color;
  ui.damageNumber.classList.remove('hidden', 'anim-float-up');
  void ui.damageNumber.offsetWidth;
  ui.damageNumber.classList.add('anim-float-up');
  ui.damageNumber.classList.remove('hidden');
  setTimeout(() => {
    ui.damageNumber.classList.add('hidden');
    ui.damageNumber.classList.remove('anim-float-up');
  }, 1400);
}

function showEffect(text, color = '#ffd700') {
  ui.effectDisplay.textContent = text;
  ui.effectDisplay.style.color = color;
  ui.effectDisplay.classList.remove('hidden', 'anim-float-up');
  void ui.effectDisplay.offsetWidth;
  ui.effectDisplay.classList.add('anim-float-up');
  ui.effectDisplay.classList.remove('hidden');
  setTimeout(() => {
    ui.effectDisplay.classList.add('hidden');
    ui.effectDisplay.classList.remove('anim-float-up');
  }, 1500);
}

function showStreakDisplay(text, color) {
  ui.streakDisplay.textContent = text;
  ui.streakDisplay.style.color = color;
  ui.streakDisplay.classList.remove('hidden', 'anim-float-up');
  void ui.streakDisplay.offsetWidth;
  ui.streakDisplay.classList.add('anim-float-up');
  ui.streakDisplay.classList.remove('hidden');
  setTimeout(() => {
    ui.streakDisplay.classList.add('hidden');
    ui.streakDisplay.classList.remove('anim-float-up');
  }, 1600);
}

function showHealFloat(text) {
  if (!ui.healDisplay) return;
  ui.healDisplay.textContent = `+${text} HP`;
  ui.healDisplay.classList.remove('hidden', 'anim-float-up');
  void ui.healDisplay.offsetWidth;
  ui.healDisplay.classList.add('anim-float-up');
  ui.healDisplay.classList.remove('hidden');
  setTimeout(() => {
    ui.healDisplay.classList.add('hidden');
    ui.healDisplay.classList.remove('anim-float-up');
  }, 1400);
}

function showExplosion(side) {
  ui.explosion.style.left = side === 'left' ? '22%' : '65%';
  ui.explosion.style.top  = '25%';
  ui.explosion.classList.remove('hidden');
  setTimeout(() => ui.explosion.classList.add('hidden'), 450);
}

function spawnParticles(side, color, count = 8) {
  if (!ui.particles) return;
  const cx = side === 'left' ? 26 : side === 'right' ? 70 : 50;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const sz = 3 + Math.random() * 7;
    p.style.cssText =
      `width:${sz}px;height:${sz}px;` +
      `left:${cx}%;top:${22 + Math.random() * 35}%;` +
      `background:${color};box-shadow:0 0 ${sz}px ${color};`;
    p.style.setProperty('--px', `${(Math.random() - 0.5) * 160}px`);
    p.style.setProperty('--py', `${(Math.random() - 0.5) * 160}px`);
    ui.particles.appendChild(p);
    setTimeout(() => p.remove(), 750);
  }
}

function flashArena(color) {
  const arena = document.getElementById('arena');
  if (!arena) return;
  const f = document.createElement('div');
  f.className        = 'flash-overlay';
  f.style.background = color || 'rgba(255,255,255,0.3)';
  arena.appendChild(f);
  setTimeout(() => f.remove(), 380);
}

function spawnBurstRing(slotIdx) {
  const slot = document.getElementById(`slot-${slotIdx}`);
  if (!slot) return;
  const ring = document.createElement('div');
  ring.className = 'burst-ring';
  slot.appendChild(ring);
  setTimeout(() => ring.remove(), 650);
}

function animateScore() {
  ui.scoreDisplay.textContent = score;
  ui.scoreDisplay.classList.remove('score-pop');
  void ui.scoreDisplay.offsetWidth;
  ui.scoreDisplay.classList.add('score-pop');
  setTimeout(() => ui.scoreDisplay.classList.remove('score-pop'), 400);
}

// ════════════════════════════════════════════════════
//  HP BARS & BOSS RING
// ════════════════════════════════════════════════════
function updateBars() {
  const bPct = Math.max(0, bossHP)   / BOSS_MAX_HP   * 100;
  const pPct = Math.max(0, playerHP) / PLAYER_MAX_HP * 100;

  ui.bossHPFill.style.width   = `${bPct}%`;
  ui.playerHPFill.style.width = `${pPct}%`;

  if (ui.bossHPText)   ui.bossHPText.textContent   = Math.ceil(Math.max(0, bossHP));
  if (ui.playerHPText) ui.playerHPText.textContent = Math.ceil(Math.max(0, playerHP));

  // SVG ring circumference r=34 → 2π×34 ≈ 213.6
  if (ui.bossRingFill) {
    const circ = 213.6;
    ui.bossRingFill.style.strokeDashoffset = circ * (1 - bPct / 100);
    ui.bossRingFill.style.stroke =
      bPct < 25 ? '#880000' :
      bPct < 50 ? '#cc4400' : '#ff3344';
  }

  // Player bar colour
  ui.playerHPFill.style.background =
    pPct < 25 ? 'linear-gradient(90deg,#880000,var(--hp-red))' :
    pPct < 50 ? 'linear-gradient(90deg,#994400,#ff8800)' :
                'linear-gradient(90deg,#1d4ed8,var(--cyan))';

  // Boss sprite stages
  const sprite =
    bPct > 75 ? '👹'    :
    bPct > 50 ? '😤👹' :
    bPct > 25 ? '🔥👹' :
    bPct > 0  ? '💢👹' : '💀';
  if (ui.bossSprite && ui.bossSprite.textContent !== sprite)
    ui.bossSprite.textContent = sprite;
}

// ════════════════════════════════════════════════════
//  END GAME
// ════════════════════════════════════════════════════
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
    ui.finalBossHP.textContent   = Math.max(0, Math.ceil(bossHP));
    ui.finalStreak.textContent   = bestStreak;
    ui.finalCombo.textContent    = getComboData(bestStreak).label;
    ui.finalXP.textContent       = totalXP;

    const rank = calcRank(acc, result);
    ui.finalRank.textContent = rank.label;
    ui.finalRank.style.color = rank.color;

    if (result === 'victory') {
      ui.endIcon.textContent  = '🏆';
      ui.endTitle.textContent = 'BOSS DEFEATED!';
      ui.endTitle.style.color = 'var(--gold)';
      ui.endReason.textContent = 'Your knowledge destroyed the boss! Champion! ⚔️✨';
    } else if (result === 'defeat') {
      ui.endIcon.textContent  = '💀';
      ui.endTitle.textContent = 'QUEST FAILED';
      ui.endTitle.style.color = 'var(--hp-red)';
      ui.endReason.textContent = 'The boss was too strong this time. Study hard and try again! 💪';
    } else {
      ui.endIcon.textContent  = '📚';
      ui.endTitle.textContent = 'QUESTIONS DONE';
      ui.endTitle.style.color = '#94a3b8';
      ui.endReason.textContent =
        `All questions used! Boss survived with ${Math.ceil(bossHP)} HP. Add more questions! 🐲`;
    }

    ui.starRating.textContent = buildStars(acc, result);
    buildBadges(acc, result);

  }, 700);
}

function calcRank(acc, result) {
  if (result === 'victory' && acc === 100) return { label:'S+', color:'#ffd700' };
  if (result === 'victory' && acc >= 80)   return { label:'S',  color:'#ffd700' };
  if (acc >= 80) return { label:'A', color:'#22c55e' };
  if (acc >= 65) return { label:'B', color:'#00d4ff' };
  if (acc >= 50) return { label:'C', color:'#94a3b8' };
  return           { label:'D', color:'#ef4444' };
}

function buildStars(acc, result) {
  const n = result === 'victory'
    ? (acc === 100 ? 3 : acc >= 70 ? 2 : 1)
    : acc >= 60 ? 1 : 0;
  return '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

function buildBadges(acc, result) {
  ui.badgesRow.innerHTML = '';
  const badges = [];
  if (result === 'victory')          badges.push('💀 Boss Slayer');
  if (acc === 100)                   badges.push('🎯 Perfect Score');
  if (acc >= 80)                     badges.push('🌟 High Achiever');
  if (result === 'victory' && currentRound <= 10) badges.push('⚡ Speed Runner');
  if (playerHP >= 80)                badges.push('🛡️ Untouchable');
  if (correctCount >= 10)            badges.push('🧠 Knowledge Master');
  if (bestStreak >= 5)               badges.push('🔥 Streak Master');
  if (bestStreak >= 10)              badges.push('💥 Unstoppable');
  if (totalXP >= 200)                badges.push('⭐ XP Hunter');
  if (doubleDmgActive === false && result === 'victory') {} // used it well
  if (badges.length === 0)           badges.push('📚 Keep Studying!');

  badges.forEach(text => {
    const d = document.createElement('div');
    d.className   = 'badge';
    d.textContent = text;
    ui.badgesRow.appendChild(d);
  });
}

// ════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}