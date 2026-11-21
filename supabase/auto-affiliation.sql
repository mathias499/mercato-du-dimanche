-- Le Mercato du dimanche · affiliation automatique des joueurs pré-inscrits
-- Un joueur qui retrouve SA fiche pré-inscrite par le coach (même prénom + nom) est validé tout de suite.
-- Les parents, les nouveaux joueurs et les nouveaux coachs restent validés par le club.
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
  elsif new.role = 'joueur' and new.player_id is not null
    and exists (select 1 from docs p where p.col = 'players' and p.id = new.player_id
                and coalesce((p.data->>'pre')::boolean, false)
                and p.data->>'team' = new.team_id
                and p.club_id = new.club_id)
    and not exists (select 1 from memberships m where m.player_id = new.player_id
                    and m.role = 'joueur' and m.statut = 'actif') then
    new.statut := 'actif';
  else
    new.statut := 'en_attente';
  end if;
  return new;
end $$;
