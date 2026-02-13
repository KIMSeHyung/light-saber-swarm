import './style.css';
import { game } from './game/game';

const app = document.getElementById('app');
if (!app) {
  throw new Error('Missing #app root element');
}

app.appendChild(game.canvas);

window.addEventListener('beforeunload', () => {
  game.destroy(true);
});
