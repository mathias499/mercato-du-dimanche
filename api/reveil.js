// Réveil quotidien : une petite lecture dans la base pour que Supabase
// ne mette jamais le projet en pause (formule gratuite : pause après 7 jours sans activité).
const SB_URL = 'https://qxgyzxewzoqsrpgancul.supabase.co'
const SB_KEY = 'sb_publishable_p3VJPAgj6l782ZyT_muDfQ_pWuoTpnf'

export default async function handler(req, res) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/docs?select=col&limit=1`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    })
    res.status(200).json({ ok: r.ok, statut: r.status, date: new Date().toISOString() })
  } catch (e) {
    res.status(500).json({ ok: false, erreur: String(e) })
  }
}
