// ============================================================
//  Circle of Health — app.js
//  Vanilla JS + Firebase Firestore (geen Storage)
//  Foto's worden client-side gecomprimeerd en als base64
//  data-URI opgeslagen in Firestore.
// ============================================================

import FIREBASE_CONFIG from './firebase-config.js';

// ── Firebase SDK ─────────────────────────────────────────────
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Config ───────────────────────────────────────────────────
const EDIT_PASSWORD = 'circleofhealth2025';

// Web3Forms access key — haal op via https://web3forms.com (voer je e-mailadres in)
const WEB3FORMS_KEY = '16d962e4-0356-44f4-b817-f5d7718f8971';

const DEFAULT_COLORS = {
  'page-bg':     '#faf8f4',
  'hero-bg':     '#c5d9c1',
  'over-bg':     '#faf8f4',
  'diensten-bg': '#f0ebe1',
  'contact-bg':  '#faf8f4',
  'heading':     '#3d3530',
  'text':        '#3d3530',
  'accent':      '#7a9e7e',
};

// ── Init ─────────────────────────────────────────────────────
const app = initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

const CONTENT_DOC = doc(db, 'content', 'site');

// ── State ────────────────────────────────────────────────────
let saveTimer            = null;
let colorSaveTimer       = null;
let elementStyleSaveTimer = null;
let activePhotoZone      = null;
let currentColors        = { ...DEFAULT_COLORS };
let elementStyles        = {};   // { fieldId: { color, background, fontSize, fontFamily, bold, italic } }
let activeEl             = null; // het element waarvoor de toolbar open is
let activeField          = null; // data-field van dat element

// ── DOM helpers ──────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── Kleurconversie rgb(…) → #rrggbb ──────────────────────────
function rgbToHex(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return '#000000';
  return '#' + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

// ── 1. Load content from Firestore ───────────────────────────
async function loadContent() {
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firebase timeout')), 8000)
    );
    const snap = await Promise.race([getDoc(CONTENT_DOC), timeout]);
    if (!snap.exists()) return;
    applyContent(snap.data());
  } catch (e) {
    console.warn('Could not load Firestore content:', e.message);
  }
}

function applyContent(data) {
  // Tekstvelden
  $$('[data-field]').forEach(el => {
    const field = el.dataset.field;
    if (!field || el.classList.contains('photo-zone')) return;
    if (data[field]) el.innerHTML = data[field];
  });

  // Logo
  if (data.logoUrl) showLogoImage(data.logoUrl);

  // Foto-zones
  $$('.photo-zone').forEach(zone => {
    const url = data[zone.dataset.field];
    if (url) applyPhotoToZone(zone, url);
  });

  // Globale kleuren
  if (data.colors) {
    currentColors = { ...DEFAULT_COLORS, ...data.colors };
    applyColors(currentColors);
  }

  // Per-element stijlen — ook zichtbaar voor gewone bezoekers
  if (data.elementStyles) {
    elementStyles = data.elementStyles;
    applyAllElementStyles();
  }
}

// ── 2. Apply global colors ────────────────────────────────────
function applyColors(colors) {
  const root = document.documentElement;
  Object.entries(colors).forEach(([key, val]) => {
    root.style.setProperty(`--color-${key}`, val);
  });
}

// ── 3. Apply per-element styles ───────────────────────────────
function applyAllElementStyles() {
  Object.entries(elementStyles).forEach(([field, style]) => {
    const el = document.querySelector(`[data-field="${field}"]`);
    if (el) applyElementStyle(el, style);
  });
}

function applyElementStyle(el, style) {
  if (!el || !style) return;
  const isPhoto = el.classList.contains('photo-zone');
  el.style.backgroundColor = style.background || '';
  if (!isPhoto) {
    el.style.color      = style.color      || '';
    el.style.fontSize   = style.fontSize   || '';
    el.style.fontFamily = style.fontFamily ? `'${style.fontFamily}', sans-serif` : '';
    el.style.fontWeight = style.bold       ? '700'    : '';
    el.style.fontStyle  = style.italic     ? 'italic' : '';
  }
}

function clearElementStyle(el) {
  if (!el) return;
  el.style.backgroundColor = '';
  el.style.color           = '';
  el.style.fontSize        = '';
  el.style.fontFamily      = '';
  el.style.fontWeight      = '';
  el.style.fontStyle       = '';
}

// ── 4. Save text content ──────────────────────────────────────
function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveStatus('Opslaan…');
  saveTimer = setTimeout(saveTextContent, 1200);
}

async function saveTextContent() {
  const payload = {};
  $$('[data-field]').forEach(el => {
    const field = el.dataset.field;
    if (!field || el.classList.contains('photo-zone')) return;
    payload[field] = el.innerHTML.trim();
  });
  try {
    await setDoc(CONTENT_DOC, payload, { merge: true });
    setSaveStatus('Opgeslagen ✓');
  } catch (e) {
    setSaveStatus('Fout bij opslaan ✗');
    console.error(e);
  }
}

// ── 5. Save global colors ─────────────────────────────────────
function scheduleColorSave() {
  clearTimeout(colorSaveTimer);
  setSaveStatus('Opslaan…');
  colorSaveTimer = setTimeout(saveColors, 800);
}

async function saveColors() {
  try {
    await setDoc(CONTENT_DOC, { colors: currentColors }, { merge: true });
    setSaveStatus('Opgeslagen ✓');
  } catch (e) {
    setSaveStatus('Fout bij opslaan ✗');
    console.error(e);
  }
}

// ── 6. Save per-element styles ────────────────────────────────
function scheduleElementStyleSave() {
  clearTimeout(elementStyleSaveTimer);
  setSaveStatus('Opslaan…');
  elementStyleSaveTimer = setTimeout(saveElementStyles, 800);
}

async function saveElementStyles() {
  try {
    await setDoc(CONTENT_DOC, { elementStyles }, { merge: true });
    setSaveStatus('Opgeslagen ✓');
  } catch (e) {
    setSaveStatus('Fout bij opslaan ✗');
    console.error(e);
  }
}

function setSaveStatus(msg) {
  const btn = $('#edit-save-btn');
  if (!btn) return;
  btn.textContent = msg;
  btn.classList.toggle('saving', msg === 'Opslaan…');
}

// ── 7. Image → base64 via Canvas ─────────────────────────────
function imageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const img       = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale  = Math.min(1, 800 / img.naturalWidth);
      const w      = Math.round(img.naturalWidth  * scale);
      const h      = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src     = objectUrl;
  });
}

// ── 8. Save single image field ────────────────────────────────
async function saveImageField(field, dataUri) {
  setSaveStatus('Afbeelding opslaan…');
  try {
    await setDoc(CONTENT_DOC, { [field]: dataUri }, { merge: true });
    setSaveStatus('Opgeslagen ✓');
  } catch (e) {
    setSaveStatus('Fout bij opslaan ✗');
    console.error(e);
  }
}

// ── 9. Photo zone helpers ─────────────────────────────────────
function applyPhotoToZone(zone, dataUri) {
  zone.style.backgroundImage = `url('${dataUri}')`;
  zone.classList.add('has-photo');
}

async function handlePhotoFile(file, zone) {
  if (!file || !file.type.startsWith('image/')) return;
  const dataUri = await imageFileToBase64(file);
  applyPhotoToZone(zone, dataUri);
  await saveImageField(zone.dataset.field, dataUri);
}

// ── 10. Logo helpers ──────────────────────────────────────────
function showLogoImage(dataUri) {
  const img  = $('#logo-img');
  const text = $('#logo-text');
  img.src     = dataUri;
  img.hidden  = false;
  text.hidden = true;
}

async function handleLogoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const dataUri = await imageFileToBase64(file);
  showLogoImage(dataUri);
  await saveImageField('logoUrl', dataUri);
}

// ── 11. Element-toolbar: hulpfuncties ─────────────────────────

function getCurrentStyle() {
  if (!activeField) return {};
  if (!elementStyles[activeField]) elementStyles[activeField] = {};
  return elementStyles[activeField];
}

function positionAndShowToolbar(el) {
  const tb     = $('#el-toolbar');
  const rect   = el.getBoundingClientRect();
  const MARGIN = 8;
  const EST_H  = 46;
  const EST_W  = 480;

  // Boven het element, tenzij te hoog
  let top  = rect.top - EST_H - MARGIN;
  if (top < 60) top = rect.bottom + MARGIN;

  // Horizontaal: links uitlijnen op element, maar niet buiten beeld
  let left = rect.left;
  if (left + EST_W > window.innerWidth - MARGIN) {
    left = window.innerWidth - EST_W - MARGIN;
  }
  left = Math.max(MARGIN, left);

  tb.style.top  = `${top}px`;
  tb.style.left = `${left}px`;
  tb.hidden     = false;
}

function populateToolbar(el) {
  const field   = el.dataset.field;
  const style   = elementStyles[field] || {};
  const isPhoto = el.classList.contains('photo-zone');
  const tb      = $('#el-toolbar');

  tb.classList.toggle('is-photo', isPhoto);
  tb.classList.toggle('is-text',  !isPhoto);

  // Achtergrondkleur
  $('#et-bg').value = style.background || '#ffffff';

  if (!isPhoto) {
    // Tekstkleur: opgeslagen waarde of berekende waarde
    if (style.color) {
      $('#et-color').value = style.color;
    } else {
      const computed = getComputedStyle(el).color;
      $('#et-color').value = rgbToHex(computed);
    }
    $('#et-font').value = style.fontFamily || '';
    $('#et-bold').classList.toggle('active',   !!style.bold);
    $('#et-italic').classList.toggle('active', !!style.italic);
  }
}

function showToolbar(el) {
  // Deactiveer vorig element
  if (activeEl && activeEl !== el) activeEl.classList.remove('el-active');

  activeEl    = el;
  activeField = el.dataset.field;
  el.classList.add('el-active');
  populateToolbar(el);
  positionAndShowToolbar(el);
}

function hideToolbar() {
  if (activeEl) activeEl.classList.remove('el-active');
  activeEl    = null;
  activeField = null;
  $('#el-toolbar').hidden = true;
}

// ── 12. Element-toolbar: events ───────────────────────────────
function initElementToolbar() {
  const tb = $('#el-toolbar');

  // Klikken in de toolbar sluit 'm niet
  tb.addEventListener('mousedown', e => e.stopPropagation());

  // Tekstkleur (live preview bij slepen, opslaan bij sluiten picker)
  $('#et-color').addEventListener('input', e => {
    if (!activeEl || !activeField) return;
    const s = getCurrentStyle();
    s.color = e.target.value;
    applyElementStyle(activeEl, s);
  });
  $('#et-color').addEventListener('change', scheduleElementStyleSave);

  // Achtergrondkleur
  $('#et-bg').addEventListener('input', e => {
    if (!activeEl || !activeField) return;
    const s = getCurrentStyle();
    s.background = e.target.value;
    applyElementStyle(activeEl, s);
  });
  $('#et-bg').addEventListener('change', scheduleElementStyleSave);

  // Lettergrootte kleiner
  $('#et-smaller').addEventListener('click', () => {
    if (!activeEl || !activeField) return;
    const s    = getCurrentStyle();
    const base = s.fontSize
      ? parseInt(s.fontSize)
      : parseInt(getComputedStyle(activeEl).fontSize);
    s.fontSize = `${Math.max(8, base - 2)}px`;
    applyElementStyle(activeEl, s);
    scheduleElementStyleSave();
  });

  // Lettergrootte groter
  $('#et-bigger').addEventListener('click', () => {
    if (!activeEl || !activeField) return;
    const s    = getCurrentStyle();
    const base = s.fontSize
      ? parseInt(s.fontSize)
      : parseInt(getComputedStyle(activeEl).fontSize);
    s.fontSize = `${Math.min(120, base + 2)}px`;
    applyElementStyle(activeEl, s);
    scheduleElementStyleSave();
  });

  // Lettertype
  $('#et-font').addEventListener('change', e => {
    if (!activeEl || !activeField) return;
    const s = getCurrentStyle();
    s.fontFamily = e.target.value;
    applyElementStyle(activeEl, s);
    scheduleElementStyleSave();
  });

  // Vet
  $('#et-bold').addEventListener('click', () => {
    if (!activeEl || !activeField) return;
    const s = getCurrentStyle();
    s.bold = !s.bold;
    $('#et-bold').classList.toggle('active', s.bold);
    applyElementStyle(activeEl, s);
    scheduleElementStyleSave();
  });

  // Cursief
  $('#et-italic').addEventListener('click', () => {
    if (!activeEl || !activeField) return;
    const s = getCurrentStyle();
    s.italic = !s.italic;
    $('#et-italic').classList.toggle('active', s.italic);
    applyElementStyle(activeEl, s);
    scheduleElementStyleSave();
  });

  // Foto vervangen (toolbar-knop delegeert naar photo-file-input)
  $('#et-photo-btn').addEventListener('click', () => {
    if (activeEl && activeEl.classList.contains('photo-zone')) {
      activePhotoZone = activeEl;
      $('#photo-file-input').click();
    }
  });

  // Herstel stijl van dit element
  $('#et-reset').addEventListener('click', () => {
    if (!activeField) return;
    delete elementStyles[activeField];
    clearElementStyle(activeEl);
    scheduleElementStyleSave();
    if (activeEl) populateToolbar(activeEl);
  });

  // Klikken buiten toolbar én buiten [data-field] sluit toolbar
  document.addEventListener('mousedown', e => {
    if (!activeEl) return;
    if (e.target.closest('#el-toolbar')) return;
    if (e.target.closest('[data-field]')) return;
    hideToolbar();
  });

  // Escape sluit toolbar
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideToolbar();
  });

  // Herpositioneer bij scrollen
  window.addEventListener('scroll', () => {
    if (activeEl && !$('#el-toolbar').hidden) {
      positionAndShowToolbar(activeEl);
    }
  }, { passive: true });

  // Herpositioneer bij resize
  window.addEventListener('resize', () => {
    if (activeEl && !$('#el-toolbar').hidden) {
      positionAndShowToolbar(activeEl);
    }
  });
}

// ── 13. Color panel (Hele site) ───────────────────────────────
function initColorPanel() {
  const panel    = $('#color-panel');
  const openBtn  = $('#color-panel-btn');
  const closeBtn = $('#color-panel-close');
  const resetBtn = $('#color-reset-btn');

  function syncInputs() {
    $$('[data-color]', panel).forEach(input => {
      input.value = currentColors[input.dataset.color] ?? DEFAULT_COLORS[input.dataset.color];
    });
  }

  openBtn.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden  = !opening;
    openBtn.setAttribute('aria-expanded', String(opening));
    if (opening) syncInputs();
  });

  closeBtn.addEventListener('click', () => {
    panel.hidden = true;
    openBtn.setAttribute('aria-expanded', 'false');
  });

  $$('[data-color]', panel).forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.color;
      currentColors[key] = input.value;
      document.documentElement.style.setProperty(`--color-${key}`, input.value);
      scheduleColorSave();
    });
  });

  resetBtn.addEventListener('click', () => {
    currentColors = { ...DEFAULT_COLORS };
    applyColors(currentColors);
    syncInputs();
    scheduleColorSave();
  });
}

// ── 14. Edit mode ─────────────────────────────────────────────
function enterEditMode() {
  document.body.classList.add('edit-mode');
  $('#edit-bar').hidden = false;
  $('#edit-fab').hidden = false;

  // Tekstelementen bewerkbaar maken
  $$('.editable').forEach(el => {
    el.contentEditable = 'true';
    el.addEventListener('input', scheduleSave);
  });

  // Alle [data-field] elementen: mousedown → toolbar tonen
  $$('[data-field]').forEach(el => {
    el.addEventListener('mousedown', () => {
      // Toolbar opnieuw tonen als 'm gesloten is voor hetzelfde element
      if (el !== activeEl || $('#el-toolbar').hidden) {
        showToolbar(el);
      }
    });
  });

  // Foto-input (gedeeld): triggered door toolbar "Foto"-knop of drag-drop
  const photoInput = $('#photo-file-input');
  photoInput.addEventListener('change', () => {
    if (activePhotoZone) handlePhotoFile(photoInput.files[0], activePhotoZone);
    photoInput.value = '';
  });

  // Drag & drop op foto-zones
  $$('.photo-zone').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      activePhotoZone = zone;
      handlePhotoFile(e.dataTransfer.files[0], zone);
    });
  });

  // Logo upload
  const logoZone  = $('#logo-upload-zone');
  const logoInput = $('#logo-file-input');
  logoZone.hidden = false;
  logoZone.addEventListener('click', () => logoInput.click());
  logoZone.addEventListener('dragover', e => {
    e.preventDefault();
    logoZone.style.background = 'rgba(122,158,126,.15)';
  });
  logoZone.addEventListener('dragleave', () => logoZone.style.background = '');
  logoZone.addEventListener('drop', e => {
    e.preventDefault();
    logoZone.style.background = '';
    handleLogoFile(e.dataTransfer.files[0]);
  });
  logoInput.addEventListener('change', () => {
    handleLogoFile(logoInput.files[0]);
    logoInput.value = '';
  });

  initColorPanel();
  initElementToolbar();
}

// ── 15. Contact form ──────────────────────────────────────────
async function handleContactSubmit(e) {
  e.preventDefault();
  const form      = e.target;
  const feedback  = $('#cf-feedback');
  const submitBtn = $('#cf-submit');

  const name    = form.name.value.trim();
  const email   = form.email.value.trim();
  const message = form.message.value.trim();

  if (!name || !email || !message) {
    showFeedback(feedback, 'Vul alle velden in.', 'error');
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Versturen…';

  try {
    if (WEB3FORMS_KEY) {
      // Stuur e-mail via Web3Forms
      const res = await fetch('https://api.web3forms.com/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject:    'Nieuw bericht via Circle of Health',
          from_name:  name,
          replyto:    email,
          name, email, message,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Web3Forms error');
    } else {
      // Fallback: sla op in Firestore als er nog geen Web3Forms key is
      await addDoc(collection(db, 'messages'), {
        name, email, message,
        createdAt: serverTimestamp(),
      });
    }
    showFeedback(feedback, 'Bedankt, je bericht is verstuurd!', 'success');
    form.reset();
  } catch (err) {
    showFeedback(feedback, 'Er ging iets mis. Probeer het later opnieuw.', 'error');
    console.error(err);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Verstuur bericht';
  }
}

function showFeedback(el, msg, type) {
  el.textContent = msg;
  el.hidden      = false;
  el.style.color = type === 'error' ? '#c0392b' : 'var(--sage-dark)';
}

// ── 16. Navigation ────────────────────────────────────────────
function initNav() {
  const toggle = $('#nav-toggle');
  const nav    = $('#main-nav');

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  $$('#main-nav a').forEach(a => {
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  const header = $('#site-header');
  new IntersectionObserver(
    ([entry]) => header.classList.toggle('scrolled', !entry.isIntersecting),
    { threshold: 0 }
  ).observe($('#hero'));
}

// ── 17. Bootstrap ─────────────────────────────────────────────
async function init() {
  initNav();
  await loadContent();

  const params = new URLSearchParams(location.search);
  if (params.get('edit') === 'true') {
    const stored = sessionStorage.getItem('editAuth');
    if (stored === EDIT_PASSWORD) {
      enterEditMode();
    } else {
      const pw = prompt('Voer het wachtwoord in voor edit mode:');
      if (pw === EDIT_PASSWORD) {
        sessionStorage.setItem('editAuth', pw);
        enterEditMode();
      } else {
        alert('Onjuist wachtwoord.');
      }
    }
  }

  $('#contact-form').addEventListener('submit', handleContactSubmit);
}

init();
