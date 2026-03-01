-- Add user_id columns

alter table public.inventory_items
add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.shopping_items
add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Make user_id NOT NULL (after backfilling)
alter table public.inventory_items
alter column user_id set not null;

alter table public.shopping_items
alter column user_id set not null;

-- Drop old indexes
drop index if exists idx_inventory_owner_archived;
drop index if exists idx_shopping_owner_completed;

-- Create new indexes
create index if not exists idx_inventory_user_archived
on public.inventory_items(user_id, archived);

create index if not exists idx_shopping_user_completed
on public.shopping_items(user_id, completed);

-- Remove owner_email column
alter table public.inventory_items drop column if exists owner_email;
alter table public.shopping_items drop column if exists owner_email;
