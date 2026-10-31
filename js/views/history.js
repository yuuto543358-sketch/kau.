// 購入履歴画面

import * as store from '../store.js';
import { icon } from '../icons.js';
import { esc, yenHTML, dayLabel, startOfDay, monthKey, matches, shortDate, relativeDay } from '../utils.js';
import { openPurchaseCreate, openPurchaseEdit } from './editor.js';
import { openProductDetail } from './product-detail.js';

const PAGE = 60;

const ui = {
  query: '',
  storeFilter: 'all',
  view: 'timeline', // 'timeline' | 'products'
  limit: PAGE,
};

let screen;
let scroller;
let navbar;
let results;
let filtersEl;
let statsEl;

export function mountHistory(el) {
  screen = el;
  screen.innerHTML = `
    <header class="navbar navbar--large">
      <div></div>
      <h1 class="navbar__title">履歴</h1>
      <div class="navbar__actions">
        <button type="button" class="icon-btn" data-action="record" aria-label="購入を記録">${icon('plus')}</button>
      </div>
    </header>
    <div class="scroll">
      <div class="content">
        <div class="large-title">履歴</div>
        <div data-role="stats"></div>
        <label class="searchbar" data-role="searchbar">
          ${icon('search')}
          <input class="searchbar__input" type="search" placeholder="商品名・お店で検索" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="履歴を検索">
          <button type="button" class="field__clear" data-action="clear-search" aria-label="検索を消す">${icon('x')}</button>
        </label>
        <div class="segmented" role="tablist">
          <span class="segmented__thumb"></span>
          <button type="button" class="segmented__btn" data-view="timeline" role="tab">日付順</button>
          <button type="button" class="segmented__btn" data-view="products" role="tab">商品別</button>
        </div>
        <div class="chips filter-chips" data-role="filters"></div>
        <div data-role="results"></div>
      </div>
    </div>`;
  navbar = screen.querySelector('.navbar');
  scroller = screen.querySelector('.scroll');
  results = screen.querySelector('[data-role="results"]');
  filtersEl = screen.querySelector('[data-role="filters"]');
  statsEl = screen.querySelector('[data-role="stats"]');
  const input = screen.querySelector('.searchbar__input');

  scroller.addEventListener('scroll', () => {
    navbar.classList.toggle('is-scrolled', scroller.scrollTop > 36);
  }, { passive: true });

  input.addEventListener('input', () => {
    ui.query = input.value;
    ui.limit = PAGE;
    screen.querySelector('[data-role="searchbar"]').classList.toggle('has-value', Boolean(input.value));
    renderResults();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });

  screen.addEventListener('click', (e) => {
    const viewBtn = e.target.closest('[data-view]');
    if (viewBtn) {
      ui.view = viewBtn.dataset.view;
      ui.limit = PAGE;
      updateSegment();
      renderResults();
      return;
    }
    const f = e.target.closest('[data-filter]');
    if (f) {
      ui.storeFilter = f.dataset.filter;
      ui.limit = PAGE;
      renderFilters();
      renderResults();
      return;
    }
    const p = e.target.closest('[data-purchase]');
    if (p) {
      openPurchaseEdit(p.dataset.purchase);
      return;
    }
    const prod = e.target.closest('[data-product]');
    if (prod) {
      openProductDetail(prod.dataset.product);
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'record') {
      openPurchaseCreate({ storeId: ui.storeFilter !== 'all' && ui.storeFilter !== 'none' ? ui.storeFilter : null });
    } else if (action === 'clear-search') {
      e.preventDefault();
      input.value = '';
      input.dispatchEvent(new Event('input'));
    } else if (action === 'more') {
      ui.limit += PAGE * 2;
      renderResults();
    }
  });

  updateSegment();
  render();
}

function updateSegment() {
  const idx = ui.view === 'timeline' ? 0 : 1;
  const thumb = screen.querySelector('.segmented__thumb');
  thumb.style.width = 'calc(50% - 2px)';
  thumb.style.transform = `translateX(${idx * 100}%)`;
  screen.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === ui.view)));
}

export function render() {
  if (!screen) return;
  renderStats();
  renderFilters();
  renderResults();
}

function renderStats() {
  const purchases = store.state().purchases;
  const now = Date.now();
  const thisMonth = monthKey(now);
  const d = new Date(now);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const lastMonth = monthKey(d.getTime());
  let cur = 0;
  let curN = 0;
  let prev = 0;
  for (const r of purchases) {
    const mk = monthKey(r.date);
    const amount = (r.price ?? 0) * r.qty;
    if (mk === thisMonth) { cur += amount; curN += r.qty; } else if (mk === lastMonth) prev += amount;
  }
  const diff = cur - prev;
  statsEl.innerHTML = purchases.length ? `
    <div class="stat-grid">
      <div class="stat">
        <div class="stat__label">${new Date(now).getMonth() + 1}月の支出</div>
        <div class="stat__value">${yenHTML(cur)}</div>
        <div class="stat__sub">${curN}点を購入</div>
      </div>
      <div class="stat">
        <div class="stat__label">${d.getMonth() + 1}月の支出</div>
        <div class="stat__value">${yenHTML(prev)}</div>
        <div class="stat__sub">${prev ? `今月は ${diff >= 0 ? '+' : '−'}¥${Math.abs(diff).toLocaleString('ja-JP')}` : '記録なし'}</div>
      </div>
    </div>` : '';
}

function renderFilters() {
  const purchases = store.state().purchases;
  const used = new Set(purchases.map((r) => r.storeId || 'none'));
  const stores = store.storesSorted().filter((s) => used.has(s.id));
  if (ui.storeFilter !== 'all' && !used.has(ui.storeFilter)) ui.storeFilter = 'all';
  if (!purchases.length) {
    filtersEl.innerHTML = '';
    return;
  }
  filtersEl.innerHTML = `
    <button type="button" class="chip ${ui.storeFilter === 'all' ? 'is-active' : ''}" data-filter="all">すべてのお店</button>
    ${stores.map((s) => `<button type="button" class="chip ${ui.storeFilter === s.id ? 'is-active' : ''}" data-filter="${esc(s.id)}">${esc(s.name)}</button>`).join('')}
    ${used.has('none') ? `<button type="button" class="chip ${ui.storeFilter === 'none' ? 'is-active' : ''}" data-filter="none">店舗未設定</button>` : ''}`;
}

function filtered() {
  const q = ui.query.trim();
  return store.state().purchases.filter((r) => {
    if (ui.storeFilter !== 'all' && (r.storeId || 'none') !== ui.storeFilter) return false;
    if (!q) return true;
    return matches(store.productName(r.productId), q) || matches(store.storeName(r.storeId), q);
  });
}

function renderResults() {
  const all = store.state().purchases;
  if (!all.length) {
    results.innerHTML = `
      <div class="empty">
        <div class="empty__art">${icon('receipt')}</div>
        <div class="empty__title">購入履歴はまだありません</div>
        <div class="empty__text">リストの商品にチェックを入れると、<br>ここに自動で記録されます。</div>
        <div class="empty__actions">
          <button type="button" class="btn btn--tinted" data-action="record">${icon('plus')}購入を手動で記録</button>
        </div>
      </div>`;
    return;
  }
  const rows = filtered();
  if (!rows.length) {
    results.innerHTML = `
      <div class="empty empty--compact">
        <div class="empty__art">${icon('search')}</div>
        <div class="empty__title">見つかりませんでした</div>
        <div class="empty__text">別のことばで検索してみてください。</div>
      </div>`;
    return;
  }
  results.innerHTML = ui.view === 'timeline' ? timeline(rows) : byProduct(rows);
}

function timeline(rows) {
  const sorted = [...rows].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
  const shown = sorted.slice(0, ui.limit);
  const days = new Map();
  for (const r of sorted) {
    const k = startOfDay(r.date);
    if (!days.has(k)) days.set(k, { total: 0, rows: [] });
    days.get(k).total += (r.price ?? 0) * r.qty;
  }
  for (const r of shown) days.get(startOfDay(r.date)).rows.push(r);
  let html = '';
  for (const [day, info] of days) {
    if (!info.rows.length) continue;
    html += `
      <div class="day-head"><span>${dayLabel(day)}</span><span class="day-head__total">${yenHTML(info.total)}</span></div>
      <div class="card history-card">
        ${info.rows.map((r) => {
          const name = store.productName(r.productId);
          const t = new Date(r.date);
          const time = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
          return `
            <button type="button" class="hrow" data-purchase="${esc(r.id)}">
              <span class="avatar">${esc(initial(store.storeName(r.storeId)))}</span>
              <span class="item__main">
                <span class="item__name">${esc(name)}</span>
                <span class="item__meta"><span>${esc(store.storeName(r.storeId))}</span><span class="item__meta-sep"></span><span class="num">${time}</span></span>
              </span>
              <span class="item__right">
                <span class="item__price" style="display:block">${yenHTML(r.price === null ? null : r.price * r.qty)}</span>
                ${r.qty > 1 ? `<span class="item__sub" style="display:block">${yenHTML(r.price)} × ${r.qty}</span>` : ''}
              </span>
            </button>`;
        }).join('')}
      </div>`;
  }
  if (sorted.length > shown.length) {
    html += `<div class="more"><button type="button" class="btn btn--secondary btn--small" data-action="more">さらに表示（残り${sorted.length - shown.length}件）</button></div>`;
  }
  return html;
}

function byProduct(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.productId)) groups.set(r.productId, []);
    groups.get(r.productId).push(r);
  }
  const list = [...groups.entries()]
    .map(([pid, rs]) => {
      const last = rs.reduce((a, r) => (!a || r.date > a.date ? r : a), null);
      const lastPriced = rs.filter((r) => r.price !== null).reduce((a, r) => (!a || r.date > a.date ? r : a), null);
      return { pid, rs, last, lastPriced, name: store.productName(pid) };
    })
    .sort((a, b) => b.last.date - a.last.date);
  const shown = list.slice(0, ui.limit);
  return `
    <div class="day-head"><span>${list.length}品目</span><span class="day-head__total">前回の価格</span></div>
    <div class="card history-card">
      ${shown.map((g) => `
        <button type="button" class="hrow" data-product="${esc(g.pid)}">
          <span class="avatar">${icon('box')}</span>
          <span class="item__main">
            <span class="item__name">${esc(g.name)}</span>
            <span class="item__meta"><span>${g.rs.length}回購入</span><span class="item__meta-sep"></span><span>${relativeDay(g.last.date)}</span></span>
          </span>
          <span class="item__right">
            <span class="item__price" style="display:block">${yenHTML(g.lastPriced ? g.lastPriced.price : null)}</span>
            ${g.lastPriced ? `<span class="item__sub" style="display:block">${esc(store.storeName(g.lastPriced.storeId))}・${shortDate(g.lastPriced.date)}</span>` : ''}
          </span>
          ${icon('chevronRight', 'row__chev')}
        </button>`).join('')}
    </div>
    ${list.length > shown.length ? `<div class="more"><button type="button" class="btn btn--secondary btn--small" data-action="more">さらに表示（残り${list.length - shown.length}件）</button></div>` : ''}`;
}

function initial(name) {
  const s = String(name || '').trim();
  return s ? Array.from(s)[0].toUpperCase() : '?';
}
