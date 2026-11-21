import { useEffect, useRef } from 'react'
import { demarrerMercato } from './legacy/mercato.js'

// L'appli complète (version 1) est rendue dans #app.
// Les écrans seront migrés un par un en composants React lors du branchement à Supabase.
export default function App() {
  const lance = useRef(false)
  useEffect(() => {
    if (lance.current) return // évite le double démarrage du mode StrictMode en développement
    lance.current = true
    demarrerMercato()
  }, [])
  return <div className="app" id="app" />
}
