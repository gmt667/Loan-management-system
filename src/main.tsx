import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from 'next-themes';

const SafeThemeProvider = ThemeProvider as any;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SafeThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      <App />
    </SafeThemeProvider>
  </StrictMode>,
);
