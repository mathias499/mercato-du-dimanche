// Relais vers les données publiques de la FFF (classements, calendriers).
// Le navigateur ne peut pas les lire directement : cette fonction les lit à sa place.
// Essai : /api/fff?diag=2237 renvoie un résumé de ce que la FFF répond pour un club.
const BASE = 'https://api-dofa.fff.fr'

async function lire(chemin) {
  const r = await fetch(BASE + chemin, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Mercato du dimanche)' } })
  const txt = await r.text()
  let json = null
  try { json = JSON.parse(txt) } catch (e) { /* pas du JSON */ }
  return { statut: r.status, json, debut: json ? undefined : txt.slice(0, 200) }
}
const liste = (j) => Array.isArray(j) ? j : (j && (j['hydra:member'] || j.member || j.items)) || []
const resume = (o, n = 0) => {
  if (o === null || typeof o !== 'object') return typeof o === 'string' ? o.slice(0, 40) : o
  if (Array.isArray(o)) return o.length ? [resume(o[0], n + 1), `… ${o.length} éléments`] : []
  if (n > 2) return '{…}'
  const out = {}
  for (const k of Object.keys(o).slice(0, 40)) out[k] = resume(o[k], n + 1)
  return out
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
  try {
    const { diag, chemin } = req.query || {}
    if (diag) {
      if (!/^\d+$/.test(diag)) return res.status(400).json({ ok: false })
      const club = await lire(`/api/clubs/${diag}.json`)
      const equipes = await lire(`/api/clubs/${diag}/equipes.json?filter=`)
      const eqs = liste(equipes.json)
      const out = { club: { statut: club.statut, apercu: resume(club.json), debut: club.debut }, equipes: { statut: equipes.statut, nombre: eqs.length, premiere: resume(eqs[0]), debut: equipes.debut } }
      return res.status(200).json(out)
    }
    if (!chemin || !/^\/api\/(clubs|compets)\/[\w\/.\-]{1,120}$/.test(chemin) || chemin.includes('..')) return res.status(400).json({ ok: false, erreur: 'chemin refusé' })
    const r = await lire(chemin + (chemin.endsWith('equipes.json') ? '?filter=' : ''))
    return res.status(r.statut === 200 ? 200 : 502).json({ ok: r.statut === 200, statut: r.statut, donnees: r.json, debut: r.debut })
  } catch (e) {
    return res.status(502).json({ ok: false, erreur: String(e && e.message || e) })
  }
}
