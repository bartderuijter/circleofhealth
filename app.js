// ============================================================
//  Circle of Health — app.js
//  Vanilla JS + Firebase (Firestore + Storage)
// ============================================================

import FIREBASE_CONFIG from './firebase-config.js';

// ── Firebase SDK (CDN ESM shim) ──────────────────────────────
import { initializeApp }                    from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, serverTimestamp }
                                             from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL }
                                             from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// ── Config ───────────────────────────────────────────────────
const EDIT_PASSWORD = 'circleofhealth2025'; // ← pas dit aan

// ── Init ─────────────────────────────────────────────────────
const app     = initializeApp(FIREBASE_CONFIG);
const db      = getFirestore(app);
const storage = getStorage(app);

const CONTENT_DOC = doc(db, 'content', 'site');

// ── State ────────────────────────────────────────────────────
let isEditMode = false;
let saveTimer  = null;
let activePhotoField = null;

// ── DOM helpers ──────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── 1. Load content from Firestore ───────────────────────────
async function loadContent() {
  try {
    const snap = await getDoc(CONTENT_DOC);
    if (!snap.exists()) return;
    const data = snap.data();
    applyContent(data);
  } catch (e) {
    console.warn('Could not load Firestore content:', e.message);
  }
}

function applyContent(data) {
  // Text fields
  $$('[data-field]').forEach(el => {
    const field = el.dataset.field;
    if (!field || el.classList.contains('photo-zone')) return;
    if (data[field] !== undefined && data[field] !== '') {
      el.innerHTML = data[field];
    }
  });

  // Logo
  if (data.logoUrl) {
    showLogoImage(data.logoUrl);
  }

  // Photo zones
  $$('.photo-zone').forEach(zone => {
    const field = zone.dataset.field;
    if (data[field]) {
      applyPhotoToZone(zone, data[field]);
    }
  });
}

// ── 2. Save content to Firestore ─────────────────────────────
function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveStatus('Opslaan…');
  saveTimer = setTimeout(saveContent, 1200);
}

async function saveContent() {
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

// ── 3. Image resize helper ────────────────────────────────────
function resizeImage(file, maxWidth = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale   = Math.min(1, maxWidth / img.naturalWidth);
      const w       = Math.round(img.naturalWidth  * scale);
      const h       = Math.round(img.naturalHeight * scale);
      const canvas  = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', 0.88);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── 4. Upload image → Storage, save URL → Firestore ──────────
async function uploadAndSaveImage(file, field) {
  setSaveStatus('Afbeelding uploaden…');
  try {
    const blob      = await resizeImage(file);
    const storageRef = ref(storage, `images/${field}_${Date.now()}.jpg`);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(storageRef);
    await setDoc(CONTENT_DOC, { [field]: url }, { merge: true });
    setSaveStatus('Opgeslagen ✓');
    return url;
  } catch (e) {
    setSaveStatus('Upload mislukt ✗');
    console.error(e);
    return null;
  }
}

// ── 5. Photo zone helpers ─────────────────────────────────────
function applyPhotoToZone(zone, url) {
  zone.style.backgroundImage = `url('${url}')`;
  zone.classList.add('has-photo');
}

async function handlePhotoFile(file, zone) {
  if (!file || !file.type.startsWith('image/')) return;
  const field = zone.dataset.field;
  // Optimistic preview
  const previewUrl = URL.createObjectURL(file);
  applyPhotoToZone(zone, previewUrl);
  // Upload
  const url = await uploadAndSaveImage(file, field);
  if (url) {
    applyPhotoToZone(zone, url);
    URL.revokeObjectURL(previewUrl);
  }
}

// ── 6. Logo image helpers ─────────────────────────────────────
function showLogoImage(url) {
  const img  = $('#logo-img');
  const text = $('#logo-text');
  img.src    = url;
  img.hidden = false;
  text.hidden = true;
}

async function handleLogoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const previewUrl = URL.createObjectURL(file);
  showLogoImage(previewUrl);
  const url = await uploadAndSaveImage(file, 'logoUrl');
  if (url) {
    showLogoImage(url);
    URL.revokeObjectURL(previewUrl);
  }
}

// ── 7. Edit mode setup ────────────────────────────────────────
function enterEditMode() {
  isEditMode = true;
  document.body.classList.add('edit-mode');
  $('#edit-bar').hidden  = false;
  $('#edit-fab').hidden  = false;

  // Make text nodes editable
  $$('.editable').forEach(el => {
    el.contentEditable = 'true';
    el.addEventListener('input', scheduleSave);
  });

  // Photo zones — click to open file picker
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

  // Shared hidden file input for photo zones
  const photoInput = $('#photo-file-input');
  photoInput.addEventListener('change', () => {
    if (activePhotoField) handlePhotoFile(photoInput.files[0], activePhotoField);
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
  activePhotoField = zone;
  $('#photo-file-input').click();
}

// ── 8. Contact form ───────────────────────────────────────────
async function handleContactSubmit(e) {
  e.preventDefault();
  const form     = e.target;
  const feedback = $('#cf-feedback');
  const submitBtn = $('#cf-submit');

  const name    = form.name.value.trim();
  const email   = form.email.value.trim();
  const message = form.message.value.trim();

  if (!name || !email || !message) {
    showFeedback(feedback, 'Vul alle velden in.', 'error');
    return;
  }

  submitBtn.disabled = true;
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
    submitBtn.disabled  = false;
    submitBtn.textContent = 'Verstuur bericht';
  }
}

function showFeedback(el, msg, type) {
  el.textContent = msg;
  el.hidden = false;
  el.style.color = type === 'error' ? '#c0392b' : 'var(--sage-dark)';
}

// ── 9. Navigation helpers ─────────────────────────────────────
function initNav() {
  const toggle = $('#nav-toggle');
  const nav    = $('#main-nav');

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  // Close on nav link click (mobile)
  $$('#main-nav a').forEach(a => {
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  // Scrolled class on header
  const header = $('#site-header');
  const observer = new IntersectionObserver(
    ([entry]) => header.classList.toggle('scrolled', !entry.isIntersecting),
    { threshold: 0 }
  );
  observer.observe($('#hero'));
}

// ── 10. Bootstrap ─────────────────────────────────────────────
async function init() {
  initNav();

  // Load content first (so page shows saved state before potential edit mode)
  await loadContent();

  // Check URL for edit mode
  const params = new URLSearchParams(location.search);
  if (params.get('edit') === 'true') {
    const pw = prompt('Voer het wachtwoord in voor edit mode:');
    if (pw === EDIT_PASSWORD) {
      enterEditMode();
    } else {
      alert('Onjuist wachtwoord.');
    }
  }

  // Contact form
  $('#contact-form').addEventListener('submit', handleContactSubmit);
}

init();
