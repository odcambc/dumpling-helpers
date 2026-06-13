import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import OligoValidatorPage from './pages/OligoValidatorPage.tsx'
import LibraryCompositionPage from './pages/LibraryCompositionPage.tsx'
import SequencingPlanPage from './pages/SequencingPlanPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/oligo-validator" element={<OligoValidatorPage />} />
        <Route path="/library-composition" element={<LibraryCompositionPage />} />
        <Route path="/sequencing-plan" element={<SequencingPlanPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
