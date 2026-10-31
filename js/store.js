// データ管理（商品マスター・店舗マスター・買い物リスト・購入履歴）
//
// すべてのデータはこの端末の localStorage に JSON として保存される。
//   products  : 商品マスター   { id, name, key, createdAt, updatedAt }
//   stores    : 店舗マスター   { id, name, key, order, createdAt, updatedAt }
//   items     : 買い物リスト   { id, productId, storeId, price, qty, memo, createdAt, checked, checkedAt, purchaseId }
//   purchases : 購入履歴       { id, productId, storeId, price, qty, date, itemId, createdAt }
// 商品名・店舗名は正規化したキーで同一判定し、マスターが重複しないようにしている。

import { uid, cleanName, nameKey, looseKey, matches, norm, deepClone } from './utils.js';

const STORAGE_KEY = 'kau.data.v1';
export const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS = {
  showChecked: true,
};

let data = emptyData();
let byProduct = new Map();
let byStore = new Map();
const listeners = new Set();
let lastError = null;

function emptyData() {
  return {
    schema: SCHEMA_VERSION,
    products: [],
    stores: [],
    items: [],
    purchases: [],
    settings: { ...DEFAULT_SETTINGS },
    meta: { createdAt: Date.now(), lastBackupAt: null },
  };
}

/* ---------------------------------------------------------------- 読み込み・保存 */

export function init() {
  data = readStorage() ?? emptyData();
  reindex();
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    data = readStorage() ?? emptyData();
    reindex();
    emit('sync');
  });
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitize(JSON.parse(raw));
  } catch (err) {
    console.error('データの読み込みに失敗しました', err);
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    lastError = null;
  } catch (err) {
    lastError = err;
    console.error('データの保存に失敗しました', err);
  }
}

function reindex() {
  byProduct = new Map(data.products.map((p) => [p.id, p]));
  byStore = new Map(data.stores.map((s) => [s.id, s]));
}

function emit(reason) {
  listeners.forEach((fn) => {
    try { fn(reason); } catch (err) { console.error(err); }
  });
}

function commit(reason = 'change') {
  reindex();
  persist();
  emit(reason);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getError() {
  return lastError;
}

/** 読み取り専用で全データを返す */
export function state() {
  return data;
}

/* ---------------------------------------------------------------- 整合性チェック */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const toPrice = (v) => (isNum(v) && v >= 0 ? Math.round(v) : null);
const toQty = (v) => (isNum(v) && v >= 1 ? Math.min(Math.round(v), 999) : 1);
const toTime = (v, fallback) => (isNum(v) && v > 0 ? v : fallback);

/**
 * 外部から来たデータ（保存データ・バックアップ）を検証して整える。
 * 壊れた参照の除去、同名マスターの統合などを行う。
 */
export function sanitize(input) {
  const src = input && typeof input === 'object' ? input : {};
  const now = Date.now();
  const out = emptyData();
  out.meta = { ...out.meta, ...(src.meta && typeof src.meta === 'object' ? src.meta : {}) };
  out.settings = { ...DEFAULT_SETTINGS, ...(src.settings && typeof src.settings === 'object' ? src.settings : {}) };

  // 商品マスター（同じキーは1つに統合）
  const productAlias = new Map();
  const productByKey = new Map();
  for (const p of Array.isArray(src.products) ? src.products : []) {
    if (!p || typeof p.id !== 'string') continue;
    const name = cleanName(p.name);
    if (!name) continue;
    const key = nameKey(name);
    const existing = productByKey.get(key);
    if (existing) {
      productAlias.set(p.id, existing.id);
      continue;
    }
    const product = {
      id: p.id,
      name,
      key,
      createdAt: toTime(p.createdAt, now),
      updatedAt: toTime(p.updatedAt, now),
    };
    productByKey.set(key, product);
    productAlias.set(p.id, p.id);
    out.products.push(product);
  }

  // 店舗マスター
  const storeAlias = new Map();
  const storeByKey = new Map();
  const rawStores = (Array.isArray(src.stores) ? src.stores : [])
    .filter((s) => s && typeof s.id === 'string')
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  for (const s of rawStores) {
    const name = cleanName(s.name);
    if (!name) continue;
    const key = nameKey(name);
    const existing = storeByKey.get(key);
    if (existing) {
      storeAlias.set(s.id, existing.id);
      continue;
    }
    const store = {
      id: s.id,
      name,
      key,
      order: out.stores.length,
      createdAt: toTime(s.createdAt, now),
      updatedAt: toTime(s.updatedAt, now),
    };
    storeByKey.set(key, store);
    storeAlias.set(s.id, s.id);
    out.stores.push(store);
  }

  const resolveStore = (id) => (id && storeAlias.has(id) ? storeAlias.get(id) : null);

  // 購入履歴
  const purchaseIds = new Set();
  for (const r of Array.isArray(src.purchases) ? src.purchases : []) {
    if (!r || typeof r.id !== 'string' || purchaseIds.has(r.id)) continue;
    const productId = productAlias.get(r.productId);
    if (!productId) continue;
    purchaseIds.add(r.id);
    out.purchases.push({
      id: r.id,
      productId,
      storeId: resolveStore(r.storeId),
      price: toPrice(r.price),
      qty: toQty(r.qty),
      date: toTime(r.date, now),
      itemId: typeof r.itemId === 'string' ? r.itemId : null,
      createdAt: toTime(r.createdAt, toTime(r.date, now)),
    });
  }

  // 買い物リスト
  const itemIds = new Set();
  for (const it of Array.isArray(src.items) ? src.items : []) {
    if (!it || typeof it.id !== 'string' || itemIds.has(it.id)) continue;
    const productId = productAlias.get(it.productId);
    if (!productId) continue;
    itemIds.add(it.id);
    const checked = Boolean(it.checked);
    const purchaseId = checked && purchaseIds.has(it.purchaseId) ? it.purchaseId : null;
    out.items.push({
      id: it.id,
      productId,
      storeId: resolveStore(it.storeId),
      price: toPrice(it.price),
      qty: toQty(it.qty),
      memo: typeof it.memo === 'string' ? it.memo.slice(0, 500) : '',
      createdAt: toTime(it.createdAt, now),
      checked,
      checkedAt: checked ? toTime(it.checkedAt, now) : null,
      purchaseId,
    });
  }

  // 履歴→リストの参照を検証
  const linked = new Set(out.items.map((i) => i.purchaseId).filter(Boolean));
  for (const r of out.purchases) {
    if (r.itemId && !(itemIds.has(r.itemId) && linked.has(r.id))) r.itemId = null;
  }
  return out;
}

/* ---------------------------------------------------------------- 取得 */

export const getProduct = (id) => byProduct.get(id) || null;
export const getStore = (id) => byStore.get(id) || null;
export const productName = (id) => byProduct.get(id)?.name ?? '（削除された商品）';
export const storeName = (id) => (id ? byStore.get(id)?.name ?? '店舗未設定' : '店舗未設定');

export function storesSorted() {
  return [...data.stores].sort((a, b) => a.order - b.order);
}

export function findProductByName(name) {
  const key = nameKey(name);
  if (!key) return null;
  return data.products.find((p) => p.key === key) || null;
}

export function findStoreByName(name) {
  const key = nameKey(name);
  if (!key) return null;
  return data.stores.find((s) => s.key === key) || null;
}

/** 商品名から商品を取得、なければ作成（コミットはしない） */
function ensureProduct(name) {
  const clean = cleanName(name);
  if (!clean) return null;
  const found = findProductByName(clean);
  if (found) return found;
  const now = Date.now();
  const product = { id: uid('p_'), name: clean, key: nameKey(clean), createdAt: now, updatedAt: now };
  data.products.push(product);
  byProduct.set(product.id, product);
  return product;
}

/** 店舗名から店舗を取得、なければ作成（コミットはしない） */
function ensureStore(name) {
  const clean = cleanName(name);
  if (!clean) return null;
  const found = findStoreByName(clean);
  if (found) return found;
  const now = Date.now();
  const order = data.stores.reduce((m, s) => Math.max(m, s.order), -1) + 1;
  const store = { id: uid('s_'), name: clean, key: nameKey(clean), order, createdAt: now, updatedAt: now };
  data.stores.push(store);
  byStore.set(store.id, store);
  return store;
}

/* ---------------------------------------------------------------- 価格の参照 */

/** 同じ商品・同じ店舗での直近の購入価格 */
export function lastPrice(productId, storeId, excludeId = null) {
  if (!productId) return null;
  const sid = storeId || null;
  let best = null;
  for (const r of data.purchases) {
    if (r.productId !== productId || r.storeId !== sid || r.price === null || r.id === excludeId) continue;
    if (!best || r.date > best.date || (r.date === best.date && r.createdAt > best.createdAt)) best = r;
  }
  return best ? { price: best.price, date: best.date, purchaseId: best.id } : null;
}

/** 商品の店舗ごとの直近価格（安い順） */
export function storePrices(productId) {
  const latest = new Map();
  const mins = new Map();
  for (const r of data.purchases) {
    if (r.productId !== productId || r.price === null) continue;
    const key = r.storeId || '';
    const cur = latest.get(key);
    if (!cur || r.date > cur.date) latest.set(key, r);
    const min = mins.get(key);
    if (min === undefined || r.price < min) mins.set(key, r.price);
  }
  return [...latest.entries()]
    .map(([key, r]) => ({ storeId: key || null, price: r.price, date: r.date, min: mins.get(key) }))
    .sort((a, b) => a.price - b.price || b.date - a.date);
}

/** 商品の統計 */
export function productStats(productId) {
  const rows = data.purchases.filter((r) => r.productId === productId);
  const priced = rows.filter((r) => r.price !== null);
  const last = rows.reduce((a, r) => (!a || r.date > a.date ? r : a), null);
  const lastPriced = priced.reduce((a, r) => (!a || r.date > a.date ? r : a), null);
  const min = priced.reduce((a, r) => (!a || r.price < a.price || (r.price === a.price && r.date > a.date) ? r : a), null);
  const avg = priced.length ? priced.reduce((s, r) => s + r.price, 0) / priced.length : null;
  const total = priced.reduce((s, r) => s + r.price * r.qty, 0);
  return {
    count: rows.length,
    qty: rows.reduce((s, r) => s + r.qty, 0),
    avg,
    total,
    min,
    last,
    lastPriced,
  };
}

/** 参照数（管理画面の削除時の影響表示に使う） */
export function productRefs(productId) {
  return {
    items: data.items.filter((i) => i.productId === productId).length,
    purchases: data.purchases.filter((r) => r.productId === productId).length,
  };
}

export function storeRefs(storeId) {
  return {
    items: data.items.filter((i) => i.storeId === storeId).length,
    purchases: data.purchases.filter((r) => r.storeId === storeId).length,
  };
}

/* ---------------------------------------------------------------- 入力候補 */

function usageScores(kind) {
  const field = kind === 'product' ? 'productId' : 'storeId';
  const now = Date.now();
  const scores = new Map();
  const add = (id, ts, weight) => {
    if (!id) return;
    const ageDays = Math.max(0, (now - ts) / 86400000);
    const s = weight * (1 + 2 / (1 + ageDays / 14));
    scores.set(id, (scores.get(id) || 0) + s);
  };
  for (const r of data.purchases) add(r[field], r.date, 1);
  for (const i of data.items) add(i[field], i.createdAt, 0.6);
  return scores;
}

/** 商品名の候補 */
export function suggestProducts(query, limit = 12) {
  const scores = usageScores('product');
  const q = norm(query);
  let list = data.products;
  if (q) list = list.filter((p) => matches(p.name, q));
  return [...list]
    .map((p) => ({
      product: p,
      starts: q ? norm(p.name).startsWith(q) : false,
      score: scores.get(p.id) || 0,
    }))
    .sort((a, b) => (b.starts - a.starts) || (b.score - a.score) || a.product.name.localeCompare(b.product.name, 'ja'))
    .slice(0, limit)
    .map((x) => x.product);
}

/** 店舗名の候補。商品が分かっていれば、その商品を買ったことがある店舗を優先する */
export function suggestStores(query, productId, limit = 20) {
  const scores = usageScores('store');
  const q = norm(query);
  const priced = new Map();
  if (productId) {
    for (const sp of storePrices(productId)) if (sp.storeId) priced.set(sp.storeId, sp);
  }
  let list = data.stores;
  if (q) list = list.filter((s) => matches(s.name, q));
  return [...list]
    .map((s) => ({
      store: s,
      starts: q ? norm(s.name).startsWith(q) : false,
      has: priced.has(s.id),
      score: scores.get(s.id) || 0,
      last: productId ? lastPrice(productId, s.id) : null,
    }))
    .sort((a, b) => (b.starts - a.starts) || (b.has - a.has) || (b.score - a.score) || (a.store.order - b.store.order))
    .slice(0, limit);
}

/* ---------------------------------------------------------------- 買い物リスト */

export function getItem(id) {
  return data.items.find((i) => i.id === id) || null;
}

/** 未購入で同じ商品・同じ店舗のアイテム */
export function findOpenItem(productId, storeId, exceptId = null) {
  const sid = storeId || null;
  return data.items.find((i) => !i.checked && i.id !== exceptId && i.productId === productId && i.storeId === sid) || null;
}

/**
 * リストに追加。同じ商品・同じ店舗の未購入アイテムがあれば個数を増やす。
 * @returns {{ item, merged: boolean } | null}
 */
export function addItem({ name, storeName: sName, price = null, qty = 1, memo = '' }) {
  const product = ensureProduct(name);
  if (!product) return null;
  const store = ensureStore(sName);
  const storeId = store ? store.id : null;
  const cleanMemo = String(memo || '').trim().slice(0, 500);
  const existing = findOpenItem(product.id, storeId);
  if (existing) {
    existing.qty = Math.min(999, existing.qty + toQty(qty));
    if (price !== null) existing.price = toPrice(price);
    if (cleanMemo && cleanMemo !== existing.memo) {
      existing.memo = existing.memo ? `${existing.memo} / ${cleanMemo}` : cleanMemo;
    }
    commit('item:update');
    return { item: existing, merged: true };
  }
  const item = {
    id: uid('i_'),
    productId: product.id,
    storeId,
    price: toPrice(price),
    qty: toQty(qty),
    memo: cleanMemo,
    createdAt: Date.now(),
    checked: false,
    checkedAt: null,
    purchaseId: null,
  };
  data.items.push(item);
  commit('item:add');
  return { item, merged: false };
}

/** リストのアイテムを更新。購入済みなら対応する履歴も更新する */
export function updateItem(id, { name, storeName: sName, price = null, qty = 1, memo = '' }) {
  const item = getItem(id);
  if (!item) return null;
  const product = ensureProduct(name);
  if (!product) return null;
  const store = ensureStore(sName);
  item.productId = product.id;
  item.storeId = store ? store.id : null;
  item.price = toPrice(price);
  item.qty = toQty(qty);
  item.memo = String(memo || '').trim().slice(0, 500);
  if (item.purchaseId) {
    const r = data.purchases.find((p) => p.id === item.purchaseId);
    if (r) Object.assign(r, { productId: item.productId, storeId: item.storeId, price: item.price, qty: item.qty });
  }
  commit('item:update');
  return item;
}

/** 購入済み／未購入の切り替え。購入済みにすると購入履歴に記録する */
export function setChecked(id, checked) {
  setCheckedMany([[id, checked]]);
}

/** 複数のアイテムをまとめて切り替え（保存は1回） */
export function setCheckedMany(pairs) {
  let changed = 0;
  for (const [id, checked] of pairs) {
    const item = getItem(id);
    if (!item || item.checked === checked) continue;
    applyChecked(item, checked);
    changed += 1;
  }
  if (changed) commit('item:check');
  return changed;
}

function applyChecked(item, checked) {
  const now = Date.now();
  if (checked) {
    const purchase = {
      id: uid('h_'),
      productId: item.productId,
      storeId: item.storeId,
      price: item.price,
      qty: item.qty,
      date: now,
      itemId: item.id,
      createdAt: now,
    };
    data.purchases.push(purchase);
    item.checked = true;
    item.checkedAt = now;
    item.purchaseId = purchase.id;
  } else {
    if (item.purchaseId) data.purchases = data.purchases.filter((r) => r.id !== item.purchaseId);
    item.checked = false;
    item.checkedAt = null;
    item.purchaseId = null;
  }
}

/** リストから削除（購入済みの場合、履歴は残す） */
export function deleteItem(id) {
  const item = getItem(id);
  if (!item) return;
  unlinkPurchase(item);
  data.items = data.items.filter((i) => i.id !== id);
  commit('item:delete');
}

/** 購入済みの商品をリストから片付ける（履歴は残る） */
export function clearChecked(storeId) {
  const target = (i) => i.checked && (storeId === undefined || i.storeId === storeId);
  const removed = data.items.filter(target);
  removed.forEach(unlinkPurchase);
  data.items = data.items.filter((i) => !target(i));
  commit('item:clear');
  return removed.length;
}

function unlinkPurchase(item) {
  if (!item.purchaseId) return;
  const r = data.purchases.find((p) => p.id === item.purchaseId);
  if (r) r.itemId = null;
}

/* ---------------------------------------------------------------- 購入履歴 */

export function getPurchase(id) {
  return data.purchases.find((r) => r.id === id) || null;
}

export function addPurchase({ name, storeName: sName, price = null, qty = 1, date = Date.now() }) {
  const product = ensureProduct(name);
  if (!product) return null;
  const store = ensureStore(sName);
  const r = {
    id: uid('h_'),
    productId: product.id,
    storeId: store ? store.id : null,
    price: toPrice(price),
    qty: toQty(qty),
    date: toTime(date, Date.now()),
    itemId: null,
    createdAt: Date.now(),
  };
  data.purchases.push(r);
  commit('purchase:add');
  return r;
}

/** 履歴を更新。リストの購入済みアイテムと紐づいていれば、そちらも合わせる */
export function updatePurchase(id, { name, storeName: sName, price = null, qty = 1, date }) {
  const r = getPurchase(id);
  if (!r) return null;
  const product = ensureProduct(name);
  if (!product) return null;
  const store = ensureStore(sName);
  r.productId = product.id;
  r.storeId = store ? store.id : null;
  r.price = toPrice(price);
  r.qty = toQty(qty);
  if (date) r.date = toTime(date, r.date);
  if (r.itemId) {
    const item = getItem(r.itemId);
    if (item) Object.assign(item, { productId: r.productId, storeId: r.storeId, price: r.price, qty: r.qty });
  }
  commit('purchase:update');
  return r;
}

export function deletePurchase(id) {
  const r = getPurchase(id);
  if (!r) return;
  if (r.itemId) {
    const item = getItem(r.itemId);
    if (item && item.purchaseId === id) item.purchaseId = null;
  }
  data.purchases = data.purchases.filter((p) => p.id !== id);
  commit('purchase:delete');
}

/* ---------------------------------------------------------------- 商品マスター */

export function createProduct(name) {
  const clean = cleanName(name);
  if (!clean) return { error: 'empty' };
  const found = findProductByName(clean);
  if (found) return { conflict: found };
  const product = ensureProduct(clean);
  commit('product:add');
  return { product };
}

export function renameProduct(id, name) {
  const product = getProduct(id);
  if (!product) return { error: 'missing' };
  const clean = cleanName(name);
  if (!clean) return { error: 'empty' };
  const key = nameKey(clean);
  const conflict = data.products.find((p) => p.key === key && p.id !== id);
  if (conflict) return { conflict };
  product.name = clean;
  product.key = key;
  product.updatedAt = Date.now();
  commit('product:update');
  return { product };
}

/** fromId の商品を toId に統合（リスト・履歴を付け替える） */
export function mergeProducts(fromId, toId) {
  if (fromId === toId || !getProduct(fromId) || !getProduct(toId)) return false;
  data.items.forEach((i) => { if (i.productId === fromId) i.productId = toId; });
  data.purchases.forEach((r) => { if (r.productId === fromId) r.productId = toId; });
  data.products = data.products.filter((p) => p.id !== fromId);
  mergeOpenDuplicates();
  commit('product:merge');
  return true;
}

/** 商品を削除。リストのアイテムと購入履歴も削除する */
export function deleteProduct(id) {
  data.items = data.items.filter((i) => i.productId !== id);
  data.purchases = data.purchases.filter((r) => r.productId !== id);
  data.products = data.products.filter((p) => p.id !== id);
  commit('product:delete');
}

/* ---------------------------------------------------------------- 店舗マスター */

export function createStore(name) {
  const clean = cleanName(name);
  if (!clean) return { error: 'empty' };
  const found = findStoreByName(clean);
  if (found) return { conflict: found };
  const store = ensureStore(clean);
  commit('store:add');
  return { store };
}

export function renameStore(id, name) {
  const store = getStore(id);
  if (!store) return { error: 'missing' };
  const clean = cleanName(name);
  if (!clean) return { error: 'empty' };
  const key = nameKey(clean);
  const conflict = data.stores.find((s) => s.key === key && s.id !== id);
  if (conflict) return { conflict };
  store.name = clean;
  store.key = key;
  store.updatedAt = Date.now();
  commit('store:update');
  return { store };
}

export function mergeStores(fromId, toId) {
  if (fromId === toId || !getStore(fromId) || !getStore(toId)) return false;
  data.items.forEach((i) => { if (i.storeId === fromId) i.storeId = toId; });
  data.purchases.forEach((r) => { if (r.storeId === fromId) r.storeId = toId; });
  data.stores = data.stores.filter((s) => s.id !== fromId);
  normalizeOrder();
  mergeOpenDuplicates();
  commit('store:merge');
  return true;
}

/** 店舗を削除。リスト・履歴の店舗は「未設定」になる（記録自体は残す） */
export function deleteStore(id) {
  data.items.forEach((i) => { if (i.storeId === id) i.storeId = null; });
  data.purchases.forEach((r) => { if (r.storeId === id) r.storeId = null; });
  data.stores = data.stores.filter((s) => s.id !== id);
  normalizeOrder();
  mergeOpenDuplicates();
  commit('store:delete');
}

export function moveStore(id, delta) {
  const list = storesSorted();
  const idx = list.findIndex((s) => s.id === id);
  const to = idx + delta;
  if (idx < 0 || to < 0 || to >= list.length) return;
  const [s] = list.splice(idx, 1);
  list.splice(to, 0, s);
  list.forEach((st, i) => { st.order = i; });
  commit('store:order');
}

function normalizeOrder() {
  storesSorted().forEach((s, i) => { s.order = i; });
}

/** 統合後に同じ商品・同じ店舗の未購入アイテムが複数あれば1つにまとめる */
function mergeOpenDuplicates() {
  const seen = new Map();
  const remove = new Set();
  for (const i of data.items) {
    if (i.checked) continue;
    const key = `${i.productId}|${i.storeId || ''}`;
    const first = seen.get(key);
    if (first) {
      first.qty = Math.min(999, first.qty + i.qty);
      if (first.price === null) first.price = i.price;
      if (i.memo && i.memo !== first.memo) first.memo = first.memo ? `${first.memo} / ${i.memo}` : i.memo;
      remove.add(i.id);
    } else {
      seen.set(key, i);
    }
  }
  if (remove.size) data.items = data.items.filter((i) => !remove.has(i.id));
}

/** 似た名前（表記ゆれ）のグループを探す */
export function duplicateGroups(kind) {
  const list = kind === 'product' ? data.products : data.stores;
  const groups = new Map();
  for (const e of list) {
    const k = looseKey(e.name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/* ---------------------------------------------------------------- 設定 */

export function setSetting(key, value) {
  data.settings[key] = value;
  commit('settings');
}

/* ---------------------------------------------------------------- 元に戻す */

export function checkpoint() {
  return deepClone(data);
}

export function restore(snapshot) {
  if (!snapshot) return;
  data = sanitize(snapshot);
  commit('restore');
}

/* ---------------------------------------------------------------- バックアップ */

/** バックアップを書き出したことを記録 */
export function markBackup() {
  data.meta.lastBackupAt = Date.now();
  commit('backup');
}

export function exportData() {
  return {
    app: 'kau.',
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      products: data.products.map(({ key, ...p }) => p),
      stores: data.stores.map(({ key, ...s }) => s),
      items: data.items,
      purchases: data.purchases,
      settings: data.settings,
      meta: data.meta,
    },
  };
}

/** バックアップの内容を確認（取り込む前の件数表示用） */
export function inspectBackup(json) {
  const src = json && typeof json === 'object' && json.data && typeof json.data === 'object' ? json.data : json;
  if (!src || typeof src !== 'object' || !['products', 'stores', 'items', 'purchases'].some((k) => Array.isArray(src[k]))) {
    return null;
  }
  const clean = sanitize(src);
  return {
    clean,
    counts: {
      products: clean.products.length,
      stores: clean.stores.length,
      items: clean.items.length,
      purchases: clean.purchases.length,
    },
  };
}

export function replaceAll(cleanData) {
  data = sanitize(cleanData);
  commit('import');
}

export function resetAll() {
  data = emptyData();
  commit('reset');
}

export function isEmpty() {
  return !data.products.length && !data.stores.length && !data.items.length && !data.purchases.length;
}
