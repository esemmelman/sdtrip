create table public.sdtrip_packing (
  checklist_key text not null check (checklist_key ~ '^[0-9a-f]{64}$'),
  item_id text not null check (item_id ~ '^[a-z]{1,24}$'),
  packed boolean not null,
  primary key (checklist_key, item_id)
);

alter table public.sdtrip_packing enable row level security;
revoke all on public.sdtrip_packing from public, anon, authenticated;
grant select, insert, update on public.sdtrip_packing to anon;

create policy sdtrip_device_key on public.sdtrip_packing to anon
  using (checklist_key = (select current_setting('request.headers', true)::jsonb ->> 'x-client-info'))
  with check (checklist_key = (select current_setting('request.headers', true)::jsonb ->> 'x-client-info'));
