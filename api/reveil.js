// Passage quotidien (cron Vercel, chaque jour vers 18 h en hiver, 19 h en été) :
// 1. une petite lecture dans la base pour que Supabase ne mette jamais le projet en pause
//    (formule gratuite : pause après 7 jours sans activité) ;
// 2. les rappels automatiques : 4 jours et 2 jours avant la clôture des réponses,
//    une notification à ceux qui n'ont pas encore répondu (match entre nous, entraînement
//    avec date limite, prochain match de l'équipe).
// Essai sans rien envoyer : /api/reveil?essai=1 (affiche seulement des compteurs).
import * as webpushNs from 'web-push'
const webpush = webpushNs.default || webpushNs
import { createClient } from '@supabase/supabase-js'

const SB_URL = 'https://qxgyzxewzoqsrpgancul.supabase.co'
const SB_KEY = 'sb_publishable_p3VJPAgj6l782ZyT_muDfQ_pWuoTpnf'
const VAPID_PUBLIC = 'BGb0TjUXfvETYZ79OUcVwiZ-UVxT0tQhKb7vfhsffaCtT95ctal7VIkM6WBHx1rDqmx74Bgqkre332EtlFYlLdo'
const JOURS_AVANT = [4, 2]

const aujourdhuiParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const plusJours = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const jourLong = (iso) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00Z'))

async function rappels(essai) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPrive = process.env.VAPID_PRIVATE_KEY
  if (!secret || !vapidPrive) return { fait: false, raison: 'Variables manquantes sur Vercel' }
  webpush.setVapidDetails('mailto:mathias.dauve@gmail.com', VAPID_PUBLIC, vapidPrive)
  const admin = createClient(SB_URL, secret, { auth: { persistSession: false } })
  const jour = aujourdhuiParis()
  const bilan = { fait: true, jour, essai: !!essai, rappels: [] }

  // Équipes (pour connaître le club) et joueurs
  const { data: eqDocs } = await admin.from('docs').select('id,data').eq('col', 'teams')
  const equipes = new Map((eqDocs || []).map((d) => [d.id, d.data || {}]))
  const joueursDe = async (tid) => {
    const { data } = await admin.from('docs').select('id,data').eq('col', 'players').eq('data->>team', tid)
    return (data || []).map((d) => d.data || { id: d.id })
  }

  // Envoi à une liste de joueurs (seulement ceux qui ont un compte et les notifications activées)
  const envoyer = async (cle, club, pids, titre, texte) => {
    const ligne = { cle, sansReponse: pids.length, envoyes: 0 }
    bilan.rappels.push(ligne)
    if (!pids.length) return
    if (essai) { ligne.essai = true; return }
    // Une seule fois par jour et par rendez-vous, même si ce passage est appelé plusieurs fois
    const { error: deja } = await admin.from('docs').insert({ col: 'rappels', id: cle + '@' + jour, club_id: club, visibilite: 'prive', data: { at: Date.now() } })
    if (deja && String(deja.code) === '23505') { ligne.dejaFait = true; return }
    if (deja) ligne.marque = String(deja.message || deja.code)
    const { data: adh } = await admin.from('memberships').select('user_id').eq('club_id', club).eq('statut', 'actif').in('player_id', pids)
    const dest = [...new Set((adh || []).map((m) => m.user_id))]
    if (!dest.length) return
    const { data: abos } = await admin.from('push_subs').select('endpoint, sub').in('user_id', dest)
    const charge = JSON.stringify({ title: titre, body: texte, url: '/?v=home' })
    await Promise.all((abos || []).map(async (a) => {
      try { await webpush.sendNotification(a.sub, charge, { TTL: 86400 }); ligne.envoyes++ }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await admin.from('push_subs').delete().eq('endpoint', a.endpoint) }
    }))
  }

  // 1. Matchs entre nous et entraînements avec une date limite de réponse
  const { data: trDocs } = await admin.from('docs').select('id,data').eq('col', 'trainings')
  for (const d of trDocs || []) {
    const tr = d.data || {}
    if (!tr.date || tr.date < jour) continue
    if (!tr.label && tr.lim == null) continue
    const cloture = plusJours(tr.date, -(Number(tr.lim) || 0))
    const n = JOURS_AVANT.find((k) => plusJours(cloture, -k) === jour)
    if (n == null) continue
    const eq = equipes.get(tr.team); if (!eq || eq.ext) continue
    const cle = tr.id + '@' + tr.date
    const { data: etat } = await admin.from('docs').select('data').eq('col', 'trainState').eq('id', cle).maybeSingle()
    if (etat && etat.data && etat.data.v === 'X') continue
    const { data: rep } = await admin.from('docs').select('data').eq('col', 'trainRsvp').eq('id', cle).maybeSingle()
    const r = (rep && rep.data && rep.data.v) || {}
    const pids = (await joueursDe(tr.team)).filter((p) => !r[p.id]).map((p) => p.id)
    const nom = tr.label || 'Entraînement'
    await envoyer('tr:' + cle, eq.club, pids, '⏰ ' + nom + ' : ta réponse',
      nom + ' ' + jourLong(tr.date) + ' : tu n’as pas encore répondu. Dis « Je viens » ou « Je ne viens pas »' + (cloture === tr.date ? '.' : ', réponses closes ' + jourLong(cloture) + '.'))
  }

  // 2. Prochain match de chaque équipe : ceux qui n'ont pas répondu présent ou absent
  const { data: maDocs } = await admin.from('docs').select('id,data').eq('col', 'matches').eq('data->>status', 'accepted').gte('data->>date', jour)
  const matchs = (maDocs || []).map((d) => d.data || {}).filter((m) => m.date).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
  const vues = new Set()
  for (const m of matchs) {
    for (const tid of [m.from, m.to]) {
      const eq = equipes.get(tid); if (!eq || eq.ext || vues.has(tid)) continue
      vues.add(tid) // seul le prochain match de l'équipe compte : les réponses des joueurs portent sur lui
      const n = JOURS_AVANT.find((k) => plusJours(m.date, -k) === jour)
      if (n == null) continue
      const adv = equipes.get(tid === m.from ? m.to : m.from) || {}
      const { data: advClub } = adv.club ? await admin.from('docs').select('data').eq('col', 'clubs').eq('id', adv.club).maybeSingle() : { data: null }
      const contre = advClub && advClub.data && advClub.data.name ? ' contre ' + advClub.data.name : ''
      const pids = (await joueursDe(tid)).filter((p) => !['ok', 'no', 'inj'].includes(p.rep)).map((p) => p.id)
      await envoyer('ma:' + m.id + ':' + tid, eq.club, pids, '⏰ Match dans ' + n + ' jours : ta réponse',
        'Match' + contre + ' ' + jourLong(m.date) + ' : tu n’as pas encore répondu. Dis au coach si tu es présent ou absent.')
    }
  }
  return bilan
}

export default async function handler(req, res) {
  let base = null
  try {
    const r = await fetch(`${SB_URL}/rest/v1/docs?select=col&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    })
    base = { ok: r.ok, statut: r.status }
  } catch (e) {
    base = { ok: false, erreur: String(e) }
  }
  let rap = null
  try { rap = await rappels(req.query && req.query.essai) } catch (e) { rap = { fait: false, erreur: String(e && e.message || e) } }
  res.status(base.ok ? 200 : 500).json({ ok: base.ok, statut: base.statut, date: new Date().toISOString(), rappels: rap })
}
