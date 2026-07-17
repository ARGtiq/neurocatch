/* ============================================================
   anki-data.js — слой данных Anki-модуля NeuroCatch поверх Supabase.
   Заменяет loadAnkiDecks/saveAnkiDecks/loadAnkiCards/saveAnkiCards
   и весь путь через localStorage + touchLocal()/blob-sync.

   Подключение в neurocatch.html (после подключения neurocatch.js,
   т.к. модуль использует уже поднятый sbClient()):
     <script type="module" src="anki-data.js"></script>

   Модуль вешает публичное API на window.AnkiData — остальной код
   (openAnkiCardEditor, renderAnkiDeckList и т.д.) дергает эти функции
   вместо старых localStorage-based.
   ============================================================ */

import { FSRS, generatorParameters, createEmptyCard, Rating, State as FsrsState }
  from 'https://esm.sh/ts-fsrs@4';

const RATING_MAP = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
const FSRS_STATE_TO_DB = { 0: 'new', 1: 'learning', 2: 'review', 3: 'relearning' };

/* ---------- получение уже существующего supabase-клиента NeuroCatch ---------- */
async function getClient() {
  if (typeof window.sbClient !== 'function') {
    throw new Error('sbClient() недоступен — anki-data.js должен подключаться после neurocatch.js и после облачного логина');
  }
  const c = await window.sbClient();
  if (!c) throw new Error('Нет облачного клиента (настрой Supabase в настройках)');
  return c;
}
async function requireUser() {
  const c = await getClient();
  const { data } = await c.auth.getSession();
  if (!data || !data.session) throw new Error('Нужен вход в облако');
  return { client: c, uid: data.session.user.id };
}

/* ============================================================
   DECKS
   ============================================================ */
async function listDecks() {
  const { client, uid } = await requireUser();
  const { data, error } = await client.from('decks').select('*')
    .eq('owner', uid).is('deleted_at', null).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
async function createDeck(name, opts) {
  const { client, uid } = await requireUser();
  const row = { owner: uid, name, algorithm: (opts && opts.algorithm) || 'fsrs' };
  const { data, error } = await client.from('decks').insert(row).select().single();
  if (error) throw error;
  return data;
}
async function updateDeck(id, patch) {
  const { client } = await requireUser();
  const { data, error } = await client.from('decks').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
async function deleteDeck(id) {
  const { client } = await requireUser();
  // soft-delete колоды + всех её карточек
  const now = new Date().toISOString();
  await client.from('cards').update({ deleted_at: now }).eq('deck_id', id);
  const { error } = await client.from('decks').update({ deleted_at: now }).eq('id', id);
  if (error) throw error;
}
async function deckCounts(deckId) {
  const { client } = await requireUser();
  const now = new Date().toISOString();
  // ВАЖНО: query builder Supabase-JS мутируется при каждом .eq()/.in() —
  // нельзя переиспользовать один и тот же объект для нескольких параллельных
  // запросов (ломает фильтры друг друга). Каждый запрос строится с нуля.
  const [n, l, r] = await Promise.all([
    client.from('cards').select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId).is('deleted_at', null).eq('suspended', false).eq('state', 'new'),
    client.from('cards').select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId).is('deleted_at', null).eq('suspended', false).in('state', ['learning', 'relearning']),
    client.from('cards').select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId).is('deleted_at', null).eq('suspended', false)
      .eq('state', 'review').lte('due_at', now),
  ]);
  return { new: n.count || 0, learning: l.count || 0, review: r.count || 0 };
}

/* ============================================================
   CARDS — CRUD
   ============================================================ */
async function listCards(deckId, opts) {
  const { client, uid } = await requireUser();
  let q = client.from('cards').select('*').eq('owner', uid).is('deleted_at', null);
  if (deckId) q = q.eq('deck_id', deckId);
  if (opts && opts.tags && opts.tags.length) q = q.overlaps('tags', opts.tags);
  if (opts && opts.search) q = q.textSearch('transcript_search', opts.search, { type: 'websearch' });
  if (opts && opts.maturity === 'mature') q = q.eq('state', 'review').gte('fsrs_stability', 21);
  if (opts && opts.maturity === 'learning') q = q.in('state', ['new', 'learning', 'relearning']);
  if (opts && opts.dueRange) {
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday); endToday.setDate(endToday.getDate() + 1);
    if (opts.dueRange === 'overdue') { q = q.lt('due_at', startToday.toISOString()); }
    else if (opts.dueRange === 'today') { q = q.gte('due_at', startToday.toISOString()).lt('due_at', endToday.toISOString()); }
    else if (opts.dueRange === 'tomorrow') {
      const t0 = new Date(endToday), t1 = new Date(endToday); t1.setDate(t1.getDate() + 1);
      q = q.gte('due_at', t0.toISOString()).lt('due_at', t1.toISOString());
    } else if (opts.dueRange === 'week') {
      const w = new Date(startToday); w.setDate(w.getDate() + 7);
      q = q.lt('due_at', w.toISOString());
    } else if (opts.dueRange === 'month') {
      const m = new Date(startToday); m.setDate(m.getDate() + 30);
      q = q.lt('due_at', m.toISOString());
    }
  }
  q = q.order('updated_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
async function getCard(id) {
  const { client } = await requireUser();
  const { data, error } = await client.from('cards').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
async function createCard(deckId, fields) {
  const { client, uid } = await requireUser();
  const row = Object.assign({
    deck_id: deckId, owner: uid, card_type: 'basic',
    front: '', back: '', tags: [], media_refs: [],
  }, fields);
  const { data, error } = await client.from('cards').insert(row).select().single();
  if (error) throw error;
  return data;
}
async function updateCard(id, patch) {
  const { client } = await requireUser();
  const { data, error } = await client.from('cards').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
async function deleteCards(ids) {
  const { client } = await requireUser();
  const { error } = await client.from('cards')
    .update({ deleted_at: new Date().toISOString() }).in('id', ids);
  if (error) throw error;
}

/* ============================================================
   MEDIA (фото/аудио) — Supabase Storage
   ============================================================ */
async function uploadMedia(cardId, blob, kind, filename) {
  const { client, uid } = await requireUser();
  // Storage-ключ должен быть безопасным (ASCII, без пробелов) независимо от того,
  // что передал вызывающий код — кириллица/пробелы/спецсимволы в самом ключе объекта
  // могут ронять upload. Красивое человекочитаемое имя сохраняем отдельно в filename.
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(filename || '');
  const ext = (extMatch && extMatch[1]) || (blob.type && blob.type.split('/')[1]) || 'bin';
  const path = `${uid}/${cardId}/${Date.now()}_${kind}.${ext}`;
  const { error } = await client.storage.from('anki-media').upload(path, blob, {
    contentType: blob.type, upsert: false,
  });
  if (error) throw error;
  return { path, kind, filename };
}
async function mediaUrl(path) {
  const { client } = await requireUser();
  const { data, error } = await client.storage.from('anki-media').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
async function deleteMedia(path) {
  const { client } = await requireUser();
  await client.storage.from('anki-media').remove([path]);
}
/* сжатие фото перед аплоадом — идентично compressImage() из neurocatch.js,
   продублировано здесь чтобы модуль был самодостаточным */
function compressImage(file, maxSide, quality) {
  return new Promise((resolve) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxSide || h > maxSide) { if (w > h) { h = Math.round(h * maxSide / w); w = maxSide; } else { w = Math.round(w * maxSide / h); h = maxSide; } }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob(b => resolve(b || file), 'image/webp', quality || 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ============================================================
   ПЛАНИРОВЩИК: FSRS (ts-fsrs) + SM-2 (портировано из ankiRate())
   ============================================================ */
const fsrsInstances = new Map(); // deckId -> FSRS instance (кэш по конфигу колоды)
function getFsrs(deckConfig) {
  const key = JSON.stringify(deckConfig || {});
  if (!fsrsInstances.has(key)) {
    fsrsInstances.set(key, new FSRS(generatorParameters(deckConfig || {})));
  }
  return fsrsInstances.get(key);
}

function cardToFsrsCard(card) {
  const empty = createEmptyCard(card.created_at ? new Date(card.created_at) : new Date());
  if (card.fsrs_stability != null) empty.stability = card.fsrs_stability;
  if (card.fsrs_difficulty != null) empty.difficulty = card.fsrs_difficulty;
  empty.reps = card.reps || 0;
  empty.lapses = card.lapses || 0;
  empty.last_review = card.fsrs_last_review ? new Date(card.fsrs_last_review) : undefined;
  empty.due = new Date(card.due_at);
  const stateNum = Object.keys(FSRS_STATE_TO_DB).find(k => FSRS_STATE_TO_DB[k] === card.state);
  empty.state = stateNum != null ? Number(stateNum) : FsrsState.New;
  return empty;
}

/* SM-2, линейная версия — 1:1 портирована из neurocatch.js ankiRate() */
function sm2Rate(card, rating) {
  let ease = card.sm2_ease || 2.5;
  let interval = card.sm2_interval || 0;
  let reps = (card.reps || 0) + 1;
  if (rating === 'again') { interval = 1; ease = Math.max(1.3, ease - 0.2); reps = 0; }
  else if (rating === 'hard') { interval = Math.max(1, Math.round((interval || 1) * 1.2)); ease = Math.max(1.3, ease - 0.15); }
  else if (rating === 'good') { interval = interval ? Math.round(interval * ease) : 1; if (!interval) interval = 1; }
  else if (rating === 'easy') { interval = interval ? Math.round(interval * ease * 1.3) : 4; ease += 0.15; }
  if (!interval || interval < 1) interval = 1;
  const due = new Date(Date.now() + interval * 86400000);
  const state = rating === 'again' ? 'relearning' : (reps <= 1 ? 'learning' : 'review');
  return { sm2_ease: ease, sm2_interval: interval, reps, due_at: due.toISOString(), state };
}

/**
 * Оценить карточку: применяет FSRS или SM-2 в зависимости от deck.algorithm,
 * пишет обновление в cards + append-only строку в reviews.
 */
async function rateCard(card, deck, rating, durationMs) {
  const { client, uid } = await requireUser();
  const stateBefore = card.state;
  let patch, scheduledDays = null;

  if (deck.algorithm === 'fsrs') {
    const fsrs = getFsrs(deck.fsrs_config);
    const fsrsCard = cardToFsrsCard(card);
    const result = fsrs.next(fsrsCard, new Date(), RATING_MAP[rating]);
    const next = result.card;
    scheduledDays = (next.due - Date.now()) / 86400000;
    patch = {
      fsrs_stability: next.stability, fsrs_difficulty: next.difficulty,
      fsrs_last_review: new Date().toISOString(),
      due_at: next.due.toISOString(),
      state: FSRS_STATE_TO_DB[next.state] || 'review',
      reps: next.reps, lapses: next.lapses,
    };
  } else {
    const r = sm2Rate(card, rating);
    scheduledDays = r.sm2_interval;
    patch = r;
  }
  if (rating === 'again') patch.lapses = (card.lapses || 0) + (deck.algorithm === 'fsrs' ? 0 : 1);

  const { data, error } = await client.from('cards').update(patch).eq('id', card.id).select().single();
  if (error) throw error;

  await client.from('reviews').insert({
    card_id: card.id, owner: uid, rating, algorithm: deck.algorithm,
    scheduled_days: scheduledDays, state_before: stateBefore, state_after: data.state,
    duration_ms: durationMs || null,
  });
  return data;
}

/* ============================================================
   ОЧЕРЕДЬ СЕССИИ: review-first, потом new, в пределах дневных лимитов
   ============================================================ */
async function buildStudyQueue(deckId) {
  const deck = (await listDecks()).find(d => d.id === deckId);
  if (!deck) throw new Error('Колода не найдена');
  const { client, uid } = await requireUser();
  const now = new Date().toISOString();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const { data: doneToday } = await client.from('reviews')
    .select('id, card_id, state_before')
    .eq('owner', uid).gte('reviewed_at', todayStart.toISOString());
  const reviewedNewToday = (doneToday || []).filter(r => r.state_before === 'new').length;
  const reviewedRestToday = (doneToday || []).length - reviewedNewToday;

  const reviewLeft = Math.max(0, deck.review_per_day - reviewedRestToday);
  const newLeft = Math.max(0, deck.new_per_day - reviewedNewToday);

  const [{ data: dueCards }, { data: newCards }] = await Promise.all([
    client.from('cards').select('*').eq('deck_id', deckId).is('deleted_at', null)
      .eq('suspended', false).neq('state', 'new').lte('due_at', now)
      .order('due_at', { ascending: true }).limit(reviewLeft),
    client.from('cards').select('*').eq('deck_id', deckId).is('deleted_at', null)
      .eq('suspended', false).eq('state', 'new')
      .order('created_at', { ascending: true }).limit(newLeft),
  ]);

  // Разбиваем cloze/occlusion на суб-карточки: по одному пропуску/маске за раз.
  // Каждая суб-карточка несёт _clozeIndex (номер c) или _occlusionIndex (индекс маски),
  // _isLastSub (нужно ли фиксировать оценку в БД), _worstRating (накопитель наихудшей оценки).
  function expand(card) {
    if (card.card_type === 'cloze' && card.back) {
      const nums = [...new Set([...(card.back).matchAll(/\{\{c(\d+)::/g)].map(m => +m[1]))].sort((a,b)=>a-b);
      if (nums.length > 1) return nums.map((n, i) => ({ ...card, _clozeIndex: n, _isLastSub: i === nums.length - 1, _worstRating: null }));
    }
    if (card.card_type === 'image_occlusion' && (card.occlusion_map || []).length > 1) {
      return card.occlusion_map.map((_, i) => ({ ...card, _occlusionIndex: i, _isLastSub: i === card.occlusion_map.length - 1, _worstRating: null }));
    }
    return [card];
  }
  const allCards = [...(dueCards || []), ...(newCards || [])];
  const queue = allCards.flatMap(expand);
  return { deck, queue };
}

/* ============================================================
   BULK-ОПЕРАЦИИ (Card Browser)
   ============================================================ */
async function bulkTag(ids, tags, mode) { // mode: 'add' | 'remove'
  const { client } = await requireUser();
  const { data: rows } = await client.from('cards').select('id, tags').in('id', ids);
  const updates = (rows || []).map(r => {
    const set = new Set(r.tags || []);
    tags.forEach(t => mode === 'remove' ? set.delete(t) : set.add(t));
    return client.from('cards').update({ tags: [...set] }).eq('id', r.id);
  });
  await Promise.all(updates);
}
async function bulkMove(ids, targetDeckId) {
  const { client } = await requireUser();
  const { error } = await client.from('cards').update({ deck_id: targetDeckId }).in('id', ids);
  if (error) throw error;
}
async function bulkDelete(ids) { return deleteCards(ids); }
async function bulkSuspend(ids, suspended) {
  const { client } = await requireUser();
  const { error } = await client.from('cards').update({ suspended: !!suspended }).in('id', ids);
  if (error) throw error;
}
async function bulkResetProgress(ids) {
  const { client } = await requireUser();
  const { error } = await client.from('cards').update({
    state: 'new', due_at: new Date().toISOString(), reps: 0, lapses: 0,
    sm2_ease: 2.5, sm2_interval: 0,
    fsrs_stability: null, fsrs_difficulty: null, fsrs_last_review: null,
  }).in('id', ids);
  if (error) throw error;
}
async function bulkReschedule(ids, deltaDays) {
  const { client } = await requireUser();
  const { data: rows } = await client.from('cards').select('id, due_at').in('id', ids);
  await Promise.all((rows || []).map(r => {
    const d = new Date(r.due_at); d.setDate(d.getDate() + deltaDays);
    return client.from('cards').update({ due_at: d.toISOString() }).eq('id', r.id);
  }));
}

/* ============================================================
   МИГРАЦИЯ: neurocatch_anki_decks/neurocatch_anki_cards (localStorage/blob) → таблицы
   Вызывается один раз (кнопка в настройках или автоматически при первом логине
   после обновления, с флагом в localStorage чтобы не повторять).
   ============================================================ */
async function migrateFromLocalStorage() {
  if (localStorage.getItem('neurocatch_anki_migrated_v2')) return { migrated: false, reason: 'already-done' };
  let oldDecks = [], oldCards = [];
  try { oldDecks = JSON.parse(localStorage.getItem('neurocatch_anki_decks') || '[]'); } catch (e) {}
  try { oldCards = JSON.parse(localStorage.getItem('neurocatch_anki_cards') || '[]'); } catch (e) {}
  if (!oldDecks.length && !oldCards.length) {
    localStorage.setItem('neurocatch_anki_migrated_v2', '1');
    return { migrated: false, reason: 'no-data' };
  }
  const { client, uid } = await requireUser();
  const deckIdMap = {};
  for (const d of oldDecks) {
    const { data, error } = await client.from('decks').insert({
      owner: uid, name: d.name, algorithm: 'sm2', // старые колоды были на линейном SM-2
    }).select().single();
    if (error) throw error;
    deckIdMap[d.id] = data.id;
  }
  let migratedCards = 0;
  for (const c of oldCards) {
    const newDeckId = deckIdMap[c.deckId];
    if (!newDeckId) continue;
    const state = !c.reps ? 'new' : (c.interval && c.interval >= 21 ? 'review' : 'learning');
    const { error } = await client.from('cards').insert({
      deck_id: newDeckId, owner: uid, card_type: 'basic',
      front: c.front || '', back: c.back || '',
      state, reps: c.reps || 0,
      sm2_ease: c.ease || 2.5, sm2_interval: c.interval || 0,
      due_at: c.due ? new Date(c.due).toISOString() : new Date().toISOString(),
      created_at: c.ts ? new Date(c.ts).toISOString() : new Date().toISOString(),
    });
    if (!error) migratedCards++;
  }
  localStorage.setItem('neurocatch_anki_migrated_v2', '1');
  return { migrated: true, decks: oldDecks.length, cards: migratedCards };
}

/* ============================================================
   USER SECRETS — шифрование AI-ключа паролем (WebCrypto)
   ============================================================ */
function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function unb64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); }

async function deriveKey(password, saltBytes, iterations) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iterations || 210000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function encryptAndStoreApiKey(apiKey, password) {
  const { client, uid } = await requireUser();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, 210000);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(apiKey));
  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv, 0); payload.set(new Uint8Array(ciphertext), iv.length);
  const { error } = await client.from('user_secrets').upsert({
    owner: uid, encrypted_key: b64(payload), salt: b64(salt), kdf_iterations: 210000,
  });
  if (error) throw error;
}
async function fetchAndDecryptApiKey(password) {
  const { client, uid } = await requireUser();
  const { data, error } = await client.from('user_secrets').select('*').eq('owner', uid).maybeSingle();
  if (error) throw error;
  if (!data) return null; // ключа в базе нет — просим пользователя ввести полный ключ
  const salt = unb64(data.salt);
  const key = await deriveKey(password, salt, data.kdf_iterations);
  const payload = unb64(data.encrypted_key);
  const iv = payload.slice(0, 12), ciphertext = payload.slice(12);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plain);
  } catch (e) {
    throw new Error('Неверный пароль или повреждённые данные'); // AES-GCM провалит тег при неверном ключе
  }
}
async function hasStoredApiKey() {
  const { client, uid } = await requireUser();
  const { data } = await client.from('user_secrets').select('owner').eq('owner', uid).maybeSingle();
  return !!data;
}

/* ============================================================
   THEME PRESETS + AI Theme Generator
   ============================================================ */
async function listThemePresets() {
  const { client, uid } = await requireUser();
  const { data, error } = await client.from('theme_presets').select('*').eq('owner', uid).order('created_at');
  if (error) throw error;
  return data;
}
async function saveThemePreset(name, tokens, source, aiPrompt) {
  const { client, uid } = await requireUser();
  const { data, error } = await client.from('theme_presets').insert({
    owner: uid, name, tokens, source: source || 'manual', ai_prompt: aiPrompt || null,
  }).select().single();
  if (error) throw error;
  return data;
}
async function setActiveTheme(id) {
  const { client, uid } = await requireUser();
  await client.from('theme_presets').update({ is_active: false }).eq('owner', uid);
  const { error } = await client.from('theme_presets').update({ is_active: true }).eq('id', id);
  if (error) throw error;
}
async function deleteThemePreset(id) {
  const { client } = await requireUser();
  const { error } = await client.from('theme_presets').delete().eq('id', id);
  if (error) throw error;
}

const THEME_TOKEN_SCHEMA_HINT = `{
  "name": "строка — название темы",
  "colors": {"surface":"#hex","surface-container":"#hex","on-surface":"#hex","primary":"#hex","on-primary":"#hex","secondary":"#hex","tertiary":"#hex","error":"#hex","outline":"#hex"},
  "font": "название google-шрифта, например Inter или Manrope",
  "radius": {"card": число_px, "button": число_px_или_'full'},
  "blur": {"level1_px": число, "level3_px": число, "intensity": "low|medium|high"}
}`;

function buildThemePrompt(userDescription) {
  return `Сгенерируй тему оформления приложения по описанию пользователя. Ответь СТРОГО валидным JSON без markdown-обёртки, без пояснений вокруг, в точности по этой форме:\n${THEME_TOKEN_SCHEMA_HINT}\nОписание желаемого вайба от пользователя: "${userDescription}"`;
}

/**
 * Формирует промпт, копирует его в буфер (как aiTargets() в NeuroCatch),
 * и если провайдер настроен — сразу прогоняет через llmComplete() для live-preview.
 * Возвращает { prompt, tokens|null }.
 */
async function generateThemeFromPrompt(userDescription) {
  const prompt = buildThemePrompt(userDescription);
  try { await navigator.clipboard.writeText(prompt); } catch (e) { /* тост-фолбэк на стороне UI */ }
  let tokens = null;
  if (typeof window.llmComplete === 'function' && typeof window.hasLLM === 'function' && window.hasLLM()) {
    try {
      let raw = await window.llmComplete(prompt);
      raw = (raw || '').replace(/```json|```/g, '').trim();
      const m = raw.match(/\{[\s\S]*\}/);
      tokens = JSON.parse(m ? m[0] : raw);
    } catch (e) { tokens = null; }
  }
  return { prompt, tokens };
}

/* ============================================================
   TAGS — управление глобальным списком тегов
   ============================================================ */
async function listAllTags() {
  const { client, uid } = await requireUser();
  const { data, error } = await client.from('cards').select('tags').eq('owner', uid).is('deleted_at', null);
  if (error) throw error;
  const set = new Map();
  (data || []).forEach(r => (r.tags || []).forEach(t => set.set(t, (set.get(t) || 0) + 1)));
  return [...set.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}
async function renameTag(oldTag, newTag) {
  const { client, uid } = await requireUser();
  const { data, error } = await client.from('cards').select('id, tags').eq('owner', uid).contains('tags', [oldTag]);
  if (error) throw error;
  await Promise.all((data || []).map(r => {
    const next = [...new Set((r.tags || []).map(t => t === oldTag ? newTag : t))];
    return client.from('cards').update({ tags: next }).eq('id', r.id);
  }));
}
async function deleteTag(tag) {
  const { client, uid } = await requireUser();
  const { data, error } = await client.from('cards').select('id, tags').eq('owner', uid).contains('tags', [tag]);
  if (error) throw error;
  await Promise.all((data || []).map(r =>
    client.from('cards').update({ tags: (r.tags || []).filter(t => t !== tag) }).eq('id', r.id)
  ));
}

/* ============================================================
   ANALYTICS — на основе reviews
   ============================================================ */
async function analyticsSummary(days) {
  const { client, uid } = await requireUser();
  const since = new Date(Date.now() - (days || 90) * 86400000).toISOString();
  const [{ data: reviews }, { count: totalCards }] = await Promise.all([
    client.from('reviews').select('rating,reviewed_at,scheduled_days').eq('owner', uid).gte('reviewed_at', since),
    client.from('cards').select('id', { count: 'exact', head: true }).eq('owner', uid).is('deleted_at', null),
  ]);
  const rows = reviews || [];
  const total = rows.length;
  const correct = rows.filter(r => r.rating === 'good' || r.rating === 'easy').length;
  const retention = total ? Math.round((correct / total) * 1000) / 10 : 0;

  const dayset = new Set(rows.map(r => r.reviewed_at.slice(0, 10)));
  let streak = 0; const d = new Date(); d.setHours(0, 0, 0, 0);
  const todayKey = d.toISOString().slice(0, 10);
  if (!dayset.has(todayKey)) d.setDate(d.getDate() - 1);
  for (;;) { const k = d.toISOString().slice(0, 10); if (dayset.has(k)) { streak++; d.setDate(d.getDate() - 1); } else break; }

  const heatmap = {};
  rows.forEach(r => { const k = r.reviewed_at.slice(0, 10); heatmap[k] = (heatmap[k] || 0) + 1; });

  const { data: byState } = await client.from('cards').select('state').eq('owner', uid).is('deleted_at', null);
  const maturity = { new: 0, learning: 0, review: 0, relearning: 0 };
  (byState || []).forEach(c => { maturity[c.state] = (maturity[c.state] || 0) + 1; });

  return { totalReviews: total, totalCards: totalCards || 0, retention, streak, heatmap, maturity };
}

/* ============================================================
   CSV IMPORT
   ============================================================ */
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',' || c === ';') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim().length));
}
/**
 * Разбирает CSV в массив {front, back, tags[]}. Ожидаемые колонки: front, back, tags (необязательно).
 * Шапка (первая строка) определяется автоматически по слову front/вопрос в первой ячейке.
 */
function parseCardsCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const first = (rows[0][0] || '').trim().toLowerCase();
  const hasHeader = ['front', 'вопрос', 'front side'].includes(first);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map(r => ({
    front: (r[0] || '').trim(),
    back: (r[1] || '').trim(),
    tags: (r[2] || '').trim() ? r[2].split(/[;\s]+/).map(t => t.trim()).filter(Boolean) : [],
  })).filter(c => c.front || c.back);
}
async function bulkImportCards(deckId, cards) {
  const { client, uid } = await requireUser();
  const rows = cards.map(c => ({
    deck_id: deckId, owner: uid, card_type: 'basic',
    front: c.front || '', back: c.back || '', tags: c.tags || [],
  }));
  const CHUNK = 500; let imported = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await client.from('cards').insert(chunk);
    if (error) throw error;
    imported += chunk.length;
  }
  return imported;
}

/* ============================================================
   ПОЛНЫЙ БЭКАП — все Anki-таблицы владельца (без user_secrets)
   ============================================================ */
async function exportAllAnkiData() {
  const [decks, cards, reviews, themePresets] = await Promise.all([
    listDecks(),
    listCards(null),
    (async () => { const { client, uid } = await requireUser(); const { data, error } = await client.from('reviews').select('*').eq('owner', uid); if (error) throw error; return data; })(),
    listThemePresets(),
  ]);
  return { decks, cards, reviews, themePresets };
}

/* ============================================================ */
window.AnkiData = {
  parseCardsCSV, bulkImportCards, exportAllAnkiData,
  listAllTags, renameTag, deleteTag, analyticsSummary,
  listDecks, createDeck, updateDeck, deleteDeck, deckCounts,
  listCards, getCard, createCard, updateCard, deleteCards,
  uploadMedia, mediaUrl, deleteMedia, compressImage,
  rateCard, buildStudyQueue,
  bulkTag, bulkMove, bulkDelete, bulkSuspend, bulkResetProgress, bulkReschedule,
  migrateFromLocalStorage,
  encryptAndStoreApiKey, fetchAndDecryptApiKey, hasStoredApiKey,
  listThemePresets, saveThemePreset, setActiveTheme, deleteThemePreset, generateThemeFromPrompt, buildThemePrompt,
};
