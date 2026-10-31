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
    autofocus: !product,
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
    autofocus: !product,
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

function openEntryEditor(init) {
  const st = { ...init };
  const isItem = st.mode.startsWith('item');
  const isAdd = st.mode.endsWith('add');
  const excludeId = st.mode === 'purchase-edit' ? st.id : null;

  const title = {
    'item-add': '商品を追加',
    'item-edit': '商品を編集',
    'purchase-add': '購入を記録',
    'purchase-edit': '購入履歴を編集',
  }[st.mode];

  const primaryLabel = { 'item-add': '追加', 'item-edit': '保存', 'purchase-add': '記録', 'purchase-edit': '保存' }[st.mode];

  const body = `
    ${st.mode === 'item-edit' && st.checked ? `<div class="notice notice--muted">${icon('info')}<span>購入済みの商品です。変更は購入履歴にも反映されます。</span></div>` : ''}
    ${st.mode === 'purchase-edit' && st.linked ? `<div class="notice notice--muted">${icon('info')}<span>買い物リストの購入済み商品と連動しています。変更はリストにも反映されます。</span></div>` : ''}
    <div class="form-label">商品名</div>
    <div class="form-group">
      <div class="field" data-field="name">
        ${icon('box')}
        <input class="field__input" data-input="name" type="text" placeholder="例：牛乳" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="80" aria-label="商品名">
        <button type="button" class="field__clear" data-clear="name" aria-label="商品名を消す">${icon('x')}</button>
      </div>
      <div class="suggest" data-suggest="name"></div>
    </div>

    <div class="form-label">購入場所</div>
    <div class="form-group">
      <div class="field" data-field="store">
        ${icon('store')}
        <input class="field__input" data-input="store" type="text" placeholder="例：スーパーA" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="60" aria-label="購入場所">
        <button type="button" class="field__clear" data-clear="store" aria-label="購入場所を消す">${icon('x')}</button>
      </div>
      <div class="suggest" data-suggest="store"></div>
    </div>

    <div class="form-label">価格<span class="form-label__opt">1個あたり</span></div>
    <div class="form-group">
      <div class="price-field" data-role="price-field">
        <span class="price-field__sym">¥</span>
        <input class="price-field__input" data-input="price" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off" enterkeyhint="${isItem ? 'next' : 'done'}" aria-label="価格">
      </div>
      <div class="price-hint" data-role="price-hint"></div>
      <div class="field">
        ${icon('copy')}
        <span class="field__row-label">個数</span>
        <div class="stepper">
          <button type="button" class="stepper__btn" data-step="-1" aria-label="1つ減らす">${icon('minus')}</button>
          <span class="stepper__value" data-role="qty">1</span>
          <button type="button" class="stepper__btn" data-step="1" aria-label="1つ増やす">${icon('plus')}</button>
        </div>
      </div>
    </div>

    ${isItem ? `
    <div class="form-label">メモ<span class="form-label__opt">任意</span></div>
    <div class="form-group">
      <div class="field" data-field="memo">
        ${icon('note')}
        <input class="field__input" data-input="memo" type="text" placeholder="例：6枚切り、特売なら2つ" autocomplete="off" enterkeyhint="done" maxlength="200" aria-label="メモ">
        <button type="button" class="field__clear" data-clear="memo" aria-label="メモを消す">${icon('x')}</button>
      </div>
    </div>` : `
    <div class="form-label">購入日</div>
    <div class="form-group">
      <div class="field">
        ${icon('calendar')}
        <input class="field__input field__input--date" data-input="date" type="date" aria-label="購入日">
      </div>
    </div>`}

    ${st.mode === 'purchase-edit' ? `<button type="button" class="btn btn--tinted btn--block" data-action="product-history">${icon('clock')}この商品の履歴と価格を見る</button>` : ''}
    ${!isAdd ? `<div class="sheet-danger"><button type="button" class="btn btn--danger btn--block" data-action="delete">${icon('trash')}${isItem ? 'リストから削除' : 'この履歴を削除'}</button></div>` : ''}
  `;

  const footer = `
    <div data-role="dup"></div>
    <div class="footer-total" data-role="total"></div>
    <div class="sheet__footer-row">
      ${st.mode === 'item-add' ? '<button type="button" class="btn btn--secondary" data-action="submit-continue">続けて追加</button>' : ''}
      <button type="button" class="btn btn--primary" data-action="submit">${st.mode === 'item-add' ? 'リストに追加' : primaryLabel === '記録' ? '履歴に記録' : '保存'}</button>
    </div>`;

  const sheet = openSheet({
    title,
    body,
    footer,
    right: `<button type="button" class="btn-text btn-text--strong" data-action="submit">${primaryLabel}</button>`,
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

    /* ---------- 候補チップ ---------- */

    function renderNameSuggest() {
      const box = $('[data-suggest="name"]');
      const q = st.name.trim();
      const list = store.suggestProducts(q, q ? 20 : 14);
      const selKey = nameKey(q);
      if (!list.length || (list.length === 1 && list[0].key === selKey)) {
        box.innerHTML = '';
        return;
      }
      box.innerHTML = `
        <div class="suggest__caption">${q ? '候補' : 'よく買うもの'}</div>
        <div class="suggest__chips">
          ${list.map((p) => `<button type="button" class="s-chip ${p.key === selKey ? 'is-selected' : ''}" data-pick-name="${esc(p.id)}"><span>${esc(p.name)}</span></button>`).join('')}
        </div>`;
    }

    function renderStoreSuggest() {
      const box = $('[data-suggest="store"]');
      const q = st.storeName.trim();
      const exact = store.findStoreByName(q);
      const product = store.findProductByName(st.name);
      const filterQ = q && !exact ? q : '';
      const list = store.suggestStores(filterQ, product ? product.id : null);
      if (!list.length) {
        box.innerHTML = '';
        return;
      }
      const priced = list.some((x) => x.last);
      box.innerHTML = `
        <div class="suggest__caption">${priced ? '前回の価格つき' : filterQ ? '候補' : '履歴から選ぶ'}</div>
        <div class="suggest__chips">
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
      if (st.storeName.trim() && !s) return { product, store: null, last: null, newStore: true };
      return { product, store: s, last: store.lastPrice(product.id, s ? s.id : null, excludeId) };
    }

    // allowAuto=false のときは価格欄を書き換えず、ヒントだけ更新する（価格の手入力中）
    function updatePrice(allowAuto = true) {
      const { product, store: s, last, newStore } = currentLast();
      if (allowAuto && st.priceSource !== 'manual') {
        if (last) {
          st.price = String(last.price);
          st.priceSource = 'auto';
        } else {
          st.price = '';
          st.priceSource = 'empty';
        }
        inputs.price.value = st.price;
      }
      $('[data-role="price-field"]').classList.toggle('is-auto', st.priceSource === 'auto');

      const hint = $('[data-role="price-hint"]');
      const where = s ? s.name : '店舗未設定';
      let html = '';
      if (last && st.priceSource === 'auto') {
        html = `<span class="badge">${icon('sparkle')}自動入力</span><span>${esc(where)}で${shortDate(last.date)}に買ったときの価格</span>`;
      } else if (last && st.priceSource === 'manual' && parsePrice(st.price) !== last.price) {
        html = `<span>前回 ${yen(last.price)}（${shortDate(last.date)}）</span><button type="button" class="price-hint__apply" data-action="apply-last">${icon('undo')}前回の価格にする</button>`;
      } else if (last) {
        html = `<span>${esc(where)}の前回価格（${shortDate(last.date)}）と同じです</span>`;
      } else if (product && (s || newStore)) {
        html = `<span>${newStore ? '新しいお店です。' : 'このお店での購入履歴はまだありません。'}価格を入力してください</span>`;
      } else if (product && !st.storeName.trim()) {
        html = '<span>購入場所を選ぶと、そのお店の前回価格が入ります</span>';
      } else if (st.name.trim()) {
        html = '<span>新しい商品です。価格がわかれば入力してください</span>';
      } else {
        html = '<span>商品と購入場所を選ぶと、前回の価格が自動で入ります</span>';
      }

      // より安いお店があれば知らせる
      if (product) {
        const cheapest = store.storePrices(product.id)[0];
        const cur = parsePrice(st.price);
        if (cheapest && cheapest.storeId && (!s || cheapest.storeId !== s.id) && cur !== null && cheapest.price < cur) {
          html += `<span class="price-hint__cheaper">${icon('trendDown')}${esc(store.storeName(cheapest.storeId))}なら ${yen(cheapest.price)}</span>`;
        }
      }
      hint.innerHTML = html;
      updateTotal();
    }

    function updateTotal() {
      const price = parsePrice(st.price);
      const total = $('[data-role="total"]');
      if (price === null) {
        total.innerHTML = `<span>${st.qty > 1 ? `${st.qty}個` : ''}</span><span class="price price--empty">価格未入力</span>`;
      } else {
        total.innerHTML = `<span>${st.qty > 1 ? `${yen(price)} × ${st.qty}個` : '合計'}</span><span class="price">${yen(price * st.qty)}</span>`;
      }
      $('[data-role="qty"]').textContent = st.qty;
      $('[data-step="-1"]').disabled = st.qty <= 1;
    }

    /* ---------- 重複のお知らせ ---------- */

    function updateDup() {
      const box = $('[data-role="dup"]');
      if (st.mode !== 'item-add') return;
      const product = store.findProductByName(st.name);
      const s = st.storeName.trim() ? store.findStoreByName(st.storeName) : null;
      const newStore = st.storeName.trim() && !s;
      const open = product && !newStore ? store.findOpenItem(product.id, s ? s.id : null) : null;
      box.innerHTML = open
        ? `<div class="footer-dup">${icon('info')}<span>リストに追加済み（${open.qty}個）・個数が増えます</span></div>`
        : '';
    }

    function updateClear() {
      el.querySelectorAll('[data-field]').forEach((f) => {
        const input = f.querySelector('input');
        f.classList.toggle('has-value', Boolean(input && input.value));
      });
    }

    function refreshAll() {
      renderNameSuggest();
      renderStoreSuggest();
      updatePrice();
      updateDup();
      updateClear();
    }

    /* ---------- イベント ---------- */

    inputs.name.addEventListener('input', () => {
      st.name = inputs.name.value;
      renderNameSuggest();
      renderStoreSuggest();
      updatePrice();
      updateDup();
      updateClear();
    });

    inputs.store.addEventListener('input', () => {
      st.storeName = inputs.store.value;
      renderStoreSuggest();
      updatePrice();
      updateDup();
      updateClear();
    });

    inputs.price.addEventListener('input', () => {
      const digits = inputs.price.value.normalize('NFKC').replace(/[^\d]/g, '').slice(0, 8);
      if (digits !== inputs.price.value) inputs.price.value = digits;
      st.price = digits;
      st.priceSource = digits ? 'manual' : 'empty';
      updatePrice(false);
    });

    inputs.price.addEventListener('focus', () => {
      // 自動入力された価格はタップですぐ書き換えられるよう全選択
      if (inputs.price.value) setTimeout(() => inputs.price.setSelectionRange(0, inputs.price.value.length), 0);
    });

    if (inputs.memo) {
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

    // Enterキーで次の欄へ
    const order = ['name', 'store', 'price', 'memo'].filter((k) => inputs[k]);
    order.forEach((k, i) => {
      inputs[k].addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        const next = order[i + 1];
        if (next) inputs[next].focus();
        else submit(false);
      });
    });

    el.addEventListener('click', (e) => {
      const nameChip = e.target.closest('[data-pick-name]');
      if (nameChip) {
        const p = store.getProduct(nameChip.dataset.pickName);
        if (!p) return;
        st.name = p.name;
        inputs.name.value = p.name;
        inputs.name.blur();
        refreshAll();
        return;
      }
      const storeChip = e.target.closest('[data-pick-store]');
      if (storeChip) {
        const s = store.getStore(storeChip.dataset.pickStore);
        if (!s) return;
        const same = store.findStoreByName(st.storeName)?.id === s.id;
        st.storeName = same ? '' : s.name; // 選択中のチップをもう一度タップで解除
        inputs.store.value = st.storeName;
        inputs.store.blur();
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
      const step = e.target.closest('[data-step]');
      if (step) {
        st.qty = Math.max(1, Math.min(999, st.qty + Number(step.dataset.step)));
        updateTotal();
        return;
      }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'apply-last') {
        st.priceSource = 'auto';
        updatePrice();
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
      const name = st.name.trim();
      if (!name) {
        const field = $('[data-field="name"]').closest('.form-group');
        field.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
          { duration: 320, easing: 'ease-out' },
        );
        inputs.name.focus();
        toast('商品名を入力してください', { icon: 'info' });
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
          // 店舗はそのまま、ほかの欄をリセットして次の入力へ
          st.name = '';
          st.price = '';
          st.priceSource = 'empty';
          st.qty = 1;
          st.memo = '';
          inputs.name.value = '';
          inputs.price.value = '';
          if (inputs.memo) inputs.memo.value = '';
          refreshAll();
          inputs.name.focus({ preventScroll: true });
          el.querySelector('.sheet__body').scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      } else if (st.mode === 'item-edit') {
        if (!store.updateItem(st.id, payload)) {
          toast('この商品は見つかりませんでした');
        }
      } else if (st.mode === 'purchase-add') {
        store.addPurchase(payload);
        toast(`「${name}」を購入履歴に記録しました`, { icon: 'check' });
      } else if (st.mode === 'purchase-edit') {
        if (!store.updatePurchase(st.id, payload)) {
          toast('この履歴は見つかりませんでした');
        }
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
    updateTotal();
    if (st.autofocus) inputs.name.focus({ preventScroll: true });
  }

  return sheet;
}
