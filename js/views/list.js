// ホーム画面（買い物リスト）

import * as store from '../store.js';
import { icon } from '../icons.js';
import { esc, yenHTML } from '../utils.js';
import { flip, toast } from '../ui.js';
import { loadSample, quickAdd } from '../actions.js';
import { openItemEditor, openItemEdit } from './editor.js';

const ui = {
  tab: 'all', // 'all' | 店舗ID | 'none'（店舗未設定）
  checkedCollapsed: false,
};

let screen;
let scroller;
let content;
let navbar;
const pending = new Map(); // チェック操作の反映待ち
let pendingTimer = null;

const NONE = 'none';
const tabKey = (storeId) => storeId || NONE;

export function currentStoreId() {
  return ui.tab === 'all' || ui.tab === NONE ? null : ui.tab;
}

export function mountList(el) {
  screen = el;
  screen.innerHTML = `
    <header class="navbar navbar--large navbar--flat">
      <div></div>
      <h1 class="navbar__title brand">kau<span class="brand__dot">.</span></h1>
      <div class="navbar__actions">
        <button type="button" class="icon-btn" data-action="toggle-show-checked" aria-label="購入済みの表示切り替え"></button>
      </div>
    </header>
    <div class="scroll"><div class="content" data-role="content"></div></div>`;
  navbar = screen.querySelector('.navbar');
  scroller = screen.querySelector('.scroll');
  content = screen.querySelector('[data-role="content"]');

  scroller.addEventListener('scroll', onScroll, { passive: true });
  screen.addEventListener('click', onClick);
  setupSwipe();
  render();
}

function onScroll() {
  navbar.classList.toggle('is-scrolled', scroller.scrollTop > 36);
  const tabs = content.querySelector('.store-tabs');
  if (tabs) {
    const stuck = tabs.getBoundingClientRect().top <= navbar.getBoundingClientRect().bottom + 0.5;
    screen.classList.toggle('is-stuck', stuck && scroller.scrollTop > 0);
  }
}

/* ------------------------------------------------------------------ 描画 */

export function render({ animate = true } = {}) {
  if (!content) return;
  const doRender = () => {
    content.innerHTML = build();
    openRow = null;
  };
  if (animate && screen.classList.contains('is-active')) flip(content, doRender);
  else doRender();
  const showChecked = store.state().settings.showChecked;
  const toggle = screen.querySelector('[data-action="toggle-show-checked"]');
  toggle.innerHTML = icon(showChecked ? 'eye' : 'eyeOff');
  toggle.hidden = !store.state().items.some((i) => i.checked);
  toggle.setAttribute('aria-label', showChecked ? '購入済みを隠す' : '購入済みを表示');
  onScroll();
}

function isChecked(item) {
  return pending.has(item.id) ? pending.get(item.id) : item.checked;
}

function build() {
  const data = store.state();
  const items = data.items;
  const header = `
    <div class="large-title brand">kau<span class="brand__dot">.</span></div>
    <div class="subtitle">${todayText()}</div>`;

  if (!items.length) return header + buildEmpty();

  // 店舗タブ（リストに商品がある店舗だけ）
  const tabs = [];
  for (const s of store.storesSorted()) {
    const list = items.filter((i) => i.storeId === s.id);
    if (list.length) tabs.push({ key: s.id, name: s.name, open: list.filter((i) => !i.checked).length });
  }
  const noStore = items.filter((i) => !i.storeId);
  if (noStore.length) tabs.push({ key: NONE, name: '店舗未設定', open: noStore.filter((i) => !i.checked).length });
  if (ui.tab !== 'all' && !tabs.some((t) => t.key === ui.tab)) ui.tab = 'all';

  const visible = ui.tab === 'all' ? items : items.filter((i) => tabKey(i.storeId) === ui.tab);
  const open = visible.filter((i) => !i.checked);
  const done = visible.filter((i) => i.checked);
  const total = open.reduce((s, i) => s + (i.price ?? 0) * i.qty, 0);
  const missing = open.filter((i) => i.price === null).length;
  const progress = visible.length ? Math.round((done.length / visible.length) * 100) : 0;
  const currentTab = tabs.find((t) => t.key === ui.tab);

  const summary = `
    <section class="summary" aria-label="未購入の合計">
      <div class="summary__label">
        <span>未購入の合計</span>
        ${currentTab ? `<span class="summary__store">${icon('store')}${esc(currentTab.name)}</span>` : `<span>${tabs.length}店舗</span>`}
      </div>
      <div class="summary__amount">${yenHTML(total)}</div>
      <div class="summary__meta">
        <span>残り <strong class="num">${open.length}</strong> 点</span>
        <span class="item__meta-sep"></span>
        <span>購入済み <strong class="num">${done.length}</strong> 点</span>
        ${missing ? `<span class="item__meta-sep"></span><span class="summary__warn">価格未入力 ${missing}</span>` : ''}
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="progress__bar" style="width:${progress}%"></div></div>
    </section>`;

  const tabsHTML = `
    <div data-role="tabs-anchor"></div>
    <nav class="store-tabs" aria-label="購入場所で絞り込み">
      <div class="chips" data-role="tabs">
        <button type="button" class="chip ${ui.tab === 'all' ? 'is-active' : ''}" data-tab-store="all">すべて<span class="chip__count">${items.filter((i) => !i.checked).length}</span></button>
        ${tabs.map((t) => `<button type="button" class="chip ${ui.tab === t.key ? 'is-active' : ''}" data-tab-store="${esc(t.key)}">${esc(t.name)}<span class="chip__count">${t.open}</span></button>`).join('')}
      </div>
    </nav>`;

  let groups = '';
  if (!open.length) {
    groups += `
      <div class="empty empty--compact">
        <div class="empty__art">${icon('checks')}</div>
        <div class="empty__title">${ui.tab === 'all' ? 'すべて購入しました' : 'このお店の買い物は完了です'}</div>
        <div class="empty__text">購入済みの商品は履歴に保存されています。</div>
      </div>`;
  } else if (ui.tab === 'all') {
    // 店舗ごとにまとめて表示
    const order = [...store.storesSorted().map((s) => s.id), null];
    for (const sid of order) {
      const list = open.filter((i) => (i.storeId || null) === sid);
      if (!list.length) continue;
      const sub = list.reduce((s, i) => s + (i.price ?? 0) * i.qty, 0);
      groups += `
        <section class="group" data-flip="g-${esc(tabKey(sid))}">
          <button type="button" class="group__head group__head--button" data-tab-store="${esc(tabKey(sid))}">
            <span class="group__title">${icon('store')}<span>${esc(store.storeName(sid))}</span><span class="group__count">${list.length}</span></span>
            <span class="group__total">${yenHTML(sub)}</span>
          </button>
          <div class="card">${list.sort(byCreated).map((i) => itemRow(i, false)).join('')}</div>
        </section>`;
    }
  } else {
    groups += `
      <section class="group" data-flip="g-open">
        <div class="card">${open.sort(byCreated).map((i) => itemRow(i, false)).join('')}</div>
      </section>`;
  }

  // 購入済み
  const showChecked = data.settings.showChecked;
  let doneHTML = '';
  if (done.length && showChecked) {
    doneHTML = `
      <section class="group ${ui.checkedCollapsed ? 'is-collapsed' : ''}" data-flip="g-done">
        <div class="group__head">
          <button type="button" class="group__title" data-action="collapse-checked" aria-expanded="${!ui.checkedCollapsed}">
            ${icon('chevronDown', 'chev')}<span>購入済み</span><span class="group__count">${done.length}</span>
          </button>
          <button type="button" class="toolbar__btn toolbar__btn--accent" data-action="clear-checked">${icon('checks')}片付ける</button>
        </div>
        ${ui.checkedCollapsed ? '' : `<div class="card">${done.sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0)).map((i) => itemRow(i, ui.tab === 'all')).join('')}</div>`}
      </section>`;
  } else if (done.length) {
    doneHTML = `
      <div class="toolbar">
        <button type="button" class="toolbar__btn" data-action="toggle-show-checked">${icon('eye')}購入済み ${done.length}点を表示</button>
        <button type="button" class="toolbar__btn toolbar__btn--accent" data-action="clear-checked">${icon('checks')}片付ける</button>
      </div>`;
  }

  return header + summary + tabsHTML + groups + doneHTML;
}

const byCreated = (a, b) => a.createdAt - b.createdAt;

function todayText() {
  const d = new Date();
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日（${w}）`;
}

function itemRow(item, showStore) {
  const checked = isChecked(item);
  const metas = [];
  if (showStore) metas.push(`<span class="item__memo">${icon('store')}<span>${esc(store.storeName(item.storeId))}</span></span>`);
  if (item.memo) metas.push(`<span class="item__memo">${icon('note')}<span>${esc(item.memo)}</span></span>`);
  const priceHTML = item.price === null
    ? '<div class="item__noprice">価格未入力</div>'
    : `<div class="item__price">${yenHTML(item.price * item.qty)}</div>${item.qty > 1 ? `<div class="item__sub">${yenHTML(item.price)} × ${item.qty}</div>` : ''}`;
  return `
    <div class="row-wrap" data-flip="${esc(item.id)}">
      <button type="button" class="row-delete" data-action="swipe-delete" data-id="${esc(item.id)}" tabindex="-1" aria-label="削除"><span class="row-delete__inner">${icon('trash')}<span>削除</span></span></button>
      <div class="item ${checked ? 'is-checked' : ''}" data-id="${esc(item.id)}">
        <button type="button" class="check" data-action="toggle" aria-pressed="${checked}" aria-label="${checked ? '未購入に戻す' : '購入済みにする'}">
          <span class="check__ring"></span>${icon('check')}
        </button>
        <button type="button" class="item__tap" data-action="edit">
          <span class="item__main">
            <span class="item__name">${esc(store.productName(item.productId))}${item.qty > 1 && item.price === null ? ` <span class="item__sub">×${item.qty}</span>` : ''}</span>
            ${metas.length ? `<span class="item__meta">${metas.join('<span class="item__meta-sep"></span>')}</span>` : ''}
          </span>
          <span class="item__right">${priceHTML}</span>
        </button>
      </div>
    </div>`;
}

function buildEmpty() {
  const fresh = store.isEmpty();
  const frequent = fresh ? [] : store.suggestProducts('', 10);
  return `
    <div class="empty">
      <div class="empty__art">${icon('bag')}</div>
      <div class="empty__title">${fresh ? '買い物リストをはじめましょう' : 'リストは空っぽです'}</div>
      <div class="empty__text">${fresh
        ? '右下の <b>＋</b> ボタンから、買いたいものを<br>追加できます。'
        : '右下の <b>＋</b> ボタンで追加できます。<br>よく買うものはタップですぐ追加できます。'}</div>
      <div class="empty__actions">
        <button type="button" class="btn btn--primary" data-action="add">${icon('plus')}商品を追加</button>
        ${fresh ? `<button type="button" class="btn btn--tinted" data-action="load-sample">${icon('sparkle')}サンプルデータで試す</button>` : ''}
      </div>
    </div>
    ${frequent.length ? `
      <section class="group">
        <div class="group__head"><span class="group__title">${icon('clock')}<span>よく買うもの</span></span></div>
        <div class="suggest__chips suggest__chips--wrap" style="padding:0">
          ${frequent.map((p) => {
            const last = store.productStats(p.id).lastPriced;
            return `<button type="button" class="s-chip" data-quick-add="${esc(p.id)}"><span>${esc(p.name)}</span>${last ? `<span class="s-chip__price">${yenHTML(last.price)}</span>` : ''}${icon('plus')}</button>`;
          }).join('')}
        </div>
      </section>` : ''}`;
}

/* ------------------------------------------------------------------ 操作 */

function onClick(e) {
  if (swipeState.suppressClick) return;
  const tabBtn = e.target.closest('[data-tab-store]');
  if (tabBtn) {
    selectTab(tabBtn.dataset.tabStore);
    return;
  }
  const quick = e.target.closest('[data-quick-add]');
  if (quick) {
    quickAdd(quick.dataset.quickAdd);
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const itemEl = actionEl.closest('.item');
  const id = itemEl?.dataset.id || actionEl.dataset.id;

  if (openRow && action !== 'swipe-delete') {
    closeOpenRow();
    if (itemEl) return;
  }

  switch (action) {
    case 'toggle':
      toggleItem(id, itemEl);
      break;
    case 'edit':
      openItemEdit(id);
      break;
    case 'swipe-delete':
      deleteWithUndo(id);
      break;
    case 'add':
      openItemEditor({ storeId: currentStoreId() });
      break;
    case 'load-sample':
      loadSample();
      break;
    case 'toggle-show-checked':
      store.setSetting('showChecked', !store.state().settings.showChecked);
      break;
    case 'collapse-checked':
      ui.checkedCollapsed = !ui.checkedCollapsed;
      render();
      break;
    case 'clear-checked':
      clearChecked();
      break;
    default:
  }
}

function selectTab(key) {
  if (ui.tab === key) return;
  ui.tab = key;
  render({ animate: false });
  content.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  const active = content.querySelector('.chip.is-active');
  active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  // タブが上部に固定されている場合は、リストの先頭が見えるようにスクロール
  const anchor = content.querySelector('[data-role="tabs-anchor"]');
  if (anchor) {
    const target = anchor.offsetTop + 14 - navbar.offsetHeight;
    if (scroller.scrollTop > target) scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }
}

/** チェック操作：見た目をすぐ切り替え、少し待ってから並び替え＆保存 */
function toggleItem(id, itemEl) {
  const item = store.getItem(id);
  if (!item) return;
  const next = !isChecked(item);
  pending.set(id, next);
  if (itemEl) {
    itemEl.classList.toggle('is-checked', next);
    const check = itemEl.querySelector('.check');
    check.classList.remove('pop');
    void check.offsetWidth;
    check.classList.add('pop');
    check.setAttribute('aria-pressed', String(next));
  }
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(flushPending, 650);
}

export function flushPending() {
  clearTimeout(pendingTimer);
  if (!pending.size) return;
  const entries = [...pending.entries()];
  pending.clear();
  const newlyChecked = entries
    .filter(([id, checked]) => checked && store.getItem(id) && !store.getItem(id).checked)
    .map(([id]) => store.getItem(id));
  store.setCheckedMany(entries);
  if (newlyChecked.length === 1) {
    toast(`「${store.productName(newlyChecked[0].productId)}」を購入履歴に保存しました`, { icon: 'check' });
  } else if (newlyChecked.length > 1) {
    toast(`${newlyChecked.length}点を購入履歴に保存しました`, { icon: 'check' });
  }
}

function deleteWithUndo(id) {
  const item = store.getItem(id);
  if (!item) return;
  const snapshot = store.checkpoint();
  const name = store.productName(item.productId);
  openRow = null;
  store.deleteItem(id);
  toast(`「${name}」を削除しました`, { action: '元に戻す', onAction: () => store.restore(snapshot) });
}

function clearChecked() {
  flushPending();
  const snapshot = store.checkpoint();
  const scope = ui.tab === 'all' ? undefined : ui.tab === NONE ? null : ui.tab;
  const n = store.clearChecked(scope);
  if (n) toast(`購入済み ${n}点を片付けました`, { action: '元に戻す', onAction: () => store.restore(snapshot) });
}

/* ------------------------------------------------------------------ スワイプで削除 */

const swipeState = { suppressClick: false };
let openRow = null;
const OPEN_X = -96;

function setRowX(itemEl, x, settle) {
  itemEl.classList.toggle('is-settling', Boolean(settle));
  itemEl.style.transform = x ? `translateX(${x}px)` : '';
  if (x) itemEl.parentElement.classList.add('show-actions');
}

function closeOpenRow() {
  if (!openRow) return;
  const el = openRow;
  openRow = null;
  setRowX(el, 0, true);
  setTimeout(() => {
    if (!el.style.transform) el.parentElement?.classList.remove('show-actions');
  }, 320);
}

function setupSwipe() {
  let s = null;
  content.addEventListener('touchstart', (e) => {
    const itemEl = e.target.closest('.item');
    if (!itemEl || e.touches.length > 1) { s = null; return; }
    if (openRow && openRow !== itemEl) closeOpenRow();
    const t = e.touches[0];
    s = { el: itemEl, x: t.clientX, y: t.clientY, base: itemEl === openRow ? OPEN_X : 0, pos: 0, decided: false, horizontal: false };
  }, { passive: true });

  content.addEventListener('touchmove', (e) => {
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.decided = true;
      s.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (s.horizontal) {
        s.el.classList.add('is-swiping');
        s.el.parentElement.classList.add('show-actions');
      }
    }
    if (!s.horizontal) return;
    let pos = s.base + dx;
    if (pos > 0) pos *= 0.25;
    s.pos = pos;
    s.el.style.transform = `translateX(${pos}px)`;
  }, { passive: true });

  const end = () => {
    if (!s) return;
    const cur = s;
    s = null;
    if (!cur.horizontal) return;
    cur.el.classList.remove('is-swiping');
    swipeState.suppressClick = true;
    setTimeout(() => { swipeState.suppressClick = false; }, 350);
    const width = cur.el.offsetWidth;
    if (cur.pos < -width * 0.55) {
      // 大きくスワイプしたらそのまま削除
      setRowX(cur.el, -width, true);
      const id = cur.el.dataset.id;
      setTimeout(() => deleteWithUndo(id), 200);
    } else if (cur.pos < -48) {
      setRowX(cur.el, OPEN_X, true);
      openRow = cur.el;
    } else {
      openRow = cur.el;
      closeOpenRow();
    }
  };
  content.addEventListener('touchend', end);
  content.addEventListener('touchcancel', end);
}
