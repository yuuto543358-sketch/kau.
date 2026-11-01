// 管理画面：商品・店舗の管理、表記ゆれの整理、表示設定、バックアップ

import * as store from '../store.js';
import { icon } from '../icons.js';
import { esc, yenHTML, matches, shortDate, longDate } from '../utils.js';
import { openSheet, pushPage, confirmDialog, toast } from '../ui.js';
import { loadSample } from '../actions.js';

export const APP_VERSION = '1.1.0';

let screen;
let content;
let navbar;
let scroller;

export function mountManage(el) {
  screen = el;
  screen.innerHTML = `
    <header class="navbar navbar--large">
      <div></div>
      <h1 class="navbar__title">管理</h1>
      <div></div>
    </header>
    <div class="scroll">
      <div class="content">
        <div class="large-title" style="margin-bottom:18px">管理</div>
        <div data-role="content"></div>
        <input type="file" data-role="import-file" hidden>
      </div>
    </div>`;
  content = screen.querySelector('[data-role="content"]');
  navbar = screen.querySelector('.navbar');
  scroller = screen.querySelector('.scroll');
  scroller.addEventListener('scroll', () => navbar.classList.toggle('is-scrolled', scroller.scrollTop > 36), { passive: true });

  const fileInput = screen.querySelector('[data-role="import-file"]');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) importBackup(file);
  });

  screen.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    switch (action) {
      case 'products': openProductsPage(); break;
      case 'stores': openStoresPage(); break;
      case 'duplicates': openDuplicatesPage(); break;
      case 'export': exportBackup(); break;
      case 'import': fileInput.click(); break;
      case 'sample': loadSample(); break;
      case 'reset': resetAll(); break;
      default:
    }
  });
  screen.addEventListener('change', (e) => {
    if (e.target.matches('[data-setting]')) store.setSetting(e.target.dataset.setting, e.target.checked);
  });
  render();
}

export function render() {
  if (!content) return;
  const d = store.state();
  const dups = store.duplicateGroups('product').length + store.duplicateGroups('store').length;
  const last = d.meta.lastBackupAt;
  content.innerHTML = `
    <div class="list-group">
      <div class="list-group__title">商品と店舗</div>
      <div class="list-group__body list-group__body--icons">
        <button type="button" class="row" data-action="products">
          <span class="row__icon">${icon('box')}</span>
          <span class="row__main"><span class="row__label" style="display:block">商品</span></span>
          <span class="row__value num">${d.products.length}</span>
          ${icon('chevronRight', 'row__chev')}
        </button>
        <button type="button" class="row" data-action="stores">
          <span class="row__icon">${icon('store')}</span>
          <span class="row__main"><span class="row__label" style="display:block">店舗</span></span>
          <span class="row__value num">${d.stores.length}</span>
          ${icon('chevronRight', 'row__chev')}
        </button>
        <button type="button" class="row" data-action="duplicates">
          <span class="row__icon">${icon('merge')}</span>
          <span class="row__main"><span class="row__label" style="display:block">表記ゆれの整理</span></span>
          ${dups ? `<span class="badge">${dups}件</span>` : '<span class="row__value">なし</span>'}
          ${icon('chevronRight', 'row__chev')}
        </button>
      </div>
      <div class="list-group__footer">名前の変更・削除・統合ができます。同じ名前の商品や店舗は自動でひとつにまとまります。</div>
    </div>

    <div class="list-group">
      <div class="list-group__title">表示</div>
      <div class="list-group__body list-group__body--icons">
        <label class="row">
          <span class="row__icon">${icon('eye')}</span>
          <span class="row__main"><span class="row__label" style="display:block">購入済みの商品を表示</span></span>
          <span class="switch">
            <input type="checkbox" data-setting="showChecked" ${d.settings.showChecked ? 'checked' : ''} aria-label="購入済みの商品を表示">
            <span class="switch__track"></span><span class="switch__thumb"></span>
          </span>
        </label>
      </div>
    </div>

    <div class="list-group">
      <div class="list-group__title">バックアップ</div>
      <div class="list-group__body list-group__body--icons">
        <button type="button" class="row" data-action="export">
          <span class="row__icon row__icon--accent">${icon('download')}</span>
          <span class="row__main">
            <span class="row__label" style="display:block">バックアップを書き出す</span>
            <span class="row__sub" style="display:block">${last ? `前回：${longDate(last)}` : 'まだ書き出していません'}</span>
          </span>
          ${icon('chevronRight', 'row__chev')}
        </button>
        <button type="button" class="row" data-action="import">
          <span class="row__icon">${icon('upload')}</span>
          <span class="row__main">
            <span class="row__label" style="display:block">バックアップから復元</span>
            <span class="row__sub" style="display:block">書き出したファイル（.json）を読み込みます</span>
          </span>
          ${icon('chevronRight', 'row__chev')}
        </button>
      </div>
      <div class="list-group__footer">データはこの端末の中だけに保存されています。機種変更や万一に備えて、ときどき書き出しておくと安心です。</div>
    </div>

    <div class="list-group">
      <div class="list-group__title">その他</div>
      <div class="list-group__body list-group__body--icons">
        <button type="button" class="row" data-action="sample">
          <span class="row__icon">${icon('sparkle')}</span>
          <span class="row__main"><span class="row__label" style="display:block">サンプルデータを読み込む</span></span>
          ${icon('chevronRight', 'row__chev')}
        </button>
        <button type="button" class="row row--danger" data-action="reset">
          <span class="row__icon row__icon--danger">${icon('trash')}</span>
          <span class="row__main"><span class="row__label" style="display:block">すべてのデータを削除</span></span>
        </button>
      </div>
    </div>

    <div class="app-footer">
      <div class="brand">kau<span class="brand__dot">.</span></div>
      <div>バージョン ${APP_VERSION}</div>
      <div>リスト ${d.items.length}件・購入履歴 ${d.purchases.length}件</div>
    </div>`;
}

/* ================================================================== 商品の管理 */

function lastUsed(kind, id) {
  const d = store.state();
  const field = kind === 'product' ? 'productId' : 'storeId';
  let t = 0;
  for (const r of d.purchases) if (r[field] === id && r.date > t) t = r.date;
  for (const i of d.items) if (i[field] === id && i.createdAt > t) t = i.createdAt;
  return t;
}

function openProductsPage() {
  const state = { query: '' };
  pushPage({
    title: '商品',
    backLabel: '管理',
    right: `<button type="button" class="icon-btn" data-action="new-product" aria-label="商品を追加">${icon('plus')}</button>`,
    render: (body) => {
      if (!body.dataset.ready) {
        body.dataset.ready = '1';
        body.innerHTML = `
          <label class="searchbar" style="margin-top:0">
            ${icon('search')}
            <input class="searchbar__input" type="search" placeholder="商品を検索" autocomplete="off" spellcheck="false" aria-label="商品を検索">
          </label>
          <div data-role="list" style="margin-top:16px"></div>`;
        const input = body.querySelector('input');
        input.addEventListener('input', () => {
          state.query = input.value;
          renderList();
        });
      }
      const renderList = () => {
        const list = body.querySelector('[data-role="list"]');
        const products = store.state().products
          .filter((p) => matches(p.name, state.query))
          .map((p) => ({ p, t: lastUsed('product', p.id) || p.createdAt }))
          .sort((a, b) => b.t - a.t);
        if (!store.state().products.length) {
          list.innerHTML = `<div class="empty empty--compact"><div class="empty__art">${icon('box')}</div><div class="empty__title">商品はまだありません</div><div class="empty__text">リストに追加した商品が、ここに自動で登録されます。</div></div>`;
          return;
        }
        if (!products.length) {
          list.innerHTML = '<div class="empty empty--compact"><div class="empty__text">見つかりませんでした</div></div>';
          return;
        }
        list.innerHTML = `
          <div class="list-group">
            <div class="list-group__title">${products.length}件・最近使った順</div>
            <div class="list-group__body">
              ${products.map(({ p }) => {
                const refs = store.productRefs(p.id);
                const st = store.productStats(p.id);
                return `
                  <button type="button" class="row" data-edit-product="${esc(p.id)}">
                    <span class="row__main">
                      <span class="row__label" style="display:block">${esc(p.name)}</span>
                      <span class="row__sub" style="display:block">履歴 ${refs.purchases}件・リスト ${refs.items}件</span>
                    </span>
                    <span class="row__value">${st.lastPriced ? yenHTML(st.lastPriced.price) : ''}</span>
                    ${icon('chevronRight', 'row__chev')}
                  </button>`;
              }).join('')}
            </div>
          </div>`;
      };
      renderList();
    },
    onMount: (el) => {
      el.addEventListener('click', (e) => {
        const row = e.target.closest('[data-edit-product]');
        if (row) openProductEdit(row.dataset.editProduct);
        if (e.target.closest('[data-action="new-product"]')) {
          openNameSheet({
            title: '商品を登録',
            label: '商品名',
            placeholder: '例：牛乳',
            iconName: 'box',
            onSave: (name) => {
              const res = store.createProduct(name);
              if (res.conflict) {
                toast(`「${res.conflict.name}」はすでに登録されています`, { icon: 'info' });
                return false;
              }
              toast(`「${res.product.name}」を登録しました`, { icon: 'check' });
              return true;
            },
          });
        }
      });
    },
  });
}

/** 商品の編集シート */
export function openProductEdit(productId) {
  const product = store.getProduct(productId);
  if (!product) return;
  const refs = store.productRefs(productId);
  const stats = store.productStats(productId);
  const sheet = openSheet({
    title: '商品を編集',
    right: '<button type="button" class="btn-text btn-text--strong" data-action="save">保存</button>',
    body: `
      <div class="form-label">商品名</div>
      <div class="form-group">
        <div class="field has-value" data-field="name">
          ${icon('box')}
          <input class="field__input" type="text" maxlength="80" autocomplete="off" spellcheck="false" enterkeyhint="done" aria-label="商品名">
          <button type="button" class="field__clear" data-action="clear" aria-label="消す">${icon('x')}</button>
        </div>
      </div>
      <div class="list-group">
        <div class="list-group__body">
          <div class="row"><span class="row__main"><span class="row__label" style="display:block">購入履歴</span></span><span class="row__value num">${refs.purchases}件</span></div>
          <div class="row"><span class="row__main"><span class="row__label" style="display:block">買い物リスト</span></span><span class="row__value num">${refs.items}件</span></div>
          <div class="row"><span class="row__main"><span class="row__label" style="display:block">前回の価格</span></span><span class="row__value">${stats.lastPriced ? `${yenHTML(stats.lastPriced.price)}（${shortDate(stats.lastPriced.date)}）` : '—'}</span></div>
        </div>
      </div>
      <div class="list-group">
        <div class="list-group__body list-group__body--icons">
          <button type="button" class="row row--accent" data-action="history">
            <span class="row__icon">${icon('clock')}</span>
            <span class="row__main"><span class="row__label" style="display:block">購入履歴と価格を見る</span></span>
            ${icon('chevronRight', 'row__chev')}
          </button>
          <button type="button" class="row row--accent" data-action="merge">
            <span class="row__icon">${icon('merge')}</span>
            <span class="row__main"><span class="row__label" style="display:block">ほかの商品に統合する</span></span>
            ${icon('chevronRight', 'row__chev')}
          </button>
        </div>
        <div class="list-group__footer">同じ商品が別の名前で登録されているときは「統合」すると、リストと履歴がひとつにまとまります。</div>
      </div>
      <button type="button" class="btn btn--danger btn--block" data-action="delete">${icon('trash')}この商品を削除</button>`,
    onMount: (el, close) => {
      const input = el.querySelector('input');
      input.value = product.name;
      const field = el.querySelector('[data-field]');
      input.addEventListener('input', () => field.classList.toggle('has-value', Boolean(input.value)));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); save(); }
      });
      const save = async () => {
        const res = store.renameProduct(productId, input.value);
        if (res.error === 'empty') {
          toast('商品名を入力してください', { icon: 'info' });
          input.focus();
          return;
        }
        if (res.conflict) {
          const ok = await confirmDialog({
            title: `「${res.conflict.name}」はすでにあります`,
            message: `「${product.name}」を「${res.conflict.name}」に統合しますか？\nリストと購入履歴はすべて「${res.conflict.name}」に移ります。`,
            ok: '統合する',
          });
          if (!ok) return;
          mergeWithUndo('product', productId, res.conflict.id);
          close();
          return;
        }
        if (res.product) toast('商品名を変更しました', { icon: 'check' });
        close();
      };
      el.addEventListener('click', async (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'save') save();
        else if (action === 'clear') { input.value = ''; field.classList.remove('has-value'); input.focus(); }
        else if (action === 'history') import('./product-detail.js').then((m) => m.openProductDetail(productId));
        else if (action === 'merge') {
          pickMergeTarget('product', productId, () => close());
        } else if (action === 'delete') {
          const r = store.productRefs(productId);
          const ok = await confirmDialog({
            title: `「${product.name}」を削除しますか？`,
            message: r.items || r.purchases
              ? `この商品のリスト${r.items}件と購入履歴${r.purchases}件もすべて削除されます。\n履歴を残したい場合は「統合」を使ってください。`
              : '商品名の候補から削除されます。',
            ok: '削除',
            danger: true,
          });
          if (!ok) return;
          const snapshot = store.checkpoint();
          store.deleteProduct(productId);
          close();
          toast(`「${product.name}」を削除しました`, { action: '元に戻す', onAction: () => store.restore(snapshot) });
        }
      });
    },
  });
  return sheet;
}

/* ================================================================== 店舗の管理 */

function openStoresPage() {
  pushPage({
    title: '店舗',
    backLabel: '管理',
    right: `<button type="button" class="icon-btn" data-action="new-store" aria-label="店舗を追加">${icon('plus')}</button>`,
    render: (body) => {
      const stores = store.storesSorted();
      if (!stores.length) {
        body.innerHTML = `<div class="empty"><div class="empty__art">${icon('store')}</div><div class="empty__title">店舗はまだありません</div><div class="empty__text">商品を追加するときに入力したお店が、<br>ここに自動で登録されます。</div></div>`;
        return;
      }
      body.innerHTML = `
        <div class="list-group">
          <div class="list-group__title">並び順はリストの表示順になります</div>
          <div class="list-group__body list-group__body--icons">
            ${stores.map((s, i) => {
              const refs = store.storeRefs(s.id);
              return `
                <div class="row row--tap" data-edit-store="${esc(s.id)}">
                  <span class="row__icon">${icon('store')}</span>
                  <span class="row__main">
                    <span class="row__label" style="display:block">${esc(s.name)}</span>
                    <span class="row__sub" style="display:block">履歴 ${refs.purchases}件・リスト ${refs.items}件</span>
                  </span>
                  <span class="row__actions">
                    <button type="button" class="mini-btn" data-move="${esc(s.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="上へ">${icon('chevronUp')}</button>
                    <button type="button" class="mini-btn" data-move="${esc(s.id)}" data-dir="1" ${i === stores.length - 1 ? 'disabled' : ''} aria-label="下へ">${icon('chevronDown')}</button>
                  </span>
                </div>`;
            }).join('')}
          </div>
          <div class="list-group__footer">お店をタップすると、名前の変更・統合・削除ができます。</div>
        </div>`;
    },
    onMount: (el) => {
      el.addEventListener('click', (e) => {
        const mv = e.target.closest('[data-move]');
        if (mv) {
          store.moveStore(mv.dataset.move, Number(mv.dataset.dir));
          return;
        }
        const row = e.target.closest('[data-edit-store]');
        if (row) {
          openStoreEdit(row.dataset.editStore);
          return;
        }
        if (e.target.closest('[data-action="new-store"]')) {
          openNameSheet({
            title: '店舗を登録',
            label: '店舗名',
            placeholder: '例：スーパーA',
            iconName: 'store',
            onSave: (name) => {
              const res = store.createStore(name);
              if (res.conflict) {
                toast(`「${res.conflict.name}」はすでに登録されています`, { icon: 'info' });
                return false;
              }
              toast(`「${res.store.name}」を登録しました`, { icon: 'check' });
              return true;
            },
          });
        }
      });
    },
  });
}

function openStoreEdit(storeId) {
  const s = store.getStore(storeId);
  if (!s) return;
  const refs = store.storeRefs(storeId);
  openSheet({
    title: '店舗を編集',
    right: '<button type="button" class="btn-text btn-text--strong" data-action="save">保存</button>',
    body: `
      <div class="form-label">店舗名</div>
      <div class="form-group">
        <div class="field has-value" data-field="name">
          ${icon('store')}
          <input class="field__input" type="text" maxlength="60" autocomplete="off" spellcheck="false" enterkeyhint="done" aria-label="店舗名">
          <button type="button" class="field__clear" data-action="clear" aria-label="消す">${icon('x')}</button>
        </div>
      </div>
      <div class="list-group">
        <div class="list-group__body">
          <div class="row"><span class="row__main"><span class="row__label" style="display:block">購入履歴</span></span><span class="row__value num">${refs.purchases}件</span></div>
          <div class="row"><span class="row__main"><span class="row__label" style="display:block">買い物リスト</span></span><span class="row__value num">${refs.items}件</span></div>
        </div>
      </div>
      <div class="list-group">
        <div class="list-group__body list-group__body--icons">
          <button type="button" class="row row--accent" data-action="merge">
            <span class="row__icon">${icon('merge')}</span>
            <span class="row__main"><span class="row__label" style="display:block">ほかの店舗に統合する</span></span>
            ${icon('chevronRight', 'row__chev')}
          </button>
        </div>
        <div class="list-group__footer">同じお店が別の名前で登録されているときは「統合」すると、リストと履歴がひとつにまとまります。</div>
      </div>
      <button type="button" class="btn btn--danger btn--block" data-action="delete">${icon('trash')}この店舗を削除</button>`,
    onMount: (el, close) => {
      const input = el.querySelector('input');
      input.value = s.name;
      const field = el.querySelector('[data-field]');
      input.addEventListener('input', () => field.classList.toggle('has-value', Boolean(input.value)));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); save(); }
      });
      const save = async () => {
        const res = store.renameStore(storeId, input.value);
        if (res.error === 'empty') {
          toast('店舗名を入力してください', { icon: 'info' });
          input.focus();
          return;
        }
        if (res.conflict) {
          const ok = await confirmDialog({
            title: `「${res.conflict.name}」はすでにあります`,
            message: `「${s.name}」を「${res.conflict.name}」に統合しますか？\nリストと購入履歴はすべて「${res.conflict.name}」に移ります。`,
            ok: '統合する',
          });
          if (!ok) return;
          mergeWithUndo('store', storeId, res.conflict.id);
          close();
          return;
        }
        if (res.store) toast('店舗名を変更しました', { icon: 'check' });
        close();
      };
      el.addEventListener('click', async (e) => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action === 'save') save();
        else if (action === 'clear') { input.value = ''; field.classList.remove('has-value'); input.focus(); }
        else if (action === 'merge') pickMergeTarget('store', storeId, () => close());
        else if (action === 'delete') {
          const r = store.storeRefs(storeId);
          const ok = await confirmDialog({
            title: `「${s.name}」を削除しますか？`,
            message: r.items || r.purchases
              ? `この店舗のリスト${r.items}件と購入履歴${r.purchases}件は「店舗未設定」になります（記録は残ります）。`
              : '店舗名の候補から削除されます。',
            ok: '削除',
            danger: true,
          });
          if (!ok) return;
          const snapshot = store.checkpoint();
          store.deleteStore(storeId);
          close();
          toast(`「${s.name}」を削除しました`, { action: '元に戻す', onAction: () => store.restore(snapshot) });
        }
      });
    },
  });
}

/* ================================================================== 統合 */

function mergeWithUndo(kind, fromId, toId) {
  const fromName = kind === 'product' ? store.productName(fromId) : store.storeName(fromId);
  const toName = kind === 'product' ? store.productName(toId) : store.storeName(toId);
  const snapshot = store.checkpoint();
  const ok = kind === 'product' ? store.mergeProducts(fromId, toId) : store.mergeStores(fromId, toId);
  if (ok) toast(`「${fromName}」を「${toName}」に統合しました`, { action: '元に戻す', onAction: () => store.restore(snapshot) });
}

/** 統合先を選ぶシート */
function pickMergeTarget(kind, fromId, onDone) {
  const isProduct = kind === 'product';
  const fromName = isProduct ? store.productName(fromId) : store.storeName(fromId);
  const state = { query: '' };
  openSheet({
    title: '統合先を選ぶ',
    body: `
      <div class="notice notice--muted">${icon('merge')}<span>「${esc(fromName)}」のリストと購入履歴を、選んだ${isProduct ? '商品' : '店舗'}に移します。「${esc(fromName)}」は削除されます。</span></div>
      <label class="searchbar" style="margin:0 0 16px">
        ${icon('search')}
        <input class="searchbar__input" type="search" placeholder="${isProduct ? '商品' : '店舗'}を検索" autocomplete="off" spellcheck="false" aria-label="検索">
      </label>
      <div data-role="list"></div>`,
    onMount: (el, close) => {
      const input = el.querySelector('input');
      const list = el.querySelector('[data-role="list"]');
      const renderList = () => {
        const all = (isProduct ? store.state().products : store.storesSorted())
          .filter((x) => x.id !== fromId && matches(x.name, state.query));
        list.innerHTML = all.length ? `
          <div class="list-group" style="margin:0">
            <div class="list-group__body">
              ${all.map((x) => {
                const refs = isProduct ? store.productRefs(x.id) : store.storeRefs(x.id);
                return `<button type="button" class="row" data-target="${esc(x.id)}">
                  <span class="row__main">
                    <span class="row__label" style="display:block">${esc(x.name)}</span>
                    <span class="row__sub" style="display:block">履歴 ${refs.purchases}件・リスト ${refs.items}件</span>
                  </span>
                  ${icon('chevronRight', 'row__chev')}
                </button>`;
              }).join('')}
            </div>
          </div>` : '<div class="empty empty--compact"><div class="empty__text">統合できる候補がありません</div></div>';
      };
      input.addEventListener('input', () => { state.query = input.value; renderList(); });
      renderList();
      el.addEventListener('click', async (e) => {
        const row = e.target.closest('[data-target]');
        if (!row) return;
        const toId = row.dataset.target;
        const toName = isProduct ? store.productName(toId) : store.storeName(toId);
        const refs = isProduct ? store.productRefs(fromId) : store.storeRefs(fromId);
        const ok = await confirmDialog({
          title: `「${toName}」に統合しますか？`,
          message: `「${fromName}」のリスト${refs.items}件・購入履歴${refs.purchases}件が「${toName}」に移り、「${fromName}」は削除されます。`,
          ok: '統合する',
        });
        if (!ok) return;
        mergeWithUndo(kind, fromId, toId);
        close();
        onDone?.();
      });
    },
  });
}

/* ================================================================== 表記ゆれの整理 */

function openDuplicatesPage() {
  const chosen = new Map(); // グループキー → 残すID
  pushPage({
    title: '表記ゆれの整理',
    backLabel: '管理',
    render: (body) => {
      const sections = [
        { kind: 'product', label: '商品', groups: store.duplicateGroups('product') },
        { kind: 'store', label: '店舗', groups: store.duplicateGroups('store') },
      ];
      const total = sections.reduce((s, x) => s + x.groups.length, 0);
      if (!total) {
        body.innerHTML = `
          <div class="empty">
            <div class="empty__art">${icon('shield')}</div>
            <div class="empty__title">表記ゆれは見つかりませんでした</div>
            <div class="empty__text">「コーヒー」と「コーヒ」、「ゴミ袋 45L」と「ゴミ袋45L」のように、よく似た名前があるとここに表示されます。</div>
          </div>`;
        return;
      }
      body.innerHTML = `
        <p class="page-intro">よく似た名前が見つかりました。残す名前を選んで「まとめる」をタップすると、リストと購入履歴がひとつにまとまります。</p>
        ${sections.filter((x) => x.groups.length).map((sec) => `
          ${sec.groups.map((g) => {
            const gkey = `${sec.kind}:${g.map((x) => x.id).sort().join(',')}`;
            const refsOf = (x) => (sec.kind === 'product' ? store.productRefs(x.id) : store.storeRefs(x.id));
            let keep = chosen.get(gkey);
            if (!g.some((x) => x.id === keep)) {
              keep = [...g].sort((a, b) => {
                const ra = refsOf(a); const rb = refsOf(b);
                return (rb.purchases + rb.items) - (ra.purchases + ra.items);
              })[0].id;
              chosen.set(gkey, keep);
            }
            return `
              <div class="list-group">
                <div class="list-group__title">${sec.label}</div>
                <div class="list-group__body">
                  ${g.map((x) => {
                    const r = refsOf(x);
                    return `<button type="button" class="row ${x.id === keep ? 'is-selected' : ''}" data-choose="${esc(gkey)}" data-id="${esc(x.id)}">
                      <span class="radio">${icon('check')}</span>
                      <span class="row__main">
                        <span class="row__label" style="display:block">${esc(x.name)}</span>
                        <span class="row__sub" style="display:block">履歴 ${r.purchases}件・リスト ${r.items}件</span>
                      </span>
                    </button>`;
                  }).join('')}
                </div>
                <div style="padding-top:10px">
                  <button type="button" class="btn btn--tinted btn--block btn--small" data-merge-group="${esc(gkey)}" data-kind="${sec.kind}" data-ids="${esc(g.map((x) => x.id).join(','))}">${icon('merge')}選んだ名前にまとめる</button>
                </div>
              </div>`;
          }).join('')}
        `).join('')}`;
    },
    onMount: (el, page) => {
      el.addEventListener('click', (e) => {
        const c = e.target.closest('[data-choose]');
        if (c) {
          chosen.set(c.dataset.choose, c.dataset.id);
          page.render();
          return;
        }
        const m = e.target.closest('[data-merge-group]');
        if (m) {
          const kind = m.dataset.kind;
          const keep = chosen.get(m.dataset.mergeGroup);
          const ids = m.dataset.ids.split(',').filter((id) => id !== keep);
          const snapshot = store.checkpoint();
          ids.forEach((id) => (kind === 'product' ? store.mergeProducts(id, keep) : store.mergeStores(id, keep)));
          const name = kind === 'product' ? store.productName(keep) : store.storeName(keep);
          toast(`「${name}」にまとめました`, { action: '元に戻す', onAction: () => store.restore(snapshot) });
        }
      });
    },
  });
}

/* ================================================================== 名前入力シート */

function openNameSheet({ title, label, placeholder, iconName, onSave }) {
  openSheet({
    title,
    size: 'auto',
    right: '<button type="button" class="btn-text btn-text--strong" data-action="save">登録</button>',
    body: `
      <div class="form-label">${esc(label)}</div>
      <div class="form-group">
        <div class="field">
          ${icon(iconName)}
          <input class="field__input" type="text" maxlength="80" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" enterkeyhint="done" aria-label="${esc(label)}">
        </div>
      </div>
      <div style="height:8px"></div>`,
    onMount: (el, close) => {
      const input = el.querySelector('input');
      const save = () => {
        if (!input.value.trim()) { input.focus(); return; }
        if (onSave(input.value)) close();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); save(); }
      });
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="save"]')) save();
      });
      input.focus({ preventScroll: true });
    },
  });
}

/* ================================================================== バックアップ */

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function exportBackup() {
  const json = store.exportData();
  const text = JSON.stringify(json, null, 2);
  const filename = `kau-backup-${timestamp()}.json`;
  const file = new File([text], filename, { type: 'application/json' });

  // iPhoneでは共有シートから「ファイルに保存」できる
  if (navigator.canShare && navigator.share) {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'kau. バックアップ' });
        store.markBackup();
        toast('バックアップを書き出しました', { icon: 'check' });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  store.markBackup();
  toast('バックアップを書き出しました', { icon: 'check' });
}

async function importBackup(file) {
  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    toast('ファイルを読み込めませんでした', { icon: 'alert' });
    return;
  }
  const info = store.inspectBackup(json);
  if (!info) {
    toast('kau. のバックアップファイルではないようです', { icon: 'alert' });
    return;
  }
  const c = info.counts;
  const exported = json.exportedAt ? new Date(json.exportedAt) : null;
  const ok = await confirmDialog({
    title: 'バックアップから復元しますか？',
    message: `${exported && !Number.isNaN(exported.getTime()) ? `${longDate(exported.getTime())}のバックアップ\n` : ''}商品 ${c.products}・店舗 ${c.stores}・リスト ${c.items}・履歴 ${c.purchases}件\n\n今のデータはこの内容に置き換わります。`,
    ok: '復元する',
    danger: true,
  });
  if (!ok) return;
  const snapshot = store.checkpoint();
  store.replaceAll(info.clean);
  toast('バックアップから復元しました', { action: '元に戻す', onAction: () => store.restore(snapshot) });
}

async function resetAll() {
  const ok = await confirmDialog({
    title: 'すべてのデータを削除しますか？',
    message: '買い物リスト・購入履歴・商品・店舗がすべて削除されます。',
    ok: 'すべて削除',
    danger: true,
  });
  if (!ok) return;
  const snapshot = store.checkpoint();
  store.resetAll();
  toast('すべてのデータを削除しました', { action: '元に戻す', onAction: () => store.restore(snapshot) });
}
