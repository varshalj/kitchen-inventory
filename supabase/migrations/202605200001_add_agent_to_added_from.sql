-- Allow 'agent' as a valid source for shopping items added via MCP/agent tools
alter table public.shopping_items
  drop constraint if exists shopping_items_added_from_check;

alter table public.shopping_items
  add constraint shopping_items_added_from_check
    check (added_from in ('consumed', 'manual', 'voice', 'agent'));
