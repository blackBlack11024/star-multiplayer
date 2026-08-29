import * as THREE from 'three';
import { gameStore } from '../game/GameStore';

export class TelescopeModel {
  private group: THREE.Group;
  private tubeGroup: THREE.Group;
  private mountedLaserGroup: THREE.Group;
  private eyepieceMesh: THREE.Mesh;
  private eyepieceGlow: THREE.PointLight;
  private beaconLight: THREE.PointLight;
  private interactionDistance = 4.0;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    // Placed directly in front of the player's initial view!
    this.group.position.set(0, 0, -3.5);

    // ==========================================
    // 1. Observation Platform Pad (Circular Stone Base)
    // ==========================================
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x1c2333,
      roughness: 0.85,
      metalness: 0.15
    });
    const padGeo = new THREE.CylinderGeometry(1.6, 1.7, 0.08, 32);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.y = 0.04;
    pad.receiveShadow = true;
    this.group.add(pad);

    // Outer luminous guide ring on the pad (soft cyan glow)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
    const ringGeo = new THREE.RingGeometry(1.48, 1.52, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.082;
    this.group.add(ring);

    // Platform guide beacon lights
    const padLight1 = new THREE.PointLight(0x38bdf8, 0.8, 4);
    padLight1.position.set(1.3, 0.2, 0);
    this.group.add(padLight1);

    const padLight2 = new THREE.PointLight(0x38bdf8, 0.8, 4);
    padLight2.position.set(-1.3, 0.2, 0);
    this.group.add(padLight2);

    // ==========================================
    // 2. Telescope Tripod & Equatorial Mount
    // ==========================================
    const legMat = new THREE.MeshStandardMaterial({ color: 0x22262c, metalness: 0.85, roughness: 0.25 });
    const mountMat = new THREE.MeshStandardMaterial({ color: 0x181c22, metalness: 0.9, roughness: 0.2 });
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.2, roughness: 0.15 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.9, roughness: 0.25 }); // Gold brass

    // Tripod legs
    for (let i = 0; i < 3; i++) {
      const legGeo = new THREE.CylinderGeometry(0.025, 0.02, 1.4);
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.y = 0.7;
      const angle = (i / 3) * Math.PI * 2;
      leg.position.x = Math.cos(angle) * 0.38;
      leg.position.z = Math.sin(angle) * 0.38;
      leg.rotation.x = 0.28;
      leg.rotation.y = -angle;
      this.group.add(leg);
    }

    // Accessory spreader tray
    const trayGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.02, 3);
    const tray = new THREE.Mesh(trayGeo, mountMat);
    tray.position.y = 0.65;
    this.group.add(tray);
    
    // Mount head
    const mountGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.28, 16);
    const mount = new THREE.Mesh(mountGeo, mountMat);
    mount.position.y = 1.4;
    this.group.add(mount);
    
    // Counterweight bar & weight
    const cwBar = new THREE.CylinderGeometry(0.012, 0.012, 0.45);
    const barMesh = new THREE.Mesh(cwBar, legMat);
    barMesh.position.set(0, 1.2, -0.22);
    barMesh.rotation.x = Math.PI / 4;
    this.group.add(barMesh);
    
    const cwWeight = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 16);
    const weightMesh = new THREE.Mesh(cwWeight, mountMat);
    weightMesh.position.set(0, 1.05, -0.37);
    weightMesh.rotation.x = Math.PI / 4;
    this.group.add(weightMesh);
    
    // ==========================================
    // 3. Optical Tube Assembly (OTA)
    // ==========================================
    this.tubeGroup = new THREE.Group();
    this.tubeGroup.position.set(0, 1.55, 0);
    
    // Main optical tube
    const tubeGeo = new THREE.CylinderGeometry(0.13, 0.13, 1.05, 24);
    tubeGeo.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    this.tubeGroup.add(tube);

    // Front brass aperture ring
    const ringAperture = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.012, 8, 24), accentMat);
    ringAperture.position.z = 0.525;
    this.tubeGroup.add(ringAperture);

    // Front lens glass
    const lensGeo = new THREE.CircleGeometry(0.125, 24);
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0x0055ff,
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.6,
      transparent: true,
      opacity: 0.9
    });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.z = 0.52;
    this.tubeGroup.add(lens);
    
    // Finder scope
    const finder = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 12), mountMat);
    finder.geometry.rotateX(Math.PI / 2);
    finder.position.set(0.11, 0.16, 0);
    this.tubeGroup.add(finder);
    
    // Eyepiece
    const epGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.12, 12);
    this.eyepieceMesh = new THREE.Mesh(epGeo, accentMat);
    this.eyepieceMesh.position.set(0, 0.13, -0.45);
    this.tubeGroup.add(this.eyepieceMesh);
    
    // Soft red night-vision glow at eyepiece
    this.eyepieceGlow = new THREE.PointLight(0xef4444, 0.8, 2.0);
    this.eyepieceMesh.add(this.eyepieceGlow);

    // ==========================================
    // 4. Mounted 532nm Green Laser Pointer Assembly
    // ==========================================
    this.mountedLaserGroup = new THREE.Group();
    const laserOffset = new THREE.Vector3(-0.11, 0.16, 0.3);

    // 1. Dovetail mounting clamp bracket
    const clampGeo = new THREE.BoxGeometry(0.035, 0.035, 0.12);
    const clamp = new THREE.Mesh(clampGeo, mountMat);
    clamp.position.set(laserOffset.x, laserOffset.y - 0.02, laserOffset.z);
    this.mountedLaserGroup.add(clamp);

    // 2. Laser pointer cylinder body (matte dark alloy with brass accent)
    const laserBodyGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 16);
    laserBodyGeo.rotateX(Math.PI / 2);
    const laserBodyMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.85,
      roughness: 0.2
    });
    const laserBody = new THREE.Mesh(laserBodyGeo, laserBodyMat);
    laserBody.position.copy(laserOffset);
    this.mountedLaserGroup.add(laserBody);

    // 3. Brass emitter bezel ring
    const bezelGeo = new THREE.TorusGeometry(0.016, 0.003, 8, 16);
    const bezel = new THREE.Mesh(bezelGeo, accentMat);
    bezel.position.set(laserOffset.x, laserOffset.y, laserOffset.z + 0.11);
    this.mountedLaserGroup.add(bezel);

    // 4. Emerald aperture glow point light
    const emitterGlow = new THREE.PointLight(0x34d399, 1.2, 2.0);
    emitterGlow.position.set(laserOffset.x, laserOffset.y, laserOffset.z + 0.13);
    this.mountedLaserGroup.add(emitterGlow);

    // 5. Emerald Laser Beam (Intense core + atmospheric Rayleigh scatter)
    const beamStart = new THREE.Vector3(laserOffset.x, laserOffset.y, laserOffset.z + 0.12);
    const beamEnd = new THREE.Vector3(laserOffset.x, laserOffset.y, 2500);

    const coreBeamGeo = new THREE.BufferGeometry().setFromPoints([beamStart, beamEnd]);
    const coreBeamMat = new THREE.LineBasicMaterial({
      color: 0xd1fae5,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const coreBeam = new THREE.Line(coreBeamGeo, coreBeamMat);
    coreBeam.frustumCulled = false;
    this.mountedLaserGroup.add(coreBeam);

    const scatterBeamMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      linewidth: 6,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const scatterBeam = new THREE.Line(coreBeamGeo, scatterBeamMat);
    scatterBeam.frustumCulled = false;
    this.mountedLaserGroup.add(scatterBeam);

    // 6. Sky target dot sprite (shines on the celestial dome)
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
    const dotSprite = new THREE.Sprite(dotMat);
    dotSprite.position.set(laserOffset.x, laserOffset.y, 1000);
    dotSprite.scale.set(16, 16, 1);
    this.mountedLaserGroup.add(dotSprite);

    this.tubeGroup.add(this.mountedLaserGroup);

    this.mountedLaserGroup.visible = gameStore.getState().isLaserPointerMounted;
    gameStore.subscribe((state) => {
      this.mountedLaserGroup.visible = state.isLaserPointerMounted;
    });
    
    this.group.add(this.tubeGroup);

    // Soft beacon light for visibility at night
    this.beaconLight = new THREE.PointLight(0x38bdf8, 1.2, 8);
    this.beaconLight.position.set(0, 2.2, 0);
    this.group.add(this.beaconLight);

    scene.add(this.group);
  }

  public setMountedLaserVisible(visible: boolean) {
    if (this.mountedLaserGroup) {
      this.mountedLaserGroup.visible = visible;
    }
  }
  
  public isPlayerNear(playerPos: THREE.Vector3): boolean {
    return this.group.position.distanceTo(playerPos) < this.interactionDistance;
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public setPosition(pos: THREE.Vector3, rotY?: number) {
    this.group.position.copy(pos);
    if (rotY !== undefined) {
      this.group.rotation.y = rotY;
    }
  }

  public getRotationY(): number {
    return this.group.rotation.y;
  }

  public getTubeWorldPosition(): THREE.Vector3 {
    const pos = new THREE.Vector3(0, 0, 0.52);
    this.tubeGroup.localToWorld(pos);
    return pos;
  }

  public getOpticalDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, 1);
    dir.applyQuaternion(this.tubeGroup.quaternion);
    return dir.normalize();
  }
  
  public updatePointing(targetWorldDir: THREE.Vector3) {
    const dir = targetWorldDir.clone().normalize();
    if (dir.y < 0.08) {
      dir.y = 0.08;
      dir.normalize();
    }
    this.tubeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  }
  
  public update(playerPos: THREE.Vector3) {
    if (this.isPlayerNear(playerPos)) {
      this.eyepieceGlow.intensity = 1.2;
    } else {
      this.eyepieceGlow.intensity = 0.5;
    }
  }
  
  public getEyepieceWorldPosition(): THREE.Vector3 {
    const pos = new THREE.Vector3();
    this.eyepieceMesh.getWorldPosition(pos);
    return pos;
  }
  
  public setVisible(visible: boolean) {
    this.group.visible = visible;
  }
  
  public dispose() {
    this.group.parent?.remove(this.group);
  }
}
