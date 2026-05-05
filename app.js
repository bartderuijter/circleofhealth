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
const EDIT_PASSWORD = 'circleofhealth2025'; // ← pas dit aan

// ── Init ─────────────────────────────────────────────────────
const app = initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

const CONTENT_DOC = doc(db, 'content', 'site');

// ── State ────────────────────────────────────────────────────
let saveTimer        = null;
let activePhotoZone  = null;

// ── DOM helpers ──────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── 1. Load content from Firestore ───────────────────────────
async function loadContent() {
  try {
    const snap = await getDoc(CONTENT_DOC);
    if (!snap.exists()) return;
    applyContent(snap.data());
  } catch (e) {
    console.warn('Could not load Firestore content:', e.message);
  }
}

function applyContent(data) {
  $$('[data-field]').forEach(el => {
    const field = el.dataset.field;
    if (!field || el.classList.contains('photo-zone')) return;
    if (data[field]) el.innerHTML = data[field];
  });

  if (data.logoUrl) showLogoImage(data.logoUrl);

  $$('.photo-zone').forEach(zone => {
    const url = data[zone.dataset.field];
    if (url) applyPhotoToZone(zone, url);
  });
}

// ── 2. Save text content ──────────────────────────────────────
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

function setSaveStatus(msg) {
  const btn = $('#edit-save-btn');
  if (!btn) return;
  btn.textContent = msg;
  btn.classList.toggle('saving', msg === 'Opslaan…');
}

// ── 3. Image → base64 via Canvas (max 800px, JPEG 0.75) ──────
function imageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
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
    img.src = objectUrl;
  });
}

// ── 4. Save a single image field to Firestore ────────────────
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

// ── 5. Photo zone helpers ─────────────────────────────────────
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

// ── 6. Logo helpers ───────────────────────────────────────────
function showLogoImage(dataUri) {
  const img   = $('#logo-img');
  const text  = $('#logo-text');
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

// ── 7. Edit mode ──────────────────────────────────────────────
function enterEditMode() {
  document.body.classList.add('edit-mode');
  $('#edit-bar').hidden = false;
  $('#edit-fab').hidden = false;

  $$('.editable').forEach(el => {
    el.contentEditable = 'true';
    el.addEventListener('input', scheduleSave);
  });

  $$('.photo-zone').forEach(zone => {
    zone.addEventListener('click', () => triggerPhotoInput(zone));
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      handlePhotoFile(e.dataTransfer.files[0], zone);
    });
  });

  const photoInput = $('#photo-file-input');
  photoInput.addEventListener('change', () => {
    if (activePhotoZone) handlePhotoFile(photoInput.files[0], activePhotoZone);
    photoInput.value = '';
  });

  // Logo upload zone
  const logoZone  = $('#logo-upload-zone');
  const logoInput = $('#logo-file-input');
  logoZone.hidden = false;
  logoZone.addEventListener('click', () => logoInput.click());
  logoZone.addEventListener('dragover', e => { e.preventDefault(); logoZone.style.background = 'rgba(122,158,126,.15)'; });
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
}

function triggerPhotoInput(zone) {
  activePhotoZone = zone;
  $('#photo-file-input').click();
}

// ── 8. Contact form ───────────────────────────────────────────
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
    await addDoc(collection(db, 'messages'), {
      name, email, message,
      createdAt: serverTimestamp()
    });
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

// ── 9. Navigation ─────────────────────────────────────────────
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

// ── 10. Bootstrap ─────────────────────────────────────────────
async function init() {
  initNav();
  await loadContent();

  const params = new URLSearchParams(location.search);
  if (params.get('edit') === 'true') {
    const pw = prompt('Voer het wachtwoord in voor edit mode:');
    if (pw === EDIT_PASSWORD) {
      enterEditMode();
    } else {
      alert('Onjuist wachtwoord.');
    }
  }

  $('#contact-form').addEventListener('submit', handleContactSubmit);
}

init();
