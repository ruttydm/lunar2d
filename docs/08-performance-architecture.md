# Performance Architecture

The current performance target is a stable Canvas 2D game loop with predictable physics cost.

## Current Priorities

- Keep physics in fixed steps.
- Keep pure math in tested helper modules.
- Cache terrain samples per body instead of recalculating every query.
- Avoid unnecessary DOM writes outside HUD update.
- Keep multiplayer sends throttled to 15 Hz.
- Keep particles bounded by lifetime.

## Renderer Options

Canvas 2D is acceptable for the current game because the scene is mostly simple shapes, terrain paths, projectiles, particles, HUD canvases, and text.

PixiJS/WebGL becomes worth it if we need:

- thousands of particles;
- shader glow and bloom;
- sprite batching;
- texture atlases;
- smoother minimap/orbital-map composition;
- stronger mobile GPU performance.

Do not move rendering to PixiJS until `game.ts` has a renderer boundary. The next renderer-safe shape is:

```ts
interface Renderer {
  resize(width: number, height: number): void;
  render(snapshot: GameSnapshot): void;
}
```

That keeps future Canvas and Pixi renderers interchangeable.
