'use strict';

const groups = [
  ['Clothes', {
    shirts: '2 daytime shirts',
    bottoms: 'Shorts or lightweight pants',
    longpants: 'Long pants for evenings',
    layer: 'Fleece or sweater for 55°F nights',
    sleep: 'Pajamas',
    underwear: '3 pairs of underwear',
    socks: '3 pairs of socks',
    shoes: 'Comfortable walking shoes',
  }],
  ['Swimming & sun', {
    suit: 'Swimsuit',
    towel: 'Swim towel (if needed)',
    sandals: 'Flip-flops or pool sandals',
    wetbag: 'Bag for wet swimwear',
    sunscreen: 'Water-resistant sunscreen',
    sunglasses: 'Sunglasses',
    hat: 'Sun hat or cap',
    goggles: 'Goggles (optional)',
  }],
  ['Toiletries & health', {
    toothbrush: 'Toothbrush',
    toothpaste: 'Toothpaste',
    deodorant: 'Deodorant',
    wash: 'Shampoo and body wash (if needed)',
    hair: 'Comb or hairbrush',
    medication: 'Medications for the trip',
    eyewear: 'Prescription glasses or contacts (if needed)',
  }],
  ['Travel essentials', {
    phone: 'Phone',
    charger: 'Phone charger and cable',
    wallet: 'Wallet, ID, and payment card',
    keys: 'House and car keys',
    reservations: 'Reservation or travel details',
    water: 'Reusable water bottle',
    laundry: 'Bag for dirty clothes',
  }],
];

const backend = window.packingBackend;
const storageKey = 'sdtrip-checklist-v1';
const state = JSON.parse(localStorage.getItem(storageKey) || 'null') ?? {
  key: Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
    byte.toString(16).padStart(2, '0')).join(''),
  packed: {},
  pending: {},
};

const list = document.querySelector('#list');
const count = document.querySelector('#count');
const progress = document.querySelector('#progress');
const status = document.querySelector('#status');
const filter = document.querySelector('#filter');
const done = document.querySelector('#done');
const sections = [];
const checks = new Map();
let hidePacked = false;
let syncing = false;
let loaded = false;

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function render() {
  let packedCount = 0;
  for (const { section, ids } of sections) {
    let visible = 0;
    for (const id of ids) {
      const check = checks.get(id);
      check.checked = state.packed[id] === true;
      check.parentElement.hidden = hidePacked && check.checked;
      packedCount += Number(check.checked);
      visible += Number(!check.parentElement.hidden);
    }
    section.hidden = visible === 0;
  }
  count.textContent = packedCount + ' of ' + checks.size + ' packed';
  progress.value = packedCount;
  done.hidden = packedCount !== checks.size;
}

function change(id, checked) {
  state.packed[id] = checked;
  state.pending[id] = checked;
  save();
  render();
  void sync();
}

for (const [title, items] of groups) {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  const rows = document.createElement('div');
  heading.textContent = title;
  rows.className = 'items';
  for (const [id, name] of Object.entries(items)) {
    const label = document.createElement('label');
    const check = document.createElement('input');
    const text = document.createElement('span');
    check.type = 'checkbox';
    text.textContent = name;
    check.addEventListener('change', () => change(id, check.checked));
    label.append(check, text);
    rows.append(label);
    checks.set(id, check);
  }
  section.append(heading, rows);
  list.append(section);
  sections.push({ section, ids: Object.keys(items) });
}

filter.addEventListener('click', () => {
  hidePacked = !hidePacked;
  filter.setAttribute('aria-pressed', String(hidePacked));
  filter.textContent = hidePacked ? 'Show packed' : 'Hide packed';
  render();
});

async function request(query, options = {}) {
  const response = await fetch(backend.url + '/rest/v1/sdtrip_packing' + query, {
    ...options,
    headers: {
      apikey: backend.key,
      'x-client-info': state.key,
      ...options.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Sync request failed: ' + response.status);
  return response;
}

async function sync() {
  if (syncing) return;
  syncing = true;
  status.textContent = 'Connecting to Supabase…';
  try {
    if (!loaded) {
      const response = await request('?select=item_id,packed');
      for (const row of await response.json()) {
        if (checks.has(row.item_id) && !Object.hasOwn(state.pending, row.item_id)) {
          state.packed[row.item_id] = row.packed;
        }
      }
      loaded = true;
      save();
      render();
    }
    while (Object.keys(state.pending).length) {
      const batch = Object.entries(state.pending);
      await request('?on_conflict=checklist_key,item_id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch.map(([item_id, packed]) => ({
          checklist_key: state.key, item_id, packed,
        }))),
      });
      for (const [id, packed] of batch) {
        if (state.pending[id] === packed) delete state.pending[id];
      }
      save();
    }
    status.textContent = 'Saved to Supabase';
  } catch {
    status.textContent = 'Saved on this device · Cloud connection unavailable';
  } finally {
    syncing = false;
  }
}

save();
progress.max = checks.size;
render();
window.addEventListener('online', sync);
window.addEventListener('focus', sync);
void sync();
