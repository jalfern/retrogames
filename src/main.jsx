import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline shell (#433): register the /retrogames-scoped service worker in prod
// only — in dev it would fight Vite's HMR. BASE_URL is '/retrogames/', so this
// registers /retrogames/sw.js and the SW inherits the /retrogames/ scope.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
