const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Theme preference stays on this device. Both themes use the same content.
const themeButton = $('.theme-toggle');
function syncTheme() {
  const isLight = root.dataset.theme === 'light';
  themeButton.setAttribute('aria-label', `Включить ${isLight ? 'тёмную' : 'светлую'} тему`);
  $('meta[name="theme-color"]').content = isLight ? '#e4e8e5' : '#1b2022';
}
themeButton.addEventListener('click', () => {
  // Interpolate colors in place. Snapshot transitions can flatten preserve-3d
  // descendants, so the cube must stay in the live scene throughout the change.
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('supply-theme', root.dataset.theme); } catch { /* Private mode still allows switching. */ }
  syncTheme();
});
syncTheme();

const menuButton = $('.menu-toggle');
const navigation = $('#main-nav');
const mobileMenu = matchMedia('(max-width: 899px)');
function setMenu(open) {
  const expanded = mobileMenu.matches && open;
  menuButton.setAttribute('aria-expanded', String(expanded));
  menuButton.setAttribute('aria-label', expanded ? 'Закрыть меню' : 'Открыть меню');
  navigation.classList.toggle('is-open', expanded);
  navigation.hidden = mobileMenu.matches && !expanded;
}
menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
mobileMenu.addEventListener('change', () => setMenu(false));
navigation.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') { setMenu(false); menuButton.focus(); }
});
document.addEventListener('click', (event) => { if (!event.target.closest('.site-header')) setMenu(false); });
setMenu(false);

const header = $('.site-header');
let scrollPending = false;
function updateHeader() { header.classList.toggle('scrolled', scrollY > 24); scrollPending = false; }
addEventListener('scroll', () => { if (!scrollPending) { scrollPending = true; requestAnimationFrame(updateHeader); } }, { passive:true });
updateHeader();

// Same-page navigation without fragments in the address bar. The form gets its
// own target: a tall introduction must not leave the actual fields off-screen.
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const id = link.getAttribute('href').slice(1);
  const section = document.getElementById(id);
  if (!section) return;
  event.preventDefault();
  setMenu(false);
  const target = id === 'request' ? $('.request-area') : id === 'services' ? $('.section-heading',section) : id === 'questions' ? $('.questions-heading',section) : section;
  document.dispatchEvent(new CustomEvent('section:navigate',{detail:{section}}));
  const bottom = $('.header-inner').getBoundingClientRect().bottom;
  const gap = id === 'request' ? 4 : 24;
  const top = id === 'main' ? 0 : Math.max(0,scrollY+target.getBoundingClientRect().top-bottom-gap);
  // Smooth only this explicit click, never wheel/touch scrolling.
  scrollTo({top,behavior:reducedMotion.matches ? 'instant' : 'smooth'});
  if (link.classList.contains('skip-link')) { section.tabIndex=-1;section.focus({preventScroll:true}); }
});

// Native details remain functional without JS; WAAPI also animates closing.
const disclosures = new Map();
$$('.faq').forEach((details) => {
  const summary = $('summary', details);
  const content = summary.nextElementSibling;
  const state = { expanded: details.open, animation: null };
  function finish() {
    const animation = state.animation;
    state.animation = null;
    if (animation) { animation.onfinish = null; animation.cancel(); }
    details.open = state.expanded;
    details.style.height = '';
    details.style.overflow = '';
    content.inert = !state.expanded;
  }
  function setExpanded(expanded, instant = false) {
    const start = details.getBoundingClientRect().height;
    if (state.animation) {
      state.animation.onfinish = null;
      state.animation.cancel();
      state.animation = null;
    }
    state.expanded = expanded;
    summary.setAttribute('aria-expanded', String(expanded));
    details.dataset.expanded = String(expanded);
    content.inert = !expanded;
    if (instant || reducedMotion.matches || !details.animate) { finish(); return; }
    // Measure the natural end size before locking the current (possibly interrupted) height.
    details.style.height = '';
    details.open = expanded;
    const end = details.getBoundingClientRect().height;
    details.open = true;
    details.style.height = `${start}px`;
    details.style.overflow = 'clip';
    state.animation = details.animate(
      { height: [`${start}px`, `${end}px`] },
      { duration: expanded ? 280 : 220, easing: 'cubic-bezier(.22,.61,.36,1)' }
    );
    state.animation.onfinish = finish;
  }
  summary.setAttribute('aria-expanded', String(state.expanded));
  details.dataset.expanded = String(state.expanded);
  content.inert = !state.expanded;
  summary.addEventListener('click', (event) => {
    event.preventDefault();
    const expanded = !state.expanded;
    setExpanded(expanded, event.detail === 0);
  });
  disclosures.set(details, { state, setExpanded, finish });
});
// Reflow and accessibility preference changes must never leave a clipped panel.
addEventListener('resize', () => disclosures.forEach(({ finish }) => finish()));
reducedMotion.addEventListener('change', () => disclosures.forEach(({ finish }) => finish()));

const form = $('#request-form');
const task = $('#task');
const contact = $('#contact');
const fileInput = $('#specification');
const result = $('#request-result');
const placeholders = {
  exact:'Модель или артикул, количество, важные характеристики…',
  analog:'Что нужно заменить? Укажите модель, характеристики и ограничения…',
  solution:'Опишите задачу, условия работы и требования к оборудованию…'
};
const kindNames = { exact:'Точная позиция', analog:'Подбор аналога', solution:'Подбор решения' };
function syncKind() { task.placeholder = placeholders[form.elements.kind.value]; }
$$('input[name="kind"]', form).forEach(input => input.addEventListener('change', syncKind));
syncKind();
function setFieldError(input, message) {
  input.setAttribute('aria-invalid', String(Boolean(message)));
  $(`#${input.id}-error`).textContent = message;
}
[contact, task].forEach((input) => input.addEventListener('input', () => setFieldError(input, '')));
form.addEventListener('input', () => { result.hidden = true; });
form.addEventListener('change', () => { result.hidden = true; });
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  const label = $('#file-label');
  const error = $('#file-error');
  error.textContent = '';
  fileInput.removeAttribute('aria-invalid');
  label.textContent = 'Добавить файл';
  if (!file) return;
  let message = '';
  if (file.size > 10 * 1024 * 1024) message = 'Файл больше 10 МБ. Выберите файл поменьше.';
  else if (!/\.(pdf|docx?|xlsx?|csv|txt|jpe?g|png|webp)$/i.test(file.name)) message = 'Выберите PDF, документ, таблицу или изображение.';
  if (message) { error.textContent = message; fileInput.value = ''; fileInput.setAttribute('aria-invalid', 'true'); return; }
  label.textContent = file.name;
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const connection = contact.value.trim();
  const details = task.value.trim();
  const digits = connection.replace(/\D/g, '');
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(connection);
  const isPhone = /^\+?[\d\s().-]+$/.test(connection) && digits.length >= 7 && digits.length <= 15;
  const contactError = !connection ? 'Укажите телефон или email для связи.' : !(isEmail || isPhone) ? 'Проверьте телефон или email. Например: name@company.ru.' : '';
  const taskError = details.length < 3 ? 'Укажите нужную позицию или кратко опишите задачу.' : '';
  setFieldError(contact, contactError);
  setFieldError(task, taskError);
  if (contactError || taskError) { result.hidden = true; (contactError ? contact : task).focus(); return; }
  const lines = ['Запрос на подбор и поставку оборудования', '', `Тип запроса: ${kindNames[form.elements.kind.value]}`];
  if (form.elements.name.value.trim()) lines.push(`Контактное лицо: ${form.elements.name.value.trim()}`);
  if (form.elements.company.value.trim()) lines.push(`Компания: ${form.elements.company.value.trim()}`);
  lines.push(`Телефон или email: ${connection}`, '', 'Задача:', details);
  if (fileInput.files[0]) lines.push('', `Спецификация: ${fileInput.files[0].name}`, 'Файл нужно приложить отдельно — в текстовом черновике только его название.');
  lines.push('', 'Локальный черновик. Этот запрос не был отправлен.');
  $('#request-preview').value = lines.join('\n');
  $('#result-message').textContent = '';
  result.hidden = false;
  $('#result-heading').focus({preventScroll:true});
  result.scrollIntoView({behavior:'auto', block:'center'});
});

$('#copy-request').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText($('#request-preview').value);
    $('#result-message').textContent = 'Текст запроса скопирован.';
  } catch {
    $('#request-preview').focus();
    $('#request-preview').select();
    $('#result-message').textContent = 'Текст выделен. Скопируйте его через меню устройства или сочетанием клавиш.';
  }
});
$('#download-request').addEventListener('click', () => {
  const blob = new Blob(['\uFEFF' + $('#request-preview').value], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'Запрос-на-поставку.txt';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#result-message').textContent = 'Файл запроса подготовлен для скачивания. Запрос никуда не отправлен.';
});

if ('IntersectionObserver' in window) {
  const sections = $$('main>section');
  const visibleSections = new Set();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleSections.add(entry.target);
      else visibleSections.delete(entry.target);
    }
    // Leaving a section must also clear its highlight, including a return to
    // the hero, which now lives inside its own scroll-animation wrapper.
    const active = sections.filter(section => visibleSections.has(section)).pop();
    $$('.main-nav a').forEach((link) => {
      if (active?.id && link.hash === `#${active.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, {rootMargin:'-20% 0px -55% 0px', threshold:0});
  sections.forEach((section) => observer.observe(section));
}

// A small response to the pointer gives the illustration depth; touch stays still.
const equipmentScene = $('.hero-equipment');
if (equipmentScene) {
const equipmentImage = $('img', equipmentScene);
const equipmentNote = $('.equipment-note', equipmentScene);
let equipmentFrame = 0;
let equipmentX = 0;
let equipmentY = 0;
function resetEquipment() {
  cancelAnimationFrame(equipmentFrame);
  equipmentFrame = 0;
  equipmentImage.style.transform = '';
  equipmentNote.style.transform = '';
}
equipmentScene.addEventListener('pointermove', event => {
  if (reducedMotion.matches || event.pointerType !== 'mouse') return;
  const bounds = equipmentScene.getBoundingClientRect();
  equipmentX = ((event.clientX - bounds.left) / bounds.width - .5) * 12;
  equipmentY = ((event.clientY - bounds.top) / bounds.height - .5) * 8;
  if (equipmentFrame) return;
  equipmentFrame = requestAnimationFrame(() => {
    equipmentImage.style.transform = `translate(${equipmentX}px, ${equipmentY}px)`;
    equipmentNote.style.transform = `translate(${-equipmentX / 2}px, ${-equipmentY / 2}px)`;
    equipmentFrame = 0;
  });
});
equipmentScene.addEventListener('pointerleave', resetEquipment);
reducedMotion.addEventListener('change', resetEquipment);
addEventListener('resize', resetEquipment);

}
