// Plan B automatique : appelé environ une fois par heure (crons Vercel, de 6 h à 21 h).
// Pour chaque entraînement du jour qui a un plan B et l'option « automatique » :
//  - environ 3 h avant la séance, si le cumul de pluie de la journée (tombée + prévue
//    jusqu'à la séance) atteint le seuil, la séance passe en plan B et l'équipe est prévenue ;
//  - plus tôt dans la journée, seulement si la pluie DÉJÀ tombée atteint le seuil (c'est sûr) ;
//  - sinon rien n'est envoyé.
// Si le coach revient au plan normal, l'appli ne rebascule pas une deuxième fois.
// Essai sans rien changer ni envoyer : /api/planb?essai=1
import * as webpushNs from 'web-push'
const webpush = webpushNs.default || webpushNs
import { createClient } from '@supabase/supabase-js'

const SB_URL = 'https://qxgyzxewzoqsrpgancul.supabase.co'
const VAPID_PUBLIC = 'BGb0TjUXfvETYZ79OUcVwiZ-UVxT0tQhKb7vfhsffaCtT95ctal7VIkM6WBHx1rDqmx74Bgqkre332EtlFYlLdo'
const SEUIL_MM = 5          // « moyen » : une bonne pluie dans la journée
const FENETRE_MIN = 210     // décision à partir de 3 h 30 avant la séance
const TOT_MIN = 600         // avant ça (jusqu'à 10 h avant), seulement si la pluie est déjà tombée

function maintenantParis() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  const jour = `${p.year}-${p.month}-${p.day}`
  return { jour, heure: Number(p.hour), minutes: Number(p.hour) * 60 + Number(p.minute), dow: new Date(jour + 'T12:00:00Z').getUTCDay() }
}

export default async function handler(req, res) {
  const essai = !!(req.query && req.query.essai)
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPrive = process.env.VAPID_PRIVATE_KEY
  if (!secret || !vapidPrive) return res.status(500).json({ ok: false, erreur: 'Variables manquantes sur Vercel' })
  try {
    webpush.setVapidDetails('mailto:mathias.dauve@gmail.com', VAPID_PUBLIC, vapidPrive)
    const admin = createClient(SB_URL, secret, { auth: { persistSession: false } })
    const now = maintenantParis()
    const bilan = { ok: true, jour: now.jour, heure: now.heure, essai, seances: [] }

    const { data: trDocs } = await admin.from('docs').select('id,data').eq('col', 'trainings')
    const duJour = (trDocs || []).map((d) => d.data || {}).filter((tr) => tr.planB && tr.autoB && tr.time && (tr.date ? tr.date === now.jour : Number(tr.dow) === now.dow))
    if (!duJour.length) return res.status(200).json(bilan)

    const { data: eqDocs } = await admin.from('docs').select('id,data').eq('col', 'teams')
    const equipes = new Map((eqDocs || []).map((d) => [d.id, d.data || {}]))
    const meteoCache = new Map()

    for (const tr of duJour) {
      const cle = tr.id + '@' + now.jour
      const ligne = { cle, decision: 'rien' }
      bilan.seances.push(ligne)
      const eq = equipes.get(tr.team); if (!eq || eq.ext) { ligne.decision = 'équipe inconnue'; continue }
      const [hh, mm] = String(tr.time).split(':').map(Number)
      const avant = hh * 60 + (mm || 0) - now.minutes
      ligne.minutesAvant = avant
      if (avant <= 0 || avant > TOT_MIN) { ligne.decision = 'hors créneau'; continue }

      const { data: etat } = await admin.from('docs').select('data').eq('col', 'trainState').eq('id', cle).maybeSingle()
      const st = (etat && etat.data && etat.data.v) || 'A'
      if (st !== 'A') { ligne.decision = 'déjà ' + (st === 'B' ? 'en plan B' : 'annulée'); continue }

      const { data: clubDoc } = await admin.from('docs').select('data').eq('col', 'clubs').eq('id', eq.club).maybeSingle()
      const club = (clubDoc && clubDoc.data) || {}
      const terrain = (club.fields || []).find((f) => f.id === tr.field) || {}
      const terrainB = (club.fields || []).find((f) => f.id === tr.planB.field) || {}
      if (terrain.surface === 'Salle (gymnase)') { ligne.decision = 'déjà en salle'; continue }
      if (!club.lat || !club.lng) { ligne.decision = 'ville du club sans coordonnées'; continue }

      const k = Number(club.lat).toFixed(2) + ',' + Number(club.lng).toFixed(2)
      if (!meteoCache.has(k)) {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${club.lat}&longitude=${club.lng}&hourly=precipitation&timezone=Europe%2FParis&forecast_days=1`)
        meteoCache.set(k, r.ok ? await r.json() : null)
      }
      const h = meteoCache.get(k) && meteoCache.get(k).hourly
      if (!h || !h.time || !h.precipitation) { ligne.decision = 'météo indisponible'; continue }
      let tombee = 0, prevue = 0
      h.time.forEach((t, i) => {
        if (String(t).slice(0, 10) !== now.jour) return
        const heure = Number(String(t).slice(11, 13)); const v = Number(h.precipitation[i]) || 0
        if (heure < now.heure) tombee += v
        if (heure <= hh + 1) prevue += v
      })
      ligne.tombee = Math.round(tombee * 10) / 10; ligne.prevue = Math.round(prevue * 10) / 10
      const bascule = avant <= FENETRE_MIN ? prevue >= SEUIL_MM : tombee >= SEUIL_MM
      if (!bascule) { ligne.decision = avant <= FENETRE_MIN ? 'plan normal maintenu' : 'trop tôt pour décider'; continue }
      ligne.decision = 'plan B'
      if (essai) continue

      // Une seule bascule automatique par séance : si le coach revient au plan normal, on n'y touche plus
      const { error: deja } = await admin.from('docs').insert({ col: 'rappels', id: 'pb:' + cle, club_id: eq.club, visibilite: 'prive', data: { at: Date.now() } })
      if (deja && String(deja.code) === '23505') { ligne.decision = 'déjà basculée une fois'; continue }
      if (deja) ligne.marque = String(deja.message || deja.code)

      const { error: errEtat } = await admin.from('docs').upsert({ col: 'trainState', id: cle, club_id: eq.club, club2: null, visibilite: 'club', data: { v: 'B' } }, { onConflict: 'col,id' })
      if (errEtat) { ligne.decision = 'échec : ' + String(errEtat.message || errEtat.code); continue }

      const { data: adh } = await admin.from('memberships').select('user_id, role, team_id').eq('club_id', eq.club).eq('statut', 'actif')
      const dest = [...new Set((adh || []).filter((m) => m.role !== 'supporter' && (m.team_id === tr.team || m.role === 'responsable')).map((m) => m.user_id))]
      ligne.envoyes = 0
      if (dest.length) {
        const { data: abos } = await admin.from('push_subs').select('endpoint, sub').in('user_id', dest)
        const quoi = tr.label || 'L’entraînement'
        const charge = JSON.stringify({
          title: '🌧 Plan B · ' + (club.name || 'Entraînement'),
          body: `Trop de pluie (${String(ligne.prevue).replace('.', ',')} mm) : ${quoi} d’aujourd’hui passe au plan B, ${terrainB.name || 'autre terrain'} à ${String(tr.planB.time).replace(':', 'h')}.`,
          url: '/?v=home',
        })
        await Promise.all((abos || []).map(async (a) => {
          try { await webpush.sendNotification(a.sub, charge, { TTL: 14400 }); ligne.envoyes++ }
          catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await admin.from('push_subs').delete().eq('endpoint', a.endpoint) }
        }))
      }
    }
    return res.status(200).json(bilan)
  } catch (e) {
    return res.status(500).json({ ok: false, erreur: String(e && e.message || e) })
  }
}
