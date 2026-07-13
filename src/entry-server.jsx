import './index.css';
import { renderToString } from 'react-dom/server';
import App from './App.jsx';

export function render(_url) {
  return renderToString(<App />);
}
