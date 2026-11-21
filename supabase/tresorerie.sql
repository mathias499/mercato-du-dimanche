-- Le Mercato du dimanche · trésorerie du club
-- Nouvelle visibilité « staff » : seuls les coachs et dirigeants validés du club lisent et modifient la trésorerie.
alter table public.docs drop constraint if exists docs_visibilite_check;
alter table public.docs add constraint docs_visibilite_check check (visibilite in ('public','supporters','club','staff','prive'));

drop policy if exists "lire" on public.docs;
create policy "lire" on public.docs for select to authenticated using (
  visibilite = 'public'
  or owner = auth.uid()
  or (visibilite = 'supporters' and (public.est_fan(club_id) or public.est_fan(club2)))
  or (visibilite = 'club' and (public.est_membre(club_id) or public.est_membre(club2)))
  or (visibilite = 'staff' and public.est_staff(club_id))
);
drop policy if exists "modifier" on public.docs;
create policy "modifier" on public.docs for update to authenticated using (
  (col <> 'treso' and (owner = auth.uid()
     or public.est_membre(club_id) or public.est_membre(club2)
     or col in ('annonces','tournaments','leagues')))
  or (col = 'treso' and public.est_staff(club_id))
) with check (true);
