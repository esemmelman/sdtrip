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

state.details ??= {};
for (const [id, pending] of Object.entries(state.pending)) {
  if (typeof pending === 'boolean') state.pending[id] = { packed: pending };
}

const list = document.querySelector('#list');
const count = document.querySelector('#count');
const progress = document.querySelector('#progress');
const status = document.querySelector('#status');
const filter = document.querySelector('#filter');
const done = document.querySelector('#done');
const empty = document.querySelector('#empty');
const add = document.querySelector('#add');
const dialog = document.querySelector('#editor');
const title = document.querySelector('#editor-title');
const form = document.querySelector('#edit-form');
const nameInput = document.querySelector('#item-name');
const remove = document.querySelector('#remove');
const deleteDialog = document.querySelector('#confirm-delete');
const deleteName = document.querySelector('#delete-name');

const items = new Map();
const categories = [...groups.map(([category]) => category), 'Custom items'];
for (const [category, defaults] of groups) {
  for (const [id, name] of Object.entries(defaults)) {
    items.set(id, { category, name });
  }
}
let hidePacked = false;
let syncing = false;
let loaded = false;
let editingId = null;

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getItem(id) {
  const details = state.details[id];
  return {
    name: details?.name ?? items.get(id)?.name,
    category: items.get(id)?.category ?? 'Custom items',
    deleted: details?.deleted ?? false,
    packed: state.packed[id] === true,
  };
}

function render() {
  const focused = document.activeElement;
  const focusId = focused?.closest('[data-item]')?.dataset.item;
  const focusSelector = focused?.matches('input') ? 'input' : 'button';
  const sections = new Map();
  let total = 0;
  let packedCount = 0;
  for (const id of new Set([...items.keys(), ...Object.keys(state.details)])) {
    const item = getItem(id);
    if (item.deleted || !item.name) continue;
    total += 1;
    packedCount += Number(item.packed);
    if (hidePacked && item.packed) continue;
    if (!sections.has(item.category)) sections.set(item.category, []);
    sections.get(item.category).push(createRow(id, item));
  }

  const content = document.createDocumentFragment();
  for (const category of categories) {
    const rows = sections.get(category);
    if (!rows) continue;
    const section = document.createElement('section');
    const heading = document.createElement('h2');
    const container = document.createElement('div');
    heading.textContent = category;
    container.className = 'items';
    container.append(...rows);
    section.append(heading, container);
    content.append(section);
  }
  list.replaceChildren(content);
  count.textContent = packedCount + ' of ' + total + ' packed';
  progress.max = Math.max(total, 1);
  progress.value = packedCount;
  done.hidden = total === 0 || packedCount !== total;
  empty.hidden = total !== 0;
  if (focusId) {
    const target = list.querySelector('[data-item="' + CSS.escape(focusId) + '"] ' + focusSelector);
    (target ?? filter).focus({ preventScroll: true });
  }
}

function createRow(id, item) {
  const row = document.createElement('div');
  const label = document.createElement('label');
  const check = document.createElement('input');
  const text = document.createElement('span');
  const edit = document.createElement('button');
  row.className = 'item';
  row.dataset.item = id;
  check.type = 'checkbox';
  check.checked = item.packed;
  text.textContent = item.name;
  check.addEventListener('change', () => update(id, { packed: check.checked }));
  edit.type = 'button';
  edit.className = 'edit';
  edit.textContent = 'Edit';
  edit.setAttribute('aria-label', 'Edit ' + item.name);
  edit.addEventListener('click', () => openEditor(id));
  label.append(check, text);
  row.append(label, edit);
  return row;
}

function update(id, changes) {
  const item = { ...getItem(id), ...changes };
  state.packed[id] = item.packed;
  if ('name' in changes || 'deleted' in changes) {
    state.details[id] = { name: item.name, deleted: item.deleted };
  }
  state.pending[id] = { ...state.pending[id], ...changes };
  save();
  render();
  void sync();
}

function openEditor(id) {
  editingId = id;
  title.textContent = id ? 'Edit item' : 'Add item';
  nameInput.value = id ? getItem(id).name : '';
  nameInput.setCustomValidity('');
  remove.hidden = !id;
  dialog.showModal();
  nameInput.select();
}

add.addEventListener('click', () => openEditor(null));
nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
form.addEventListener('submit', event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.setCustomValidity('Enter an item name.');
    nameInput.reportValidity();
    return;
  }
  const id = editingId ?? 'custom_' + crypto.randomUUID().replaceAll('-', '');
  dialog.close();
  update(id, { name });
});

document.querySelector('#cancel-edit').addEventListener('click', () => dialog.close());
remove.addEventListener('click', () => {
  deleteName.textContent = getItem(editingId).name;
  deleteDialog.showModal();
});
deleteDialog.addEventListener('close', () => {
  if (deleteDialog.returnValue !== 'delete') return;
  dialog.close();
  update(editingId, { deleted: true });
  add.focus();
});
deleteDialog.addEventListener('cancel', () => { deleteDialog.returnValue = ''; });

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
      const response = await request('?select=item_id,packed,item_name,deleted');
      for (const row of await response.json()) {
        const id = row.item_id;
        const pending = state.pending[id] ?? {};
        state.packed[id] = pending.packed ?? row.packed;
        if (row.item_name !== null || row.deleted || state.details[id]) {
          state.details[id] = {
            name: pending.name ?? row.item_name,
            deleted: pending.deleted ?? row.deleted,
          };
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
        body: JSON.stringify(batch.map(([item_id]) => {
          const item = getItem(item_id);
          return {
            checklist_key: state.key,
            item_id,
            packed: item.packed,
            item_name: state.details[item_id]?.name ?? null,
            deleted: item.deleted,
          };
        })),
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
render();
window.addEventListener('online', sync);
window.addEventListener('focus', sync);
void sync();
