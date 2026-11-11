// The shop counter: one component for Mel's locker, Edna's back room and
// Chibby's parts bench. The hangar mounts it inside a station's panel:
//
//   import { mountShop } from './shops/ui.js';   // plus <link rel="stylesheet" href="./shops/shop.css">
//   const shop = mountShop({ root, shop: 'mel', store, speak, bus, toast });
//   shop.render(); shop.destroy();
//
// store: voyage/store.js (get, update, subscribe). speak(lineId) (optional):
// story's speaker, so the keeper says their line on open, buy, sell or a deal.
// bus (optional): emits 'shop:bought' { shop, item }, 'shop:sold' { shop, item },
// 'shop:deal' { shop, deal, pass } and 'shop:equipped' { item, slot } for sounds.
// toast(text) (optional): the page's reward toast. rng: for the deal rolls.
// All text goes in with textContent.
import { el, button } from '../quests/ui/player.js';
import { shopView, buy, sell, tryDeal, equip, unequip, GEAR, SLOTS, SHOPS } from './shop.js';
import { ITEMS } from '../quests/core.js';

const money = (n) => `${Math.trunc(n).toLocaleString('en-US')} cr`;
const itemName = (id) => ITEMS[id]?.name || id;
const SLOT_NAMES = Object.freeze({ armour: 'Armour', weapon: 'Weapon' });

function costText(cost) {
  const parts = [];
  if (cost.money) parts.push(money(cost.money));
  for (const [id, n] of Object.entries(cost.items || {})) parts.push(`${n} ${itemName(id)}`);
  return parts.join(' + ') || 'Free';
}

function repText(rep) {
  return Object.entries(rep || {}).map(([g, n]) => `${n > 0 ? '+' : ''}${n} rep with ${g[0].toUpperCase()}${g.slice(1)}`).join(', ');
}

export function mountShop({ root, shop: shopId, store, speak = null, bus = null, toast = () => {}, rng = Math.random }) {
  let note = '';
  let flash = '';
  let tab = 'buy';
  const say = (line) => { if (line && speak) { try { speak(line); } catch { /* text still shows */ } } };
  const lineFor = (key) => SHOPS[shopId]?.lines?.[key]?.line || null;
  const emit = (type, detail) => { try { bus?.emit(type, detail); } catch { /* sounds are optional */ } };

  function commit(out, after) {
    if (!out.ok) { note = out.reason; say(out.line); render(); return; }
    store.update(() => out.save);
    say(out.line);
    after?.();
  }

  function row(v, s) {
    const price = el('span', { class: 'sh-price', text: costText(s.cost) });
    if (s.list && s.cost.money < s.list) price.append(el('s', { text: ` ${money(s.list)}` }));
    return el('li', { class: ['sh-item', s.ok ? '' : 'is-off', flash === s.item ? 'is-bought' : ''].join(' ').trim(), dataset: { item: s.item } },
      el('div', { class: 'sh-what' },
        el('strong', { text: s.qty > 1 ? `${s.name} ×${s.qty}` : s.name }),
        s.gear ? el('small', { class: 'sh-tag', text: s.gear.text }) : null,
        el('p', { text: s.blurb }),
        s.note ? el('p', { class: 'sh-risk', text: `${s.note}${s.rep ? ` (${repText(s.rep)})` : ''}` }) : null,
        s.owned ? el('small', { class: 'sh-owned', text: `In your kit: ${s.owned}` }) : null,
      ),
      el('div', { class: 'sh-buy' },
        price,
        button(s.ok ? 'Buy' : s.reasons[0], () => commit(buy(store.get(), shopId, s.item), () => {
          flash = s.item; note = `Bought ${s.name}.`;
          emit('shop:bought', { shop: shopId, item: s.item });
          toast(note);
          setTimeout(() => { if (flash === s.item) { flash = ''; render(); } }, 900);
        }), { disabled: !s.ok, class: s.ok ? 'primary' : null, 'aria-label': `Buy ${s.name} for ${costText(s.cost)}` }),
      ),
    );
  }

  function gearPanel(v) {
    const owned = Object.keys(GEAR).filter((id) => SLOTS.includes(GEAR[id].slot) && (store.get().items?.[id] || 0) > 0);
    if (!owned.length) return null;
    return el('section', { class: 'sh-gear', 'aria-label': 'What you are wearing' },
      el('h4', { text: 'WORN' }),
      el('ul', {}, ...SLOTS.map((slot) => el('li', {},
        el('span', { text: `${SLOT_NAMES[slot]}: ${v.gear[slot] ? itemName(v.gear[slot]) : slot === 'weapon' ? 'Sidearm' : 'Nothing'}` }),
        ...owned.filter((id) => GEAR[id].slot === slot && v.gear[slot] !== id).map((id) => button(`Wear ${itemName(id)}`, () => commit(equip(store.get(), id), () => {
          emit('shop:equipped', { item: id, slot }); say(lineFor('equip'));
        }))),
        v.gear[slot] ? button('Take off', () => commit(unequip(store.get(), slot))) : null,
      ))),
    );
  }

  function sellPanel(v) {
    if (!v.buys.length) return el('p', { class: 'sh-empty', text: 'Nothing in your hold this shop wants.' });
    return el('ul', { class: 'sh-list' }, ...v.buys.map((b) => el('li', { class: 'sh-item', dataset: { sell: b.item } },
      el('div', { class: 'sh-what' }, el('strong', { text: b.name }), el('small', { class: 'sh-owned', text: `You have ${b.owned}${b.worn ? ' (worn)' : ''}` })),
      el('div', { class: 'sh-buy' }, el('span', { class: 'sh-price', text: money(b.money) }),
        button('Sell one', () => commit(sell(store.get(), shopId, b.item), () => { note = `Sold ${b.name} for ${money(b.money)}.`; emit('shop:sold', { shop: shopId, item: b.item }); })))),
    ));
  }

  function dealPanel(v) {
    if (!v.deals.length) return null;
    return el('section', { class: 'sh-deals', 'aria-label': 'Risky deals' },
      el('h4', { text: 'RISKY DEALS' }),
      el('ul', { class: 'sh-list' }, ...v.deals.map((d) => el('li', { class: 'sh-item sh-deal', dataset: { deal: d.id } },
        el('div', { class: 'sh-what' }, el('strong', { text: d.name }), el('p', { text: d.blurb }),
          el('small', { class: 'sh-tag', text: `A roll: d6 + ${d.statName}, ${d.dc} or more` })),
        el('div', { class: 'sh-buy' }, el('span', { class: 'sh-price', text: costText(d.cost) }),
          button(d.ok ? 'Take the deal' : d.reasons[0], () => {
            const out = tryDeal(store.get(), shopId, d.id, { rng });
            commit(out, () => {
              note = `${out.roll.roll} + ${out.roll.bonus} = ${out.roll.total} vs ${out.roll.dc}: ${out.pass ? 'it pays off.' : 'no luck.'} ${out.text}`;
              emit('shop:deal', { shop: shopId, deal: d.id, pass: out.pass });
              render();
            });
          }, { disabled: !d.ok }))),
      )),
    );
  }

  function render() {
    const v = shopView(shopId, store.get());
    if (!v) { root.replaceChildren(el('p', { text: 'This shop is shut.' })); return; }
    const tabs = el('div', { class: 'sh-tabs', role: 'tablist' },
      ...['buy', 'sell'].map((t) => button(t === 'buy' ? 'Buy' : 'Sell', () => { tab = t; note = ''; render(); }, { role: 'tab', 'aria-selected': String(tab === t), class: tab === t ? 'is-on' : null })));
    root.replaceChildren(el('section', { class: `sh sh-${shopId}`, dataset: { shop: shopId } },
      el('header', { class: 'sh-head' },
        el('h3', { text: v.name }),
        el('p', { class: 'sh-wallet', text: money(v.money) }),
      ),
      el('p', { class: 'sh-blurb', text: v.blurb }),
      v.discounts.length ? el('ul', { class: 'sh-discounts' }, ...v.discounts.map((d) => el('li', { text: `${d.off}% off: ${d.why}` }))) : null,
      tabs,
      tab === 'buy' ? el('ul', { class: 'sh-list' }, ...v.stock.map((s) => row(v, s))) : sellPanel(v),
      tab === 'buy' ? dealPanel(v) : null,
      gearPanel(v),
      el('p', { class: 'sh-note', role: 'status', 'aria-live': 'polite', text: note }),
    ));
  }

  const off = store.subscribe(() => render());
  render();
  say(lineFor('open'));
  return { render, destroy: () => { off?.(); root.replaceChildren(); } };
}

