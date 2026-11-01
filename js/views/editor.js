// 商品の追加・編集シート／購入履歴の記録・編集シート
//
// 商品名・購入場所は履歴の候補からタップで選べる。
// 商品名と購入場所の組み合わせに応じて、その店での直近の購入価格を自動入力する。

import * as store from '../store.js';
import { icon } from '../icons.js';
import { esc, yen, parsePrice, shortDate, toDateInput, fromDateInput, nameKey } from '../utils.js';
import { openSheet, toast, confirmDialog } from '../ui.js';

/**
 * 買い物リストの商品を追加
 * @param {{ storeId?: string|null, productId?: string }} [preset]
 */
export function openItemEditor(preset = {}) {
  const storeName = preset.storeId ? store.storeName(preset.storeId) : '';
  const product = preset.productId ? store.getProduct(preset.productId) : null;
  return openEntryEditor({
    mode: 'item-add',
    name: product ? product.name : '',
    storeName,
    price: '',
    priceSource: 'empty',
    qty: 1,
    memo: '',
  });
}

/** 買い物リストの商品を編集 */
export function openItemEdit(itemId) {
  const item = store.getItem(itemId);
  if (!item) return null;
  return openEntryEditor({
    mode: 'item-edit',
    id: item.id,
    checked: item.checked,
    name: store.productName(item.productId),
    storeName: item.storeId ? store.storeName(item.storeId) : '',
    price: item.price === null ? '' : String(item.price),
    priceSource: item.price === null ? 'empty' : 'manual',
    qty: item.qty,
    memo: item.memo,
  });
}

/** 購入履歴を手動で記録 */
export function openPurchaseCreate(preset = {}) {
  const product = preset.productId ? store.getProduct(preset.productId) : null;
  return openEntryEditor({
    mode: 'purchase-add',
    name: product ? product.name : '',
    storeName: preset.storeId ? store.storeName(preset.storeId) : '',
    price: '',
    priceSource: 'empty',
    qty: 1,
    date: Date.now(),
  });
}

/** 購入履歴を編集 */
export function openPurchaseEdit(purchaseId) {
  const r = store.getPurchase(purchaseId);
  if (!r) return null;
  return openEntryEditor({
    mode: 'purchase-edit',
    id: r.id,
    linked: Boolean(r.itemId),
    name: store.productName(r.productId),
    storeName: r.storeId ? store.storeName(r.storeId) : '',
    price: r.price === null ? '' : String(r.price),
    priceSource: r.price === null ? 'empty' : 'manual',
    qty: r.qty,
    date: r.date,
  });
}

/* ------------------------------------------------------------------ 本体 */

// シンプルな1枚のフォーム。キーボードの確定（Enter）で「商品 → お店 → 価格」の順に進む。
// 候補ボタンは、いま入力している欄（商品かお店）の分だけ表示する。
function openEntryEditor(init) {
  const st = { ...init, showAll: false };
  const isItem = st.mode.startsWith('item');
  const isAdd = st.mode.endsWith('add');
  const excludeId = st.mode === 'purchase-edit' ? st.id : null;
  st.active = isAdd ? (!st.name ? 'name' : !st.storeName ? 'store' : null) : null;

  const title = {
    'item-add': '商品を追加',
    'item-edit': '商品を編集',
    'purchase-add': '購入を記録',
    'purchase-edit': '購入履歴を編集',
  }[st.mode];

  const note = st.mode === 'item-edit' && st.checked
    ? '購入済みの商品です。変更は購入履歴にも反映されます。'
    : st.mode === 'purchase-edit' && st.linked ? 'リストの購入済み商品と連動しています。' : '';

  const body = `
    <div class="entry">
      <div class="entry-row" data-field="name">
        <span class="entry-row__label">商品</span>
        <input class="entry-row__input" data-input="name" type="text" placeholder="商品名" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="80" aria-label="商品名">
        <button type="button" class="field__clear" data-clear="name" aria-label="消す">${icon('x')}</button>
      </div>
      <div class="entry-row" data-field="store">
        <span class="entry-row__label">お店</span>
        <input class="entry-row__input" data-input="store" type="text" placeholder="お店（なしでもOK）" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="60" aria-label="お店">
        <button type="button" class="field__clear" data-clear="store" aria-label="消す">${icon('x')}</button>
      </div>
      <div class="entry-row entry-row--price" data-role="price-field">
        <span class="entry-row__label">価格</span>
        <span class="entry-row__yen">¥</span>
        <input class="entry-row__input entry-row__input--price" data-input="price" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off" enterkeyhint="${isItem ? 'next' : 'done'}" aria-label="価格">
        <div class="stepper stepper--compact">
          <button type="button" class="stepper__btn" data-step="-1" aria-label="1つ減らす">${icon('minus')}</button>
          <span class="stepper__value" data-role="qty">1</span>
          <button type="button" class="stepper__btn" data-step="1" aria-label="1つ増やす">${icon('plus')}</button>
        </div>
      </div>
      ${isItem ? `
      <div class="entry-row" data-field="memo">
        <span class="entry-row__label">メモ</span>
        <input class="entry-row__input entry-row__input--memo" data-input="memo" type="text" placeholder="任意" autocomplete="off" enterkeyhint="done" maxlength="200" aria-label="メモ">
        <button type="button" class="field__clear" data-clear="memo" aria-label="消す">${icon('x')}</button>
      </div>` : `
      <label class="entry-row">
        <span class="entry-row__label">日付</span>
        <input class="entry-row__input entry-row__input--date" data-input="date" type="date" aria-label="購入日">
      </label>`}
    </div>
    <div class="entry-hint" data-role="price-hint"></div>
    <div class="entry-chips" data-role="chips"></div>
    ${note ? `<p class="entry-note">${note}</p>` : ''}
    ${st.mode === 'purchase-edit' ? `<button type="button" class="btn btn--tinted btn--block entry-extra" data-action="product-history">${icon('clock')}この商品の履歴と価格を見る</button>` : ''}
    ${!isAdd ? `<button type="button" class="btn btn--danger btn--block entry-extra" data-action="delete">${icon('trash')}${isItem ? 'リストから削除' : 'この履歴を削除'}</button>` : ''}
  `;

  const footer = `
    <div class="sheet__footer-row">
      ${st.mode === 'item-add' ? '<button type="button" class="btn btn--secondary" data-action="submit-continue">続けて追加</button>' : ''}
      <button type="button" class="btn btn--primary" data-action="submit" data-role="submit-label"></button>
    </div>`;

  const sheet = openSheet({
    title,
    body,
    footer,
    className: 'sheet--entry',
    onMount: (el) => mount(el),
  });

  function mount(el) {
    const $ = (sel) => el.querySelector(sel);
    const inputs = {
      name: $('[data-input="name"]'),
      store: $('[data-input="store"]'),
      price: $('[data-input="price"]'),
      memo: $('[data-input="memo"]'),
      date: $('[data-input="date"]'),
    };
    inputs.name.value = st.name;
    inputs.store.value = st.storeName;
    inputs.price.value = st.price;
    if (inputs.memo) inputs.memo.value = st.memo || '';
    if (inputs.date) inputs.date.value = toDateInput(st.date);

    /* ---------- 候補ボタン（入力中の欄の分だけ） ---------- */

    function renderChips() {
      const box = $('[data-role="chips"]');
      el.querySelectorAll('.entry-row').forEach((r) => r.classList.toggle('is-active', r.dataset.field === st.active));
      if (st.active === 'name') box.innerHTML = nameChips();
      else if (st.active === 'store') box.innerHTML = storeChips();
      else box.innerHTML = '';
    }

    function nameChips() {
      const qv = st.name.trim();
      const limit = qv ? 24 : st.showAll ? 200 : 12;
      const list = store.suggestProducts(qv, limit + 1);
      const more = !qv && list.length > limit;
      const shown = list.slice(0, limit);
      const selKey = nameKey(qv);
      if (!shown.length || (shown.length === 1 && shown[0].key === selKey)) return '';
      return `
        <div class="suggest__caption">${qv ? '候補' : 'よく買うもの'}</div>
        <div class="suggest__chips suggest__chips--wrap">
          ${shown.map((p) => `<button type="button" class="s-chip ${p.key === selKey ? 'is-selected' : ''}" data-pick-name="${esc(p.id)}"><span>${esc(p.name)}</span></button>`).join('')}
          ${more ? '<button type="button" class="s-chip s-chip--more" data-action="show-all">すべて表示</button>' : ''}
        </div>`;
    }

    function storeChips() {
      const qv = st.storeName.trim();
      const exact = store.findStoreByName(qv);
      const product = store.findProductByName(st.name);
      const list = store.suggestStores(qv && !exact ? qv : '', product ? product.id : null, 40);
      if (!list.length) return '';
      return `
        <div class="suggest__caption">お店</div>
        <div class="suggest__chips suggest__chips--wrap">
          ${list.map(({ store: s, last }) => {
            const lp = last && excludeId ? store.lastPrice(product.id, s.id, excludeId) : last;
            return `<button type="button" class="s-chip ${exact && exact.id === s.id ? 'is-selected' : ''}" data-pick-store="${esc(s.id)}">
              <span>${esc(s.name)}</span>${lp ? `<span class="s-chip__price">${yen(lp.price)}</span>` : ''}
            </button>`;
          }).join('')}
        </div>`;
    }

    /* ---------- 価格の自動入力 ---------- */

    function currentLast() {
      const product = store.findProductByName(st.name);
      if (!product) return { product: null, store: null, last: null };
      const s = st.storeName.trim() ? store.findStoreByName(st.storeName) : null;
      // 入力された店舗名がまだ登録されていない（新しい店舗）の場合は履歴なし
      if (st.storeName.trim() && !s) return { product, store: null, last: null };
      return { product, store: s, last: store.lastPrice(product.id, s ? s.id : null, excludeId) };
    }

    // allowAuto=false のときは価格欄を書き換えず、表示だけ更新する（価格の手入力中）
    function updatePrice(allowAuto = true) {
      const { product, store: s, last } = currentLast();
      if (allowAuto && st.priceSource !== 'manual') {
        st.price = last ? String(last.price) : '';
        st.priceSource = last ? 'auto' : 'empty';
        inputs.price.value = st.price;
      }
      $('[data-role="price-field"]').classList.toggle('is-auto', st.priceSource === 'auto');

      const parts = [];
      if (last && st.priceSource === 'auto') {
        parts.push(`<span class="badge">${icon('sparkle')}前回の価格</span><span>${shortDate(last.date)}・${esc(s ? s.name : '店舗未設定')}</span>`);
      } else if (last && st.priceSource === 'manual' && parsePrice(st.price) !== last.price) {
        parts.push(`<button type="button" class="price-hint__apply" data-action="apply-last">${icon('undo')}前回 ${yen(last.price)} に戻す</button>`);
      }
      // 同じ商品がリストにあれば知らせる
      if (st.mode === 'item-add' && product && !(st.storeName.trim() && !s)) {
        const open = store.findOpenItem(product.id, s ? s.id : null);
        if (open) parts.push(`<span class="entry-hint__dup">${icon('info')}リストに${open.qty}個あり・個数が増えます</span>`);
      }
      $('[data-role="price-hint"]').innerHTML = parts.join('');
      updateTotal();
    }

    function updateTotal() {
      const price = parsePrice(st.price);
      const base = { 'item-add': '追加', 'item-edit': '保存', 'purchase-add': '記録', 'purchase-edit': '保存' }[st.mode];
      $('[data-role="submit-label"]').innerHTML = price === null
        ? base
        : `${base}<span class="btn__sub">${yen(price * st.qty)}</span>`;
      $('[data-role="qty"]').textContent = st.qty;
      $('[data-step="-1"]').disabled = st.qty <= 1;
    }

    function updateClear() {
      el.querySelectorAll('[data-field]').forEach((f) => {
        const input = f.querySelector('input');
        f.classList.toggle('has-value', Boolean(input && input.value));
      });
    }

    function refreshAll() {
      renderChips();
      updatePrice();
      updateClear();
    }

    /* ---------- 入力 ---------- */

    inputs.name.addEventListener('input', () => {
      st.name = inputs.name.value;
      st.active = 'name';
      renderChips();
      updatePrice();
      updateClear();
    });

    inputs.store.addEventListener('input', () => {
      st.storeName = inputs.store.value;
      st.active = 'store';
      renderChips();
      updatePrice();
      updateClear();
    });

    inputs.name.addEventListener('focus', () => { st.active = 'name'; renderChips(); });
    inputs.store.addEventListener('focus', () => { st.active = 'store'; renderChips(); });

    inputs.price.addEventListener('input', () => {
      const digits = inputs.price.value.normalize('NFKC').replace(/[^\d]/g, '').slice(0, 8);
      if (digits !== inputs.price.value) inputs.price.value = digits;
      st.price = digits;
      st.priceSource = digits ? 'manual' : 'empty';
      updatePrice(false);
    });

    inputs.price.addEventListener('focus', () => {
      st.active = null;
      renderChips();
      // 自動入力された価格はタップですぐ書き換えられるよう全選択
      if (inputs.price.value) setTimeout(() => inputs.price.setSelectionRange(0, inputs.price.value.length), 0);
    });

    if (inputs.memo) {
      inputs.memo.addEventListener('focus', () => { st.active = null; renderChips(); });
      inputs.memo.addEventListener('input', () => {
        st.memo = inputs.memo.value;
        updateClear();
      });
    }

    if (inputs.date) {
      inputs.date.addEventListener('change', () => {
        const ts = fromDateInput(inputs.date.value, st.date);
        if (ts) st.date = ts;
      });
    }

    /* ---------- キーボードの確定（Enter）で次の欄へ ---------- */

    const nextOf = { name: 'store', store: 'price', price: 'memo' };
    function goNext(key) {
      // 入力途中の文字も確実に反映してから進む
      if (key === 'name') st.name = inputs.name.value;
      if (key === 'store') st.storeName = inputs.store.value;
      const next = nextOf[key];
      if (next && inputs[next]) {
        inputs[next].focus({ preventScroll: true });
        inputs[next].scrollIntoView({ block: 'nearest' });
      } else {
        inputs[key].blur();
        st.active = null;
        renderChips();
      }
    }
    for (const key of ['name', 'store', 'price', 'memo']) {
      const input = inputs[key];
      if (!input) continue;
      let pending = false;
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (e.isComposing) {
          // 日本語変換の「確定」：変換が終わるのを待ってから次へ
          pending = true;
          setTimeout(() => { if (pending) { pending = false; goNext(key); } }, 250);
        } else {
          goNext(key);
        }
      });
      input.addEventListener('compositionend', () => {
        if (!pending) return;
        pending = false;
        setTimeout(() => goNext(key), 0);
      });
    }

    /* ---------- タップ ---------- */

    el.addEventListener('click', (e) => {
      const nameChip = e.target.closest('[data-pick-name]');
      if (nameChip) {
        const p = store.getProduct(nameChip.dataset.pickName);
        if (!p) return;
        st.name = p.name;
        inputs.name.value = p.name;
        inputs.name.blur();
        st.active = st.storeName.trim() ? null : 'store'; // 次はお店
        refreshAll();
        return;
      }
      const storeChip = e.target.closest('[data-pick-store]');
      if (storeChip) {
        const s = store.getStore(storeChip.dataset.pickStore);
        if (!s) return;
        st.storeName = s.name;
        inputs.store.value = s.name;
        inputs.store.blur();
        st.active = null;
        refreshAll();
        return;
      }
      const clear = e.target.closest('[data-clear]');
      if (clear) {
        const key = clear.dataset.clear;
        inputs[key].value = '';
        inputs[key].dispatchEvent(new Event('input'));
        inputs[key].focus();
        return;
      }
      const stepBtn = e.target.closest('[data-step]');
      if (stepBtn) {
        st.qty = Math.max(1, Math.min(999, st.qty + Number(stepBtn.dataset.step)));
        updateTotal();
        return;
      }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'apply-last') {
        st.priceSource = 'auto';
        updatePrice();
      } else if (action === 'show-all') {
        st.showAll = true;
        renderChips();
      } else if (action === 'submit') {
        submit(false);
      } else if (action === 'submit-continue') {
        submit(true);
      } else if (action === 'delete') {
        remove();
      } else if (action === 'product-history') {
        const product = store.findProductByName(st.name);
        if (product) import('./product-detail.js').then((m) => m.openProductDetail(product.id));
      }
    });

    /* ---------- 保存 ---------- */

    function submit(keepOpen) {
      st.name = inputs.name.value;
      st.storeName = inputs.store.value;
      const name = st.name.trim();
      if (!name) {
        const row = $('[data-field="name"]');
        row.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
          { duration: 320, easing: 'ease-out' },
        );
        st.active = 'name';
        renderChips();
        toast('商品名を入れてください', { icon: 'info' });
        return;
      }
      const payload = {
        name,
        storeName: st.storeName.trim(),
        price: parsePrice(st.price),
        qty: st.qty,
        memo: st.memo || '',
        date: st.date,
      };

      if (st.mode === 'item-add') {
        const res = store.addItem(payload);
        if (!res) return;
        const pname = store.productName(res.item.productId);
        toast(res.merged ? `「${pname}」の個数を${res.item.qty}にしました` : `「${pname}」を追加しました`, { icon: 'check' });
        if (keepOpen) {
          // お店はそのまま、ほかの欄をリセットして次の商品へ
          Object.assign(st, { name: '', price: '', priceSource: 'empty', qty: 1, memo: '', active: 'name', showAll: false });
          inputs.name.value = '';
          inputs.price.value = '';
          if (inputs.memo) inputs.memo.value = '';
          refreshAll();
          inputs.name.focus({ preventScroll: true });
          return;
        }
      } else if (st.mode === 'item-edit') {
        if (!store.updateItem(st.id, payload)) toast('この商品は見つかりませんでした');
      } else if (st.mode === 'purchase-add') {
        store.addPurchase(payload);
        toast(`「${name}」を購入履歴に記録しました`, { icon: 'check' });
      } else if (st.mode === 'purchase-edit') {
        if (!store.updatePurchase(st.id, payload)) toast('この履歴は見つかりませんでした');
      }
      sheet.close();
    }

    async function remove() {
      if (isItem) {
        const item = store.getItem(st.id);
        if (!item) return sheet.close();
        const snapshot = store.checkpoint();
        const pname = store.productName(item.productId);
        store.deleteItem(st.id);
        sheet.close();
        toast(`「${pname}」を削除しました`, { action: '元に戻す', onAction: () => store.restore(snapshot) });
      } else {
        const ok = await confirmDialog({
          title: 'この購入履歴を削除しますか？',
          message: '削除すると、この記録は価格の自動入力に使われなくなります。',
          ok: '削除',
          danger: true,
        });
        if (!ok) return;
        const snapshot = store.checkpoint();
        store.deletePurchase(st.id);
        sheet.close();
        toast('購入履歴を削除しました', { action: '元に戻す', onAction: () => store.restore(snapshot) });
      }
    }

    refreshAll();
    // 候補がまったくないとき（はじめて使うとき）だけ、すぐキーボードを出す
    if (st.active === 'name' && !store.state().products.length) inputs.name.focus({ preventScroll: true });
  }

  return sheet;
}
