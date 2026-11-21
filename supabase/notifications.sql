-- Le Mercato du dimanche · notifications sur les téléphones
-- Chaque téléphone qui accepte les notifications enregistre ici son « adresse » de notification.
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "mes notifications lire" on public.push_subs;
create policy "mes notifications lire" on public.push_subs for select to authenticated using (user_id = auth.uid());
drop policy if exists "mes notifications ajouter" on public.push_subs;
create policy "mes notifications ajouter" on public.push_subs for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "mes notifications modifier" on public.push_subs;
create policy "mes notifications modifier" on public.push_subs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "mes notifications supprimer" on public.push_subs;
create policy "mes notifications supprimer" on public.push_subs for delete to authenticated using (user_id = auth.uid());
