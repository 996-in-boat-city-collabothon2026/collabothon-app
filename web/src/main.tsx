import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { LangProvider } from './i18n';
import { applyComfort, loadComfort } from './lib/comfort';
import './index.css';

// Text size + contrast before the first paint, so the page never flashes at the wrong size.
applyComfort(loadComfort());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LangProvider>
  </StrictMode>,
);
