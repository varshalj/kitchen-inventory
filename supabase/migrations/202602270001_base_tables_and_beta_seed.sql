create extension if not exists "pgcrypto";

create table if not exists public.inventory_items (
  id text primary key,
  owner_email text not null,
  name text not null,
  category text not null,
  expiry_date timestamptz,
  location text not null,
  quantity integer default 1,
  archived boolean not null default false,
  added_on timestamptz,
  consumed_on timestamptz,
  wasted_on timestamptz,
  partially_consumed boolean,
  notes text,
  price text,
  brand text,
  archive_reason text check (archive_reason in ('consumed','wasted','other')),
  ordered_from text,
  synced_from_email boolean,
  email_source text,
  rating integer,
  review_tags text[],
  review_note text,
  rated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id text primary key,
  owner_email text not null,
  name text not null,
  quantity integer not null default 1,
  category text,
  notes text,
  completed boolean not null default false,
  added_on timestamptz not null default now(),
  added_from text check (added_from in ('consumed','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_owner_archived on public.inventory_items(owner_email, archived);
create index if not exists idx_shopping_owner_completed on public.shopping_items(owner_email, completed);

insert into public.inventory_items (
  id, owner_email, name, category, expiry_date, location, quantity, archived, added_on, ordered_from, synced_from_email
)
values
  ('beta-inv-1', 'demo-beta@kitchen.app', 'Organic Milk', 'Dairy', now() + interval '5 days', 'Refrigerator', 1, false, now() - interval '2 days', 'Instamart', false),
  ('beta-inv-2', 'demo-beta@kitchen.app', 'Chicken Breast', 'Meat', now() + interval '2 days', 'Freezer', 2, false, now() - interval '5 days', 'BigBasket', false),
  ('beta-inv-3', 'demo-beta@kitchen.app', 'Pasta', 'Grains', now() + interval '90 days', 'Pantry', 1, false, now() - interval '10 days', 'Amazon Fresh', false)
on conflict (id) do nothing;

insert into public.shopping_items (
  id, owner_email, name, quantity, category, completed, added_on, added_from
)
values
  ('beta-shop-1', 'demo-beta@kitchen.app', 'Eggs', 12, 'Dairy', false, now(), 'manual'),
  ('beta-shop-2', 'demo-beta@kitchen.app', 'Tomatoes', 6, 'Vegetables', false, now(), 'manual')
on conflict (id) do nothing;
