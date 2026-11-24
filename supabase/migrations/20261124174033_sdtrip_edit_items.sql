alter table public.sdtrip_packing
  drop constraint sdtrip_packing_item_id_check,
  add constraint sdtrip_packing_item_id_check check (item_id ~ '^([a-z]{1,24}|custom_[0-9a-f]{32})$'),
  add column item_name text check (char_length(btrim(item_name)) between 1 and 100),
  add column deleted boolean not null default false;
