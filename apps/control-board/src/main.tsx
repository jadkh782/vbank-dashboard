import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4/wght.css'
import '@vbank/ui/styles/tokens.css'
import '@vbank/ui/styles/base.css'
import '@vbank/ui/styles/chrome.css'
import '@vbank/ui/styles/forms.css'
import '@vbank/ui/styles/drawer.css'
import './styles/control-board.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
