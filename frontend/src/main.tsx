import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import OligoValidatorPage from './pages/OligoValidatorPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/oligo-validator" element={<OligoValidatorPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
