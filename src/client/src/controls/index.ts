/**
 * Input manager — keyboard, mouse, touch, gamepad
 * KSP-inspired controls
 */

export interface InputState {
  // Throttle (0-1, persists like KSP)
  throttle: number;
  throttleUp: boolean;
  throttleDown: boolean;
  
  // Rotation
  pitch: number;   // -1 to 1
  yaw: number;     // -1 to 1
  roll: number;    // -1 to 1
  
  // RCS translation
  translateX: number;
  translateY: number;
  translateZ: number;
  
  // Modes
  sasMode: number;  // 0-6
  rcsMode: boolean;
  fineControl: boolean;
  
  // Actions
  fire: boolean;
  boost: boolean;
  
  // Camera
  cameraOrbitX: number;
  cameraOrbitY: number;
  cameraZoom: number;
  mapView: boolean;
}

export class InputManager {
  private keys: Set<string> = new Set();
  private canvas: HTMLCanvasElement;
  
  public state: InputState = {
    throttle: 0,
    throttleUp: false,
    throttleDown: false,
    pitch: 0,
    yaw: 0,
    roll: 0,
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    sasMode: 0,
    rcsMode: false,
    fineControl: false,
    fire: false,
    boost: false,
    cameraOrbitX: 0,
    cameraOrbitY: 0,
    cameraZoom: 0,
    mapView: false,
  };

  // Mouse state
  private mouseX = 0;
  private mouseY = 0;
  private mouseDX = 0;
  private mouseDY = 0;
  private mouseDown = false;
  private rightMouseDown = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupKeyboard();
    this.setupMouse();
    this.setupTouch();
    this.setupGamepad();
  }

  private setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      
      // Toggle keys
      switch (e.code) {
        case 'KeyT': // SAS toggle
          this.state.sasMode = (this.state.sasMode + 1) % 7;
          break;
        case 'KeyR': // RCS toggle
          this.state.rcsMode = !this.state.rcsMode;
          break;
        case 'KeyF': // Fine control
          this.state.fineControl = !this.state.fineControl;
          break;
        case 'KeyM': // Map view
          this.state.mapView = !this.state.mapView;
          break;
        case 'KeyZ': // Full throttle
          this.state.throttle = 1.0;
          break;
        case 'KeyX': // Cut throttle
          this.state.throttle = 0.0;
          break;
        case 'KeyV': // Camera mode
          // Handled in camera system
          break;
        case 'KeyB': // Brake assist
          // TODO: compute brake assist
          break;
      }
      
      e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      e.preventDefault();
    });
  }

  private setupMouse() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    this.canvas.addEventListener('wheel', (e) => {
      this.state.cameraZoom += e.deltaY * 0.01;
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private setupTouch() {
    // TODO: Virtual joysticks for mobile
  }

  private setupGamepad() {
    // TODO: Gamepad support via navigator.getGamepads()
  }

  /**
   * Update input state — call once per frame
   */
  update() {
    const k = this.keys;
    
    // Throttle (Shift = up, Ctrl = down, persists)
    if (k.has('ShiftLeft') || k.has('ShiftRight')) {
      this.state.throttle = Math.min(1.0, this.state.throttle + 0.02);
    }
    if (k.has('ControlLeft') || k.has('ControlRight')) {
      this.state.throttle = Math.max(0.0, this.state.throttle - 0.02);
    }

    // Rotation (WASD + QE) or (Arrow keys)
    let pitch = 0, yaw = 0, roll = 0;
    
    if (k.has('KeyW') || k.has('ArrowDown')) pitch = -1;  // Pitch down
    if (k.has('KeyS') || k.has('ArrowUp')) pitch = 1;     // Pitch up
    if (k.has('KeyA') || k.has('ArrowLeft')) yaw = -1;    // Yaw left
    if (k.has('KeyD') || k.has('ArrowRight')) yaw = 1;    // Yaw right
    if (k.has('KeyQ')) roll = -1;                          // Roll left
    if (k.has('KeyE')) roll = 1;                           // Roll right

    // RCS translation (when RCS mode is on, WASD becomes translation)
    if (this.state.rcsMode) {
      let tx = 0, ty = 0, tz = 0;
      if (k.has('KeyA')) tx = -1;
      if (k.has('KeyD')) tx = 1;
      if (k.has('ShiftLeft') || k.has('ShiftRight')) ty = 1;
      if (k.has('ControlLeft') || k.has('ControlRight')) ty = -1;
      if (k.has('KeyW')) tz = -1;
      if (k.has('KeyS')) tz = 1;
      this.state.translateX = tx;
      this.state.translateY = ty;
      this.state.translateZ = tz;
      // In RCS mode, only Q/E do rotation
      this.state.pitch = 0;
      this.state.yaw = 0;
      this.state.roll = roll;
    } else {
      this.state.pitch = pitch;
      this.state.yaw = yaw;
      this.state.roll = roll;
      this.state.translateX = 0;
      this.state.translateY = 0;
      this.state.translateZ = 0;
    }

    // Actions
    this.state.fire = this.mouseDown;
    this.state.boost = k.has('Space');

    // Camera orbit from mouse drag
    this.state.cameraOrbitX = this.mouseDX;
    this.state.cameraOrbitY = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  /**
   * Reset per-frame deltas
   */
  resetFrame() {
    // Camera deltas are consumed in update()
  }

  destroy() {
    // Clean up event listeners if needed
  }
}
