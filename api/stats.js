// Statistiques générales de l'appli (nombre de clubs, d'équipes, de licenciés…)
// Réservé à l'administrateur : le compte qui a créé le tout premier club, ou un e-mail listé dans ADMIN_EMAILS sur Vercel.
import { createClient } from '@supabase/supabase-js'

const SB_URL = 'https://qxgyzxewzoqsrpgancul.supabase.co'

async function tout(admin, table, colonnes, filtre) {
  const lignes = []
  for (let de = 0; ; de += 1000) {
    let q = admin.from(table).select(colonnes).range(de, de + 999)
    if (filtre) q = filtre(q)
    const { data, error } = await q
    if (error) throw error
    lignes.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return lignes
}

export default async function handler(req, res) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return res.status(500).json({ ok: false, erreur: 'Variable manquante sur Vercel' })
  const admin = createClient(SB_URL, secret, { auth: { persistSession: false } })
  try {
    const jeton = (req.headers.authorization || '').replace(/^Bearer /, '')
    const { data: u } = await admin.auth.getUser(jeton)
    const moi = u && u.user
    if (!moi) return res.status(401).json({ ok: false })

    // Qui est administrateur ?
    const listes = String(process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean)
    const { data: premier } = await admin.from('memberships').select('user_id').eq('role', 'responsable')
      .order('created_at', { ascending: true }).limit(1)
    const estAdmin = listes.includes(String(moi.email || '').toLowerCase()) || !!(premier && premier[0] && premier[0].user_id === moi.id)
    const sonde = (req.query && req.query.sonde) || (req.url || '').includes('sonde=1')
    if (sonde) return res.status(200).json({ ok: true, admin: estAdmin })
    if (!estAdmin) return res.status(403).json({ ok: false })

    const [clubs, equipes, joueurs, matchs, articles, adh, activite, questions] = await Promise.all([
      tout(admin, 'docs', 'id,data', (q) => q.eq('col', 'clubs')),
      tout(admin, 'docs', 'id,data', (q) => q.eq('col', 'teams')),
      tout(admin, 'docs', 'id,club_id,data', (q) => q.eq('col', 'players')),
      tout(admin, 'docs', 'id,data', (q) => q.eq('col', 'matches')),
      tout(admin, 'docs', 'id,club_id', (q) => q.eq('col', 'articles')),
      tout(admin, 'memberships', 'user_id,club_id,role,statut,created_at'),
      tout(admin, 'docs', 'club_id,updated_at', (q) => q.not('club_id', 'is', null)),
      tout(admin, 'docs', 'id,data', (q) => q.eq('col', 'support')),
    ])

    const vraisClubs = clubs.filter((c) => !c.data.ext)
    const vraiesEquipes = equipes.filter((t) => !t.data.ext && vraisClubs.some((c) => c.id === t.data.club))
    const idEquipes = new Set(vraiesEquipes.map((t) => t.id))
    const licencies = joueurs.filter((p) => idEquipes.has(p.data.team))
    const actifs = adh.filter((m) => m.statut === 'actif')
    const il7 = Date.now() - 7 * 864e5
    const uniques = (l) => new Set(l.map((m) => m.user_id)).size
    const role = (r) => uniques(actifs.filter((m) => r.includes(m.role)))

    const parClub = vraisClubs.map((c) => {
      const eq = vraiesEquipes.filter((t) => t.data.club === c.id)
      const ids = new Set(eq.map((t) => t.id))
      const mem = actifs.filter((m) => m.club_id === c.id)
      const dates = adh.filter((m) => m.club_id === c.id).map((m) => m.created_at).sort()
      const act = activite.filter((d) => d.club_id === c.id).map((d) => d.updated_at).sort()
      return {
        nom: c.data.name || '?', ville: c.data.town || '',
        equipes: eq.length, categories: [...new Set(eq.map((t) => t.data.cat))],
        licencies: joueurs.filter((p) => ids.has(p.data.team)).length,
        comptes: uniques(mem),
        joueursInscrits: uniques(mem.filter((m) => m.role === 'joueur')),
        supporters: uniques(mem.filter((m) => ['supporter', 'parent'].includes(m.role))),
        cree: dates[0] || null, activite: act[act.length - 1] || null,
      }
    }).sort((a, b) => String(b.cree || '').localeCompare(String(a.cree || '')))

    return res.status(200).json({
      ok: true, date: new Date().toISOString(),
      total: {
        clubs: vraisClubs.length, equipes: vraiesEquipes.length, licencies: licencies.length,
        comptes: uniques(actifs), coachs: role(['responsable', 'coach', 'adjoint']), joueurs: role(['joueur']),
        parents: role(['parent']), supporters: role(['supporter']),
        enAttente: adh.filter((m) => m.statut === 'en_attente').length,
        nouveaux7j: uniques(adh.filter((m) => new Date(m.created_at).getTime() > il7)),
        clubs7j: parClub.filter((c) => c.cree && new Date(c.cree).getTime() > il7).length,
        matchsJoues: matchs.filter((m) => m.data.status === 'played').length,
        articles: articles.length,
      },
      clubs: parClub,
      messages: questions.map((q) => q.data).sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 60),
    })
  } catch (e) {
    return res.status(500).json({ ok: false, erreur: String((e && e.message) || e) })
  }
}
