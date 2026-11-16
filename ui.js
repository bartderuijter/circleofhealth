// ============================================================
//  Circle of Health — ui.js
//  Menu, scroll-animaties en contactformulier. Staat los van
//  Firebase, zodat dit altijd werkt, ook als de database niet laadt.
// ============================================================
(() => {
  const WEB3FORMS_KEY = '2933d4fe-824d-40e2-9c59-6bc1bb752a8c';
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const editing = () => document.body.classList.contains('edit-mode');

  document.documentElement.classList.add('js');

  // ── Menu ────────────────────────────────────────────────────
  const toggle = $('#nav-toggle');
  const nav    = $('#main-nav');
  const header = $('#site-header');

  function setOpen(open) {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  }
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  $$('a', nav).forEach(a => a.addEventListener('click', () => { if (!editing()) setOpen(false); }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); toggle.focus(); }
  });

  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Rustig in beeld komen bij scrollen ──────────────────────
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  // ── Knop bij een dienst: onderwerp alvast invullen ──────────
  $$('[data-topic-from]').forEach(btn => btn.addEventListener('click', () => {
    if (editing()) return;
    const topic = $('#cf-topic');
    const title = $(`[data-field="${btn.dataset.topicFrom}"]`);
    if (topic && title) topic.value = title.textContent.trim();
  }));

  // ── Contactformulier (e-mail via Web3Forms) ─────────────────
  const form = $('#contact-form');
  if (form) form.addEventListener('submit', async e => {
    e.preventDefault();
    const feedback  = $('#cf-feedback');
    const submitBtn = $('#cf-submit');
    const label     = submitBtn.textContent;

    const show = (msg, type) => {
      feedback.textContent = msg;
      feedback.hidden      = false;
      feedback.dataset.type = type;
    };

    const data = Object.fromEntries(
      [...new FormData(form)].map(([key, value]) => [key, String(value).trim()])
    );
    if (!data.name || !data.email || !data.message) return show('Vul alle velden in.', 'error');
    if (!form.checkValidity()) return show('Controleer je e-mailadres.', 'error');

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Versturen…';
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject:    'Nieuw bericht via Circle of Health',
          from_name:  data.name,
          replyto:    data.email,
          ...data,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Web3Forms error');
      show('Bedankt, je bericht is verstuurd!', 'success');
      form.reset();
    } catch (err) {
      show('Er ging iets mis. Probeer het later opnieuw of stuur een e-mail.', 'error');
      console.error(err);
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = label;
    }
  });
})();
