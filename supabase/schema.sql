-- ════════════════════════════════════════════════════════════════
-- Le Mercato du dimanche · base de données Supabase (v1)
-- À coller en entier dans Supabase → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════

-- 1. PROFILS (prénom uniquement : l'email reste dans la partie sécurisée de Supabase)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text not null default '',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profils lisibles" on public.profiles;
create policy "profils lisibles" on public.profiles for select to authenticated using (true);
drop policy if exists "profil modifiable par soi" on public.profiles;
create policy "profil modifiable par soi" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, prenom)
  values (new.id, coalesce(new.raw_user_meta_data->>'prenom', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists quand_utilisateur_cree on auth.users;
create trigger quand_utilisateur_cree after insert on auth.users
  for each row execute function public.creer_profil();

-- 2. APPARTENANCES (qui est quoi dans quel club)
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  club_id text not null,
  team_id text not null default '',
  role text not null check (role in ('responsable','coach','adjoint','joueur','parent','supporter','arbitre')),
  player_id text,
  statut text not null default 'en_attente' check (statut in ('actif','en_attente')),
  created_at timestamptz not null default now(),
  unique (user_id, club_id, team_id, role)
);
alter table public.memberships enable row level security;

-- Fonctions de contrôle (security definer pour éviter les boucles de règles)
create or replace function public.est_staff(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.club_id = c
    and m.statut = 'actif' and m.role in ('responsable','coach','adjoint'));
$$;
create or replace function public.est_membre(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.club_id = c
    and m.statut = 'actif' and m.role in ('responsable','coach','adjoint','joueur','parent','arbitre'));
$$;
create or replace function public.est_fan(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.club_id = c and m.statut = 'actif');
$$;

-- Statut automatique : le fondateur du club est validé tout de suite,
-- les supporters aussi ; joueurs, parents et nouveaux coachs attendent la validation du club.
create or replace function public.statut_appartenance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  if not exists (select 1 from memberships m where m.club_id = new.club_id and m.statut = 'actif'
                 and m.role in ('responsable','coach')) then
    new.statut := 'actif';
  elsif new.role = 'supporter' then
    new.statut := 'actif';
  elsif exists (select 1 from memberships m where m.club_id = new.club_id and m.user_id = auth.uid()
                and m.statut = 'actif' and m.role in ('responsable','coach','adjoint')) then
    new.statut := 'actif';
  else
    new.statut := 'en_attente';
  end if;
  return new;
end $$;
drop trigger if exists avant_appartenance on public.memberships;
create trigger avant_appartenance before insert on public.memberships
  for each row execute function public.statut_appartenance();

drop policy if exists "voir ses appartenances et celles de son club" on public.memberships;
create policy "voir ses appartenances et celles de son club" on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.est_staff(club_id));
drop policy if exists "demander à rejoindre" on public.memberships;
create policy "demander à rejoindre" on public.memberships for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "le staff valide" on public.memberships;
create policy "le staff valide" on public.memberships for update to authenticated
  using (public.est_staff(club_id)) with check (public.est_staff(club_id));
drop policy if exists "quitter ou retirer" on public.memberships;
create policy "quitter ou retirer" on public.memberships for delete to authenticated
  using (user_id = auth.uid() or public.est_staff(club_id));

-- 3. DONNÉES DE L'APPLI (clubs, équipes, matchs, tournois, effectifs…)
-- visibilite : public = toute l'appli · supporters = club + supporters · club = membres validés du club · prive = auteur seul
create table if not exists public.docs (
  col text not null,
  id text not null,
  club_id text,
  club2 text,
  visibilite text not null default 'club' check (visibilite in ('public','supporters','club','prive')),
  data jsonb not null,
  owner uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
create index if not exists docs_club on public.docs (club_id);
create index if not exists docs_club2 on public.docs (club2);
alter table public.docs enable row level security;
alter table public.docs replica identity full;

drop policy if exists "lire" on public.docs;
create policy "lire" on public.docs for select to authenticated using (
  visibilite = 'public'
  or owner = auth.uid()
  or (visibilite = 'supporters' and (public.est_fan(club_id) or public.est_fan(club2)))
  or (visibilite = 'club' and (public.est_membre(club_id) or public.est_membre(club2)))
);
drop policy if exists "creer" on public.docs;
create policy "creer" on public.docs for insert to authenticated with check (
  owner = auth.uid()
);
drop policy if exists "modifier" on public.docs;
create policy "modifier" on public.docs for update to authenticated using (
  owner = auth.uid()
  or public.est_membre(club_id) or public.est_membre(club2)
  or (col in ('annonces','tournaments','leagues') )
) with check (true);
drop policy if exists "supprimer" on public.docs;
create policy "supprimer" on public.docs for delete to authenticated using (
  owner = auth.uid() or public.est_staff(club_id)
);

create or replace function public.maj_date() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists docs_maj on public.docs;
create trigger docs_maj before update on public.docs for each row execute function public.maj_date();

-- 4. TEMPS RÉEL (live, tournois, fil des matchs)
do $$ begin
  begin alter publication supabase_realtime add table public.docs; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.memberships; exception when duplicate_object then null; end;
end $$;

-- 5. PHOTOS (logos, joueurs, Gazette) : chacun écrit dans son dossier
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "photos envoi" on storage.objects;
create policy "photos envoi" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos modif" on storage.objects;
create policy "photos modif" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos suppression" on storage.objects;
create policy "photos suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
