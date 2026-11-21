-- Le Mercato du dimanche · pré-inscription par le coach
-- Un joueur (ou un parent) qui s'inscrit avec le même prénom + nom qu'un joueur
-- pré-inscrit par le coach retrouve sa fiche. Seuls le nom du club et la catégorie sont renvoyés.

create or replace function public.norm_nom(x text) returns text
language sql immutable as $$
  select array_to_string(array(
    select w from unnest(regexp_split_to_array(trim(regexp_replace(
      translate(lower(coalesce(x,'')), 'àâäáãéèêëíîïìóôöòõúûüùçñ-''’', 'aaaaaeeeeiiiiooooouuuucn   '),
      '\s+', ' ', 'g')), ' ')) w
    where w <> '' order by w), ' ')
$$;

create or replace function public.chercher_preinscrit(p_nom text)
returns table(club_id text, team_id text, player_id text, club_nom text, categorie text, joueur text)
language sql stable security definer set search_path = public as $$
  select t.data->>'club', p.data->>'team', p.id, c.data->>'name', t.data->>'cat', p.data->>'name'
  from docs p
  join docs t on t.col = 'teams' and t.id = p.data->>'team'
  join docs c on c.col = 'clubs' and c.id = t.data->>'club'
  where p.col = 'players'
    and coalesce((p.data->>'pre')::boolean, false)
    and length(public.norm_nom(p_nom)) >= 5
    and public.norm_nom(p.data->>'name') = public.norm_nom(p_nom)
    and not exists (select 1 from memberships m where m.player_id = p.id and m.statut = 'actif' and m.role = 'joueur')
  limit 5
$$;
revoke all on function public.chercher_preinscrit(text) from public, anon;
grant execute on function public.chercher_preinscrit(text) to authenticated;
