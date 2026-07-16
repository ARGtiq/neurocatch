/* ============================================================
   anki-ui.js — новые экраны Anki-модуля NeuroCatch.
   Подключать в neurocatch.html ПОСЛЕ anki-data.js:
     <script type="module" src="anki-ui.js"></script>
   Использует глобальные хелперы из neurocatch.js: $, esc, attr, toast,
   show, openCatMenu, llmComplete, hasLLM, copyText, fmtDate.
   Все view-контейнеры (#view-anki-*) должны быть добавлены в
   neurocatch.html — см. anki-ui.html-fragment.html.
   ============================================================ */

const $ = window.$ || (s => document.querySelector(s));
const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
// esc/attr/show объявлены в neurocatch.js как const-стрелочные функции — top-level
// const/let НЕ становятся свойствами window (в отличие от function-деклараций типа
// llmComplete/toast), и модуль (`type="module"`) их не видит вообще. Поэтому здесь —
// собственные копии тех же самых реализаций, 1:1 с neurocatch.js, а не window.esc/window.attr.
const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const attr = u => String(u).replace(/"/g, '%22');
const toast = window.toast;
const show = window.show;

/* ============================================================
   0. THEME TOKENS — применение живого превью + сохранённых пресетов
   ============================================================ */
const DEFAULT_THEME_TOKENS = {
  name: 'NeuroCatch (по умолчанию)',
  colors: null, // null = не трогать текущие CSS-переменные NeuroCatch
  font: null,
  radius: { card: 16, button: 'full' },
  blur: { level1_px: 20, level3_px: 40, intensity: 'medium' },
};

function applyThemeTokensLive(tokens) {
  const root = document.documentElement.style;
  if (tokens.colors) {
    Object.entries(tokens.colors).forEach(([k, v]) => {
      if (typeof v === 'string' && /^#/.test(v)) root.setProperty('--theme-' + k, v);
    });
    // держим совместимость с существующей системой акцента NeuroCatch
    if (tokens.colors.primary && typeof window.setAccent === 'function') {
      window.setAccent(tokens.colors.primary, false);
    }
  }
  if (tokens.font) {
    const id = 'anki-theme-font-link';
    let link = document.getElementById(id);
    if (!link) { link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; document.head.appendChild(link); }
    link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(tokens.font).replace(/%20/g, '+') + ':wght@400;600;700;800&display=swap';
    root.setProperty('--theme-font', `'${tokens.font}', Inter, sans-serif`);
  }
  if (tokens.radius) {
    if (tokens.radius.card) root.setProperty('--theme-radius-card', tokens.radius.card + 'px');
    root.setProperty('--theme-radius-button', tokens.radius.button === 'full' ? '9999px' : (tokens.radius.button + 'px'));
  }
  if (tokens.blur) {
    root.setProperty('--theme-blur-1', (tokens.blur.level1_px || 20) + 'px');
    root.setProperty('--theme-blur-3', (tokens.blur.level3_px || 40) + 'px');
  }
  document.body.classList.toggle('blur-reduced', localStorage.getItem('neurocatch_reduce_blur') === '1');
}

function renderThemeSettings() {
  const box = $('#themeSettingsBox'); if (!box) return;
  box.innerHTML = `
    <div class="sgroup" data-grp="main" style="display:none">
      <div class="sec-title">AI-тема</div>
      <div class="field">
        <label for="themeDescInput" style="display:flex;align-items:center;justify-content:space-between">Описание желаемого вайба<button type="button" class="link-btn" id="resetThemeBtn">Сбросить</button></label>
        <textarea id="themeDescInput" placeholder="Например: закат над океаном, спокойные тёплые тона..." style="min-height:60px"></textarea>
        <div class="hint">Промпт скопируется в буфер и, если настроен ИИ, применится сразу как предпросмотр.</div>
        <div class="status-row"><span style="flex:1"></span><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="link-btn" id="pasteThemeBtn">Вставить готовый код</button><button type="button" class="link-btn" id="genThemeBtn">Сгенерировать</button></div></div>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;justify-content:space-between">Текущий предпросмотр<button type="button" class="link-btn" id="saveThemePresetBtn">Сохранить как пресет</button></label>
        <div class="hint" id="themePresetList">Пока нет сохранённых пресетов</div>
      </div>
      <div class="field"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="reduceBlurToggle" style="width:auto"> Уменьшить прозрачность/блюр (для слабых устройств)</label></div>
    </div>`;
  lucide.createIcons();

  const reduceEl = $('#reduceBlurToggle');
  reduceEl.checked = localStorage.getItem('neurocatch_reduce_blur') === '1';
  reduceEl.addEventListener('change', () => {
    localStorage.setItem('neurocatch_reduce_blur', reduceEl.checked ? '1' : '0');
    document.body.classList.toggle('blur-reduced', reduceEl.checked);
  });

  let lastGenerated = null;
  $('#pasteThemeBtn').addEventListener('click', () => openManualPasteModal(''));
  $('#genThemeBtn').addEventListener('click', async () => {
    const desc = $('#themeDescInput').value.trim();
    if (!desc) { toast('Опиши желаемый вайб', true); return; }
    toast('Промпт скопирован в буфер…');
    try {
      const { tokens } = await window.AnkiData.generateThemeFromPrompt(desc);
      if (tokens) {
        lastGenerated = tokens; applyThemeTokensLive(tokens);
        toast('Тема сгенерирована и применена как предпросмотр');
      } else {
        openManualPasteModal(desc);
      }
    } catch (e) { toast('Ошибка генерации: ' + (e.message || e), true); openManualPasteModal(desc); }
  });
  function openManualPasteModal(desc) {
    const ex = document.getElementById('themePasteOverlay'); if (ex) ex.remove();
    const ov = document.createElement('div'); ov.className = 'overlay open'; ov.id = 'themePasteOverlay';
    const explain = desc
      ? 'Промпт уже в буфере обмена — ключ ИИ не настроен или генерация не удалась. Вставь промпт в любой чат (ChatGPT, Claude, Gemini...), скопируй ответ (JSON) целиком и вставь сюда:'
      : 'Сгенерировал тему в другом чате (ChatGPT, Claude, Gemini...)? Вставь сюда её JSON-ответ целиком:';
    ov.innerHTML = `<div class="modal" style="max-width:480px">
      <div class="modal-head"><h2>Вставь код темы</h2><button class="icon-btn" id="themePasteClose"><i data-lucide="x"></i></button></div>
      <p style="color:var(--muted,#888);font-size:13px;margin-bottom:10px">${esc(explain)}</p>
      <textarea id="themePasteInput" placeholder="Вставь сюда JSON-ответ ИИ..." style="min-height:140px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px"></textarea>
      <button class="btn btn-primary" id="themePasteApply" style="width:100%;margin-top:10px"><i data-lucide="check"></i>Применить тему</button>
    </div>`;
    document.body.appendChild(ov); lucide.createIcons();
    ov.querySelector('#themePasteClose').addEventListener('click', () => ov.remove());
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#themePasteApply').addEventListener('click', () => {
      let raw = ov.querySelector('#themePasteInput').value.trim();
      raw = raw.replace(/```json|```/g, '').trim();
      const m = raw.match(/\{[\s\S]*\}/);
      try {
        const tokens = JSON.parse(m ? m[0] : raw);
        lastGenerated = tokens; applyThemeTokensLive(tokens);
        toast('Тема применена как предпросмотр');
        ov.remove();
      } catch (e) { toast('Не получилось разобрать JSON — проверь, что скопировал ответ целиком', true); }
    });
  }
  $('#saveThemePresetBtn').addEventListener('click', async () => {
    if (!lastGenerated) { toast('Сначала сгенерируй тему', true); return; }
    const name = prompt('Название пресета:', lastGenerated.name || 'Моя тема');
    if (!name) return;
    try { await window.AnkiData.saveThemePreset(name, lastGenerated, 'ai', $('#themeDescInput').value.trim()); toast('Пресет сохранён'); renderThemePresetList(); }
    catch (e) { toast('Ошибка: ' + (e.message || e), true); }
  });
  $('#resetThemeBtn').addEventListener('click', () => { applyThemeTokensLive(DEFAULT_THEME_TOKENS); toast('Тема сброшена'); });

  renderThemePresetList();
}
async function renderThemePresetList() {
  const box = $('#themePresetList'); if (!box) return;
  try {
    const list = await window.AnkiData.listThemePresets();
    box.innerHTML = list.length ? list.map(p => `
      <div class="theme-preset-row" data-id="${p.id}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
        <span>${esc(p.name)}${p.source === 'ai' ? ' 🤖' : ''}</span>
        <button class="mini theme-preset-apply" data-id="${p.id}">Применить</button>
      </div>`).join('') : '<div class="empty">Пока нет сохранённых пресетов</div>';
    box.querySelectorAll('.theme-preset-apply').forEach(b => b.addEventListener('click', async () => {
      const p = list.find(x => x.id === b.dataset.id);
      if (p) { applyThemeTokensLive(p.tokens); await window.AnkiData.setActiveTheme(p.id); toast('Тема применена: ' + p.name); }
    }));
  } catch (e) { box.innerHTML = '<div class="empty">Не удалось загрузить пресеты</div>'; }
}

/* ============================================================
   1. DECK SETTINGS
   ============================================================ */
async function openDeckSettings(deckId) {
  const decks = await window.AnkiData.listDecks();
  const deck = decks.find(d => d.id === deckId); if (!deck) return;
  const box = $('#deckSettingsBox'); if (!box) return;
  box.innerHTML = `
    <h2>${esc(deck.name)} — настройки</h2>
    <div class="md-section">
      <label>Новых карточек в день</label>
      <input type="range" id="dsNewPerDay" min="0" max="100" value="${deck.new_per_day}">
      <div class="hint"><span id="dsNewPerDayVal">${deck.new_per_day}</span></div>
      <label style="margin-top:14px">Максимум повторений в день</label>
      <input type="range" id="dsReviewPerDay" min="0" max="1000" step="10" value="${deck.review_per_day}">
      <div class="hint"><span id="dsReviewPerDayVal">${deck.review_per_day}</span></div>
      <label style="margin-top:14px">Алгоритм планирования</label>
      <div class="algo-chip-row">
        <button class="algo-chip${deck.algorithm === 'fsrs' ? ' on' : ''}" data-alg="fsrs">FSRS (рекомендуется)</button>
        <button class="algo-chip${deck.algorithm === 'sm2' ? ' on' : ''}" data-alg="sm2">SM-2 (классический)</button>
      </div>
      <div class="hint" id="algoDescription" style="margin-top:8px"></div>
      <div class="hint" style="margin-top:6px">Смена алгоритма для этой колоды сбросит прогресс карточек под новый алгоритм.</div>
      <button class="btn btn-primary" id="dsSaveBtn" style="width:100%;margin-top:18px">Сохранить</button>
    </div>`;
  $('#dsNewPerDay').addEventListener('input', e => $('#dsNewPerDayVal').textContent = e.target.value);
  $('#dsReviewPerDay').addEventListener('input', e => $('#dsReviewPerDayVal').textContent = e.target.value);
  let selectedAlg = deck.algorithm;
  const ALGO_DESCRIPTIONS = {
    fsrs: 'FSRS (Free Spaced Repetition Scheduler) — современный алгоритм на основе модели памяти с тремя параметрами (устойчивость, сложность, вероятность вспоминания). Подстраивается под твою реальную статистику ответов по каждой карточке и обычно даёт более точные интервалы, чем SM-2, особенно на больших колодах.',
    sm2: 'SM-2 — классический алгоритм из ранних версий SuperMemo и оригинального Anki. Интервал растёт по формуле «предыдущий интервал × фактор лёгкости», фактор корректируется после каждого ответа. Проще и предсказуемее, но менее точно учитывает индивидуальные различия между карточками.',
  };
  const descEl = $('#algoDescription');
  if (descEl) descEl.textContent = ALGO_DESCRIPTIONS[selectedAlg] || '';
  box.querySelectorAll('.algo-chip[data-alg]').forEach(b => b.addEventListener('click', () => {
    selectedAlg = b.dataset.alg;
    box.querySelectorAll('.algo-chip[data-alg]').forEach(x => x.classList.toggle('on', x.dataset.alg === selectedAlg));
    if (descEl) descEl.textContent = ALGO_DESCRIPTIONS[selectedAlg] || '';
  }));
  $('#dsSaveBtn').addEventListener('click', async () => {
    try {
      const patch = {
        new_per_day: +$('#dsNewPerDay').value,
        review_per_day: +$('#dsReviewPerDay').value,
      };
      if (selectedAlg !== deck.algorithm) {
        if (!confirm('Сменить алгоритм? Прогресс карточек этой колоды будет сброшен.')) return;
        patch.algorithm = selectedAlg;
        const cards = await window.AnkiData.listCards(deckId);
        await window.AnkiData.bulkResetProgress(cards.map(c => c.id));
      }
      await window.AnkiData.updateDeck(deckId, patch);
      toast('Настройки колоды сохранены');
    } catch (e) { toast('Ошибка: ' + (e.message || e), true); }
  });
  show($('#view-deck-settings'));
}

/* ============================================================
   2. CARD BROWSER (фильтры + bulk)
   ============================================================ */
let browserSelected = new Set();
let browserDeckId = null;
async function openCardBrowser(deckId) {
  browserDeckId = deckId; browserSelected.clear();
  window._browserMaturity = null; window._browserDueRange = null;
  const bar = document.getElementById('browserActionBar'); if (bar) bar.remove();
  document.querySelectorAll('#browserMaturityRow .chip').forEach(c => c.classList.toggle('on', c.dataset.m === ''));
  document.querySelectorAll('#browserDueRow .chip').forEach(c => c.classList.toggle('on', c.dataset.d === ''));
  await renderCardBrowser();
  show($('#view-card-browser'));
}
const STATE_RU = { new: 'новая', learning: 'изучение', review: 'повтор', relearning: 'переучивание' };
async function renderCardBrowser() {
  const box = $('#browserList'); if (!box) return;
  box.innerHTML = '<div class="empty">Загрузка…</div>';
  const search = ($('#browserSearch') && $('#browserSearch').value.trim()) || '';
  const maturity = window._browserMaturity || null;
  const dueRange = window._browserDueRange || null;
  const tags = window._browserTags || [];
  let cards;
  try { cards = await window.AnkiData.listCards(browserDeckId, { search: search || undefined, maturity, dueRange: dueRange || undefined, tags: tags.length ? tags : undefined }); }
  catch (e) { box.innerHTML = '<div class="empty">Ошибка загрузки: ' + esc(e.message || e) + '</div>'; return; }

  if (!cards.length) { box.innerHTML = '<div class="empty">Карточек не найдено</div>'; renderBrowserActionBar(); return; }
  box.innerHTML = cards.map(c => `
    <div class="q-item" data-id="${c.id}">
      <button class="mini browser-check" data-id="${c.id}"><i data-lucide="${browserSelected.has(c.id) ? 'check-square' : 'square'}"></i></button>
      <div style="flex:1;min-width:0">
        <div class="q-text">${esc((c.front || '').slice(0, 90))}</div>
        <div class="q-time">${(c.tags || []).map(t => `<span class="tag-pill" style="margin-right:4px">${esc(t)}</span>`).join('')}
          <span class="tag-pill" style="margin-left:6px">${esc(STATE_RU[c.state] || c.state)}</span>
          ${c.suspended ? '<span class="tag-pill state-suspended">приостановлена</span>' : ''}
          · срок ${fmtDate(new Date(c.due_at).getTime())}</div>
      </div>
    </div>`).join('');
  lucide.createIcons();
  box.querySelectorAll('.browser-check').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.id;
    if (browserSelected.has(id)) browserSelected.delete(id); else browserSelected.add(id);
    renderCardBrowser();
  }));
  renderBrowserActionBar();
}
function clearBrowserSelection() {
  browserSelected.clear();
  const bar = document.getElementById('browserActionBar');
  if (bar) bar.remove();
}
function renderBrowserActionBar() {
  let bar = document.getElementById('browserActionBar');
  const n = browserSelected.size;
  if (!n) { if (bar) bar.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'browserActionBar'; bar.className = 'frag-action-bar'; document.body.appendChild(bar); }
  bar.innerHTML = `<span class="frag-count">${n} выбрано</span>
    <button class="btn" id="bTag"><i data-lucide="list"></i>Tag</button>
    <button class="btn" id="bMove"><i data-lucide="folder"></i>Move</button>
    <button class="btn" id="bSuspend"><i data-lucide="clock"></i>Suspend</button>
    <button class="btn" id="bReset"><i data-lucide="refresh-cw"></i>Reset</button>
    <button class="btn" id="bReschedule"><i data-lucide="calendar"></i>Reschedule</button>
    <button class="btn btn-clear" id="bDelete"><i data-lucide="trash-2"></i>Delete</button>`;
  lucide.createIcons();
  const ids = () => [...browserSelected];
  $('#bTag').onclick = async () => { const t = prompt('Тег добавить (можно несколько через запятую):'); if (!t) return; await window.AnkiData.bulkTag(ids(), t.split(',').map(x => x.trim()).filter(Boolean), 'add'); toast('Теги добавлены'); browserSelected.clear(); renderCardBrowser(); };
  $('#bMove').onclick = async () => {
    const decks = await window.AnkiData.listDecks();
    const name = prompt('Куда переместить? Название колоды:\n' + decks.map(d => d.name).join(', '));
    const target = decks.find(d => d.name === name);
    if (!target) { toast('Колода не найдена', true); return; }
    await window.AnkiData.bulkMove(ids(), target.id); toast('Перемещено'); browserSelected.clear(); renderCardBrowser();
  };
  $('#bSuspend').onclick = async () => { await window.AnkiData.bulkSuspend(ids(), true); toast('Приостановлено'); browserSelected.clear(); renderCardBrowser(); };
  $('#bReset').onclick = async () => { if (!confirm('Сбросить прогресс выбранных карточек?')) return; await window.AnkiData.bulkResetProgress(ids()); toast('Прогресс сброшен'); browserSelected.clear(); renderCardBrowser(); };
  $('#bReschedule').onclick = async () => { const d = +prompt('На сколько дней сдвинуть? (можно отрицательное)', '1'); if (!d) return; await window.AnkiData.bulkReschedule(ids(), d); toast('Срок сдвинут'); browserSelected.clear(); renderCardBrowser(); };
  $('#bDelete').onclick = async () => { if (!confirm('Удалить выбранные карточки?')) return; await window.AnkiData.bulkDelete(ids()); toast('Удалено'); browserSelected.clear(); renderCardBrowser(); };
}

/* ============================================================
   3. TAG MANAGER
   ============================================================ */
async function renderTagManager() {
  const box = $('#tagManagerList'); if (!box) return;
  box.innerHTML = '<div class="empty">Загрузка…</div>';
  const tags = await window.AnkiData.listAllTags();
  box.innerHTML = tags.length ? tags.map(t => `
    <div class="bm-row" data-t="${attr(t.tag)}">
      <div class="bm-main"><span class="bm-title">#${esc(t.tag)}</span><div class="bm-host">${t.count} карточ.</div></div>
      <div class="bm-acts">
        <button class="mini tag-rename" data-t="${attr(t.tag)}" title="Переименовать"><i data-lucide="pencil"></i></button>
        <button class="mini tag-del" data-t="${attr(t.tag)}" title="Удалить"><i data-lucide="trash-2"></i></button>
      </div>
    </div>`).join('') : '<div class="empty">Тегов пока нет</div>';
  lucide.createIcons();
  box.querySelectorAll('.tag-rename').forEach(b => b.addEventListener('click', async () => {
    const nt = prompt('Новое имя тега:', b.dataset.t); if (!nt || nt === b.dataset.t) return;
    await window.AnkiData.renameTag(b.dataset.t, nt); toast('Тег переименован'); renderTagManager();
  }));
  box.querySelectorAll('.tag-del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Удалить тег со всех карточек?')) return;
    await window.AnkiData.deleteTag(b.dataset.t); toast('Тег удалён'); renderTagManager();
  }));
}

/* ============================================================
   4. IMAGE OCCLUSION EDITOR
   ============================================================ */
let occState = { imageEl: null, shapes: [], drawing: null, cardId: null };
function openOcclusionEditor(cardId, imageUrl) {
  occState = { imageEl: null, shapes: [], drawing: null, cardId, shapeType: 'rect' };
  const wrap = $('#occlusionCanvasWrap'); if (!wrap) return;
  wrap.innerHTML = `<div class="type-chip-row" style="margin-bottom:10px">
    <button type="button" class="type-chip on" data-shape="rect">Прямоугольник</button>
    <button type="button" class="type-chip" data-shape="ellipse">Эллипс</button>
  </div>
  <div class="occ-stage" style="position:relative;display:inline-block">
    <img id="occImg" src="${attr(imageUrl)}" style="max-width:100%;display:block;border-radius:12px">
    <svg id="occSvg" style="position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none"></svg>
  </div>
  <div class="hint" style="margin-top:10px">Тяни по картинке, чтобы создать маску. Тап по маске — удалить.</div>
  <button class="btn btn-primary" id="occSaveBtn" style="width:100%;margin-top:12px">Сохранить маски</button>`;
  const img = $('#occImg'); const svg = $('#occSvg');
  img.onload = () => { svg.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`); };
  wrap.querySelectorAll('.type-chip[data-shape]').forEach(b => b.addEventListener('click', () => {
    occState.shapeType = b.dataset.shape;
    wrap.querySelectorAll('.type-chip[data-shape]').forEach(x => x.classList.toggle('on', x === b));
  }));

  function svgPoint(evt) {
    const rect = svg.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * img.naturalWidth;
    const y = ((evt.clientY - rect.top) / rect.height) * img.naturalHeight;
    return { x, y };
  }
  function shapeSvg(s, dashed) {
    const style = dashed
      ? 'fill="rgba(0,219,233,0.2)" stroke="#00dbe9" stroke-dasharray="6 4" stroke-width="2"'
      : 'fill="rgba(0,219,233,0.35)" stroke="#00dbe9" stroke-width="3"';
    if (s.type === 'ellipse') {
      const cx = s.coords[0] + s.coords[2] / 2, cy = s.coords[1] + s.coords[3] / 2;
      return `<ellipse cx="${cx}" cy="${cy}" rx="${s.coords[2] / 2}" ry="${s.coords[3] / 2}" ${style}></ellipse>`;
    }
    return `<rect x="${s.coords[0]}" y="${s.coords[1]}" width="${s.coords[2]}" height="${s.coords[3]}" rx="6" ${style}></rect>`;
  }
  function redraw() {
    svg.innerHTML = occState.shapes.map((s, i) => shapeSvg(s, false).replace('>', ` data-i="${i}">`)).join('');
    if (occState.drawing) {
      const d = occState.drawing;
      svg.innerHTML += shapeSvg({ type: occState.shapeType, coords: [d.x, d.y, d.w, d.h] }, true);
    }
    svg.querySelectorAll('[data-i]').forEach(el => el.addEventListener('click', () => {
      occState.shapes.splice(+el.dataset.i, 1); redraw();
    }));
  }
  let start = null;
  svg.addEventListener('pointerdown', e => { start = svgPoint(e); svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e => {
    if (!start) return;
    const p = svgPoint(e);
    occState.drawing = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    redraw();
  });
  svg.addEventListener('pointerup', () => {
    if (occState.drawing && occState.drawing.w > 8 && occState.drawing.h > 8) {
      occState.shapes.push({ id: 'occ_' + Date.now() + '_' + occState.shapes.length, type: occState.shapeType,
        coords: [occState.drawing.x, occState.drawing.y, occState.drawing.w, occState.drawing.h] });
    }
    occState.drawing = null; start = null; redraw();
  });
  redraw();
  $('#occSaveBtn').addEventListener('click', async () => {
    try {
      await window.AnkiData.updateCard(occState.cardId, { occlusion_map: occState.shapes, card_type: 'image_occlusion' });
      toast('Маски сохранены (' + occState.shapes.length + ')');
      show($('#view-anki-card-editor'));
    } catch (e) { toast('Ошибка: ' + (e.message || e), true); }
  });
  show($('#view-occlusion-editor'));
}

/* ============================================================
   5. ANALYTICS
   ============================================================ */
async function renderAnkiAnalytics() {
  const box = $('#ankiAnalyticsBox'); if (!box) return;
  box.innerHTML = '<div class="empty">Считаю…</div>';
  const s = await window.AnkiData.analyticsSummary(90);
  const maxHeat = Math.max(1, ...Object.values(s.heatmap));
  const days = []; const d = new Date(); d.setDate(d.getDate() - 83);
  for (let i = 0; i < 84; i++) { const k = d.toISOString().slice(0, 10); days.push({ k, n: s.heatmap[k] || 0 }); d.setDate(d.getDate() + 1); }
  box.innerHTML = `
    <div class="dash-grid">
      <div class="stat"><div class="stat-n">${s.totalCards}</div><div class="stat-l">карточек всего</div></div>
      <div class="stat"><div class="stat-n">${s.retention}%</div><div class="stat-l">retention (90д)</div></div>
      <div class="stat"><div class="stat-n">🔥 ${s.streak}</div><div class="stat-l">дней подряд</div></div>
      <div class="stat"><div class="stat-n">${s.totalReviews}</div><div class="stat-l">повторений (90д)</div></div>
    </div>
    <div class="dash-sec"><h3>Зрелость карточек</h3>
      <div class="stat-bar-row">New: ${s.maturity.new||0} · Learning: ${s.maturity.learning||0} · Review: ${s.maturity.review||0} · Relearning: ${s.maturity.relearning||0}</div>
    </div>
    <div class="dash-sec"><h3>Активность · 12 недель</h3>
      <div class="heatmap-grid" style="display:grid;grid-template-columns:repeat(12,1fr);gap:3px">
        ${days.map(x => `<div title="${x.k}: ${x.n}" style="aspect-ratio:1;border-radius:3px;background:rgba(0,219,233,${x.n ? Math.min(1, 0.15 + x.n / maxHeat * 0.85) : 0.08})"></div>`).join('')}
      </div>
    </div>`;
}

/* ============================================================
   6. АУДИО: запись + транскрипция
   ============================================================ */
let mediaRecorder = null, audioChunks = [];
async function startAudioRecording(onStop) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];
  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
  mediaRecorder.onstop = () => { onStop(new Blob(audioChunks, { type: 'audio/webm' })); stream.getTracks().forEach(t => t.stop()); };
  mediaRecorder.start();
}
function stopAudioRecording() { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); }

async function transcribeAndAttachAudio(cardId, blob) {
  const stamp = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/[.,:]/g, '-').replace(/\s+/g, '_');
  const filename = `Запись_${stamp}.webm`;
  const media = await window.AnkiData.uploadMedia(cardId, blob, 'audio', filename);
  let transcript = '';
  if (typeof window.llmComplete === 'function' && typeof window.hasLLM === 'function' && window.hasLLM()) {
    try {
      transcript = await window.llmComplete('Сделай точную текстовую транскрипцию приложенного аудио на русском языке, только текст, без пояснений и вводных фраз.', blob);
    } catch (e) { transcript = ''; toast('Аудио сохранено, но транскрипция не удалась: ' + (e.message || e), true); }
  }
  const card = await window.AnkiData.getCard(cardId);
  const refs = (card.media_refs || []).concat([{ ...media, transcript }]);
  await window.AnkiData.updateCard(cardId, { media_refs: refs });
  return { media, transcript };
}

/* ============================================================
   7. CSV IMPORT — заглушка
   ============================================================ */
function wireCsvImportStub() {
  const btn = $('#csvImportBtn');
  if (btn) btn.addEventListener('click', () => toast('Импорт из CSV — скоро', true));
}

/* ============================================================
   8. USER SECRETS UI — шифрование AI-ключа паролем
   ============================================================ */
async function renderSecretKeyStatus() {
  const statusEl = $('#secretStatus'); if (!statusEl) return;
  statusEl.innerHTML = '<span class="sd"></span>проверяю…';
  try {
    const has = await window.AnkiData.hasStoredApiKey();
    statusEl.className = 'status' + (has ? ' ok' : '');
    statusEl.innerHTML = '<span class="sd"></span>' + (has ? 'в облаке сохранена зашифрованная копия' : 'в облаке пока ничего не сохранено');
  } catch (e) {
    statusEl.className = 'status';
    statusEl.innerHTML = '<span class="sd"></span>нужен вход в облако, чтобы это работало';
  }
}
function wireSecretKeyButtons() {
  const encBtn = $('#secretEncryptBtn');
  const decBtn = $('#secretDecryptBtn');
  if (encBtn && !encBtn.dataset.wired) {
    encBtn.dataset.wired = '1';
    encBtn.addEventListener('click', async () => {
      const key = ($('#apikey') && $('#apikey').value.trim()) || '';
      if (!key) { toast('Сначала введи API-ключ в поле выше', true); return; }
      const pass = prompt('Придумай пароль для шифрования (запомни его — без него ключ не восстановить):');
      if (!pass) return;
      const pass2 = prompt('Повтори пароль:');
      if (pass !== pass2) { toast('Пароли не совпали', true); return; }
      try {
        await window.AnkiData.encryptAndStoreApiKey(key, pass);
        toast('Ключ зашифрован и сохранён в облаке');
        renderSecretKeyStatus();
      } catch (e) { toast('Ошибка: ' + (e.message || e), true); }
    });
  }
  if (decBtn && !decBtn.dataset.wired) {
    decBtn.dataset.wired = '1';
    decBtn.addEventListener('click', async () => {
      const pass = prompt('Введи пароль для расшифровки ключа:');
      if (!pass) return;
      try {
        const key = await window.AnkiData.fetchAndDecryptApiKey(pass);
        if (!key) { toast('В облаке ещё нет сохранённого ключа — сначала зашифруй его на этом устройстве', true); return; }
        const fi = $('#apikey'); if (fi) fi.value = key;
        // settings — top-level let в neurocatch.js, недоступен из модуля напрямую;
        // штатная кнопка сохранения настроек уже умеет читать #apikey.value в settings.key
        const saveBtn = $('#saveSettings'); if (saveBtn) saveBtn.click();
        toast('Ключ расшифрован и сохранён в настройках');
      } catch (e) { toast('Ошибка: ' + (e.message || e), true); }
    });
  }
}

/* ============================================================
   9. CARD EDITOR EXTENSIONS — тип карточки, AI Auto-Fill, cloze, медиа
   ============================================================ */
let editorState = { cardId: null, mediaRefs: [], recording: false };

function onCardEditorOpen(cardId, mediaRefs, cardType) {
  editorState.cardId = cardId;
  editorState.mediaRefs = mediaRefs || [];
  const photoBtn = $('#ankiPhotoBtn'), audioBtn = $('#ankiAudioBtn'), hint = $('#ankiMediaHint');
  const canAttach = !!cardId;
  if (photoBtn) photoBtn.disabled = !canAttach;
  if (audioBtn) audioBtn.disabled = !canAttach;
  if (hint) hint.hidden = canAttach;
  setSelectedType(cardType || 'basic');
  updateTypeUI();
  renderMediaList();
}
function getSelectedType() {
  const on = document.querySelector('#ankiTypeRow .type-chip.on');
  return (on && on.dataset.type) || 'basic';
}
function setSelectedType(type) {
  document.querySelectorAll('#ankiTypeRow .type-chip').forEach(b => b.classList.toggle('on', b.dataset.type === type));
}
const TYPE_DESCRIPTIONS = {
  basic: 'Простой вопрос и ответ — классическая карточка «спереди/сзади».',
  cloze: 'В тексте ответа скрывается часть слов или фраз — при повторении нужно вспомнить именно их. Удобно для формулировок, дат, терминов внутри предложения.',
  image_occlusion: 'На фото (например, схема или анатомический атлас) закрываются отдельные области — при повторении нужно вспомнить, что скрыто под маской.',
};
function updateTypeUI() {
  const type = getSelectedType();
  const clozeHint = $('#ankiClozeHint');
  const occBtn = $('#ankiOcclusionBtn');
  const backLabel = $('#ankiBackLabel');
  const typeDesc = $('#ankiTypeDescription');
  if (clozeHint) clozeHint.hidden = type !== 'cloze';
  if (backLabel) backLabel.textContent = type === 'cloze' ? 'Текст с пропусками' : 'Ответ (оборот карточки)';
  if (typeDesc) typeDesc.textContent = TYPE_DESCRIPTIONS[type] || '';
  const hasImage = editorState.mediaRefs.some(m => m.kind === 'image');
  if (occBtn) occBtn.hidden = !(type === 'image_occlusion' && hasImage && editorState.cardId);
}
function renderMediaList() {
  const box = $('#ankiMediaList'); if (!box) return;
  if (!editorState.mediaRefs.length) { box.innerHTML = ''; return; }
  box.innerHTML = editorState.mediaRefs.map((m, i) => `
    <div class="q-item" data-i="${i}" style="padding:8px 12px">
      <div style="flex:1;min-width:0" class="q-text">${m.kind === 'image' ? '🖼️' : '🎙️'} ${esc(m.filename || m.path.split('/').pop())}${m.transcript ? '<div class="q-time">' + esc(m.transcript.slice(0, 80)) + '</div>' : ''}</div>
      <button class="q-del" data-mi="${i}" aria-label="Удалить"><i data-lucide="x"></i></button>
    </div>`).join('');
  lucide.createIcons();
  box.querySelectorAll('.q-del').forEach(b => b.addEventListener('click', async () => {
    const i = +b.dataset.mi; const m = editorState.mediaRefs[i]; if (!m) return;
    try {
      await window.AnkiData.deleteMedia(m.path);
      editorState.mediaRefs.splice(i, 1);
      await window.AnkiData.updateCard(editorState.cardId, { media_refs: editorState.mediaRefs });
      renderMediaList(); updateTypeUI();
    } catch (e) { toast('Ошибка удаления: ' + (e.message || e), true); }
  }));
}
function wireCardEditorOnce() {
  const typeRow = $('#ankiTypeRow');
  if (typeRow && !typeRow.dataset.wired) {
    typeRow.dataset.wired = '1';
    typeRow.querySelectorAll('.type-chip').forEach(b => b.addEventListener('click', () => { setSelectedType(b.dataset.type); updateTypeUI(); }));
  }

  const clozeBtn = $('#ankiClozeWrapBtn');
  if (clozeBtn && !clozeBtn.dataset.wired) {
    clozeBtn.dataset.wired = '1';
    clozeBtn.addEventListener('click', () => {
      const ta = $('#ankiBackInput'); if (!ta) return;
      const s = ta.selectionStart, e = ta.selectionEnd;
      if (s === e) { toast('Сначала выдели текст для пропуска', true); return; }
      const n = (ta.value.match(/\{\{c(\d+)::/g) || []).length + 1;
      const sel = ta.value.slice(s, e);
      ta.value = ta.value.slice(0, s) + `{{c${n}::${sel}}}` + ta.value.slice(e);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  const aiBtn = $('#ankiAiFillBtn');
  if (aiBtn && !aiBtn.dataset.wired) {
    aiBtn.dataset.wired = '1';
    aiBtn.addEventListener('click', async () => {
      const front = ($('#ankiFrontInput') && $('#ankiFrontInput').value.trim()) || '';
      if (!front) { toast('Сначала введи вопрос (лицо карточки)', true); return; }
      if (typeof window.hasLLM !== 'function' || !window.hasLLM()) { toast('Сначала настрой провайдера ИИ в настройках', true); return; }
      toast('Генерирую ответ…');
      try {
        const answer = await window.llmComplete('Дай краткий точный ответ для карточки Anki на этот вопрос, только суть, без вводных фраз и пояснений:\n' + front);
        const bi = $('#ankiBackInput'); if (bi && answer) { bi.value = answer.trim(); bi.dispatchEvent(new Event('input', { bubbles: true })); }
        toast('Ответ сгенерирован');
      } catch (e) { toast('Ошибка генерации: ' + (e.message || e), true); }
    });
  }

  const photoBtn = $('#ankiPhotoBtn'), photoInput = $('#ankiPhotoInput');
  if (photoBtn && !photoBtn.dataset.wired) {
    photoBtn.dataset.wired = '1';
    photoBtn.addEventListener('click', () => { if (!editorState.cardId) { toast('Сначала сохрани карточку', true); return; } photoInput.click(); });
    photoInput.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0]; e.target.value = '';
      if (!file || !editorState.cardId) return;
      toast('Загружаю фото…');
      try {
        const compressed = await window.AnkiData.compressImage(file, 1600, 0.82);
        const media = await window.AnkiData.uploadMedia(editorState.cardId, compressed, 'image', file.name);
        editorState.mediaRefs.push(media);
        await window.AnkiData.updateCard(editorState.cardId, { media_refs: editorState.mediaRefs });
        renderMediaList(); updateTypeUI();
        toast('Фото прикреплено');
      } catch (e2) { toast('Ошибка загрузки: ' + (e2.message || e2), true); }
    });
  }

  const audioBtn = $('#ankiAudioBtn');
  if (audioBtn && !audioBtn.dataset.wired) {
    audioBtn.dataset.wired = '1';
    audioBtn.addEventListener('click', async () => {
      if (!editorState.cardId) { toast('Сначала сохрани карточку', true); return; }
      if (!editorState.recording) {
        try {
          await startAudioRecording(async blob => {
            toast('Обрабатываю запись…');
            try {
              const { media } = await transcribeAndAttachAudio(editorState.cardId, blob);
              editorState.mediaRefs.push(media);
              renderMediaList(); updateTypeUI();
              toast('Аудио прикреплено');
            } catch (e3) { toast('Ошибка сохранения аудио: ' + (e3.message || e3), true); }
          });
          editorState.recording = true;
          audioBtn.innerHTML = '<i data-lucide="mic"></i>Стоп';
          lucide.createIcons();
          toast('Запись идёт…');
        } catch (e) { toast('Нет доступа к микрофону: ' + (e.message || e), true); }
      } else {
        stopAudioRecording();
        editorState.recording = false;
        audioBtn.innerHTML = '<i data-lucide="mic"></i>Записать аудио';
        lucide.createIcons();
      }
    });
  }

  const occBtn = $('#ankiOcclusionBtn');
  if (occBtn && !occBtn.dataset.wired) {
    occBtn.dataset.wired = '1';
    occBtn.addEventListener('click', async () => {
      const img = editorState.mediaRefs.find(m => m.kind === 'image');
      if (!img || !editorState.cardId) { toast('Сначала прикрепи фото', true); return; }
      try {
        const url = await window.AnkiData.mediaUrl(img.path);
        openOcclusionEditor(editorState.cardId, url);
      } catch (e) { toast('Ошибка загрузки фото: ' + (e.message || e), true); }
    });
  }
}
document.addEventListener('DOMContentLoaded', () => { try { wireCardEditorOnce(); } catch (e) {} });

/* ============================================================ */
window.AnkiUI = {
  applyThemeTokensLive, renderThemeSettings,
  renderSecretKeyStatus, wireSecretKeyButtons,
  onCardEditorOpen, getSelectedType,
  openDeckSettings,
  openCardBrowser, renderCardBrowser, clearBrowserSelection,
  renderTagManager,
  openOcclusionEditor,
  renderAnkiAnalytics,
  startAudioRecording, stopAudioRecording, transcribeAndAttachAudio,
  wireCsvImportStub,
};

document.addEventListener('DOMContentLoaded', () => { try { wireCsvImportStub(); } catch (e) {} });
