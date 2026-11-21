-- Le Mercato du dimanche · le coach valide toujours les joueurs
-- Même quand un joueur retrouve sa fiche pré-inscrite, sa demande attend la validation du coach.
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
