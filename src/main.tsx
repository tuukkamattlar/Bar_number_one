import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { SongsPage } from './pages/SongsPage';
import { GigsPage } from './pages/GigsPage';
import { GigEditorPage } from './pages/GigEditorPage';
import { ShowPage } from './pages/ShowPage';
import { InstrumentsPage } from './pages/InstrumentsPage';
import { PracticePage } from './pages/PracticePage';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/gigs" replace />} />
          <Route path="songs" element={<SongsPage />} />
          <Route path="gigs" element={<GigsPage />} />
          <Route path="gigs/:id" element={<GigEditorPage />} />
          <Route path="instruments" element={<InstrumentsPage />} />
          <Route path="practice" element={<PracticePage />} />
        </Route>
        <Route path="gigs/:id/show" element={<ShowPage />} />
        <Route path="practice/:songId" element={<ShowPage />} />
        <Route path="*" element={<Navigate to="/gigs" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
