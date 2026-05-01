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
  private farStarfield: THREE.Points | null = null;
  private constellationLines: THREE.LineSegments | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  
  // Dynamic objects
  public landerMeshes: Map<number, THREE.Group> = new Map();
  public projectileMeshes: Map<number, THREE.Mesh> = new Map();
  private padBeacons: THREE.Object3D[] = [];
  private transientFx: Array<{ object: THREE.Object3D; life: number; maxLife: number; kind: 'ring' | 'spark' }> = [];
  private trajectoryLine: THREE.Line | null = null;
  private caveLights: THREE.PointLight[] = [];
  
  // Constants
  private moonRadius = 10000;
  private featureAnchors = [
    new THREE.Vector3(0.84, 0.28, 0.46).normalize(),
    new THREE.Vector3(-0.36, 0.59, 0.72).normalize(),
    new THREE.Vector3(0.22, -0.48, 0.85).normalize(),
    new THREE.Vector3(-0.74, -0.2, -0.64).normalize(),
    new THREE.Vector3(0.1, 0.93, -0.36).normalize(),
  ];

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
    this.createSurfaceDetail();
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
    // Stylized full-day lighting: readable everywhere, with mild directional shape.
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.sunLight.position.set(50000, 30000, 20000);
    this.sunLight.castShadow = false; // Too expensive for a sphere this size
    this.scene.add(this.sunLight);

    this.ambientLight = new THREE.AmbientLight(0xf0f4ff, 1.15);
    this.scene.add(this.ambientLight);

    const earthLight = new THREE.DirectionalLight(0xe8f1ff, 0.72);
    earthLight.position.set(0, -100000, 0);
    this.scene.add(earthLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.66);
    rimLight.position.set(-25000, 18000, -22000);
    this.scene.add(rimLight);

    const backFill = new THREE.HemisphereLight(0xffffff, 0xd8d2c6, 1.2);
    this.scene.add(backFill);
  }

  private createMoon() {
    const geometry = new THREE.SphereGeometry(this.moonRadius, 160, 80);
    this.applyTerrainRelief(geometry);
    const texture = this.createMoonTexture(1024);
    const bump = this.createMoonBumpMap(1024);
    
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      map: texture,
      bumpMap: bump,
      bumpScale: 70,
      roughness: 0.95,
      metalness: 0.0,
      emissive: 0x4a4a4a,
      emissiveIntensity: 0.34,
      flatShading: false,
    });

    this.moon = new THREE.Mesh(geometry, material);
    this.scene.add(this.moon);
  }

  private applyTerrainRelief(geometry: THREE.SphereGeometry) {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const normal = new THREE.Vector3();

    for (let i = 0; i < position.count; i++) {
      normal.set(position.getX(i), position.getY(i), position.getZ(i)).normalize();
      const relief = this.sampleTerrainRelief(normal);
      position.setXYZ(
        i,
        normal.x * (this.moonRadius + relief),
        normal.y * (this.moonRadius + relief),
        normal.z * (this.moonRadius + relief),
      );
    }

    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  private sampleTerrainRelief(normal: THREE.Vector3) {
    const lon = Math.atan2(normal.z, normal.x) / (Math.PI * 2) + 0.5;
    const lat = Math.asin(normal.y) / Math.PI + 0.5;
    const low = this.valueNoise(lon * 7.5, lat * 4.5, 31) - 0.5;
    const mid = this.valueNoise(lon * 23, lat * 11, 67) - 0.5;
    const high = this.valueNoise(lon * 82, lat * 41, 181) - 0.5;
    let relief = low * 110 + mid * 52 + high * 20;

    for (const anchor of this.featureAnchors) {
      const angle = Math.acos(Math.max(-1, Math.min(1, normal.dot(anchor))));
      const basin = this.smoothstep(0.145, 0.0, angle);
      const rim = this.smoothstep(0.18, 0.145, angle) * this.smoothstep(0.105, 0.145, angle);
      relief -= basin * 115;
      relief += rim * 72;
    }

    const rille = Math.sin(lon * Math.PI * 14 + Math.sin(lat * Math.PI * 8) * 0.9);
    const rilleMask = this.smoothstep(0.965, 1.0, Math.abs(rille));
    relief -= rilleMask * 34 * this.valueNoise(lon * 10, lat * 20, 405);

    return Math.max(-160, Math.min(140, relief));
  }

  private createMoonTexture(size: number) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        const mare =
          this.softDisc(nx, ny, 0.18, 0.35, 0.14) +
          this.softDisc(nx, ny, 0.63, 0.42, 0.20) +
          this.softDisc(nx, ny, 0.77, 0.62, 0.12);
        const noise =
          this.valueNoise(nx * 10, ny * 5, 17) * 0.55 +
          this.valueNoise(nx * 42, ny * 21, 91) * 0.30 +
          this.valueNoise(nx * 130, ny * 65, 203) * 0.15;
        const shade = Math.max(60, Math.min(168, 92 + noise * 58 - mare * 32));
        const i = (y * size + x) * 4;
        image.data[i] = shade;
        image.data[i + 1] = shade;
        image.data[i + 2] = shade + 3;
        image.data[i + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
    this.paintCraterTexture(ctx, size, 110);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private createMoonBumpMap(size: number) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#777';
    ctx.fillRect(0, 0, size, size);
    this.paintCraterTexture(ctx, size, 190, true);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private paintCraterTexture(ctx: CanvasRenderingContext2D, size: number, count: number, bump = false) {
    const rand = this.seededRandom(7331 + (bump ? 19 : 0));
    for (let i = 0; i < count; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = (0.006 + rand() * rand() * 0.045) * size;

      ctx.save();
      ctx.globalAlpha = bump ? 0.32 : 0.18;
      ctx.fillStyle = bump ? '#333' : '#1f2022';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = bump ? 0.45 : 0.24;
      ctx.strokeStyle = bump ? '#d0d0d0' : '#d7d7d4';
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private createSurfaceDetail() {
    const craterGroup = new THREE.Group();
    const rand = this.seededRandom(4242);
    const craterFloorMat = new THREE.MeshBasicMaterial({
      color: 0x1c1d20,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const craterRimMat = new THREE.MeshBasicMaterial({
      color: 0xb8b8b2,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < 220; i++) {
      const radius = 25 + rand() * rand() * 360;
      const position = this.randomSurfacePoint(rand, this.moonRadius * 1.0006);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.8, 28), craterFloorMat);
      this.placeOnSurface(floor, position);
      craterGroup.add(floor);

      const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.76, radius, 32), craterRimMat);
      this.placeOnSurface(rim, position.clone().multiplyScalar(1.00008));
      craterGroup.add(rim);
    }

    this.createHexTileFields(craterGroup, rand);
    this.createRidges(craterGroup, rand);
    this.createLargeBasins(craterGroup);
    this.createCaveSystems(craterGroup, rand);
    this.createLavaTubes(craterGroup, rand);
    this.createRockFields(craterGroup, rand);
    this.scene.add(craterGroup);
  }

  private createLargeBasins(group: THREE.Group) {
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x17191c,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const shelfMat = new THREE.MeshBasicMaterial({
      color: 0xb7b3a8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.featureAnchors.forEach((anchor, index) => {
      const point = anchor.clone().multiplyScalar(this.moonRadius * 1.006);
      const radius = 360 + index * 55;
      const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), floorMat);
      this.placeOnSurface(floor, point);
      group.add(floor);

      for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
        const outer = radius * (1.18 + ringIndex * 0.28);
        const ring = new THREE.Mesh(new THREE.RingGeometry(outer - 9, outer, 96), shelfMat);
        this.placeOnSurface(ring, point.clone().multiplyScalar(1.0001 + ringIndex * 0.00005));
        group.add(ring);
      }
    });
  }

  private createCaveSystems(group: THREE.Group, rand: () => number) {
    const portalMat = new THREE.MeshBasicMaterial({
      color: 0x030405,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x565756,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x53d6ff,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const caveAnchors = [
      new THREE.Vector3(0.56, 0.23, 0.79),
      new THREE.Vector3(-0.2, 0.35, 0.91),
      new THREE.Vector3(-0.68, -0.28, 0.68),
      new THREE.Vector3(0.72, -0.46, -0.51),
      new THREE.Vector3(-0.12, 0.87, -0.48),
      new THREE.Vector3(0.38, -0.82, 0.42),
    ].map((v) => v.normalize());

    for (let i = 0; i < caveAnchors.length; i++) {
      const normal = caveAnchors[i];
      const frame = this.surfaceFrame(normal);
      const center = normal.clone().multiplyScalar(this.moonRadius * 1.008);
      const width = 105 + rand() * 80;
      const height = width * (0.52 + rand() * 0.22);

      const portal = new THREE.Mesh(new THREE.CircleGeometry(1, 36), portalMat);
      portal.scale.set(width, height, 1);
      this.placeOnSurface(portal, center.clone().add(frame.north.clone().multiplyScalar(height * 0.1)));
      group.add(portal);

      const lip = new THREE.Mesh(new THREE.TorusGeometry(width * 0.58, 7 + rand() * 6, 8, 44), rimMat);
      lip.scale.y = height / width;
      this.placeOnSurface(lip, center.clone().multiplyScalar(1.00015));
      group.add(lip);

      const apron = new THREE.Mesh(new THREE.RingGeometry(width * 0.72, width * 1.16, 48), glowMat);
      apron.scale.y = 0.46;
      this.placeOnSurface(
        apron,
        center.clone()
          .add(frame.north.clone().multiplyScalar(-height * 0.62))
          .multiplyScalar(1.00008),
      );
      group.add(apron);

      const light = new THREE.PointLight(0x53d6ff, 0.55, width * 2.2);
      light.position.copy(center.clone().add(normal.clone().multiplyScalar(24)));
      light.userData.phase = rand() * Math.PI * 2;
      this.caveLights.push(light);
      group.add(light);

      for (let rockIndex = 0; rockIndex < 11; rockIndex++) {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1, 0),
          rimMat,
        );
        const side = (rand() - 0.5) * width * 1.9;
        const drop = (-0.15 - rand() * 0.95) * height;
        const size = 8 + rand() * 28;
        const p = center.clone()
          .add(frame.east.clone().multiplyScalar(side))
          .add(frame.north.clone().multiplyScalar(drop))
          .normalize()
          .multiplyScalar(this.moonRadius * 1.009);
        rock.scale.set(size * (0.8 + rand() * 0.7), size * (0.55 + rand() * 0.8), size * (0.8 + rand() * 0.7));
        rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
        this.placeOnSurface(rock, p);
        group.add(rock);
      }
    }
  }

  private createLavaTubes(group: THREE.Group, rand: () => number) {
    const trenchMat = new THREE.MeshBasicMaterial({
      color: 0x08090b,
      transparent: true,
      opacity: 0.48,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0xb2afa7,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });

    for (let tubeIndex = 0; tubeIndex < 10; tubeIndex++) {
      const start = this.randomSurfacePoint(rand, this.moonRadius * 1.007);
      const normal = start.clone().normalize();
      const frame = this.surfaceFrame(normal);
      const points: THREE.Vector3[] = [];
      const length = 560 + rand() * 1250;
      const wave = 80 + rand() * 190;

      for (let i = 0; i < 18; i++) {
        const t = i / 17 - 0.5;
        const p = start.clone()
          .add(frame.east.clone().multiplyScalar(t * length))
          .add(frame.north.clone().multiplyScalar(Math.sin(t * Math.PI * 3 + tubeIndex) * wave))
          .normalize()
          .multiplyScalar(this.moonRadius * 1.0065);
        points.push(p);
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const trench = new THREE.Mesh(new THREE.TubeGeometry(curve, 56, 18 + rand() * 16, 8, false), trenchMat);
      group.add(trench);

      const rimA = new THREE.Mesh(new THREE.TubeGeometry(curve, 56, 3 + rand() * 4, 5, false), rimMat);
      rimA.scale.setScalar(1.0006);
      group.add(rimA);
    }
  }

  private createHexTileFields(group: THREE.Group, rand: () => number) {
    const mats = [
      new THREE.MeshBasicMaterial({ color: 0x6f716f, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0x8a8b86, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0x4d4e50, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false }),
    ];
    const outline = new THREE.MeshBasicMaterial({ color: 0x111315, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false });
    const fieldCenters = [
      new THREE.Vector3(0.18, 0.98, 0.05),
      new THREE.Vector3(0.58, 0.78, 0.22),
      new THREE.Vector3(-0.48, 0.82, -0.18),
      new THREE.Vector3(0.05, 0.72, 0.69),
    ].map((v) => v.normalize().multiplyScalar(this.moonRadius * 1.002));

    for (const center of fieldCenters) {
      const normal = center.clone().normalize();
      let east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal);
      if (east.lengthSq() < 0.01) east = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), normal);
      east.normalize();
      const north = new THREE.Vector3().crossVectors(normal, east).normalize();
      const radius = 58;
      const dx = Math.sqrt(3) * radius;
      const dy = 1.5 * radius;

      for (let row = -5; row <= 5; row++) {
        for (let col = -5; col <= 5; col++) {
          if (rand() < 0.16) continue;
          const localX = (col + (row & 1) * 0.5) * dx;
          const localY = row * dy;
          if (Math.hypot(localX, localY) > 520) continue;

          const point = center.clone()
            .add(east.clone().multiplyScalar(localX))
            .add(north.clone().multiplyScalar(localY))
            .normalize()
            .multiplyScalar(this.moonRadius * 1.003);
          const tile = new THREE.Mesh(new THREE.CircleGeometry(radius * (0.86 + rand() * 0.08), 6), mats[Math.floor(rand() * mats.length)]);
          tile.rotation.z = Math.PI / 6;
          this.placeOnSurface(tile, point);
          group.add(tile);

          const line = new THREE.Mesh(new THREE.RingGeometry(radius * 0.88, radius * 0.92, 6), outline);
          line.rotation.z = Math.PI / 6;
          this.placeOnSurface(line, point.clone().multiplyScalar(1.00002));
          group.add(line);
        }
      }
    }
  }

  private createRidges(group: THREE.Group, rand: () => number) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa8a7a0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });

    for (let r = 0; r < 24; r++) {
      const start = this.randomSurfacePoint(rand, this.moonRadius * 1.001);
      const normal = start.clone().normalize();
      const tangentA = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0));
      if (tangentA.lengthSq() < 0.01) tangentA.crossVectors(normal, new THREE.Vector3(1, 0, 0));
      tangentA.normalize();
      const tangentB = new THREE.Vector3().crossVectors(normal, tangentA).normalize();
      const points: THREE.Vector3[] = [];
      const length = 220 + rand() * 700;

      for (let i = -4; i <= 4; i++) {
        const offset = tangentA.clone().multiplyScalar((i / 8) * length);
        offset.add(tangentB.clone().multiplyScalar((rand() - 0.5) * length * 0.18));
        const p = start.clone().add(offset).normalize().multiplyScalar(this.moonRadius * 1.0015);
        points.push(p);
      }

      const curve = new THREE.CatmullRomCurve3(points);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 6 + rand() * 10, 5, false), mat);
      group.add(tube);
    }
  }

  private createRockFields(group: THREE.Group, rand: () => number) {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x77756f,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);

    for (let i = 0; i < 340; i++) {
      const position = this.randomSurfacePoint(rand, this.moonRadius * 1.0015);
      const size = 3 + rand() * rand() * 22;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.scale.set(size * (0.8 + rand() * 0.6), size * (0.45 + rand() * 0.9), size * (0.8 + rand() * 0.6));
      rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      this.placeOnSurface(rock, position);
      group.add(rock);
    }
  }

  private createStarfield() {
    const rand = this.seededRandom(9001);
    this.farStarfield = this.makeStarLayer(14000, 220000, 1.15, 0.72, rand, false);
    this.starfield = this.makeStarLayer(1800, 185000, 2.45, 0.95, rand, true);
    this.constellationLines = this.createConstellationLines(rand);

    this.scene.add(this.farStarfield);
    this.scene.add(this.starfield);
    this.scene.add(this.constellationLines);
  }

  private makeStarLayer(
    starsCount: number,
    distance: number,
    pointSize: number,
    opacity: number,
    rand: () => number,
    includeMilkyWay: boolean,
  ) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starsCount * 3);
    const colors = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount; i++) {
      let theta = rand() * Math.PI * 2;
      let phi = Math.acos(2 * rand() - 1);

      if (includeMilkyWay && rand() < 0.45) {
        theta = rand() * Math.PI * 2;
        phi = Math.PI * 0.52 + (rand() - 0.5) * 0.34;
      }

      const r = distance * (0.88 + rand() * 0.16);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const temp = rand();
      const brightness = 0.58 + rand() * rand() * 0.5;
      if (temp < 0.12) {
        colors[i * 3] = brightness * 0.76;
        colors[i * 3 + 1] = brightness * 0.86;
        colors[i * 3 + 2] = brightness;
      } else if (temp < 0.18) {
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness * 0.86;
        colors[i * 3 + 2] = brightness * 0.58;
      } else {
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness * 0.94;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: pointSize,
      vertexColors: true,
      sizeAttenuation: false,
      transparent: true,
      opacity,
    });

    return new THREE.Points(geometry, material);
  }

  private createConstellationLines(rand: () => number) {
    const positions: number[] = [];
    for (let c = 0; c < 16; c++) {
      let prev = this.randomSurfacePoint(rand, 195000);
      for (let i = 0; i < 4 + Math.floor(rand() * 4); i++) {
        const next = prev.clone().add(this.randomSurfacePoint(rand, 10000)).normalize().multiplyScalar(195000);
        positions.push(prev.x, prev.y, prev.z, next.x, next.y, next.z);
        prev = next;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x9bbdff, transparent: true, opacity: 0.16 })
    );
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
      flame.scale.set(1 + throttle * 0.4, 0.45 + throttle * 2.6, 1 + throttle * 0.4);
      const mat = flame.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.45 + throttle * 0.45;
    }

    const engineLight = group.getObjectByName('engineLight') as THREE.PointLight;
    if (engineLight) {
      engineLight.intensity = throttle > 0.01 ? 1.5 + throttle * 8 : 0;
    }
  }

  private createLanderMesh(entityType: number): THREE.Group {
    const group = new THREE.Group();

    // Lander body
    const bodySize = entityType === 2 ? 3.0 : entityType === 0 ? 1.5 : 2.0;
    const bodyGeo = new THREE.CylinderGeometry(bodySize * 0.42, bodySize * 0.58, bodySize * 0.95, 12);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.getLanderColor(entityType),
      roughness: 0.62,
      metalness: 0.36,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.name = 'body';
    group.add(body);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x9da3a6, roughness: 0.55, metalness: 0.45 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x25272a, roughness: 0.78, metalness: 0.16 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc58d3b, roughness: 0.48, metalness: 0.35 });

    const cabin = new THREE.Mesh(
      new THREE.SphereGeometry(bodySize * 0.35, 18, 9),
      new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.28, metalness: 0.08 })
    );
    cabin.position.set(0, bodySize * 0.4, 0);
    cabin.scale.y = 0.55;
    group.add(cabin);

    const hatch = new THREE.Mesh(new THREE.BoxGeometry(bodySize * 0.34, bodySize * 0.24, bodySize * 0.04), darkMat);
    hatch.position.set(0, bodySize * 0.05, -bodySize * 0.6);
    group.add(hatch);

    const tankGeo = new THREE.CylinderGeometry(bodySize * 0.14, bodySize * 0.14, bodySize * 0.82, 10);
    for (const x of [-bodySize * 0.62, bodySize * 0.62]) {
      for (const z of [-bodySize * 0.34, bodySize * 0.34]) {
        const tank = new THREE.Mesh(tankGeo, goldMat);
        tank.position.set(x, -bodySize * 0.05, z);
        tank.rotation.z = Math.PI / 2;
        group.add(tank);

        const strut = new THREE.Mesh(new THREE.CylinderGeometry(bodySize * 0.018, bodySize * 0.018, bodySize * 0.7, 6), frameMat);
        strut.position.set(x * 0.5, -bodySize * 0.06, z);
        strut.rotation.z = Math.PI / 2;
        group.add(strut);
      }
    }

    // Landing legs
    const legGeo = new THREE.CylinderGeometry(0.035 * bodySize, 0.035 * bodySize, bodySize * 1.02, 8);
    const legMat = frameMat;
    const legPositions = [
      [-bodySize * 0.5, -bodySize * 0.55, -bodySize * 0.5],
      [bodySize * 0.5, -bodySize * 0.55, -bodySize * 0.5],
      [-bodySize * 0.5, -bodySize * 0.55, bodySize * 0.5],
      [bodySize * 0.5, -bodySize * 0.55, bodySize * 0.5],
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      leg.rotation.x = pos[2] > 0 ? -0.42 : 0.42;
      leg.rotation.z = pos[0] > 0 ? 0.42 : -0.42;
      group.add(leg);

      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(bodySize * 0.16, bodySize * 0.16, bodySize * 0.04, 12),
        legMat
      );
      foot.position.set(pos[0] * 1.35, -bodySize * 0.92, pos[2] * 1.35);
      group.add(foot);
    }

    const panelMat = new THREE.MeshStandardMaterial({ color: 0x19395f, roughness: 0.42, metalness: 0.22 });
    for (const side of [-1, 1]) {
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(bodySize * 0.018, bodySize * 0.018, bodySize * 1.25, 6), frameMat);
      boom.position.set(side * bodySize * 0.86, bodySize * 0.1, 0);
      boom.rotation.z = Math.PI / 2;
      group.add(boom);

      const panel = new THREE.Mesh(new THREE.BoxGeometry(bodySize * 0.55, bodySize * 0.025, bodySize * 0.34), panelMat);
      panel.position.set(side * bodySize * 1.35, bodySize * 0.1, 0);
      group.add(panel);
    }

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(bodySize * 0.012, bodySize * 0.012, bodySize * 0.78, 6), frameMat);
    antenna.position.set(bodySize * 0.18, bodySize * 0.92, bodySize * 0.12);
    antenna.rotation.z = -0.35;
    group.add(antenna);

    const dish = new THREE.Mesh(new THREE.ConeGeometry(bodySize * 0.12, bodySize * 0.1, 16), frameMat);
    dish.position.set(bodySize * 0.32, bodySize * 1.25, bodySize * 0.12);
    dish.rotation.z = -0.35;
    group.add(dish);

    // Engine nozzle
    const nozzleGeo = new THREE.ConeGeometry(bodySize * 0.34, bodySize * 0.48, 14);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.5, metalness: 0.5 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(0, -bodySize * 0.58, 0);
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

    const navLight = new THREE.PointLight(0x84ffd3, 0.6, 14);
    navLight.position.set(0, bodySize * 0.55, -bodySize * 0.72);
    group.add(navLight);

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
      const geo = new THREE.SphereGeometry(0.75, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd25a });
      mesh = new THREE.Mesh(geo, mat);
      const light = new THREE.PointLight(0xffaa22, 1.5, 18);
      light.name = 'projectileLight';
      mesh.add(light);
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
    ring.name = 'padRing';

    // Position on surface and orient to face outward
    ring.position.set(x, y, z);
    ring.lookAt(0, 0, 0); // Face center (normal points outward)

    this.scene.add(ring);
    this.padBeacons.push(ring);

    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(1, radius * 0.18), 24),
      new THREE.MeshBasicMaterial({ color: 0x8effd0, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    inner.position.set(x, y, z).multiplyScalar(1.0002);
    inner.lookAt(0, 0, 0);
    this.scene.add(inner);
    this.padBeacons.push(inner);

    // Beacon light
    const light = new THREE.PointLight(0x00ff88, 2, radius * 3);
    light.position.set(x, y, z);
    this.scene.add(light);
    this.padBeacons.push(light);
  }

  pruneEntities(activeIds: Set<number>) {
    for (const id of Array.from(this.landerMeshes.keys())) {
      if (!activeIds.has(id)) this.removeEntity(id);
    }
    for (const id of Array.from(this.projectileMeshes.keys())) {
      if (!activeIds.has(id)) this.removeEntity(id);
    }
  }

  update(dt: number) {
    const t = performance.now() * 0.001;
    for (const light of this.caveLights) {
      light.intensity = 0.36 + Math.sin(t * 1.4 + light.userData.phase) * 0.08;
    }

    for (const beacon of this.padBeacons) {
      if (beacon instanceof THREE.PointLight) {
        beacon.intensity = 1.5 + Math.sin(t * 3) * 0.45;
      } else {
        const pulse = 1 + Math.sin(t * 2.4) * 0.04;
        beacon.scale.setScalar(pulse);
      }
    }

    if (this.starfield) {
      this.starfield.rotation.y += dt * 0.002;
    }
    if (this.farStarfield) {
      this.farStarfield.rotation.y -= dt * 0.0008;
    }
    if (this.constellationLines) {
      this.constellationLines.rotation.y += dt * 0.0005;
    }

    for (let i = this.transientFx.length - 1; i >= 0; i--) {
      const fx = this.transientFx[i];
      fx.life -= dt;
      const age = 1 - fx.life / fx.maxLife;
      const material = fx.object instanceof THREE.Mesh
        ? fx.object.material as THREE.Material & { opacity?: number }
        : null;

      if (fx.kind === 'ring') {
        fx.object.scale.setScalar(1 + age * 3.5);
      } else {
        const velocity = fx.object.userData.velocity as THREE.Vector3 | undefined;
        if (velocity) fx.object.position.add(velocity.clone().multiplyScalar(dt));
      }

      if (material) material.opacity = Math.max(0, 0.8 * (1 - age));
      if (fx.life <= 0) {
        this.scene.remove(fx.object);
        this.transientFx.splice(i, 1);
      }
    }
  }

  spawnImpactFx(position: number[], color = 0xff716a) {
    const point = new THREE.Vector3(position[0], position[1], position[2]);
    const normal = point.clone().normalize();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4, 8, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.copy(point.clone().add(normal.clone().multiplyScalar(3)));
    ring.lookAt(0, 0, 0);
    this.scene.add(ring);
    this.transientFx.push({ object: ring, life: 1.2, maxLife: 1.2, kind: 'ring' });

    const rand = this.seededRandom(Math.floor(performance.now()));
    for (let i = 0; i < 18; i++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 5, 5),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      spark.position.copy(point.clone().add(normal.clone().multiplyScalar(5)));
      spark.userData.velocity = normal.clone()
        .add(this.randomSurfacePoint(rand, 0.6))
        .normalize()
        .multiplyScalar(20 + rand() * 42);
      this.scene.add(spark);
      this.transientFx.push({ object: spark, life: 0.8, maxLife: 0.8, kind: 'spark' });
    }
  }

  spawnMuzzleFx(position: number[], direction: number[]) {
    const point = new THREE.Vector3(position[0], position[1], position[2]);
    const dir = new THREE.Vector3(direction[0], direction[1], direction[2]).normalize();
    const flash = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 5, 12),
      new THREE.MeshBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: 0.85 })
    );
    flash.position.copy(point.clone().add(dir.clone().multiplyScalar(5)));
    flash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(flash);
    this.transientFx.push({ object: flash, life: 0.16, maxLife: 0.16, kind: 'spark' });
  }

  updateTrajectory(points: THREE.Vector3[]) {
    if (points.length < 2) {
      if (this.trajectoryLine) this.trajectoryLine.visible = false;
      return;
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    if (!this.trajectoryLine) {
      this.trajectoryLine = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: 0.55 })
      );
      this.scene.add(this.trajectoryLine);
    } else {
      this.trajectoryLine.geometry.dispose();
      this.trajectoryLine.geometry = geometry;
      this.trajectoryLine.visible = true;
    }
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

  private randomSurfacePoint(rand: () => number, radius: number) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
    );
  }

  private placeOnSurface(object: THREE.Object3D, position: THREE.Vector3) {
    object.position.copy(position);
    object.lookAt(0, 0, 0);
  }

  private surfaceFrame(normal: THREE.Vector3) {
    const up = normal.clone().normalize();
    let east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), up);
    if (east.lengthSq() < 0.01) east = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), up);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(up, east).normalize();
    return { east, north, up };
  }

  private smoothstep(edge0: number, edge1: number, x: number) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  private valueNoise(x: number, y: number, seed: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const hash = (ix: number, iy: number) => {
      const s = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453;
      return s - Math.floor(s);
    };
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    const u = smooth(xf);
    const v = smooth(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }

  private softDisc(x: number, y: number, cx: number, cy: number, r: number) {
    const d = Math.hypot(x - cx, y - cy);
    return Math.max(0, Math.min(1, 1 - d / r));
  }

  private seededRandom(seed: number) {
    let s = Math.floor(seed) % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = s * 16807 % 2147483647;
      return (s - 1) / 2147483646;
    };
  }
}
