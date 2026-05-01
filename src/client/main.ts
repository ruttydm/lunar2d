/**
 * Lunar2D - Client Entry Point
 * 
 * Initializes the 2D lander game loop.
 */

import { Game } from './src/game';

async function main() {
  const loadingStatus = document.getElementById('loading-status')!;
  loadingStatus.textContent = 'Preparing Lunar2D...';

  try {
    const game = new Game();
    await game.init(loadingStatus);

    // Hide loading, show game
    document.getElementById('loading')!.style.display = 'none';
    document.getElementById('hud')!.style.display = 'block';

    // Start game loop
    game.start();
  } catch (err) {
    loadingStatus.textContent = `Error: ${err}`;
    console.error('Failed to initialize game:', err);
  }
}

main();
