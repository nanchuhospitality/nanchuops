import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Prevent scroll (mouse wheel) from changing number input values
document.addEventListener('wheel', (e) => {
  if (e.target.matches?.('input[type="number"]')) {
    e.preventDefault();
  }
}, { passive: false });

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
