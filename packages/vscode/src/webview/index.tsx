import React from 'react';
import { createRoot } from 'react-dom/client';
import AppWithAdapter from './AppWithAdapter';
// CSS is handled by Tailwind CLI build process
// import './index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<AppWithAdapter />);
}
