// ============================================================
// Stargazer Simulator — 532nm Astronomical Green Laser Pointer
// ============================================================

import * as THREE from 'three';
import { gameStore } from '../game/GameStore';
import { GameMode } from '../types';
import { StarIdentifier } from './StarIdentifier';
import { CelestialSphere } from './CelestialSphere';
import { PlanetData } from './PlanetarySystem';

export class LaserPointer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private starIdentifier: StarIdentifier;
  private celestialSphere?: CelestialSphere;
  private planetsProvider: () => PlanetData[];
  private telescopeModelProvider?: () => THREE.Vector3;
  private telescopeDirProvider?: () => THREE.Vector3;

  // Visual Meshes
  private handheldBeamLine: THREE.Line;
  private targetDotSprite: THREE.Sprite;
  private labelElement: HTMLElement;
  private currentRayDir = new THREE.Vector3(0, 0, -1);

  // State
  private mouseCoords = new THREE.Vector2(0, 0); // NDC (-1 to 1)
  private isPointerActive = false;
  private isMounted = false;
  private lastIdentifiedTarget: any = null;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    starIdentifier: StarIdentifier,
    planetsProvider: () => PlanetData[],
    celestialSphere?: CelestialSphere,
    telescopeModelProvider?: () => THREE.Vector3,
    telescopeDirProvider?: () => THREE.Vector3
  ) {
    this.scene = scene;
    this.camera = camera;
    this.starIdentifier = starIdentifier;
    this.planetsProvider = planetsProvider;
    this.celestialSphere = celestialSphere;
    this.telescopeModelProvider = telescopeModelProvider;
    this.telescopeDirProvider = telescopeDirProvider;

    // Build laser materials and meshes
    const beamMaterial = new THREE.LineBasicMaterial({
      color: 0x34d399,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // 1. Handheld Beam
    const handheldGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1000),
    ]);
    this.handheldBeamLine = new THREE.Line(handheldGeom, beamMaterial);
    this.handheldBeamLine.frustumCulled = false;
    this.handheldBeamLine.visible = false;
    this.scene.add(this.handheldBeamLine);

    // 2. Target Dot
    const dotCanvas = document.createElement('canvas');
    dotCanvas.width = 64;
    dotCanvas.height = 64;
    const ctx = dotCanvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(52, 211, 153, 0.8)');
    grad.addColorStop(1, 'rgba(52, 211, 153, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    const dotTex = new THREE.CanvasTexture(dotCanvas);
    const dotMat = new THREE.SpriteMaterial({
      map: dotTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.targetDotSprite = new THREE.Sprite(dotMat);
    this.targetDotSprite.scale.set(12, 12, 1);
    this.targetDotSprite.visible = false;
    this.scene.add(this.targetDotSprite);

    // 4. UI Label
    this.labelElement = document.createElement('div');
    this.labelElement.className = 'laser-target-label';
    this.labelElement.style.display = 'none';
    document.getElementById('ui-overlay')?.appendChild(this.labelElement);

    this.setupListeners();
  }

  private setupListeners() {
    window.addEventListener('mousemove', (e) => {
      if (this.isPointerActive) {
        this.mouseCoords.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseCoords.y = -(e.clientY / window.innerHeight) * 2 + 1;
      }
    });

    gameStore.subscribe((state) => {
      this.isPointerActive = state.isLaserPointerActive;
      this.isMounted = state.isLaserPointerMounted;
      const shouldHideCursor = state.isLaserPointerActive && !state.isLaserPointerMounted && state.gameMode !== GameMode.Studio;
      document.body.classList.toggle('laser-active', shouldHideCursor);
    });
  }

  public setMouseCoordinates(ndcX: number, ndcY: number) {
    this.mouseCoords.x = ndcX;
    this.mouseCoords.y = ndcY;
  }

  public update() {
    const state = gameStore.getState();

    // Handle Handheld Beam
    // Player cannot use handheld laser if it is mounted onto telescope!
    const canUseHandheld = this.isPointerActive && !this.isMounted && state.gameMode !== GameMode.Studio;

    if (canUseHandheld) {
      this.handheldBeamLine.visible = true;

      // Project ray from mouse position through camera
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(this.mouseCoords, this.camera);
      const rayDir = raycaster.ray.direction.clone().normalize();
      this.currentRayDir.copy(rayDir);

      // Laser emitter origin: bottom-right of camera
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const beamStart = this.camera.position
        .clone()
        .add(right.multiplyScalar(0.25))
        .add(up.multiplyScalar(-0.25));

      const beamEnd = beamStart.clone().add(rayDir.clone().multiplyScalar(1200));

      const posAttr = this.handheldBeamLine.geometry.attributes.position as THREE.BufferAttribute;
      posAttr.setXYZ(0, beamStart.x, beamStart.y, beamStart.z);
      posAttr.setXYZ(1, beamEnd.x, beamEnd.y, beamEnd.z);
      posAttr.needsUpdate = true;

      // Position target dot at sky distance
      this.targetDotSprite.visible = true;
      this.targetDotSprite.position.copy(beamStart.clone().add(rayDir.clone().multiplyScalar(800)));

      // 3. Identify Celestial Object near ray endpoint
      this.identifyObjectAtRay(rayDir);
    } else {
      this.handheldBeamLine.visible = false;
      this.targetDotSprite.visible = false;
      if (this.labelElement.style.display !== 'none') {
        this.labelElement.style.display = 'none';
      }
      this.lastIdentifiedTarget = null;
    }
  }

  private identifyObjectAtRay(rayDir: THREE.Vector3) {
    if (!this.celestialSphere) return;

    // Convert ray direction in world space to celestial coordinates (RA / Dec)
    const invMat = this.celestialSphere.group.matrixWorld.clone().invert();
    const celestialDir = rayDir.clone().applyMatrix4(invMat).normalize();

    const decRad = Math.asin(Math.max(-1, Math.min(1, celestialDir.y)));
    const decDeg = (decRad * 180) / Math.PI;

    let raRad = Math.atan2(celestialDir.z, celestialDir.x);
    if (raRad < 0) raRad += Math.PI * 2;
    const raHours = (raRad * 12) / Math.PI;

    const planets = this.planetsProvider();
    // Use StarIdentifier with a crisp pointing acceptance cone
    const target = this.starIdentifier.identify(raHours, decDeg, 15, this.celestialSphere, planets);

    if (target) {
      this.lastIdentifiedTarget = target;
      gameStore.getState().setLaserPointedTarget(target);

      // Show floating label near screen position
      this.labelElement.textContent = target.name;
      this.labelElement.style.display = 'block';

      // Screen space positioning
      const screenPos = this.targetDotSprite.position.clone().project(this.camera);
      const x = ((screenPos.x + 1) / 2) * window.innerWidth;
      const y = ((-screenPos.y + 1) / 2) * window.innerHeight;

      this.labelElement.style.left = `${Math.min(window.innerWidth - 180, Math.max(20, x + 15))}px`;
      this.labelElement.style.top = `${Math.min(window.innerHeight - 60, Math.max(20, y - 25))}px`;

      // Dispatch event for quests
      document.dispatchEvent(new CustomEvent('laser-pointed-target', { detail: { target } }));
    } else {
      this.lastIdentifiedTarget = null;
      gameStore.getState().setLaserPointedTarget(null);
      this.labelElement.style.display = 'none';
    }
  }

  public isActive(): boolean {
    return this.isPointerActive;
  }

  public getTargetName(): string | undefined {
    return this.lastIdentifiedTarget?.name;
  }

  public getRayDirection(): THREE.Vector3 {
    return this.currentRayDir;
  }

  public setVisibleForPhoto(visible: boolean) {
    if (!visible) {
      this.handheldBeamLine.visible = false;
      this.targetDotSprite.visible = false;
      this.labelElement.style.display = 'none';
    }
  }

  public dispose() {
    document.body.classList.remove('laser-active');
    this.handheldBeamLine.geometry.dispose();
    this.targetDotSprite.geometry.dispose();
    this.labelElement.remove();
  }
}
