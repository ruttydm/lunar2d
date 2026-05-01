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
  brakeAssist: boolean;
  
  // Camera
  cameraOrbitX: number;
  cameraOrbitY: number;
  cameraPanX: number;
  cameraPanY: number;
  cameraZoom: number;
  cameraCycle: boolean;
  mapView: boolean;
  targetCycle: boolean;
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
    brakeAssist: false,
    cameraOrbitX: 0,
    cameraOrbitY: 0,
    cameraPanX: 0,
    cameraPanY: 0,
    cameraZoom: 0,
    cameraCycle: false,
    mapView: false,
    targetCycle: false,
  };

  // Mouse state
  private mouseX = 0;
  private mouseY = 0;
  private mouseDX = 0;
  private mouseDY = 0;
  private mouseDown = false;
  private rightMouseDown = false;
  private middleMouseDown = false;
  private touchPitch = 0;
  private touchYaw = 0;
  private touchCameraX = 0;
  private touchCameraY = 0;
  private touchFire = false;
  private touchBoost = false;
  private touchBrake = false;

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
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      
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
          this.state.cameraCycle = true;
          break;
        case 'KeyB': // Brake assist
          break;
        case 'Tab':
          this.state.targetCycle = true;
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
      if (e.button === 1) this.middleMouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 1) this.middleMouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.rightMouseDown) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.middleMouseDown) {
        this.state.cameraPanX += e.movementX;
        this.state.cameraPanY += e.movementY;
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      this.state.cameraZoom += e.deltaY * 0.01;
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private setupTouch() {
    this.bindTouchStick('touch-stick-flight', (x, y) => {
      this.touchYaw = x;
      this.touchPitch = y;
    });
    this.bindTouchStick('touch-stick-camera', (x, y) => {
      this.touchCameraX = x * 7;
      this.touchCameraY = y * 7;
    });

    const throttle = document.getElementById('touch-throttle');
    const setThrottle = (clientY: number) => {
      if (!throttle) return;
      const rect = throttle.getBoundingClientRect();
      this.state.throttle = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    };
    throttle?.addEventListener('pointerdown', (event) => {
      throttle.setPointerCapture(event.pointerId);
      setThrottle(event.clientY);
    });
    throttle?.addEventListener('pointermove', (event) => {
      if ((event.buttons & 1) === 1) setThrottle(event.clientY);
    });

    this.bindHoldButton('touch-fire', (pressed) => this.touchFire = pressed);
    this.bindHoldButton('touch-boost', (pressed) => this.touchBoost = pressed);
    this.bindHoldButton('touch-brake', (pressed) => this.touchBrake = pressed);
    document.getElementById('touch-sas')?.addEventListener('click', () => {
      this.state.sasMode = (this.state.sasMode + 1) % 7;
    });
    document.getElementById('touch-rcs')?.addEventListener('click', () => {
      this.state.rcsMode = !this.state.rcsMode;
    });
  }

  private setupGamepad() {
    // Gamepads are polled in update().
  }

  private bindTouchStick(id: string, update: (x: number, y: number) => void) {
    const el = document.getElementById(id);
    const knob = el?.querySelector<HTMLElement>('.touch-stick-knob');
    if (!el || !knob) return;

    const reset = () => {
      knob.style.transform = 'translate(-50%, -50%)';
      update(0, 0);
    };
    const move = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const radius = rect.width * 0.42;
      let x = clientX - (rect.left + rect.width / 2);
      let y = clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(x, y);
      if (len > radius) {
        x = x / len * radius;
        y = y / len * radius;
      }
      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      update(x / radius, y / radius);
    };

    el.addEventListener('pointerdown', (event) => {
      el.setPointerCapture(event.pointerId);
      move(event.clientX, event.clientY);
    });
    el.addEventListener('pointermove', (event) => {
      if ((event.buttons & 1) === 1) move(event.clientX, event.clientY);
    });
    el.addEventListener('pointerup', reset);
    el.addEventListener('pointercancel', reset);
  }

  private bindHoldButton(id: string, update: (pressed: boolean) => void) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (event) => {
      el.setPointerCapture(event.pointerId);
      update(true);
    });
    el.addEventListener('pointerup', () => update(false));
    el.addEventListener('pointercancel', () => update(false));
  }

  /**
   * Update input state — call once per frame
   */
  update() {
    const k = this.keys;
    this.state.fire = false;
    this.state.boost = false;
    this.state.brakeAssist = false;
    
    // Throttle (Shift = up, Ctrl/C = down, persists)
    if (k.has('ShiftLeft') || k.has('ShiftRight')) {
      this.state.throttle = Math.min(1.0, this.state.throttle + 0.02);
    }
    if (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC')) {
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

    if (Math.abs(this.touchPitch) > 0.01 || Math.abs(this.touchYaw) > 0.01) {
      if (this.state.rcsMode) {
        this.state.translateX = this.touchYaw;
        this.state.translateZ = this.touchPitch;
      } else {
        this.state.pitch = this.touchPitch;
        this.state.yaw = this.touchYaw;
      }
    }

    this.applyGamepadState();

    // Actions
    this.state.fire = this.mouseDown || this.state.fire;
    this.state.boost = k.has('Space') || this.state.boost;
    this.state.brakeAssist = k.has('KeyB') || this.state.brakeAssist;
    this.state.fire = this.state.fire || this.touchFire;
    this.state.boost = this.state.boost || this.touchBoost;
    this.state.brakeAssist = this.state.brakeAssist || this.touchBrake;

    // Camera orbit from mouse drag
    this.state.cameraOrbitX = this.mouseDX;
    this.state.cameraOrbitY = this.mouseDY;
    this.state.cameraOrbitX += this.touchCameraX;
    this.state.cameraOrbitY += this.touchCameraY;
    this.touchCameraX *= 0.84;
    this.touchCameraY *= 0.84;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  private applyGamepadState() {
    const gamepads = navigator.getGamepads?.() ?? [];
    const pad = Array.from(gamepads).find((candidate) => candidate && candidate.connected);
    if (!pad) return;

    const deadzone = (value: number) => Math.abs(value) < 0.12 ? 0 : value;
    const leftX = deadzone(pad.axes[0] ?? 0);
    const leftY = deadzone(pad.axes[1] ?? 0);
    const rightX = deadzone(pad.axes[2] ?? 0);
    const rightY = deadzone(pad.axes[3] ?? 0);

    if (!this.state.rcsMode) {
      this.state.yaw = leftX;
      this.state.pitch = leftY;
    } else {
      this.state.translateX = leftX;
      this.state.translateZ = leftY;
    }

    this.state.cameraOrbitX += rightX * 8;
    this.state.cameraOrbitY += rightY * 8;

    const leftTrigger = pad.buttons[6]?.value ?? 0;
    const rightTrigger = pad.buttons[7]?.value ?? 0;
    this.state.throttle = Math.max(0, Math.min(1, this.state.throttle + rightTrigger * 0.025 - leftTrigger * 0.025));
    this.state.roll = (pad.buttons[5]?.pressed ? 1 : 0) - (pad.buttons[4]?.pressed ? 1 : 0);
    this.state.boost = pad.buttons[0]?.pressed ?? false;
    this.state.fire = this.state.fire || (pad.buttons[2]?.pressed ?? false);
    this.state.brakeAssist = this.state.brakeAssist || (pad.buttons[3]?.pressed ?? false);
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
