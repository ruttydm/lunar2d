/**
 * Lunar3D — Client Entry Point
 * 
 * Loads the WASM physics engine, initializes the renderer,
 * sets up the game loop, and connects to the server.
 */

import { Game } from './src/game';

async function main() {
  const loadingStatus = document.getElementById('loading-status')!;
  loadingStatus.textContent = 'Loading physics engine (Rust/WASM)...';

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
