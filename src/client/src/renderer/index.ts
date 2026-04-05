/**
 * Three.js renderer setup and scene management
 */

import * as THREE from 'three';

export class Renderer {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  
  // Scene objects
  private moon: THREE.Mesh | null = null;
  private starfield: THREE.Points | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  
  // Dynamic objects
  public landerMeshes: Map<number, THREE.Group> = new Map();
  public projectileMeshes: Map<number, THREE.Mesh> = new Map();
  
  // Constants
  private moonRadius = 10000;

  constructor(canvas: HTMLCanvasElement) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1,
      500000 // Far plane: must see entire Moon from orbit
    );
    this.camera.position.set(0, this.moonRadius + 50, 50);

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    this.setupLighting();
    this.createMoon();
    this.createStarfield();
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private setupLighting() {
    // Sunlight — harsh directional light
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.sunLight.position.set(50000, 30000, 20000);
    this.sunLight.castShadow = false; // Too expensive for a sphere this size
    this.scene.add(this.sunLight);

    // Ambient — very dim (moon has no atmosphere scatter)
    this.ambientLight = new THREE.AmbientLight(0x111122, 0.15);
    this.scene.add(this.ambientLight);

    // Earth shine — faint blue light from below
    const earthLight = new THREE.DirectionalLight(0x4488ff, 0.1);
    earthLight.position.set(0, -100000, 0);
    this.scene.add(earthLight);
  }

  private createMoon() {
    // Moon sphere — segmented for visible curvature
    const geometry = new THREE.SphereGeometry(this.moonRadius, 128, 64);
    
    // Moon material — grey, realistic
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: false,
    });

    this.moon = new THREE.Mesh(geometry, material);
    this.scene.add(this.moon);

    // Landing pad markers (temporary — will be placed by game)
    // We'll add pad markers dynamically
  }

  private createStarfield() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 10000;
    const positions = new Float32Array(starsCount * 3);
    const colors = new Float32Array(starsCount * 3);
    const sizes = new Float32Array(starsCount);

    for (let i = 0; i < starsCount; i++) {
      // Random point on a large sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 200000; // Distance

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Slightly colored stars
      const temp = Math.random();
      if (temp < 0.1) {
        // Blue-white
        colors[i * 3] = 0.7 + Math.random() * 0.3;
        colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 2] = 1.0;
      } else if (temp < 0.15) {
        // Yellow
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
        colors[i * 3 + 2] = 0.6 + Math.random() * 0.2;
      } else if (temp < 0.18) {
        // Red
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.5 + Math.random() * 0.3;
        colors[i * 3 + 2] = 0.3 + Math.random() * 0.2;
      } else {
        // White
        const b = 0.8 + Math.random() * 0.2;
        colors[i * 3] = b;
        colors[i * 3 + 1] = b;
        colors[i * 3 + 2] = b;
      }

      sizes[i] = 0.5 + Math.random() * 2.0;
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starsMaterial = new THREE.PointsMaterial({
      size: 2.0,
      vertexColors: true,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
    });

    this.starfield = new THREE.Points(starsGeometry, starsMaterial);
    this.scene.add(this.starfield);
  }

  /**
   * Create or update a lander mesh
   */
  updateLander(id: number, position: number[], orientation: number[], throttle: number, entityType: number) {
    let group = this.landerMeshes.get(id);

    if (!group) {
      group = this.createLanderMesh(entityType);
      group.userData.id = id;
      this.scene.add(group);
      this.landerMeshes.set(id, group);
    }

    // Update transform
    group.position.set(position[0], position[1], position[2]);
    group.quaternion.set(orientation[0], orientation[1], orientation[2], orientation[3]);

    // Update thrust visual
    const flame = group.getObjectByName('flame') as THREE.Mesh;
    if (flame) {
      flame.visible = throttle > 0.01;
      flame.scale.set(1, 0.5 + throttle * 2, 1);
    }
  }

  private createLanderMesh(entityType: number): THREE.Group {
    const group = new THREE.Group();

    // Lander body — simplified box shape
    const bodySize = entityType === 2 ? 3.0 : entityType === 0 ? 1.5 : 2.0;
    const bodyGeo = new THREE.BoxGeometry(bodySize, bodySize * 0.6, bodySize);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.getLanderColor(entityType),
      roughness: 0.7,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.name = 'body';
    group.add(body);

    // Landing legs
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, bodySize * 0.8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const legPositions = [
      [-bodySize * 0.4, -bodySize * 0.5, -bodySize * 0.4],
      [bodySize * 0.4, -bodySize * 0.5, -bodySize * 0.4],
      [-bodySize * 0.4, -bodySize * 0.5, bodySize * 0.4],
      [bodySize * 0.4, -bodySize * 0.5, bodySize * 0.4],
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      group.add(leg);
    }

    // Engine nozzle
    const nozzleGeo = new THREE.ConeGeometry(bodySize * 0.3, bodySize * 0.4, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(0, -bodySize * 0.5, 0);
    nozzle.rotation.x = Math.PI; // Point down
    group.add(nozzle);

    // Thrust flame
    const flameGeo = new THREE.ConeGeometry(bodySize * 0.25, bodySize * 2, 8);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.8,
    });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.name = 'flame';
    flame.position.set(0, -bodySize * 1.5, 0);
    flame.rotation.x = Math.PI;
    flame.visible = false;
    group.add(flame);

    // Point light for engine
    const engineLight = new THREE.PointLight(0xff6600, 0, 20);
    engineLight.name = 'engineLight';
    engineLight.position.set(0, -bodySize * 0.8, 0);
    group.add(engineLight);

    return group;
  }

  private getLanderColor(type: number): number {
    switch (type) {
      case 0: return 0x44aaff; // Scout - blue
      case 1: return 0xffffff; // Standard - white
      case 2: return 0xffaa44; // Heavy - orange
      case 3: return 0xff4444; // Interceptor - red
      default: return 0x888888;
    }
  }

  /**
   * Update projectile positions
   */
  updateProjectile(id: number, position: number[]) {
    let mesh = this.projectileMeshes.get(id);
    if (!mesh) {
      const geo = new THREE.SphereGeometry(0.5, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      this.projectileMeshes.set(id, mesh);
    }
    mesh.position.set(position[0], position[1], position[2]);
  }

  /**
   * Remove a mesh by entity ID
   */
  removeEntity(id: number) {
    const lander = this.landerMeshes.get(id);
    if (lander) {
      this.scene.remove(lander);
      this.landerMeshes.delete(id);
    }

    const proj = this.projectileMeshes.get(id);
    if (proj) {
      this.scene.remove(proj);
      this.projectileMeshes.delete(id);
    }
  }

  /**
   * Create a landing pad marker on the surface
   */
  createPadMarker(x: number, y: number, z: number, radius: number) {
    // Flat ring on the surface
    const ringGeo = new THREE.RingGeometry(radius - 2, radius, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);

    // Position on surface and orient to face outward
    ring.position.set(x, y, z);
    ring.lookAt(0, 0, 0); // Face center (normal points outward)

    this.scene.add(ring);

    // Beacon light
    const light = new THREE.PointLight(0x00ff88, 2, radius * 3);
    light.position.set(x, y, z);
    this.scene.add(light);
  }

  /**
   * Render the scene
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get render info for performance monitoring
   */
  getPerfInfo() {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  destroy() {
    this.renderer.dispose();
  }
}
