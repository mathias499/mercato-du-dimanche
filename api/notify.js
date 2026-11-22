// Notifications sur les téléphones (Web Push)
// Appelé par l'appli après une action : nouvelle inscription, convocation, article, live…
import * as webpushNs from 'web-push'
const webpush = webpushNs.default || webpushNs
import { createClient } from '@supabase/supabase-js'

const SB_URL = 'https://qxgyzxewzoqsrpgancul.supabase.co'
const VAPID_PUBLIC = 'BGb0TjUXfvETYZ79OUcVwiZ-UVxT0tQhKb7vfhsffaCtT95ctal7VIkM6WBHx1rDqmx74Bgqkre332EtlFYlLdo'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPrive = process.env.VAPID_PRIVATE_KEY
  if (!secret || !vapidPrive) return res.status(500).json({ ok: false, erreur: 'Variables manquantes sur Vercel' })
  webpush.setVapidDetails('mailto:mathias.dauve@gmail.com', VAPID_PUBLIC, vapidPrive)
  const admin = createClient(SB_URL, secret, { auth: { persistSession: false } })

  try {
    const jeton = (req.headers.authorization || '').replace(/^Bearer /, '')
    const { data: u } = await admin.auth.getUser(jeton)
    const moi = u && u.user && u.user.id
    if (!moi) return res.status(401).json({ ok: false })

    const corps = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { scope, id } = corps
    const titre = String(corps.title || 'Le Mercato du dimanche').slice(0, 80)
    const texte = String(corps.body || '').slice(0, 220)
    const lien = String(corps.url || '/').slice(0, 200)

    // Club concerné
    let club = id, equipe = null
    if (scope === 'team') {
      const { data: t } = await admin.from('docs').select('data').eq('col', 'teams').eq('id', id).maybeSingle()
      if (!t) return res.status(404).json({ ok: false })
      club = t.data.club; equipe = id
    }
    if (scope === 'player') club = String(corps.club || '')
    // L'expéditeur doit appartenir au club (même en attente : nouvelle inscription)
    const { data: mesAdh } = await admin.from('memberships').select('id').eq('user_id', moi).eq('club_id', club).limit(1)
    if (!mesAdh || !mesAdh.length) return res.status(403).json({ ok: false })

    // Destinataires
    let q = admin.from('memberships').select('user_id, role, team_id').eq('club_id', club).eq('statut', 'actif')
    if (scope === 'staff') q = q.in('role', ['responsable', 'coach', 'adjoint'])
    if (scope === 'player') q = q.eq('player_id', id)
    const { data: adh } = await q
    const dest = [...new Set((adh || [])
      .filter((m) => scope !== 'team' || m.team_id === equipe || m.role === 'responsable')
      .map((m) => m.user_id))].filter((x) => x !== moi)
    if (!dest.length) return res.status(200).json({ ok: true, envoyes: 0 })

    const { data: abos } = await admin.from('push_subs').select('endpoint, sub').in('user_id', dest)
    const charge = JSON.stringify({ title: titre, body: texte, url: lien })
    let envoyes = 0
    await Promise.all((abos || []).map(async (a) => {
      try { await webpush.sendNotification(a.sub, charge, { TTL: 86400 }); envoyes++ }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await admin.from('push_subs').delete().eq('endpoint', a.endpoint) }
    }))
    return res.status(200).json({ ok: true, envoyes })
  } catch (e) {
    return res.status(500).json({ ok: false, erreur: String(e && e.message || e) })
  }
}
