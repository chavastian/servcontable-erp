import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { instalarInterceptorHttp } from './services/interceptorHttp'

// Envuelve fetch una sola vez: los 43 servicios llaman a fetch directamente y
// asi el manejo de suscripcion vencida y sesion cerrada queda en un solo lugar.
instalarInterceptorHttp()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
