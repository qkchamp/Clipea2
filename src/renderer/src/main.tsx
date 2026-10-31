import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import { getT } from '@shared/i18n'
import { followLanguageSetting } from '@features/settings/ui/settingsStore'
import { App } from './App'
import './styles/global.css'

followLanguageSetting()

const root = document.getElementById('root')
if (!root) throw new Error(getT().app.missingRoot)

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
