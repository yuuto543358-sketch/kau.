// 商品ごとの購入履歴・価格比較シート

import * as store from '../store.js';
import { icon } from '../icons.js';
import { esc, yenHTML, shortDate, relativeDay, longDate } from '../utils.js';
import { openSheet } from '../ui.js';
import { openItemEditor, openPurchaseEdit, openPurchaseCreate } from './editor.js';

export function openProductDetail(productId) {
  if (!store.getProduct(productId)) return null;
  let unsubscribe = () => {};
  const sheet = openSheet({
    title: '商品の履歴',
    left: '<button type="button" class="btn-text" data-sheet-close>閉じる</button>',
    right: `<button type="button" class="icon-btn" data-action="edit-name" aria-label="商品名を変更">${icon('pencil')}</button>`,
    body: '<div data-role="detail"></div>',
    footer: `
      <div class="sheet__footer-row">
        <button type="button" class="btn btn--secondary" data-action="record">${icon('receipt')}購入を記録</button>
        <button type="button" class="btn btn--primary" data-action="add">${icon('plus')}リストに追加</button>
      </div>`,
    onMount: (el, close) => {
      const box = el.querySelector('[data-role="detail"]');
      const render = () => {
        if (!store.getProduct(productId)) {
          close();
          return;
        }
        box.innerHTML = build(productId);
      };
      render();
      unsubscribe = store.subscribe(render);
      el.addEventListener('click', (e) => {
        const p = e.target.closest('[data-purchase]');
        if (p) return openPurchaseEdit(p.dataset.purchase);
        const s = e.target.closest('[data-store-add]');
        if (s) return openItemEditor({ productId, storeId: s.dataset.storeAdd || null });
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'add') {
          const best = store.productStats(productId).last;
          openItemEditor({ productId, storeId: best ? best.storeId : null });
        } else if (action === 'record') {
          openPurchaseCreate({ productId });
        } else if (action === 'edit-name') {
          import('./manage.js').then((m) => m.openProductEdit(productId));
        }
      });
    },
    onClose: () => unsubscribe(),
  });
  return sheet;
}

function build(productId) {
  const product = store.getProduct(productId);
  const stats = store.productStats(productId);
  const prices = store.storePrices(productId);
  const rows = store.state().purchases
    .filter((r) => r.productId === productId)
    .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
  const onList = store.state().items.filter((i) => i.productId === productId && !i.checked);
  const cheapest = prices[0];

  return `
    <div class="detail-head">
      <h3 class="detail-head__name">${esc(product.name)}</h3>
      <div class="detail-head__sub">${stats.count
        ? `${stats.count}回購入・最後に買ったのは${relativeDay(stats.last.date)}`
        : 'まだ購入履歴がありません'}${onList.length ? '・リストに追加済み' : ''}</div>
    </div>

    ${stats.count ? `
    <div class="stat-grid detail-stats">
      <div class="stat">
        <div class="stat__label">前回の価格</div>
        <div class="stat__value">${yenHTML(stats.lastPriced ? stats.lastPriced.price : null)}</div>
        <div class="stat__sub">${stats.lastPriced ? `${esc(store.storeName(stats.lastPriced.storeId))}・${shortDate(stats.lastPriced.date)}` : '—'}</div>
      </div>
      <div class="stat">
        <div class="stat__label">最安値</div>
        <div class="stat__value">${yenHTML(stats.min ? stats.min.price : null)}</div>
        <div class="stat__sub">${stats.min ? `${esc(store.storeName(stats.min.storeId))}・${shortDate(stats.min.date)}` : '—'}</div>
      </div>
      <div class="stat">
        <div class="stat__label">平均価格</div>
        <div class="stat__value stat__value--small">${yenHTML(stats.avg)}</div>
      </div>
      <div class="stat">
        <div class="stat__label">これまでの合計</div>
        <div class="stat__value stat__value--small">${yenHTML(stats.total)}</div>
        <div class="stat__sub">${stats.qty}個</div>
      </div>
    </div>` : ''}

    ${prices.length ? `
    <div class="list-group">
      <div class="list-group__title">お店ごとの前回価格</div>
      <div class="list-group__body list-group__body--icons">
        ${prices.map((p) => `
          <button type="button" class="row" data-store-add="${esc(p.storeId || '')}">
            <span class="row__icon">${icon('store')}</span>
            <span class="row__main">
              <span class="row__label" style="display:block">${esc(store.storeName(p.storeId))}</span>
              <span class="row__sub" style="display:block">${shortDate(p.date)}に購入${p.min < p.price ? `・最安 ${yenHTML(p.min)}` : ''}</span>
            </span>
            ${prices.length > 1 && p === cheapest ? '<span class="badge">最安</span>' : ''}
            <span class="row__value">${yenHTML(p.price)}</span>
            ${icon('plus', 'row__chev')}
          </button>`).join('')}
      </div>
      <div class="list-group__footer">お店をタップすると、その価格でリストに追加できます。</div>
    </div>` : ''}

    <div class="list-group">
      <div class="list-group__title">購入履歴</div>
      ${rows.length ? `
      <div class="list-group__body">
        ${rows.map((r) => `
          <button type="button" class="row" data-purchase="${esc(r.id)}">
            <span class="row__main">
              <span class="row__label" style="display:block">${longDate(r.date)}</span>
              <span class="row__sub" style="display:block">${esc(store.storeName(r.storeId))}${r.qty > 1 ? `・${r.qty}個（${yenHTML(r.price)}／個）` : ''}</span>
            </span>
            <span class="row__value">${yenHTML(r.price === null ? null : r.price * r.qty)}</span>
            ${icon('chevronRight', 'row__chev')}
          </button>`).join('')}
      </div>` : `
      <div class="list-group__body"><div class="empty empty--compact"><div class="empty__text">リストでチェックを入れると、ここに記録されます。</div></div></div>`}
    </div>`;
}
