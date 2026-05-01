/**
 * Camera system — KSP-style chase, free, and orbital cameras
 */

import * as THREE from 'three';

export enum CameraMode {
  Auto = 'auto',
  Locked = 'locked',
  Chase = 'chase',
  Free = 'free',
  Orbital = 'orbital',
}

export class CameraSystem {
  private camera: THREE.PerspectiveCamera;
  private mode: CameraMode = CameraMode.Auto;
  
  // Chase camera params
  private chaseDistance = 30;
  private chaseHeight = 15;
  private chaseSmoothness = 5;
  
  // Free camera params
  private orbitAngleX = 0;
  private orbitAngleY = 0.42;
  private orbitDistance = 92;
  private focusOffset = new THREE.Vector3();
  
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
      case CameraMode.Auto: this.mode = CameraMode.Free; break;
      case CameraMode.Free: this.mode = CameraMode.Orbital; break;
      case CameraMode.Orbital: this.mode = CameraMode.Chase; break;
      case CameraMode.Chase: this.mode = CameraMode.Locked; break;
      case CameraMode.Locked: this.mode = CameraMode.Auto; break;
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
    panDeltaX: number,
    panDeltaY: number,
    zoomDelta: number,
    dt: number,
    surfaceNormal?: THREE.Vector3,
    focusTarget?: THREE.Vector3,
  ) {
    // Apply mouse orbit input
    if (Math.abs(orbitDeltaX) > 0.01 || Math.abs(orbitDeltaY) > 0.01) {
      this.orbitAngleX -= orbitDeltaX * 0.005;
      this.orbitAngleY -= orbitDeltaY * 0.005;
    }
    this.orbitAngleY = Math.max(-1.2, Math.min(1.2, this.orbitAngleY));

    if (Math.abs(panDeltaX) > 0.01 || Math.abs(panDeltaY) > 0.01) {
      const normal = surfaceNormal?.clone().normalize() ?? targetPosition.clone().normalize();
      let east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal);
      if (east.lengthSq() < 0.01) east = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), normal);
      east.normalize();
      const north = new THREE.Vector3().crossVectors(normal, east).normalize();
      this.focusOffset.add(east.multiplyScalar(-panDeltaX * 0.45));
      this.focusOffset.add(north.multiplyScalar(panDeltaY * 0.45));
      this.focusOffset.clampLength(0, 260);
    }

    // Apply zoom
    if (this.mode === CameraMode.Chase || this.mode === CameraMode.Free) {
      this.orbitDistance *= 1 + zoomDelta * 0.1;
      this.orbitDistance = Math.max(10, Math.min(200, this.orbitDistance));
    } else {
      this.mapDistance *= 1 + zoomDelta * 0.1;
      this.mapDistance = Math.max(5000, Math.min(100000, this.mapDistance));
    }

    switch (this.mode) {
      case CameraMode.Auto:
        this.updateFree(targetPosition, dt, surfaceNormal, 0.035);
        break;
      case CameraMode.Locked:
        this.updateLocked(targetPosition, targetVelocity, dt, surfaceNormal, focusTarget);
        break;
      case CameraMode.Chase:
        this.updateChase(targetPosition, targetOrientation, targetVelocity, dt, surfaceNormal);
        break;
      case CameraMode.Free:
        this.updateFree(targetPosition, dt, surfaceNormal, 0.05);
        break;
      case CameraMode.Orbital:
        this.updateOrbital(targetPosition, dt);
        break;
    }
  }

  /**
   * Chase camera: follows behind the lander, aligned with orientation
   */
  private updateChase(pos: THREE.Vector3, orient: THREE.Quaternion, velocity: THREE.Vector3, dt: number, surfaceNormal?: THREE.Vector3) {
    // Camera offset in local space: behind and above
    const normal = surfaceNormal?.clone().normalize() ?? pos.clone().normalize();
    const localOffset = new THREE.Vector3(0, this.chaseHeight, -this.chaseDistance - Math.min(70, velocity.length() * 2));
    
    // Transform to world space
    const worldOffset = localOffset.applyQuaternion(orient);
    const desiredPos = pos.clone().add(worldOffset).add(normal.multiplyScalar(18));
    const desiredLookAt = pos.clone().sub((surfaceNormal?.clone().normalize() ?? pos.clone().normalize()).multiplyScalar(24));

    this.applyCameraTransform(desiredPos, desiredLookAt, dt, 0.01);
  }

  /**
   * Free camera: orbits freely around the lander
   */
  private updateFree(pos: THREE.Vector3, dt: number, surfaceNormal?: THREE.Vector3, smoothingBase = 0.05) {
    const distance = this.orbitDistance;
    const normal = surfaceNormal?.clone().normalize() ?? pos.clone().normalize();
    let east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal);
    if (east.lengthSq() < 0.01) east = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), normal);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(normal, east).normalize();
    const lateral = east.multiplyScalar(Math.sin(this.orbitAngleX))
      .add(north.multiplyScalar(Math.cos(this.orbitAngleX)))
      .multiplyScalar(Math.cos(this.orbitAngleY) * distance);
    const offset = normal.multiplyScalar(Math.sin(this.orbitAngleY) * distance + 24).add(lateral);
    const focus = pos.clone().add(this.focusOffset);
    const desiredPos = focus.clone().add(offset);
    const desiredLookAt = focus.clone();

    this.applyCameraTransform(desiredPos, desiredLookAt, dt, smoothingBase);
  }

  private updateLocked(
    pos: THREE.Vector3,
    velocity: THREE.Vector3,
    dt: number,
    surfaceNormal?: THREE.Vector3,
    focusTarget?: THREE.Vector3,
  ) {
    const normal = surfaceNormal?.clone().normalize() ?? pos.clone().normalize();
    const toTarget = focusTarget ? focusTarget.clone().sub(pos).normalize() : velocity.clone().normalize();
    const side = new THREE.Vector3().crossVectors(normal, toTarget).normalize();
    const desiredPos = pos.clone()
      .add(toTarget.multiplyScalar(-150))
      .add(normal.multiplyScalar(72))
      .add(side.multiplyScalar(28));
    const desiredLookAt = focusTarget ? pos.clone().lerp(focusTarget, 0.28) : pos.clone();
    this.applyCameraTransform(desiredPos, desiredLookAt, dt, 0.025);
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

  private applyCameraTransform(desiredPos: THREE.Vector3, desiredLookAt: THREE.Vector3, dt: number, smoothingBase: number) {
    const correctedPos = this.avoidTerrain(desiredPos);
    const t = 1 - Math.pow(smoothingBase, dt);
    this.currentPos.lerp(correctedPos, t);
    this.currentLookAt.lerp(desiredLookAt, t);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  private avoidTerrain(position: THREE.Vector3) {
    const altitude = position.length() - 10000;
    if (altitude >= 18) return position;
    return position.clone().normalize().multiplyScalar(10018);
  }

  /**
   * Snap camera to target immediately (no smoothing)
   */
  snapTo(position: THREE.Vector3, surfaceNormal?: THREE.Vector3) {
    this.currentPos.copy(position);
    const normal = surfaceNormal?.clone().normalize() ?? position.clone().normalize();
    let tangent = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal);
    if (tangent.lengthSq() < 0.01) tangent = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), normal);
    tangent.normalize();
    const offset = normal.clone().multiplyScalar(60).add(tangent.multiplyScalar(82));

    this.currentLookAt.copy(position.clone().sub(normal.clone().multiplyScalar(80)));
    this.currentPos.copy(position).add(offset);
    
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}
