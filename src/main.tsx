import { createRoot } from 'react-dom/client';
import App from './App';
import { installLinkHandler } from './platform';
import './styles.css';

installLinkHandler();
createRoot(document.getElementById('root')!).render(<App />);
