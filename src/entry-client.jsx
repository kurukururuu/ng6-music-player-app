import './index.css';
import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import App from './App.jsx';

hydrateRoot(
  document.getElementById('app'),
  <StrictMode>
    <App />
  </StrictMode>
);
