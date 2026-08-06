/* =====================================================
   CARD QUEST — script.js  v7.1
   FIXES:
     • Chemical formulas in question/stem text now render
       with proper subscripts in ALL contexts (prose + math)
     • Diatomic molecules (Cl2, H2, O2 etc.) whitelisted
     • Leading coefficients (2Na, 4Fe) handled correctly
     • Two-pass formula extraction: parenthesised groups
       first, then standard formulas
     • All previous v7.0 fixes retained
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

const XP_PER_LEVEL    = 100;
const XP_CORRECT_BASE = 20;
const XP_STREAK_BONUS = 10;
const XP_SPEED_BONUS  = 15;

const COMBO_TABLE = [
  { min:1,  mult:1,   label:'×1'   },
  { min:3,  mult:1.5, label:'×1.5' },
  { min:5,  mult:2,   label:'×2'   },
  { min:8,  mult:3,   label:'×3'   },
  { min:12, mult:5,   label:'×5'   },
];

const STREAK_FIRES = ['','🔥','🔥🔥','🔥🔥🔥','⚡🔥⚡','💥🔥💥'];

const BONUS_OUTCOMES = [
  { icon:'⚔️', label:'BOSS HP\nHALVED!',   color:'#ffd700',
    type:'boss_half',  result:'Boss takes massive damage — HP halved!'   },
  { icon:'💀', label:'BOSS HEALS\n+50 HP!', color:'#ff3344',
    type:'boss_heal',  result:'The boss recovers 50 HP!'                 },
  { icon:'💊', label:'HERO HEALS\n+25 HP!', color:'#00ff88',
    type:'hero_heal',  result:'Your hero recovers 25 HP!'                },
  { icon:'⚡', label:'DOUBLE\nDAMAGE!',     color:'#a855f7',
    type:'double_dmg', result:'Next correct answer deals DOUBLE damage!' },
  { icon:'😐', label:'NO\nCHANGE',          color:'#7a8599',
    type:'nothing',    result:'Nothing happens this round…'              },
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

let currentStreak   = 0;
let bestStreak      = 0;
let totalXP         = 0;
let currentLevel    = 1;
let xpInLevel       = 0;
let comboMultiplier = 1;
let doubleDmgActive = false;

let questionStartTime  = 0;
let currentTimeLimitMs = DEFAULT_TIME * 1000;

let uploadedData = null;
let activeTab    = 'code';

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
    loginScreen:    g('login-screen'),
    battleScreen:   g('battle-screen'),
    endScreen:      g('end-screen'),
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
    scoreDisplay:   g('score-display'),
    roundNum:       g('round-num'),
    bossHPFill:     g('enemy-hp-fill'),
    playerHPFill:   g('player-hp-fill'),
    bossHPText:     g('enemy-hp-text'),
    playerHPText:   g('player-hp-text'),
    streakCount:    g('streak-count'),
    streakFire:     g('streak-fire'),
    comboMult:      g('combo-mult'),
    xpBarFill:      g('xp-bar-fill'),
    xpText:         g('xp-text'),
    bossSprite:     g('boss-sprite'),
    playerSprite:   g('player-sprite'),
    bossRingFill:   g('boss-ring-fill'),
    particles:      g('particles'),
    damageNumber:   g('damage-number'),
    healDisplay:    g('heal-display'),
    effectDisplay:  g('effect-display'),
    streakDisplay:  g('streak-display'),
    explosion:      g('explosion'),
    phaseLabel:     g('phase-label'),
    qAnsweredCount: g('q-answered-count'),
    cardRow:        g('card-row'),
    questionPanel:  g('question-panel'),
    qpDmgBadge:     g('qp-dmg-badge'),
    qpTimerFill:    g('qp-timer-fill'),
    qpTimerText:    g('qp-timer-text'),
    qpQuestion:     g('qp-question'),
    qpOptions:      g('qp-options'),
    qpBody:         g('qp-body'),
    qpStreakBadge:  g('qp-streak-badge'),
    bonusPanel:     g('bonus-panel'),
    bonusResult:    g('bonus-result'),
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
    toastLayer:     g('toast-layer'),
  };

  const critical = [
    'login-screen','start-btn','pin-input','battle-screen','end-screen'
  ];
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

  ui.startBtn.addEventListener('click', attemptLogin);
  ui.pinInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') attemptLogin();
  });
  ui.tryAgainBtn.addEventListener('click', restartGame);
  ui.tabCode.addEventListener('click',   () => switchTab('code'));
  ui.tabUpload.addEventListener('click', () => switchTab('upload'));

  setupFileUpload();

  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    const slot = g(`slot-${i}`);
    if (slot) slot.addEventListener('click',
      (function(idx){ return () => pickCard(idx); })(i));
  }
  for (let i = 0; i < 3; i++) {
    const bs = g(`bslot-${i}`);
    if (bs) bs.addEventListener('click',
      (function(idx){ return () => pickBonusCard(idx); })(i));
  }

  fixVH();
  window.addEventListener('resize', fixVH);
  window.addEventListener('orientationchange', () => setTimeout(fixVH, 250));

  let lastTap = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTap < 300 &&
        e.target.tagName !== 'INPUT' &&
        e.target.tagName !== 'BUTTON') {
      e.preventDefault();
    }
    lastTap = now;
  }, { passive: false });

  katexReady = (typeof katex !== 'undefined');
  console.log(`✅ Card Quest v7.1 ready | KaTeX: ${katexReady}`);
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();

// ════════════════════════════════════════════════════
//  VIEWPORT FIX
// ════════════════════════════════════════════════════
function fixVH() {
  document.documentElement.style
    .setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

// ════════════════════════════════════════════════════
//  TAB SWITCHING
// ════════════════════════════════════════════════════
function switchTab(tab) {
  activeTab = tab;
  ui.tabCode.classList.toggle('active',     tab === 'code');
  ui.tabUpload.classList.toggle('active',   tab === 'upload');
  ui.panelCode.classList.toggle('hidden',   tab !== 'code');
  ui.panelUpload.classList.toggle('hidden', tab !== 'upload');
}

// ════════════════════════════════════════════════════
//  FILE UPLOAD
// ════════════════════════════════════════════════════
function setupFileUpload() {
  if (!ui.dropZone || !ui.fileInput) return;

  ui.dropZone.addEventListener('click', () => ui.fileInput.click());
  ui.fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFileLoad(file);
  });
  ui.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    ui.dropZone.classList.add('drag-over');
  });
  ui.dropZone.addEventListener('dragleave', () =>
    ui.dropZone.classList.remove('drag-over')
  );
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
        setFileStatus('⚠️ File must be a non-empty JSON array', 'err');
        uploadedData = null;
        return;
      }
      const first = data[0];
      if (!first.options || !first.answer) {
        setFileStatus(
          '⚠️ Questions must have "options" and "answer" fields', 'err'
        );
        uploadedData = null;
        return;
      }
      uploadedData = data;
      setFileStatus(
        `✅ ${file.name} — ${data.length} question${data.length !== 1 ? 's' : ''} loaded`,
        'ok'
      );
    } catch(err) {
      setFileStatus('⚠️ Invalid JSON — check file syntax', 'err');
      uploadedData = null;
    }
  };
  reader.readAsText(file);
}

function setFileStatus(msg, type) {
  if (!ui.fileStatus) return;
  ui.fileStatus.textContent = msg;
  ui.fileStatus.className   = type;
  ui.fileStatus.classList.remove('hidden');
}

// ════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ════════════════════════════════════════════════════
function showToast(msg, color = '#ffd700', duration = 2500) {
  if (!ui.toastLayer) return;
  const t = document.createElement('div');
  t.className         = 'toast';
  t.textContent       = msg;
  t.style.borderColor = color;
  t.style.color       = color;
  ui.toastLayer.appendChild(t);
  setTimeout(() => t.remove(), duration + 300);
}

// ════════════════════════════════════════════════════
//  KATEX LOADER
// ════════════════════════════════════════════════════
function waitForKaTeX() {
  return new Promise(resolve => {
    if (typeof katex !== 'undefined') {
      katexReady = true; resolve(); return;
    }
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (typeof katex !== 'undefined') {
        clearInterval(t); katexReady = true; resolve();
      } else if (tries > 60) {
        clearInterval(t);
        console.warn('KaTeX unavailable — plain text mode');
        resolve();
      }
    }, 100);
  });
}

// ════════════════════════════════════════════════════
//  PROTECTED ACRONYMS
//  Never treated as chemical formulas
// ════════════════════════════════════════════════════
const PROTECTED_CAPS = new Set([
  'SGD','USD','EUR','GBP','JPY','AUD','CAD','HKD','CNY',
  'MYR','IDR','THB','PHP','INR','KRW','TWD','NZD','CHF',
  'DNA','RNA','ATP','ADP','NAD','FAD','HIV','BCG','WHO',
  'GPS','LCD','LED','USB','RAM','ROM','CPU','GPU','SSD',
  'PDF','HTML','CSS','API','URL','SQL','LAN','WAN','MRT',
  'LCM','HCF','GCF','GCD','BODMAS','BIDMAS',
  'AM','PM','BC','AD','CE','MCQ','QED',
]);

// ════════════════════════════════════════════════════
//  KNOWN DIATOMIC / SIMPLE MOLECULES
//  Always recognised as chemical formulas
// ════════════════════════════════════════════════════
const DIATOMICS = new Set([
  'H2','O2','N2','F2','Cl2','Br2','I2',
  'P4','S8','CO','NO','HF','HCl','HBr','HI',
]);

// ════════════════════════════════════════════════════
//  GREEK LETTERS
// ════════════════════════════════════════════════════
const GREEK_MAP = {
  alpha:'\\alpha', beta:'\\beta', gamma:'\\gamma',
  delta:'\\delta', epsilon:'\\epsilon', zeta:'\\zeta',
  eta:'\\eta', theta:'\\theta', iota:'\\iota',
  kappa:'\\kappa', lambda:'\\lambda', mu:'\\mu',
  nu:'\\nu', xi:'\\xi', pi:'\\pi', rho:'\\rho',
  sigma:'\\sigma', tau:'\\tau', upsilon:'\\upsilon',
  phi:'\\phi', chi:'\\chi', psi:'\\psi', omega:'\\omega',
  Gamma:'\\Gamma', Delta:'\\Delta', Theta:'\\Theta',
  Lambda:'\\Lambda', Xi:'\\Xi', Pi:'\\Pi',
  Sigma:'\\Sigma', Upsilon:'\\Upsilon', Phi:'\\Phi',
  Psi:'\\Psi', Omega:'\\Omega',
};

// ════════════════════════════════════════════════════
//  STATE SYMBOLS  (s)(l)(g)(aq) — always plain text
// ════════════════════════════════════════════════════
const STATE_RE = /\((s|l|g|aq)\)/g;

// ════════════════════════════════════════════════════
//  isChemicalFormula(str)  v7.1
//  Returns true for genuine chemical formulas.
//  Diatomics whitelisted. Rejects plain English words.
// ════════════════════════════════════════════════════
function isChemicalFormula(str) {
  if (!str || str.length < 2)  return false;
  if (PROTECTED_CAPS.has(str)) return false;

  // Must start with uppercase letter
  if (!/^[A-Z]/.test(str)) return false;

  // Diatomics and simple molecules are always valid
  if (DIATOMICS.has(str)) return true;

  // Must have digit OR multiple element symbols OR parenthesised group
  const hasDigit      = /\d/.test(str);
  const hasMultiElem  = /[A-Z][a-z]?[A-Z]/.test(str);
  const hasParenDigit = /\([A-Za-z]+\)\d/.test(str);

  if (!hasDigit && !hasMultiElem && !hasParenDigit) return false;

  // Reject plain English words — 4+ lowercase letters after initial cap
  if (/^[A-Z][a-z]{3,}$/.test(str)) return false;

  // Reject ambiguous 2-char: single capital + single digit e.g. "A2"
  // unless it's already caught by DIATOMICS above
  if (/^[A-Z]\d$/.test(str)) return false;

  return true;
}

// ════════════════════════════════════════════════════
//  chemicalToLatex(str)  v7.1
//
//  Element-by-element tokenizer.
//  Builds LaTeX walking the string character by character.
//  Prevents any nested \text{} bugs.
//
//  Examples:
//    H2O        → \text{H}_{2}\text{O}
//    Ca(NO3)2   → \text{Ca}(\text{N}\text{O}_{3})_{2}
//    Fe2O3      → \text{Fe}_{2}\text{O}_{3}
//    ZnCl2      → \text{Zn}\text{Cl}_{2}
//    2H2O       → 2\text{H}_{2}\text{O}  (leading coeff plain)
// ════════════════════════════════════════════════════
function chemicalToLatex(str) {
  if (!str) return '';

  let result = '';
  let i      = 0;
  const len  = str.length;

  // ── Leading coefficient (e.g. "2" in "2H2O", "4" in "4Fe") ──
  // Only strip if followed immediately by an uppercase letter
  let leadingCoeff = '';
  while (i < len && /\d/.test(str[i])) {
    leadingCoeff += str[i++];
  }
  if (leadingCoeff && i < len && /[A-Z]/.test(str[i])) {
    // Valid coefficient — output as plain number
    result += leadingCoeff;
  } else {
    // Not a coefficient — reset and treat digits as subscripts
    i = 0;
    leadingCoeff = '';
  }

  // ── Walk remaining characters ──
  while (i < len) {
    const ch = str[i];

    if (ch === '(') {
      result += '(';
      i++;

    } else if (ch === ')') {
      result += ')';
      i++;
      // Subscript digits after closing paren: Ca(NO3)2 → )_{2}
      if (i < len && /\d/.test(str[i])) {
        let num = '';
        while (i < len && /\d/.test(str[i])) num += str[i++];
        result += `_{${num}}`;
      }

    } else if (/[A-Z]/.test(ch)) {
      // Element symbol: one uppercase + optional one lowercase
      // e.g. Ca, Cl, Na, Fe, Zn, Al, Mg, Cu, Pb
      let sym = ch;
      i++;
      if (i < len && /[a-z]/.test(str[i])) {
        sym += str[i++];
      }
      result += `\\text{${sym}}`;

      // Subscript digits immediately after element symbol
      if (i < len && /\d/.test(str[i])) {
        let num = '';
        while (i < len && /\d/.test(str[i])) num += str[i++];
        result += `_{${num}}`;
      }

    } else if (/\d/.test(ch)) {
      // Stray digit — render as subscript
      let num = '';
      while (i < len && /\d/.test(str[i])) num += str[i++];
      result += `_{${num}}`;

    } else {
      // Any other character (·, +, space, etc.) — pass through
      result += ch;
      i++;
    }
  }

  return result;
}

// ════════════════════════════════════════════════════
//  scientificToLatex(s)
// ════════════════════════════════════════════════════
function scientificToLatex(s) {
  s = s.replace(
    /(-?\d+(?:\.\d+)?)\s*[×x]\s*10\^(\{[^}]+\}|-?\d+)(?![a-zA-Z\d])/g,
    (_, coeff, exp) => {
      const e = exp.startsWith('{') ? exp : `{${exp}}`;
      return `⟦MATH⟧${coeff} \\times 10^${e}⟦/MATH⟧`;
    }
  );
  s = s.replace(
    /(?<![a-zA-Z])(-?\d+(?:\.\d+)?)[eE]([+-]?\d+)(?![a-zA-Z\d])/g,
    (_, coeff, exp) =>
      `⟦MATH⟧${coeff} \\times 10^{${exp}}⟦/MATH⟧`
  );
  return s;
}

// ════════════════════════════════════════════════════
//  renderSegments(el, segments)
//  Converts segment array → DOM nodes.
//  KEY: each text run is a separate Text node.
//       Never concatenated → no colour bleed.
// ════════════════════════════════════════════════════
function renderSegments(el, segments) {
  while (el.firstChild) el.removeChild(el.firstChild);

  segments.forEach(seg => {
    if (!seg) return;

    switch (seg.type) {

      case 'newline': {
        el.appendChild(document.createElement('br'));
        break;
      }

      case 'state': {
        // State symbols: always plain text, styled separately
        const span       = document.createElement('span');
        span.className   = 'chem-state';
        span.textContent = seg.content;
        el.appendChild(span);
        break;
      }

      case 'math': {
        if (katexReady && seg.content) {
          try {
            const wrap     = document.createElement('span');
            wrap.className = 'math-rendered';
            wrap.innerHTML = katex.renderToString(seg.content, {
              throwOnError: false,
              errorColor:   '#ef4444',
              displayMode:  !!seg.display,
              output:       'html',
              strict:       false,
              trust:        false,
            });
            el.appendChild(wrap);
          } catch(e) {
            const span       = document.createElement('span');
            span.className   = 'math-fallback';
            span.textContent = seg.content;
            el.appendChild(span);
          }
        } else if (seg.content) {
          const span       = document.createElement('span');
          span.className   = 'math-fallback';
          span.textContent = seg.content;
          el.appendChild(span);
        }
        break;
      }

      case 'text':
      default: {
        if (seg.content) {
          // Plain text node — never innerHTML → no colour bleed
          el.appendChild(document.createTextNode(seg.content));
        }
        break;
      }
    }
  });
}

// ════════════════════════════════════════════════════
//  renderSafe(el, rawText)
// ════════════════════════════════════════════════════
function renderSafe(el, rawText) {
  if (!el) return;
  const segs = convertToSegments(String(rawText || ''));
  renderSegments(el, segs);
}

// ════════════════════════════════════════════════════
//  convertToSegments(raw)
//  Handles explicit $…$ / $$…$$ blocks first,
//  then passes plain text to processPlainText().
// ════════════════════════════════════════════════════
function convertToSegments(raw) {
  if (!raw || !raw.trim()) return [];

  const out = [];

  // Match $$display$$ and $inline$ — protect money $5.00
  const MATH_BLOCK_RE =
    /(\$\$[\s\S]+?\$\$|\$(?![\d.,\s])[^$\n]{1,300}?\$(?![0-9\w]))/g;

  let last = 0;
  let m;
  while ((m = MATH_BLOCK_RE.exec(raw)) !== null) {
    if (m.index > last) {
      out.push(...processPlainText(raw.slice(last, m.index)));
    }
    const block     = m[0];
    const isDisplay = block.startsWith('$$');
    const inner     = isDisplay
      ? block.slice(2,-2).trim()
      : block.slice(1,-1).trim();
    if (inner) out.push({ type:'math', content:inner, display:isDisplay });
    last = m.index + block.length;
  }
  if (last < raw.length) {
    out.push(...processPlainText(raw.slice(last)));
  }

  return out;
}

// ════════════════════════════════════════════════════
//  processPlainText(text)
//  Split on newlines, process each line separately.
// ════════════════════════════════════════════════════
function processPlainText(text) {
  if (!text) return [];
  const out   = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    out.push(...processLine(line));
    if (i < lines.length - 1) {
      out.push({ type:'newline' });
    }
  });
  return out;
}

// ════════════════════════════════════════════════════
//  processLine(line)  v7.1
//
//  Token-list pipeline for one line of text.
//  Processes patterns in priority order.
//  Chemical formulas extracted in BOTH prose and
//  math mode using two passes:
//    Pass A — parenthesised groups: Ca(NO3)2, Al(OH)3
//    Pass B — standard formulas:   Fe2O3, ZnCl2, H2SO4
// ════════════════════════════════════════════════════
function processLine(line) {
  if (line === undefined || line === null) return [];
  if (!line.trim()) return [{ type:'text', content: line }];

  // Start with the whole line as a single raw token
  let tokens = [{ type:'raw', content: line }];

  // ── 1. State symbols (s)(l)(g)(aq) ──
  // Extract FIRST so they're never parsed as math
  tokens = extractPattern(tokens, STATE_RE,
    match => ({ type:'state', content: match[0] })
  );

  // ── 2. Money amounts $52.40 — mark as plain text ──
  tokens = extractPattern(tokens,
    /\$\d[\d.,]*/g,
    match => ({ type:'text', content: match[0] })
  );

  // ── 3. Scientific notation ──
  // "6.02 x 10^23", "3.2e4", "1.6e-19"
  tokens = extractPattern(tokens,
    /(-?\d+(?:\.\d+)?)\s*[×x]\s*10\^(\{[^}]+\}|-?\d+)/g,
    match => {
      const exp = match[2].startsWith('{')
        ? match[2] : `{${match[2]}}`;
      return { type:'math',
        content:`${match[1]} \\times 10^${exp}`, display:false };
    }
  );
  tokens = extractPattern(tokens,
    /(?<![a-zA-Z])(-?\d+(?:\.\d+)?)[eE]([+-]?\d+)(?![a-zA-Z\d])/g,
    match => ({
      type:'math',
      content:`${match[1]} \\times 10^{${match[2]}}`,
      display:false
    })
  );

  // ── 4A. Chemical formulas WITH parenthesised groups ──
  // e.g. Ca(NO3)2, Al(OH)3, (NH4)2CO3, Mg(NO3)2
  // Run in ALL contexts (prose + math)
  tokens = extractPattern(tokens,
    /\b(\d*)([A-Z][a-zA-Z0-9]*(?:\([A-Za-z0-9]+\)\d*)+[a-zA-Z0-9]*)\b/g,
    match => {
      const coeff   = match[1] || '';
      const formula = match[2] || '';
      if (!isChemicalFormula(formula)) return null;
      const latex = coeff + chemicalToLatex(formula);
      return { type:'math', content:latex, display:false };
    }
  );

  // ── 4B. Standard chemical formulas (no parentheses) ──
  // e.g. Fe2O3, H2SO4, ZnCl2, NaOH, CO2, H2O, Cl2, KMnO4
  // Pattern: starts uppercase, contains mix of letters + digits
  // Must have at least one digit (subscript) or two element symbols
  tokens = extractPattern(tokens,
    /\b(\d*)([A-Z][a-z]?(?:[A-Z][a-z]?|\d)+(?:[A-Z][a-z]?\d*)*)\b/g,
    match => {
      const coeff   = match[1] || '';
      const formula = match[2] || '';
      if (!isChemicalFormula(formula)) return null;
      const latex = coeff + chemicalToLatex(formula);
      return { type:'math', content:latex, display:false };
    }
  );

  // ── 4C. Diatomic molecules (standalone) ──
  // e.g. Cl2, H2, O2, N2 — may be missed by 4B in some contexts
  tokens = extractPattern(tokens,
    /\b(H2|O2|N2|F2|Cl2|Br2|I2|P4|S8|CO|NO|HF|HCl|HBr|HI)\b/g,
    match => ({
      type:'math',
      content: chemicalToLatex(match[1]),
      display: false
    })
  );

  // ── 5. Mixed numbers "2 3/4" → 2\dfrac{3}{4} ──
  tokens = extractPattern(tokens,
    /(?<!\d)(\d+)\s+(\d{1,3})\/(\d{1,3})(?!\d)/g,
    match => {
      const [, whole, num, den] = match;
      if (parseInt(den) === 0) return null;
      return { type:'math',
        content:`${whole}\\dfrac{${num}}{${den}}`, display:false };
    }
  );

  // ── 6. Negative fractions "-3/4" ──
  tokens = extractPattern(tokens,
    /(?<![0-9])-(\d{1,4})\/(\d{1,4})(?![0-9])/g,
    match => {
      const [, num, den] = match;
      if (parseInt(den) === 0) return null;
      return { type:'math',
        content:`-\\dfrac{${num}}{${den}}`, display:false };
    }
  );

  // ── 7. Plain fractions "3/4" ──
  tokens = extractPattern(tokens,
    /(?<![$/£€¥:])(?<!\d)(\d{1,4})\s*\/\s*(\d{1,4})(?![0-9a-zA-Z/])/g,
    match => {
      const [, num, den] = match;
      if (parseInt(den) === 0) return null;
      return { type:'math',
        content:`\\dfrac{${num}}{${den}}`, display:false };
    }
  );

  // ── 8. Superscripts x^2, 10^{-3}, a^{n+1} ──
  tokens = extractPattern(tokens,
    /([a-zA-Z0-9]+)\^(\{[^}]+\}|-?\d+(?:\.\d+)?|[a-zA-Z])/g,
    match => {
      const base = match[1];
      const exp  = match[2].startsWith('{')
        ? match[2] : `{${match[2]}}`;
      return { type:'math', content:`${base}^${exp}`, display:false };
    }
  );

  // ── 9. Unicode superscripts ² ³ ──
  tokens = extractPattern(tokens,
    /([a-zA-Z0-9]+)([²³])/g,
    match => {
      const base = match[1];
      const exp  = match[2] === '²' ? '2' : '3';
      return { type:'math',
        content:`${base}^{${exp}}`, display:false };
    }
  );

  // ── 10. Subscripts x_1, a_n ──
  tokens = extractPattern(tokens,
    /(?<![a-zA-Z\d])([a-zA-Z])_(\{[^}]+\}|\d+|[a-zA-Z])(?!\w)/g,
    match => {
      const base = match[1];
      const sub  = match[2].startsWith('{')
        ? match[2] : `{${match[2]}}`;
      return { type:'math',
        content:`${base}_{${sub}}`, display:false };
    }
  );

  // ── 11. sqrt() and cbrt() ──
  tokens = extractPattern(tokens,
    /\bsqrt\s*\(([^)]+)\)/gi,
    match => ({
      type:'math',
      content:`\\sqrt{${match[1].trim()}}`,
      display:false
    })
  );
  tokens = extractPattern(tokens,
    /\bcbrt\s*\(([^)]+)\)/gi,
    match => ({
      type:'math',
      content:`\\sqrt[3]{${match[1].trim()}}`,
      display:false
    })
  );

  // ── 12. Degrees "90°" or "90 degrees" ──
  tokens = extractPattern(tokens,
    /(\d+(?:\.\d+)?)\s*°/g,
    match => ({
      type:'math',
      content:`${match[1]}^{\\circ}`,
      display:false
    })
  );
  tokens = extractPattern(tokens,
    /(\d+(?:\.\d+)?)\s+degrees?\b/gi,
    match => ({
      type:'math',
      content:`${match[1]}^{\\circ}`,
      display:false
    })
  );

  // ── 13. Multiplication sign "3 × 4" ──
  tokens = extractPattern(tokens,
    /(\d)\s*[×]\s*(\d)/g,
    match => ({
      type:'math',
      content:`${match[1]} \\times ${match[2]}`,
      display:false
    })
  );

  // ── 14. Reaction arrows → ──
  tokens = extractPattern(tokens,
    /\s*→\s*/g,
    () => ({ type:'math', content:'\\rightarrow', display:false })
  );

  // ── 15. Comparison operators >=, <=, != ──
  tokens = extractPattern(tokens,
    /([^<>!=])>=/g,
    match => ({
      type:'math',
      content:`${match[1]}\\geq`,
      display:false
    })
  );
  tokens = extractPattern(tokens,
    /([^<>!=])<=/g,
    match => ({
      type:'math',
      content:`${match[1]}\\leq`,
      display:false
    })
  );
  tokens = extractPattern(tokens,
    /([^!<>])!=/g,
    match => ({
      type:'math',
      content:`${match[1]}\\neq`,
      display:false
    })
  );

  // ── 16. Greek letters ──
  const greekRe = new RegExp(
    `\\b(${Object.keys(GREEK_MAP).join('|')})\\b`, 'g'
  );
  tokens = extractPattern(tokens, greekRe,
    match => ({
      type:'math',
      content: GREEK_MAP[match[1]],
      display:false
    })
  );

  // ── 17. Unit superscripts cm², m³ ──
  tokens = extractPattern(tokens,
    /\b(cm|mm|km|dm|m|ft|in|yd)([²³])/g,
    match => {
      const unit = match[1];
      const exp  = match[2] === '²' ? '2' : '3';
      return { type:'math',
        content:`\\text{${unit}}^{${exp}}`, display:false };
    }
  );

  // Convert any remaining 'raw' tokens to plain 'text'
  return tokens
    .map(tok => tok.type === 'raw'
      ? { type:'text', content: tok.content }
      : tok
    )
    .filter(tok => tok.content !== '');
}

// ════════════════════════════════════════════════════
//  extractPattern(tokens, regex, replacer)
//
//  Core helper: applies regex only to 'raw' tokens.
//  Splits: [before-text] [replacement] [after-text]
//  Non-raw tokens pass through unchanged.
//
//  replacer(match) → segment object, or null to keep raw
// ════════════════════════════════════════════════════
function extractPattern(tokens, regex, replacer) {
  const out = [];

  for (const tok of tokens) {
    // Only process raw tokens
    if (tok.type !== 'raw') {
      out.push(tok);
      continue;
    }

    const text = tok.content;
    // Always use a fresh global regex to avoid lastIndex issues
    const re = new RegExp(
      regex.source,
      regex.flags.includes('g') ? regex.flags : regex.flags + 'g'
    );

    let last = 0;
    let m;

    while ((m = re.exec(text)) !== null) {
      // Text before match → raw
      if (m.index > last) {
        out.push({ type:'raw', content: text.slice(last, m.index) });
      }

      // Apply replacer
      const replacement = replacer(m);
      if (replacement === null) {
        // Keep matched text as raw
        out.push({ type:'raw', content: m[0] });
      } else {
        out.push(replacement);
      }

      last = m.index + m[0].length;

      // Safety: prevent infinite loop on zero-length matches
      if (m[0].length === 0) { re.lastIndex++; }
    }

    // Remaining text after last match
    if (last < text.length) {
      out.push({ type:'raw', content: text.slice(last) });
    }
  }

  return out;
}

// ════════════════════════════════════════════════════
//  normalise(s)
//  For answer comparison — strips formatting
// ════════════════════════════════════════════════════
function normalise(s) {
  return String(s || '')
    .trim()
    .replace(/\$\$([^$]+)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g,     '$1')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\^{?2}?/g, '2')
    .replace(/\^{?3}?/g, '3')
    .replace(/½/g, '1/2')
    .replace(/¼/g, '1/4')
    .replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3')
    .replace(/⅔/g, '2/3');
}

// ════════════════════════════════════════════════════
//  QUESTION RENDERER
//  Handles: question (background), table, stem
// ════════════════════════════════════════════════════
function renderQuestion(container, qObj) {
  while (container.firstChild) container.removeChild(container.firstChild);

  // ── Background / context text ──
  if (qObj.question && qObj.question.trim()) {
    const paragraphs = qObj.question.split(/\n\n+/);
    paragraphs.forEach(para => {
      const trimmed = para.trim();
      if (!trimmed) return;

      const lines      = trimmed.split('\n');
      const bullets    = lines.filter(l => l.trim().startsWith('-'));
      const nonBullets = lines.filter(l =>
        l.trim() && !l.trim().startsWith('-'));

      if (bullets.length > 0) {
        nonBullets.forEach(line => {
          const p = document.createElement('p');
          p.className = 'q-background';
          renderSafe(p, line.trim());
          container.appendChild(p);
        });
        const ul = document.createElement('ul');
        ul.className = 'q-bullet-list';
        bullets.forEach(line => {
          const li = document.createElement('li');
          renderSafe(li, line.trim().slice(1).trim());
          ul.appendChild(li);
        });
        container.appendChild(ul);
      } else {
        const p = document.createElement('p');
        p.className = 'q-background';
        renderSafe(p, trimmed);
        container.appendChild(p);
      }
    });
  }

  // ── Table ──
  if (
    qObj.table &&
    Array.isArray(qObj.table.headers) &&
    Array.isArray(qObj.table.rows) &&
    qObj.table.headers.length > 0 &&
    qObj.table.rows.length > 0
  ) {
    const wrapper = document.createElement('div');
    wrapper.className = 'q-table-wrap';

    const table = document.createElement('table');
    table.className = 'q-table';

    const thead = document.createElement('thead');
    const hrow  = document.createElement('tr');
    qObj.table.headers.forEach(h => {
      const th = document.createElement('th');
      renderSafe(th, String(h ?? ''));
      hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    const tbody   = document.createElement('tbody');
    const numCols = qObj.table.headers.length;
    qObj.table.rows.forEach((row, ri) => {
      const tr = document.createElement('tr');
      tr.className = ri % 2 === 0 ? 'row-even' : 'row-odd';
      for (let ci = 0; ci < numCols; ci++) {
        const td  = document.createElement('td');
        const val = Array.isArray(row) ? (row[ci] ?? '') : '';
        renderSafe(td, String(val));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.appendChild(wrapper);
  }

  // ── Box plot ──
  if (qObj.boxplot) {
    const bpEl = renderBoxPlot(qObj.boxplot);
    if (bpEl) container.appendChild(bpEl);
  }

  // ── Stem (the actual question) ──
  if (qObj.stem && qObj.stem.trim()) {
    const stemEl = document.createElement('p');
    stemEl.className = 'q-stem';
    renderSafe(stemEl, qObj.stem.trim());
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
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const t = audioCtx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  } catch(e) {}
}

function playSound(type) {
  if (!audioCtx) return;
  const sounds = {
    flip:       () => { tone(300,'sine',0.07,0.1); tone(520,'sine',0.07,0.08,0.06); },
    correct:    () => { [523,659,784].forEach((f,i)  => tone(f,'sine',0.14,0.16,i*0.09)); },
    wrong:      () => { [280,160,90].forEach((f,i)   => tone(f,'sawtooth',0.2,0.12,i*0.14)); },
    hit:        () => { tone(160,'sine',0.2,0.2); tone(80,'sine',0.16,0.15,0.1); },
    boss_hurt:  () => { tone(200,'sawtooth',0.12,0.15); tone(120,'sawtooth',0.18,0.12,0.1); },
    bonus:      () => { [440,660,880].forEach((f,i)  => tone(f,'triangle',0.14,0.16,i*0.1)); },
    boss_heal:  () => { [300,200,140].forEach((f,i)  => tone(f,'sawtooth',0.3,0.12,i*0.14)); },
    hero_heal:  () => { [440,550,660].forEach((f,i)  => tone(f,'sine',0.12,0.15,i*0.1)); },
    halved:     () => { [523,784,1047].forEach((f,i) => tone(f,'sine',0.18,0.16,i*0.1)); },
    double_dmg: () => { [660,880,1100].forEach((f,i) => tone(f,'triangle',0.15,0.16,i*0.08)); },
    timeout:    () => { tone(300,'sawtooth',0.38,0.14); },
    victory:    () => { [523,659,784,1047,1319].forEach((f,i) => tone(f,'sine',0.2,0.15,i*0.12)); },
    defeat:     () => { [350,280,200,120].forEach((f,i)       => tone(f,'sawtooth',0.3,0.12,i*0.18)); },
    streak3:    () => { [440,660,880,1100].forEach((f,i)      => tone(f,'sine',0.15,0.18,i*0.08)); },
    streak5:    () => { [523,784,1047,1319].forEach((f,i)     => tone(f,'triangle',0.18,0.2,i*0.07)); },
    levelup:    () => { [392,494,587,784].forEach((f,i)       => tone(f,'sine',0.2,0.2,i*0.1)); },
  };
  if (sounds[type]) sounds[type]();
}

// ════════════════════════════════════════════════════
//  SCREEN SWITCHER
// ════════════════════════════════════════════════════
function showScreen(name) {
  [
    { el: ui.loginScreen,  id: 'login'  },
    { el: ui.battleScreen, id: 'battle' },
    { el: ui.endScreen,    id: 'end'    },
  ].forEach(({ el, id }) => {
    if (!el) return;
    if (id === name) {
      el.classList.remove('hidden');
      el.classList.add('active-screen');
    } else {
      el.classList.add('hidden');
      el.classList.remove('active-screen');
    }
  });
  if (name === 'battle' || name === 'end') {
    const gc = document.getElementById('game-container');
    if (gc) gc.scrollTop = 0;
  }
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

    if (activeTab === 'upload') {
      if (!uploadedData)
        throw new Error('Please upload a .json question file first!');
      allQuestions = uploadedData;
      startGame();
      return;
    }

    const pin = ui.pinInput.value.trim();
    if (!pin) throw new Error('Enter a Quest Code to begin!');

    const res = await fetch(`worksheets/${pin}.json`);
    if (!res.ok) throw new Error(
      `Quest "${pin}" not found.\n` +
      `Make sure worksheets/${pin}.json exists in your project.`
    );

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0)
      throw new Error('Quest file is empty or not a valid JSON array.');

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
  setTimeout(startNewRound, 350);
}

// ════════════════════════════════════════════════════
//  RESTART
// ════════════════════════════════════════════════════
function restartGame() {
  clearCardTimer();
  gameActive   = false;
  uploadedData = null;
  if (ui.fileStatus) {
    ui.fileStatus.classList.add('hidden');
    ui.fileStatus.className = 'hidden';
  }
  if (ui.fileInput) ui.fileInput.value = '';
  ui.startBtn.disabled    = false;
  ui.startBtn.textContent = '⚔️ BEGIN QUEST';
  showScreen('login');
}

// ════════════════════════════════════════════════════
//  STREAK & COMBO
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

  ui.streakCount.textContent = currentStreak;
  ui.streakCount.classList.remove('pop');
  void ui.streakCount.offsetWidth;
  ui.streakCount.classList.add('pop');

  const fireIdx = Math.min(currentStreak, STREAK_FIRES.length - 1);
  ui.streakFire.textContent = STREAK_FIRES[fireIdx];

  ui.comboMult.textContent = combo.label;
  if (combo.mult > 1) {
    ui.comboMult.classList.remove('combo-up');
    void ui.comboMult.offsetWidth;
    ui.comboMult.classList.add('combo-up');
  }

  if (currentStreak === 3) {
    playSound('streak3');
    showStreakDisplay('🔥 3 STREAK!', '#ff6b00');
    showToast('🔥 3 in a row! Combo ×1.5', '#ff6b00');
  } else if (currentStreak === 5) {
    playSound('streak5');
    showStreakDisplay('⚡ 5 STREAK!', '#a855f7');
    showToast('⚡ 5 STREAK! Combo ×2!', '#a855f7');
  } else if (currentStreak === 8) {
    playSound('streak5');
    showStreakDisplay('💥 8 STREAK!', '#ffd700');
    showToast('💥 UNSTOPPABLE! Combo ×3!', '#ffd700');
  } else if (currentStreak >= 12 && currentStreak % 4 === 0) {
    playSound('streak5');
    showStreakDisplay(`🌟 ${currentStreak} STREAK!!`, '#ffd700');
    showToast(`🌟 ${currentStreak} STREAK! Combo ×5!`, '#ffd700');
  }

  if (currentStreak >= 3) {
    ui.qpStreakBadge.textContent = `🔥×${currentStreak}`;
    ui.qpStreakBadge.classList.remove('hidden');
  }
}

function onWrongStreak() {
  currentStreak   = 0;
  comboMultiplier = 1;
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
  totalXP   += baseXP;
  xpInLevel += baseXP;
  while (xpInLevel >= XP_PER_LEVEL) {
    xpInLevel  -= XP_PER_LEVEL;
    currentLevel++;
  }
  const pct = (xpInLevel / XP_PER_LEVEL) * 100;
  ui.xpBarFill.style.width = `${pct}%`;
  ui.xpText.textContent    = totalXP;
  if (currentLevel > oldLevel) {
    playSound('levelup');
    showEffect(`⬆️ LEVEL ${currentLevel}!`, '#00d4ff');
    showToast(`⭐ Level Up! Now Level ${currentLevel}`, '#00d4ff');
    spawnParticles('center', '#00d4ff', 18);
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

  const bPct  = (bossHP / BOSS_MAX_HP) * 100;
  const arena = document.getElementById('arena');
  if (arena) arena.classList.toggle('boss-rage', bPct <= 25);
  if (ui.bossSprite)
    ui.bossSprite.classList.toggle('boss-rage-anim', bPct <= 25);

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

  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    const slot  = document.getElementById(`slot-${i}`);
    const dmgEl = document.getElementById(`slot-dmg-${i}`);
    if (!slot) continue;

    slot.className = 'card-slot';
    slot.onclick   = null;
    slot.addEventListener('click',
      (function(idx){ return () => pickCard(idx); })(i));

    const icon = slot.querySelector('.slot-icon');
    if (icon)  icon.textContent  = '🎴';
    if (dmgEl) dmgEl.textContent = '';

    if (i >= roundCards.length) {
      slot.classList.add('used');
      continue;
    }

    slot.style.opacity = '0';
    setTimeout(() => {
      slot.style.opacity = '';
      slot.classList.add('flip-in');
      setTimeout(() => slot.classList.remove('flip-in'), 500);
    }, i * 90 + 50);
  }
}

// ════════════════════════════════════════════════════
//  PICK CARD
// ════════════════════════════════════════════════════
function pickCard(index) {
  if (!gameActive)                return;
  if (index >= roundCards.length)  return;
  if (activeSlot !== -1)           return;
  if (roundCards[index].answered)  return;

  const slot = document.getElementById(`slot-${index}`);
  if (!slot) return;
  if (slot.classList.contains('used') ||
      slot.classList.contains('disabled')) return;

  activeSlot = index;
  const { question, damage } = roundCards[index];

  for (let i = 0; i < CARDS_PER_ROUND; i++) {
    const s = document.getElementById(`slot-${i}`);
    if (s) { s.classList.add('disabled'); s.onclick = null; }
  }

  slot.classList.remove('disabled');
  slot.classList.add('selected');

  const icon = slot.querySelector('.slot-icon');
  if (icon) icon.textContent = '❓';

  const dmgEl        = document.getElementById(`slot-dmg-${index}`);
  const effectiveDmg = doubleDmgActive ? damage * 2 : damage;
  if (dmgEl) dmgEl.textContent =
    doubleDmgActive ? `⚡${effectiveDmg}` : `⚔️${damage}`;

  playSound('flip');

  ui.qpDmgBadge.textContent = doubleDmgActive
    ? `⚡ ${effectiveDmg} DMG (×2!)`
    : `⚔️ ${damage} DMG`;
  ui.qpDmgBadge.style.background = doubleDmgActive
    ? 'linear-gradient(135deg,#6600cc,#a855f7)' : '';

  if (currentStreak >= 3) {
    ui.qpStreakBadge.textContent = `🔥×${currentStreak}`;
    ui.qpStreakBadge.classList.remove('hidden');
  }

  renderQuestion(ui.qpQuestion, question);

  while (ui.qpOptions.firstChild)
    ui.qpOptions.removeChild(ui.qpOptions.firstChild);

  const opts      = shuffle([...(question.options || [])]);
  const answerRaw = String(question.answer || '').trim();
  const LETTERS   = ['A','B','C','D','E'];

  opts.forEach((opt, idx) => {
    const raw = String(opt ?? '').trim();
    const btn = document.createElement('button');
    btn.className   = 'qp-opt';
    btn.dataset.raw = raw;

    const letterSpan       = document.createElement('span');
    letterSpan.className   = 'opt-letter';
    letterSpan.textContent = LETTERS[idx] || '';
    btn.appendChild(letterSpan);

    const contentSpan     = document.createElement('span');
    contentSpan.className = 'opt-content';
    renderSafe(contentSpan, raw);
    btn.appendChild(contentSpan);

    btn.addEventListener('click', () =>
      handleAnswer(btn, raw, answerRaw, damage, index)
    );
    ui.qpOptions.appendChild(btn);
  });

  if (ui.qpBody) ui.qpBody.scrollTop = 0;

  ui.questionPanel.classList.remove('hidden');
  ui.phaseLabel.textContent = 'ANSWER!';

  currentTimeLimitMs = ((question.time && question.time > 0)
    ? question.time : DEFAULT_TIME) * 1000;
  questionStartTime  = Date.now();

  setTimeout(() => {
    startCardTimer(
      currentTimeLimitMs / 1000,
      () => handleTimeout(answerRaw, damage, index)
    );
  }, 300);
}

// ════════════════════════════════════════════════════
//  CARD TIMER
// ════════════════════════════════════════════════════
function startCardTimer(seconds, onTimeout) {
  clearCardTimer();
  const startMs = Date.now();
  const limitMs = seconds * 1000;

  ui.qpTimerFill.style.width      = '100%';
  ui.qpTimerFill.style.background = 'var(--hp-green)';
  ui.qpTimerFill.classList.remove('urgent');
  ui.qpTimerText.textContent      = `${Math.round(seconds)}s`;

  cardTimerInterval = setInterval(() => {
    const elapsed = Date.now() - startMs;
    const pct     = Math.max(0, 100 - (elapsed / limitMs * 100));
    const secLeft = Math.max(0, Math.ceil((limitMs - elapsed) / 1000));

    ui.qpTimerFill.style.width     = `${pct}%`;
    ui.qpTimerText.textContent     = `${secLeft}s`;

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
  ui.qAnsweredCount.textContent =
    roundCards.filter(c => c.answered).length;

  const isCorrect     = normalise(selected) === normalise(correct);
  const elapsed       = Date.now() - questionStartTime;
  const isSpeedAnswer = isCorrect && elapsed < (currentTimeLimitMs / 3);

  if (isCorrect) {
    btn.classList.add('correct');
    correctCount++;

    const effectiveDmg = doubleDmgActive ? damage * 2 : damage;
    const comboPoints  = Math.round(effectiveDmg * 10 * comboMultiplier);
    const speedBonus   = isSpeedAnswer ? XP_SPEED_BONUS * 10 : 0;
    score += comboPoints + speedBonus;
    animateScore();

    let xpGain = XP_CORRECT_BASE;
    if (currentStreak >= 3) xpGain += XP_STREAK_BONUS;
    if (isSpeedAnswer)      xpGain += XP_SPEED_BONUS;
    awardXP(xpGain);

    playSound('correct');
    markSlot(slotIdx, 'correct');
    spawnBurstRing(slotIdx);

    if (isSpeedAnswer) {
      showEffect('⚡ FAST! +BONUS', '#00d4ff');
      showToast('⚡ Speed bonus!', '#00d4ff', 1500);
    }

    onCorrectStreak();
    doubleDmgActive = false;
    setTimeout(() => doBossHit(effectiveDmg, afterAnswer), 380);

  } else {
    btn.classList.add('wrong');
    ui.qpOptions.querySelectorAll('.qp-opt').forEach(b => {
      if (normalise(b.dataset.raw) === normalise(correct))
        b.classList.add('correct');
    });
    playSound('wrong');
    markSlot(slotIdx, 'wrong');
    onWrongStreak();
    setTimeout(() => doPlayerHit(damage, afterAnswer), 380);
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
  ui.qAnsweredCount.textContent =
    roundCards.filter(c => c.answered).length;

  playSound('timeout');
  showEffect('⏰ TIME UP!', '#ff3344');
  showToast('⏰ Too slow! Boss attacks!', '#ff3344', 1800);
  markSlot(slotIdx, 'timeout');
  onWrongStreak();
  setTimeout(() => doPlayerHit(damage, afterAnswer), 750);
}

function disableOptions() {
  if (!ui.qpOptions) return;
  ui.qpOptions.querySelectorAll('.qp-opt').forEach(b => {
    b.disabled = true;
    b.onclick  = null;
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
    ui.phaseLabel.textContent = 'PICK A CARD';

    roundCards.forEach((rc, i) => {
      if (!rc.answered) {
        questionPool.push(rc.question);
        const slot = document.getElementById(`slot-${i}`);
        if (slot) slot.classList.add('used');
      }
    });
    questionPool = shuffle(questionPool);

    if (questionsAnswered % CARDS_PER_ROUND === 0) {
      setTimeout(startBonusRound, 450);
    } else {
      setTimeout(startNewRound, 450);
    }
  }, 1600);
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
  spawnParticles('center', '#ffd700', 26);
  showToast('✨ Bonus Round! Pick your fate!', '#ffd700', 2000);

  bonusOutcomes = shuffle([...BONUS_OUTCOMES]);

  for (let i = 0; i < 3; i++) {
    const bs = document.getElementById(`bslot-${i}`);
    if (!bs) continue;

    bs.className = 'bonus-slot';
    bs.onclick   = null;
    bs.addEventListener('click',
      (function(idx){ return () => pickBonusCard(idx); })(i));

    const icon  = bs.querySelector('.bslot-icon');
    const label = bs.querySelector('.bslot-label');
    if (icon)  { icon.textContent  = '✨'; icon.style.fontSize = ''; }
    if (label) { label.textContent = '?';  label.style.color   = ''; }

    bs.style.opacity    = '0';
    bs.style.transform  = 'translateY(20px) scale(0.9)';
    bs.style.transition = 'none';

    setTimeout(() => {
      bs.style.transition =
        'opacity 0.38s ease,' +
        'transform 0.42s cubic-bezier(0.34,1.56,0.64,1),' +
        'box-shadow 0.22s, border-color 0.22s';
      bs.style.opacity   = '';
      bs.style.transform = '';
    }, i * 110 + 70);
  }
}

function pickBonusCard(index) {
  if (!gameActive) return;
  const bs = document.getElementById(`bslot-${index}`);
  if (!bs) return;
  if (bs.classList.contains('revealed') ||
      bs.classList.contains('disabled')) return;

  for (let i = 0; i < 3; i++) {
    const b = document.getElementById(`bslot-${i}`);
    if (b) { b.classList.add('disabled'); b.onclick = null; }
  }

  const outcome = bonusOutcomes[index];
  playSound('flip');

  const icon  = bs.querySelector('.bslot-icon');
  const label = bs.querySelector('.bslot-label');
  if (icon)  icon.textContent   = outcome.icon;
  if (label) {
    label.textContent = outcome.label;
    label.style.color = outcome.color;
  }
  bs.classList.remove('disabled');
  bs.classList.add('revealed');

  setTimeout(() => {
    applyBonusOutcome(outcome);
    ui.bonusResult.textContent = outcome.result;
    ui.bonusResult.style.color = outcome.color;
    ui.bonusResult.classList.remove('hidden');

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
      }, 2400);
    }, 750);
  }, 680);
}

function applyBonusOutcome(outcome) {
  switch (outcome.type) {
    case 'boss_half':
      bossHP = Math.max(1, Math.floor(bossHP / 2));
      updateBars(); playSound('halved');
      showEffect('⚔️ BOSS HP HALVED!', '#ffd700');
      showToast('⚔️ Boss HP cut in half!', '#ffd700');
      spawnParticles('left','#ffd700',24);
      flashArena('rgba(255,215,0,0.22)');
      bossHitVisual();
      break;
    case 'boss_heal':
      bossHP = Math.min(BOSS_MAX_HP, bossHP + BONUS_HEAL_AMT);
      updateBars(); playSound('boss_heal');
      showEffect(`💀 BOSS +${BONUS_HEAL_AMT} HP!`,'#ff3344');
      showToast(`💀 Boss healed ${BONUS_HEAL_AMT} HP!`,'#ff3344');
      spawnParticles('left','#ff3344',16);
      break;
    case 'hero_heal':
      playerHP = Math.min(PLAYER_MAX_HP, playerHP + 25);
      updateBars(); playSound('hero_heal');
      showEffect('💊 HERO +25 HP!','#00ff88');
      showToast('💊 You recovered 25 HP!','#00ff88');
      spawnParticles('right','#00ff88',16);
      showHealFloat('+25');
      break;
    case 'double_dmg':
      doubleDmgActive = true;
      playSound('double_dmg');
      showEffect('⚡ DOUBLE DAMAGE READY!','#a855f7');
      showToast('⚡ Next hit deals DOUBLE damage!','#a855f7');
      spawnParticles('center','#a855f7',22);
      flashArena('rgba(168,85,247,0.22)');
      break;
    case 'nothing':
      showEffect('😐 Nothing happens…','#7a8599');
      break;
  }
}

// ════════════════════════════════════════════════════
//  COMBAT
// ════════════════════════════════════════════════════
function doBossHit(damage, cb) {
  playSound('boss_hurt');
  showDamageNum(`−${damage}`, '#ff5544');
  bossHitVisual();
  bossHP = Math.max(0, bossHP - damage);
  updateBars();
  showExplosion('left');
  spawnParticles('left','#ff8800',14);
  flashArena('rgba(255,34,0,0.15)');
  setTimeout(() => {
    ui.bossSprite.classList.remove('anim-boss-hit');
    if (cb) cb();
  }, 740);
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
  spawnParticles('right','#ff3344',14);

  const gc = document.getElementById('game-container');
  if (gc) {
    const shakes = damage >= 20 ? 2 : 1;
    for (let k = 0; k < shakes; k++) {
      setTimeout(() => {
        gc.classList.add('anim-shake');
        setTimeout(() => gc.classList.remove('anim-shake'), 560);
      }, k * 110);
    }
  }

  playerHP = Math.max(0, playerHP - damage);
  updateBars();
  setTimeout(() => {
    ui.playerSprite.classList.remove('anim-player-hit');
    if (cb) cb();
  }, 740);
}

// ════════════════════════════════════════════════════
//  VISUAL EFFECTS
// ════════════════════════════════════════════════════
function _showFloat(el, text, color, duration = 1450) {
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
  el.classList.remove('hidden','anim-float-up');
  void el.offsetWidth;
  el.classList.add('anim-float-up');
  el.classList.remove('hidden');
  setTimeout(() => {
    el.classList.add('hidden');
    el.classList.remove('anim-float-up');
  }, duration);
}

function showDamageNum(text, color)          { _showFloat(ui.damageNumber,  text, color, 1450); }
function showEffect(text, color = '#ffd700') { _showFloat(ui.effectDisplay, text, color, 1550); }
function showStreakDisplay(text, color)      { _showFloat(ui.streakDisplay,  text, color, 1650); }
function showHealFloat(text) {
  _showFloat(ui.healDisplay, `${text} HP`, 'var(--hp-green)', 1450);
}

function showExplosion(side) {
  if (!ui.explosion) return;
  ui.explosion.style.left = side === 'left' ? '22%' : '65%';
  ui.explosion.style.top  = '24%';
  ui.explosion.classList.remove('hidden');
  setTimeout(() => ui.explosion.classList.add('hidden'), 480);
}

function spawnParticles(side, color, count = 8) {
  if (!ui.particles) return;
  const cx = side === 'left' ? 26 : side === 'right' ? 70 : 50;
  for (let i = 0; i < count; i++) {
    const p  = document.createElement('div');
    p.className = 'particle';
    const sz = 3 + Math.random() * 9;
    p.style.cssText =
      `width:${sz}px;height:${sz}px;` +
      `left:${cx}%;top:${18 + Math.random() * 42}%;` +
      `background:${color};box-shadow:0 0 ${sz}px ${color};`;
    p.style.setProperty('--px', `${(Math.random()-0.5)*180}px`);
    p.style.setProperty('--py', `${(Math.random()-0.5)*180}px`);
    ui.particles.appendChild(p);
    setTimeout(() => p.remove(), 780);
  }
}

function flashArena(color) {
  const arena = document.getElementById('arena');
  if (!arena) return;
  const f = document.createElement('div');
  f.className        = 'flash-overlay';
  f.style.background = color || 'rgba(255,255,255,0.3)';
  arena.appendChild(f);
  setTimeout(() => f.remove(), 400);
}

function spawnBurstRing(slotIdx) {
  const slot = document.getElementById(`slot-${slotIdx}`);
  if (!slot) return;
  const ring = document.createElement('div');
  ring.className = 'burst-ring';
  slot.appendChild(ring);
  setTimeout(() => ring.remove(), 680);
}

function animateScore() {
  ui.scoreDisplay.textContent = score;
  ui.scoreDisplay.classList.remove('score-pop');
  void ui.scoreDisplay.offsetWidth;
  ui.scoreDisplay.classList.add('score-pop');
  setTimeout(() => ui.scoreDisplay.classList.remove('score-pop'), 420);
}

// ════════════════════════════════════════════════════
//  HP BARS & BOSS RING
// ════════════════════════════════════════════════════
function updateBars() {
  const bPct = Math.max(0, bossHP)   / BOSS_MAX_HP   * 100;
  const pPct = Math.max(0, playerHP) / PLAYER_MAX_HP * 100;

  ui.bossHPFill.style.width   = `${bPct}%`;
  ui.playerHPFill.style.width = `${pPct}%`;

  if (ui.bossHPText)
    ui.bossHPText.textContent   = Math.ceil(Math.max(0, bossHP));
  if (ui.playerHPText)
    ui.playerHPText.textContent = Math.ceil(Math.max(0, playerHP));

  if (ui.bossRingFill) {
    const circ = 213.6;
    ui.bossRingFill.style.strokeDashoffset = circ * (1 - bPct / 100);
    ui.bossRingFill.style.stroke =
      bPct < 25 ? '#880000' :
      bPct < 50 ? '#cc4400' : '#ff3344';
  }

  ui.playerHPFill.style.background =
    pPct < 25 ? 'linear-gradient(90deg,#880000,var(--hp-red))' :
    pPct < 50 ? 'linear-gradient(90deg,#994400,#ff8800)' :
                'linear-gradient(90deg,#1d4ed8,var(--cyan))';

  const sprite =
    bPct > 75 ? '👹'    :
    bPct > 50 ? '😤👹' :
    bPct > 25 ? '🔥👹' :
    bPct >  0 ? '💢👹' : '💀';
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
      ui.endIcon.textContent   = '🏆';
      ui.endTitle.textContent  = 'BOSS DEFEATED!';
      ui.endTitle.style.color  = 'var(--gold)';
      ui.endReason.textContent =
        'Your knowledge destroyed the boss! Champion! ⚔️✨';
      spawnParticles('center', '#ffd700', 30);
    } else if (result === 'defeat') {
      ui.endIcon.textContent   = '💀';
      ui.endTitle.textContent  = 'QUEST FAILED';
      ui.endTitle.style.color  = 'var(--hp-red)';
      ui.endReason.textContent =
        'The boss was too strong this time. Study hard and try again! 💪';
    } else {
      ui.endIcon.textContent   = '📚';
      ui.endTitle.textContent  = 'QUESTIONS DONE';
      ui.endTitle.style.color  = '#94a3b8';
      ui.endReason.textContent =
        `All questions used! Boss survived with ${Math.ceil(bossHP)} HP. ` +
        `Add more questions to your file! 🐲`;
    }

    ui.starRating.textContent = buildStars(acc, result);
    buildBadges(acc, result);
  }, 750);
}

function calcRank(acc, result) {
  if (result === 'victory' && acc === 100) return { label:'S+', color:'#ffd700' };
  if (result === 'victory' && acc >= 80)   return { label:'S',  color:'#ffd700' };
  if (acc >= 80)  return { label:'A', color:'#22c55e' };
  if (acc >= 65)  return { label:'B', color:'#00d4ff' };
  if (acc >= 50)  return { label:'C', color:'#94a3b8' };
  return            { label:'D', color:'#ef4444' };
}

function buildStars(acc, result) {
  const n = result === 'victory'
    ? (acc === 100 ? 3 : acc >= 70 ? 2 : 1)
    : (acc >= 60 ? 1 : 0);
  return '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

function buildBadges(acc, result) {
  while (ui.badgesRow.firstChild)
    ui.badgesRow.removeChild(ui.badgesRow.firstChild);

  const badges = [];
  if (result === 'victory')       badges.push('💀 Boss Slayer');
  if (acc === 100)                badges.push('🎯 Perfect Score');
  if (acc >= 80)                  badges.push('🌟 High Achiever');
  if (result === 'victory' && currentRound <= 10)
                                  badges.push('⚡ Speed Runner');
  if (playerHP >= 80)             badges.push('🛡️ Untouchable');
  if (correctCount >= 10)         badges.push('🧠 Knowledge Master');
  if (bestStreak >= 5)            badges.push('🔥 Streak Master');
  if (bestStreak >= 10)           badges.push('💥 Unstoppable');
  if (totalXP >= 200)             badges.push('⭐ XP Hunter');
  if (doubleDmgActive)            badges.push('⚡ Double Dealer');
  if (badges.length === 0)        badges.push('📚 Keep Studying!');

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

// ════════════════════════════════════════════════════
//  BOX-AND-WHISKER PLOT RENDERER (SVG)
// ════════════════════════════════════════════════════
function renderBoxPlot(bp) {
  const { min, q1, median, q3, max, label } = bp;
  if ([min,q1,median,q3,max].some(v => v === undefined || v === null))
    return null;

  const W = 320, H = 96, padL = 34, padR = 34;
  const drawW  = W - padL - padR;
  const boxTop = 22, boxH = 32;
  const boxMid = boxTop + boxH / 2;
  const tickH  = 10;
  const range  = max - min || 1;
  const scaleX = v => padL + ((v - min) / range) * drawW;

  const xMin = scaleX(min), xQ1 = scaleX(q1),
        xMed = scaleX(median), xQ3 = scaleX(q3),
        xMax = scaleX(max);

  const ns  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', H);
  svg.style.overflow = 'visible';

  function el(tag, attrs, text) {
    const e = document.createElementNS(ns, tag);
    for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  svg.appendChild(el('line',{x1:xMin,y1:boxMid,x2:xMax,y2:boxMid,
    stroke:'#1e1e4e','stroke-width':2}));
  svg.appendChild(el('line',{x1:xMin,y1:boxMid,x2:xQ1,y2:boxMid,
    stroke:'#00d4ff','stroke-width':2.5,'stroke-dasharray':'4,2'}));
  svg.appendChild(el('line',{x1:xMin,y1:boxMid-tickH,x2:xMin,y2:boxMid+tickH,
    stroke:'#00d4ff','stroke-width':2.5,'stroke-linecap':'round'}));
  svg.appendChild(el('line',{x1:xQ3,y1:boxMid,x2:xMax,y2:boxMid,
    stroke:'#00d4ff','stroke-width':2.5,'stroke-dasharray':'4,2'}));
  svg.appendChild(el('line',{x1:xMax,y1:boxMid-tickH,x2:xMax,y2:boxMid+tickH,
    stroke:'#00d4ff','stroke-width':2.5,'stroke-linecap':'round'}));
  svg.appendChild(el('rect',{x:xQ1,y:boxTop,width:xQ3-xQ1,height:boxH,
    fill:'rgba(168,85,247,0.22)',stroke:'#a855f7','stroke-width':2,rx:3}));
  svg.appendChild(el('line',{x1:xMed,y1:boxTop,x2:xMed,y2:boxTop+boxH,
    stroke:'#ffd700','stroke-width':3,'stroke-linecap':'round'}));

  const labelY = boxTop + boxH + 16;
  const subY   = labelY + 13;

  function clampX(x, str) {
    const hw = str.length * 3.5;
    return Math.max(padL + hw, Math.min(W - padR - hw, x));
  }

  [{x:xMin,val:min,sub:'Min'},{x:xQ1,val:q1,sub:'Q1'},
   {x:xMed,val:median,sub:'Median'},{x:xQ3,val:q3,sub:'Q3'},
   {x:xMax,val:max,sub:'Max'}
  ].forEach(({x,val,sub}) => {
    const cx  = clampX(x, String(val));
    const isM = sub === 'Median';
    svg.appendChild(el('line',{
      x1:x,y1:boxTop+boxH,x2:x,y2:boxTop+boxH+5,
      stroke:'#7a8599','stroke-width':1
    }));
    svg.appendChild(el('text',{
      x:cx, y:labelY, 'text-anchor':'middle',
      fill: isM ? '#ffd700' : '#e2e8f0',
      'font-size':'10',
      'font-family':'Chakra Petch, sans-serif',
      'font-weight': isM ? '700' : '500',
    }, String(val)));
    svg.appendChild(el('text',{
      x:cx, y:subY, 'text-anchor':'middle',
      fill: isM ? '#ffd700' : '#7a8599',
      'font-size':'8',
      'font-family':'Chakra Petch, sans-serif',
      'font-weight': isM ? '700' : '400',
    }, sub));
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'q-boxplot-wrap';
  if (label) {
    const title = document.createElement('div');
    title.className   = 'q-boxplot-label';
    title.textContent = label;
    wrapper.appendChild(title);
  }
  wrapper.appendChild(svg);
  return wrapper;
}