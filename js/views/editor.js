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

// 入力は「① 商品 → ② お店 → ③ 価格」の順に1つずつ案内する。
// 選び終わった項目は1行にたたまれ、タップするともう一度ひらく。
function openEntryEditor(init) {
  const st = { ...init, showAll: false };
  const isItem = st.mode.startsWith('item');
  const isAdd = st.mode.endsWith('add');
  const excludeId = st.mode === 'purchase-edit' ? st.id : null;
  // 最初にひらく項目（追加なら商品、編集ならすべてたたむ）
  st.open = isAdd ? (st.name ? (st.storeName ? null : 'store') : 'name') : null;
  st.memoOpen = Boolean(st.memo);

  const title = {
    'item-add': '商品を追加',
    'item-edit': '商品を編集',
    'purchase-add': '購入を記録',
    'purchase-edit': '購入履歴を編集',
  }[st.mode];
  const past = st.mode.startsWith('purchase');
  const q = {
    name: past ? '何を買いましたか？' : '何を買いますか？',
    store: past ? 'どこで買いましたか？' : 'どこで買いますか？',
    price: past ? 'いくらでしたか？' : 'いくらですか？',
  };
  const headerLabel = { 'item-add': '追加', 'item-edit': '保存', 'purchase-add': '記録', 'purchase-edit': '保存' }[st.mode];

  const step = (key, num, label, placeholder, iconName, maxlength) => `
    <section class="step" data-step="${key}">
      <button type="button" class="step__summary" data-open="${key}">
        <span class="step__num">${num}</span>
        <span class="step__label">${label}</span>
        <span class="step__value" data-role="${key}-value"></span>
        <span class="step__change">変更</span>
      </button>
      <div class="step__body">
        <div class="step__head">
          <span class="step__num">${num}</span>
          <span class="step__title">${q[key]}</span>
          ${key === 'store' ? '<span class="step__opt">なしでもOK</span>' : ''}
        </div>
        <div class="big-field" data-field="${key}">
          ${icon(iconName)}
          <input class="big-field__input" data-input="${key}" type="text" placeholder="${placeholder}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" maxlength="${maxlength}" aria-label="${label}">
          <button type="button" class="field__clear" data-clear="${key}" aria-label="消す">${icon('x')}</button>
        </div>
        <div class="suggest" data-suggest="${key}"></div>
      </div>
    </section>`;

  const body = `
    ${st.mode === 'item-edit' && st.checked ? `<div class="notice notice--muted">${icon('info')}<span>購入済みの商品です。変更は購入履歴にも反映されます。</span></div>` : ''}
    ${st.mode === 'purchase-edit' && st.linked ? `<div class="notice notice--muted">${icon('info')}<span>リストの購入済み商品と連動しています。変更はリストにも反映されます。</span></div>` : ''}

    ${step('name', 1, '商品', '商品名を入力', 'box', 80)}
    ${step('store', 2, 'お店', 'お店の名前を入力', 'store', 60)}

    <section class="step is-open step--price">
      <div class="step__body">
        <div class="step__head">
          <span class="step__num">3</span>
          <span class="step__title">${q.price}</span>
          <span class="step__opt">1個あたり</span>
        </div>
        <div class="price-row">
          <label class="price-field" data-role="price-field">
            <span class="price-field__sym">¥</span>
            <input class="price-field__input" data-input="price" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="0" autocomplete="off" enterkeyhint="done" aria-label="価格">
          </label>
          <div class="qty">
            <span class="qty__label">個数</span>
            <div class="stepper">
              <button type="button" class="stepper__btn" data-step="-1" aria-label="1つ減らす">${icon('minus')}</button>
              <span class="stepper__value" data-role="qty">1</span>
              <button type="button" class="stepper__btn" data-step="1" aria-label="1つ増やす">${icon('plus')}</button>
            </div>
          </div>
        </div>
        <div class="price-hint" data-role="price-hint"></div>
      </div>
    </section>

    ${isItem ? `
    <button type="button" class="add-memo" data-action="open-memo">${icon('plus')}メモを追加<span>（任意）</span></button>
    <section class="step is-open step--memo" data-role="memo-step">
      <div class="big-field big-field--memo" data-field="memo">
        ${icon('note')}
        <input class="big-field__input" data-input="memo" type="text" placeholder="メモ（例：6枚切り）" autocomplete="off" enterkeyhint="done" maxlength="200" aria-label="メモ">
        <button type="button" class="field__clear" data-clear="memo" aria-label="メモを消す">${icon('x')}</button>
      </div>
    </section>` : `
    <section class="step is-open">
      <label class="date-row">
        ${icon('calendar')}
        <span class="date-row__label">購入日</span>
        <input class="date-row__input" data-input="date" type="date" aria-label="購入日">
      </label>
    </section>`}

    ${st.mode === 'purchase-edit' ? `<button type="button" class="btn btn--tinted btn--block" data-action="product-history">${icon('clock')}この商品の履歴と価格を見る</button>` : ''}
    ${!isAdd ? `<div class="sheet-danger"><button type="button" class="btn btn--danger btn--block" data-action="delete">${icon('trash')}${isItem ? 'リストから削除' : 'この履歴を削除'}</button></div>` : ''}
  `;

  const footer = `
    <div data-role="dup"></div>
    <div class="sheet__footer-row">
      ${st.mode === 'item-add' ? '<button type="button" class="btn btn--secondary" data-action="submit-continue">続けて追加</button>' : ''}
      <button type="button" class="btn btn--primary" data-action="submit" data-role="submit-label"></button>
    </div>`;

  const sheet = openSheet({
    title,
    body,
    footer,
    className: 'sheet--entry',
    right: `<button type="button" class="btn-text btn-text--strong" data-action="submit">${headerLabel}</button>`,
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

    /* ---------- 項目のひらく・たたむ ---------- */

    function renderSteps() {
      for (const key of ['name', 'store']) {
        const sec = $(`[data-step="${key}"]`);
        const value = (key === 'name' ? st.name : st.storeName).trim();
        sec.classList.toggle('is-open', st.open === key);
        sec.classList.toggle('is-done', Boolean(value));
        const v = $(`[data-role="${key}-value"]`);
        v.textContent = value || (key === 'name' ? 'まだ選んでいません' : '指定なし');
        v.classList.toggle('is-empty', !value);
        sec.querySelector('.step__change').textContent = value ? '変更' : '選ぶ';
      }
      const memoStep = $('[data-role="memo-step"]');
      if (memoStep) {
        memoStep.hidden = !st.memoOpen;
        $('[data-action="open-memo"]').hidden = st.memoOpen;
      }
    }

    function openStep(key, { focus = false } = {}) {
      st.open = key;
      renderSteps();
      if (key) {
        renderNameSuggest();
        renderStoreSuggest();
        const sec = $(`[data-step="${key}"]`);
        if (focus) inputs[key].focus({ preventScroll: true });
        requestAnimationFrame(() => sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
    }

    /* ---------- 候補ボタン ---------- */

    function renderNameSuggest() {
      const box = $('[data-suggest="name"]');
      const qv = st.name.trim();
      const limit = qv ? 24 : st.showAll ? 200 : 12;
      const list = store.suggestProducts(qv, limit + 1);
      const more = !qv && list.length > limit;
      const shown = list.slice(0, limit);
      const selKey = nameKey(qv);
      if (!shown.length || (shown.length === 1 && shown[0].key === selKey)) {
        box.innerHTML = qv ? `<div class="suggest__caption">「${esc(qv)}」は新しい商品として追加されます</div>` : '';
        return;
      }
      const onList = new Set(store.state().items.filter((i) => !i.checked).map((i) => i.productId));
      box.innerHTML = `
        <div class="suggest__caption">${qv ? '候補（タップで選べます）' : 'よく買うもの（タップで選べます）'}</div>
        <div class="suggest__chips suggest__chips--wrap">
          ${shown.map((p) => `<button type="button" class="s-chip ${p.key === selKey ? 'is-selected' : ''}" data-pick-name="${esc(p.id)}"><span>${esc(p.name)}</span>${isItem && onList.has(p.id) ? '<span class="s-chip__tag">リスト済</span>' : ''}</button>`).join('')}
          ${more ? `<button type="button" class="s-chip s-chip--more" data-action="show-all">すべて表示</button>` : ''}
        </div>`;
    }

    function renderStoreSuggest() {
      const box = $('[data-suggest="store"]');
      const qv = st.storeName.trim();
      const exact = store.findStoreByName(qv);
      const product = store.findProductByName(st.name);
      const filterQ = qv && !exact ? qv : '';
      const list = store.suggestStores(filterQ, product ? product.id : null, 40);
      if (!list.length) {
        box.innerHTML = qv && !exact ? `<div class="suggest__caption">「${esc(qv)}」は新しいお店として登録されます</div>` : '';
        return;
      }
      const priced = list.some((x) => x.last);
      box.innerHTML = `
        <div class="suggest__caption">${priced ? '前回の価格つき（タップで選べます）' : 'タップで選べます'}</div>
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
        html = `<span class="badge">${icon('sparkle')}自動入力</span><span>${esc(where)}の前回価格（${shortDate(last.date)}）</span>`;
      } else if (last && st.priceSource === 'manual' && parsePrice(st.price) !== last.price) {
        html = `<span>前回 ${yen(last.price)}（${shortDate(last.date)}）</span><button type="button" class="price-hint__apply" data-action="apply-last">${icon('undo')}前回の価格にする</button>`;
      } else if (last) {
        html = `<span>前回（${shortDate(last.date)}）と同じ価格です</span>`;
      } else if (product && (s || newStore)) {
        html = `<span>${newStore ? '新しいお店です。' : 'このお店ではまだ買っていません。'}わかれば入力してください</span>`;
      } else if (product && !st.storeName.trim()) {
        html = '<span>お店を選ぶと、前回の価格が自動で入ります</span>';
      } else if (st.name.trim()) {
        html = '<span>わかれば入力してください（空欄でもOK）</span>';
      } else {
        html = '<span>商品とお店を選ぶと、前回の価格が自動で入ります</span>';
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
      const base = { 'item-add': 'リストに追加', 'item-edit': '保存', 'purchase-add': '履歴に記録', 'purchase-edit': '保存' }[st.mode];
      $('[data-role="submit-label"]').innerHTML = price === null
        ? base
        : `${base}<span class="btn__sub">${yen(price * st.qty)}</span>`;
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
      renderSteps();
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
      updatePrice();
      updateDup();
      updateClear();
      renderSteps();
    });

    inputs.store.addEventListener('input', () => {
      st.storeName = inputs.store.value;
      renderStoreSuggest();
      updatePrice();
      updateDup();
      updateClear();
      renderSteps();
    });

    inputs.price.addEventListener('input', () => {
      const digits = inputs.price.value.normalize('NFKC').replace(/[^\d]/g, '').slice(0, 8);
      if (digits !== inputs.price.value) inputs.price.value = digits;
      st.price = digits;
      st.priceSource = digits ? 'manual' : 'empty';
      updatePrice(false);
    });

    inputs.price.addEventListener('focus', () => {
      // 価格欄を触ったら商品・お店はたたんで見やすく
      if (st.open && (st.open !== 'name' || st.name.trim())) { st.open = null; renderSteps(); }
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

    // Enterキーで次の項目へ
    const onEnter = (input, fn) => input && input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      fn();
    });
    onEnter(inputs.name, () => {
      if (!st.name.trim()) return;
      if (st.storeName.trim()) { openStep(null); inputs.price.focus({ preventScroll: true }); } else openStep('store', { focus: true });
    });
    onEnter(inputs.store, () => { openStep(null); inputs.price.focus({ preventScroll: true }); });
    onEnter(inputs.price, () => inputs.price.blur());
    onEnter(inputs.memo, () => inputs.memo.blur());

    el.addEventListener('click', (e) => {
      const nameChip = e.target.closest('[data-pick-name]');
      if (nameChip) {
        const p = store.getProduct(nameChip.dataset.pickName);
        if (!p) return;
        st.name = p.name;
        inputs.name.value = p.name;
        inputs.name.blur();
        // 次はお店（まだ決まっていなければ）
        st.open = st.storeName.trim() ? null : 'store';
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
        st.open = null;
        refreshAll();
        return;
      }
      const opener = e.target.closest('[data-open]');
      if (opener) {
        openStep(opener.dataset.open);
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
        renderNameSuggest();
      } else if (action === 'open-memo') {
        st.memoOpen = true;
        renderSteps();
        inputs.memo.focus({ preventScroll: true });
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
        openStep('name');
        const sec = $('[data-step="name"]');
        sec.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
          { duration: 320, easing: 'ease-out' },
        );
        toast('商品を選ぶか、入力してください', { icon: 'info' });
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
          Object.assign(st, { name: '', price: '', priceSource: 'empty', qty: 1, memo: '', memoOpen: false, open: 'name', showAll: false });
          inputs.name.value = '';
          inputs.price.value = '';
          if (inputs.memo) inputs.memo.value = '';
          refreshAll();
          el.querySelector('.sheet__body').scrollTo({ top: 0, behavior: 'smooth' });
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
    if (st.open === 'name' && !store.state().products.length) inputs.name.focus({ preventScroll: true });
  }

  return sheet;
}
