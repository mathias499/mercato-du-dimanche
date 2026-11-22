// Connexion à Supabase : comptes, données partagées, temps réel, photos
import { createClient } from '@supabase/supabase-js'

export const SB_URL = 'https://qxgyzxewzoqsrpgancul.supabase.co'
export const SB_KEY = 'sb_publishable_p3VJPAgj6l782ZyT_muDfQ_pWuoTpnf'

export const sb = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// Collections (tableaux d'objets avec un id) et dictionnaires synchronisés
export const COLS = ['clubs','teams','players','matches','convs','tournaments','posts','sponsors','forum','items','collectes','trainings','parents','events','articles','helps','annonces','leagues','notifs','comments','treso','privs','seances','support']
export const MAPS = ['compo','chats','trainRsvp','trainState','carpool','licPrice']

// Envoi des photos (images en base64 dans les données) vers le stockage Supabase
export async function envoyerPhotos(obj, uid) {
  let change = false
  const visiter = async (o) => {
    if (!o || typeof o !== 'object') return
    for (const k of Object.keys(o)) {
      const v = o[k]
      if (typeof v === 'string' && v.startsWith('data:image/') && v.length > 200) {
        try {
          const blob = await (await fetch(v)).blob()
          const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
          const chemin = `${uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          const { error } = await sb.storage.from('photos').upload(chemin, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' })
          if (!error) { o[k] = sb.storage.from('photos').getPublicUrl(chemin).data.publicUrl; change = true }
        } catch (e) { /* on réessaiera à la prochaine synchro */ }
      } else if (v && typeof v === 'object') await visiter(v)
    }
  }
  await visiter(obj)
  return change
}
