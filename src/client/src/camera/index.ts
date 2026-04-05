/**
 * Camera system — KSP-style chase, free, and orbital cameras
 */

import * as THREE from 'three';

export enum CameraMode {
  Chase = 'chase',
  Free = 'free',
  Orbital = 'orbital',
}

export class CameraSystem {
  private camera: THREE.PerspectiveCamera;
  private mode: CameraMode = CameraMode.Free;
  
  // Chase camera params
  private chaseDistance = 30;
  private chaseHeight = 15;
  private chaseSmoothness = 5;
  
  // Free camera params
  private orbitAngleX = 0;
  private orbitAngleY = 0.3;
  private orbitDistance = 40;
  
  // Map camera params
  private mapDistance = 30000;
  
  // Smoothed values
  private currentPos = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  getMode(): CameraMode { return this.mode; }

  setMode(mode: CameraMode) {
    this.mode = mode;
  }

  cycleMode(): CameraMode {
    switch (this.mode) {
      case CameraMode.Chase: this.mode = CameraMode.Free; break;
      case CameraMode.Free: this.mode = CameraMode.Orbital; break;
      case CameraMode.Orbital: this.mode = CameraMode.Chase; break;
    }
    return this.mode;
  }

  /**
   * Update camera based on target (player) position and orientation
   */
  update(
    targetPosition: THREE.Vector3,
    targetOrientation: THREE.Quaternion,
    targetVelocity: THREE.Vector3,
    orbitDeltaX: number,
    orbitDeltaY: number,
    zoomDelta: number,
    dt: number,
  ) {
    // Apply mouse orbit input
    this.orbitAngleX -= orbitDeltaX * 0.005;
    this.orbitAngleY -= orbitDeltaY * 0.005;
    this.orbitAngleY = Math.max(-1.2, Math.min(1.2, this.orbitAngleY));

    // Apply zoom
    if (this.mode === CameraMode.Chase || this.mode === CameraMode.Free) {
      this.orbitDistance *= 1 + zoomDelta * 0.1;
      this.orbitDistance = Math.max(10, Math.min(200, this.orbitDistance));
    } else {
      this.mapDistance *= 1 + zoomDelta * 0.1;
      this.mapDistance = Math.max(5000, Math.min(100000, this.mapDistance));
    }

    switch (this.mode) {
      case CameraMode.Chase:
        this.updateChase(targetPosition, targetOrientation, dt);
        break;
      case CameraMode.Free:
        this.updateFree(targetPosition, dt);
        break;
      case CameraMode.Orbital:
        this.updateOrbital(targetPosition, dt);
        break;
    }
  }

  /**
   * Chase camera: follows behind the lander, aligned with orientation
   */
  private updateChase(pos: THREE.Vector3, orient: THREE.Quaternion, dt: number) {
    // Camera offset in local space: behind and above
    const localOffset = new THREE.Vector3(0, this.chaseHeight, -this.chaseDistance);
    
    // Transform to world space
    const worldOffset = localOffset.applyQuaternion(orient);
    const desiredPos = pos.clone().add(worldOffset);

    // Smooth follow
    const t = 1 - Math.pow(0.01, dt);
    this.currentPos.lerp(desiredPos, t);
    this.currentLookAt.lerp(pos, t);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Free camera: orbits freely around the lander
   */
  private updateFree(pos: THREE.Vector3, dt: number) {
    const distance = this.orbitDistance;
    
    const offset = new THREE.Vector3(
      Math.sin(this.orbitAngleX) * Math.cos(this.orbitAngleY) * distance,
      Math.sin(this.orbitAngleY) * distance,
      Math.cos(this.orbitAngleX) * Math.cos(this.orbitAngleY) * distance,
    );

    const desiredPos = pos.clone().add(offset);

    const t = 1 - Math.pow(0.05, dt);
    this.currentPos.lerp(desiredPos, t);
    this.currentLookAt.lerp(pos, t);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Orbital/map camera: far out, shows Moon curvature
   */
  private updateOrbital(pos: THREE.Vector3, dt: number) {
    const distance = this.mapDistance;
    
    const offset = new THREE.Vector3(
      Math.sin(this.orbitAngleX) * Math.cos(this.orbitAngleY) * distance,
      Math.sin(this.orbitAngleY) * distance,
      Math.cos(this.orbitAngleX) * Math.cos(this.orbitAngleY) * distance,
    );

    const desiredPos = pos.clone().add(offset);

    const t = 1 - Math.pow(0.1, dt);
    this.currentPos.lerp(desiredPos, t);
    this.currentLookAt.lerp(pos, t);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Snap camera to target immediately (no smoothing)
   */
  snapTo(position: THREE.Vector3) {
    this.currentPos.copy(position);
    this.currentLookAt.copy(new THREE.Vector3(0, 0, 0)); // Look at Moon center
    
    // Offset camera
    const offset = new THREE.Vector3(0, 30, 50);
    this.currentPos.add(offset);
    
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}
