import * as THREE from 'three';
import { PlayerPosture, PlayerUpdatePacket, PlayerJoinPacket } from './NetworkProtocol';

export interface RemotePlayer {
  id: string;
  name: string;
  color: string;
  hatType: number;
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headGroup: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  redHeadlamp: THREE.PointLight;
  headlampBulb: THREE.Mesh;
  laserBeam: THREE.Line;
  laserBeamGeo: THREE.BufferGeometry;
  laserTipSprite: THREE.Sprite;
  laserTargetBadge: HTMLElement;
  laserActive: boolean;
  laserDir: THREE.Vector3;
  laserTargetText: string;
  speechBubbleEl: HTMLElement;
  nameTagEl: HTMLElement;
  containerEl: HTMLElement;
  speechTimeout: any;
  currentPosture: PlayerPosture;
  targetPos: THREE.Vector3;
  targetYaw: number;
  targetPitch: number;
  animTime: number;
}

export class AvatarManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private domOverlay: HTMLElement;
  private players: Map<string, RemotePlayer> = new Map();
  private laserDotTexture: THREE.Texture;
  private isPhotoHidingLasers = false;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.domOverlay = document.createElement('div');
    this.domOverlay.className = 'avatar-overlays-container';
    this.domOverlay.style.position = 'fixed';
    this.domOverlay.style.inset = '0';
    this.domOverlay.style.pointerEvents = 'none';
    this.domOverlay.style.zIndex = '120';
    document.getElementById('ui-overlay')?.appendChild(this.domOverlay);

    // Glowing green target dot texture for laser pointer tips
    const dotCanvas = document.createElement('canvas');
    dotCanvas.width = 64;
    dotCanvas.height = 64;
    const ctx = dotCanvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.3, 'rgba(52, 211, 153, 0.9)');
    grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.35)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    this.laserDotTexture = new THREE.CanvasTexture(dotCanvas);
  }

  /** Spawn or update a remote player */
  public addOrUpdatePlayer(data: PlayerJoinPacket) {
    if (this.players.has(data.id)) {
      const p = this.players.get(data.id)!;
      p.name = data.name;
      p.color = data.color;
      return;
    }

    const group = new THREE.Group();
    group.position.set(data.pos[0], data.pos[1], data.pos[2]);

    // ---- 1. Chubby Puffer Jacket Body ----
    const jacketMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(data.color),
      roughness: 0.45,
      metalness: 0.1,
    });
    // Distinct egg/capsule shaped puffy jacket
    const bodyGeo = new THREE.SphereGeometry(0.38, 16, 16);
    bodyGeo.scale(1.0, 1.25, 0.9);
    const bodyMesh = new THREE.Mesh(bodyGeo, jacketMat);
    bodyMesh.position.y = 0.75;
    bodyMesh.castShadow = true;
    group.add(bodyMesh);

    // ---- 2. Round Cute Head ----
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.28;

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdfc4, roughness: 0.8 });
    const headGeo = new THREE.SphereGeometry(0.24, 16, 16);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headGroup.add(headMesh);

    // Cartoon round goofy eyes
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeGeo = new THREE.SphereGeometry(0.06, 12, 12);
    const pupilGeo = new THREE.SphereGeometry(0.03, 8, 8);

    // Left eye
    const leftEye = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    leftEye.position.set(-0.09, 0.04, 0.21);
    const leftPupil = new THREE.Mesh(pupilGeo, eyePupilMat);
    leftPupil.position.set(-0.09, 0.04, 0.25);
    headGroup.add(leftEye, leftPupil);

    // Right eye
    const rightEye = new THREE.Mesh(eyeGeo, eyeWhiteMat);
    rightEye.position.set(0.09, 0.04, 0.21);
    const rightPupil = new THREE.Mesh(pupilGeo, eyePupilMat);
    rightPupil.position.set(0.09, 0.04, 0.25);
    headGroup.add(rightEye, rightPupil);

    // Cute blushing cheeks
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7788 });
    const blushGeo = new THREE.CircleGeometry(0.035, 12);
    const leftBlush = new THREE.Mesh(blushGeo, blushMat);
    leftBlush.position.set(-0.13, -0.05, 0.22);
    leftBlush.rotation.y = -0.3;
    const rightBlush = new THREE.Mesh(blushGeo, blushMat);
    rightBlush.position.set(0.13, -0.05, 0.22);
    rightBlush.rotation.y = 0.3;
    headGroup.add(leftBlush, rightBlush);

    // Astronomer Red LED Headlamp
    const lampMountGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12);
    lampMountGeo.rotateX(Math.PI / 2);
    const lampMountMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const lampMount = new THREE.Mesh(lampMountGeo, lampMountMat);
    lampMount.position.set(0, 0.16, 0.22);

    const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const redBulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), redLightMat);
    redBulb.position.set(0, 0.16, 0.25);

    const redPointLight = new THREE.PointLight(0xff2222, 0.6, 3.5);
    redPointLight.position.set(0, 0.16, 0.35);
    headGroup.add(lampMount, redBulb, redPointLight);

    // ---- 3. Hats & Silly Accessories (per hatType) ----
    const hatType = data.hatType % 5;
    if (hatType === 0) {
      // Beanie with bouncy pompom
      const beanieGeo = new THREE.SphereGeometry(0.26, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const beanieMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.9 });
      const beanie = new THREE.Mesh(beanieGeo, beanieMat);
      beanie.position.y = 0.08;
      const pompom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      pompom.position.y = 0.34;
      headGroup.add(beanie, pompom);
    } else if (hatType === 1) {
      // Oversized warm fluffy earmuffs
      const muffMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.8 });
      const bandGeo = new THREE.TorusGeometry(0.26, 0.025, 8, 24, Math.PI);
      const band = new THREE.Mesh(bandGeo, new THREE.MeshStandardMaterial({ color: 0x111111 }));
      band.rotation.z = Math.PI;
      band.position.y = 0.05;
      const muffLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), muffMat);
      muffLeft.rotation.z = Math.PI / 2;
      muffLeft.position.set(-0.25, 0.05, 0);
      const muffRight = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), muffMat);
      muffRight.rotation.z = Math.PI / 2;
      muffRight.position.set(0.25, 0.05, 0);
      headGroup.add(band, muffLeft, muffRight);
    } else if (hatType === 2) {
      // Goofy star glasses
      const glassesMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
      const starRingL = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 5), glassesMat);
      starRingL.position.set(-0.09, 0.04, 0.25);
      const starRingR = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 5), glassesMat);
      starRingR.position.set(0.09, 0.04, 0.25);
      headGroup.add(starRingL, starRingR);
    } else if (hatType === 3) {
      // Fluffy fur hood
      const hoodGeo = new THREE.TorusGeometry(0.28, 0.08, 12, 24);
      const hoodMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.95 });
      const hood = new THREE.Mesh(hoodGeo, hoodMat);
      hood.rotation.x = Math.PI / 6;
      hood.position.set(0, 0.02, -0.05);
      headGroup.add(hood);
    } else {
      // Night aviator goggles pushed up onto forehead
      const goggleMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.3 });
      const goggleL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), goggleMat);
      goggleL.rotation.x = Math.PI / 2;
      goggleL.position.set(-0.09, 0.18, 0.2);
      const goggleR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), goggleMat);
      goggleR.rotation.x = Math.PI / 2;
      goggleR.position.set(0.09, 0.18, 0.2);
      headGroup.add(goggleL, goggleR);
    }

    group.add(headGroup);

    // ---- 4. Stubby Arms & Legs ----
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const legGeo = new THREE.CapsuleGeometry(0.09, 0.3, 8, 8);
    const leftLeg = new THREE.Mesh(legGeo, limbMat);
    leftLeg.position.set(-0.16, 0.25, 0);
    const rightLeg = new THREE.Mesh(legGeo, limbMat);
    rightLeg.position.set(0.16, 0.25, 0);
    group.add(leftLeg, rightLeg);

    const armGeo = new THREE.CapsuleGeometry(0.08, 0.28, 8, 8);
    const leftArm = new THREE.Mesh(armGeo, jacketMat);
    leftArm.position.set(-0.4, 0.75, 0);
    const rightArm = new THREE.Mesh(armGeo, jacketMat);
    rightArm.position.set(0.4, 0.75, 0);
    group.add(leftArm, rightArm);

    // ---- 5. Green Laser Pointer Beam & Sky Tip Sprite ----
    const laserBeamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 50, 0),
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: 0x22ff55,
      linewidth: 3,
      transparent: true,
      opacity: 0.85,
    });
    const laserBeam = new THREE.Line(laserBeamGeo, laserMat);
    laserBeam.frustumCulled = false;
    laserBeam.visible = false;
    this.scene.add(laserBeam);

    const dotMat = new THREE.SpriteMaterial({
      map: this.laserDotTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const laserTipSprite = new THREE.Sprite(dotMat);
    laserTipSprite.scale.set(14, 14, 1);
    laserTipSprite.visible = false;
    this.scene.add(laserTipSprite);

    this.scene.add(group);

    // ---- 6. 2D Overhead DOM Nametag & Speech Bubble ----
    const containerEl = document.createElement('div');
    containerEl.className = 'remote-player-overhead';
    containerEl.style.position = 'absolute';
    containerEl.style.transform = 'translate(-50%, -100%)';
    containerEl.style.display = 'flex';
    containerEl.style.flexDirection = 'column';
    containerEl.style.alignItems = 'center';
    containerEl.style.gap = '4px';

    const speechBubbleEl = document.createElement('div');
    speechBubbleEl.className = 'remote-speech-bubble';
    speechBubbleEl.style.display = 'none';
    speechBubbleEl.style.background = 'rgba(15, 23, 42, 0.92)';
    speechBubbleEl.style.color = '#f8fafc';
    speechBubbleEl.style.border = '1px solid rgba(56, 189, 248, 0.4)';
    speechBubbleEl.style.borderRadius = '12px';
    speechBubbleEl.style.padding = '6px 12px';
    speechBubbleEl.style.fontSize = '13px';
    speechBubbleEl.style.fontWeight = '500';
    speechBubbleEl.style.maxWidth = '220px';
    speechBubbleEl.style.boxShadow = '0 4px 16px rgba(0,0,0,0.5)';
    speechBubbleEl.style.transition = 'opacity 0.4s ease';

    const nameTagEl = document.createElement('div');
    nameTagEl.className = 'remote-nametag';
    nameTagEl.textContent = data.name;
    nameTagEl.style.background = 'rgba(0,0,0,0.6)';
    nameTagEl.style.color = data.color;
    nameTagEl.style.border = `1px solid ${data.color}88`;
    nameTagEl.style.borderRadius = '6px';
    nameTagEl.style.padding = '2px 8px';
    nameTagEl.style.fontSize = '11px';
    nameTagEl.style.fontWeight = '600';
    nameTagEl.style.letterSpacing = '0.04em';

    containerEl.appendChild(speechBubbleEl);
    containerEl.appendChild(nameTagEl);
    this.domOverlay.appendChild(containerEl);

    // Floating 2D label at the sky tip of the laser beam
    const laserTargetBadge = document.createElement('div');
    laserTargetBadge.className = 'laser-target-label';
    laserTargetBadge.style.display = 'none';
    this.domOverlay.appendChild(laserTargetBadge);

    this.players.set(data.id, {
      id: data.id,
      name: data.name,
      color: data.color,
      hatType,
      group,
      bodyMesh,
      headGroup,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      redHeadlamp: redPointLight,
      headlampBulb: redBulb,
      laserBeam,
      laserBeamGeo,
      laserTipSprite,
      laserTargetBadge,
      laserActive: false,
      laserDir: new THREE.Vector3(0, 0.7, -0.7).normalize(),
      laserTargetText: '',
      speechBubbleEl,
      nameTagEl,
      containerEl,
      speechTimeout: null,
      currentPosture: 'stand',
      targetPos: new THREE.Vector3(data.pos[0], data.pos[1], data.pos[2]),
      targetYaw: 0,
      targetPitch: 0,
      animTime: 0,
    });
  }

  /** Update player position, posture and orientation */
  public updatePlayerState(pkt: PlayerUpdatePacket) {
    const p = this.players.get(pkt.id);
    if (!p) return;

    p.targetPos.set(pkt.pos[0], pkt.pos[1], pkt.pos[2]);
    p.targetYaw = pkt.yaw;
    p.targetPitch = pkt.pitch;
    p.currentPosture = pkt.posture;

    // Headlamp state sync
    if (pkt.headlampMode === 'off') {
      p.redHeadlamp.visible = false;
      (p.headlampBulb.material as THREE.MeshBasicMaterial).color.setHex(0x222222);
    } else if (pkt.headlampMode === 'white') {
      p.redHeadlamp.visible = true;
      p.redHeadlamp.color.setHex(0xfff5ea);
      p.redHeadlamp.intensity = 1.0;
      (p.headlampBulb.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
    } else {
      p.redHeadlamp.visible = true;
      p.redHeadlamp.color.setHex(0xff2222);
      p.redHeadlamp.intensity = 0.6;
      (p.headlampBulb.material as THREE.MeshBasicMaterial).color.setHex(0xff2222);
    }

    // Laser pointer sync
    p.laserActive = Boolean(pkt.laserActive);
    if (pkt.laserDir) {
      p.laserDir.set(pkt.laserDir[0], pkt.laserDir[1], pkt.laserDir[2]).normalize();
    }
    p.laserTargetText = pkt.laserTarget || '';
  }

  /** Display a comic speech bubble over a player's head */
  public showSpeechBubble(playerId: string, text: string) {
    const p = this.players.get(playerId);
    if (!p) return;

    p.speechBubbleEl.textContent = text;
    p.speechBubbleEl.style.display = 'block';
    p.speechBubbleEl.style.opacity = '1';

    if (p.speechTimeout) clearTimeout(p.speechTimeout);
    p.speechTimeout = setTimeout(() => {
      p.speechBubbleEl.style.opacity = '0';
      setTimeout(() => {
        p.speechBubbleEl.style.display = 'none';
      }, 400);
    }, 6000);
  }

  /** Remove player */
  public removePlayer(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;

    this.scene.remove(p.group);
    this.scene.remove(p.laserBeam);
    this.scene.remove(p.laserTipSprite);
    p.laserBeamGeo.dispose();
    p.laserTipSprite.material.dispose();
    p.laserTargetBadge.remove();
    p.containerEl.remove();
    this.players.delete(playerId);
  }

  /** Temporarily hide all laser beams for pristine photography */
  public hideLasersForPhoto(hide: boolean) {
    this.isPhotoHidingLasers = hide;
    this.players.forEach((p) => {
      if (hide) {
        p.laserBeam.visible = false;
        p.laserTipSprite.visible = false;
        p.laserTargetBadge.style.display = 'none';
      }
    });
  }

  /** Animation and projection loop */
  public update(deltaTime: number) {
    const tempVec = new THREE.Vector3();

    this.players.forEach((p) => {
      p.animTime += deltaTime;

      // Smooth position lerp
      p.group.position.lerp(p.targetPos, Math.min(1.0, deltaTime * 12));

      // Handle Postures & Animations
      if (p.currentPosture === 'lie_down') {
        p.group.rotation.x = -Math.PI / 2;
        p.group.rotation.y = p.targetYaw;
        p.group.position.y = 0.22;
        p.leftLeg.rotation.x = 0;
        p.rightLeg.rotation.x = 0;
        p.leftArm.rotation.x = 0;
        p.rightArm.rotation.x = 0;
      } else if (p.currentPosture === 'in_telescope') {
        p.group.rotation.x = 0;
        p.group.rotation.y = p.targetYaw;
        p.headGroup.rotation.x = 0.45;
        p.bodyMesh.rotation.x = 0.35;
        p.leftLeg.rotation.x = 0;
        p.rightLeg.rotation.x = 0;
      } else {
        p.group.rotation.x = 0;
        p.group.rotation.y = p.targetYaw;
        p.headGroup.rotation.x = p.targetPitch;
        p.bodyMesh.rotation.x = 0;

        if (p.currentPosture === 'walk' || p.currentPosture === 'run') {
          const speed = p.currentPosture === 'run' ? 14 : 8;
          const legSwing = Math.sin(p.animTime * speed) * 0.6;
          p.leftLeg.rotation.x = legSwing;
          p.rightLeg.rotation.x = -legSwing;
          p.leftArm.rotation.x = -legSwing * 0.7;
          p.rightArm.rotation.x = legSwing * 0.7;
        } else {
          p.leftLeg.rotation.x = 0;
          p.rightLeg.rotation.x = 0;
          p.leftArm.rotation.x = Math.sin(p.animTime * 2) * 0.05;
          p.rightArm.rotation.x = -Math.sin(p.animTime * 2) * 0.05;
        }
      }

      // 1. Update Laser Beam & Sky Target Badge at the beam tip
      if (p.laserActive && !this.isPhotoHidingLasers) {
        // Origin of beam in world space (around remote player's chest level: height ~1.3m)
        const beamStart = p.group.position.clone().add(new THREE.Vector3(0, 1.3, 0));
        const beamEnd = beamStart.clone().addScaledVector(p.laserDir, 1200);
        const skyTip = beamStart.clone().addScaledVector(p.laserDir, 800);

        p.laserBeamGeo.setFromPoints([beamStart, beamEnd]);
        p.laserBeam.visible = true;

        p.laserTipSprite.position.copy(skyTip);
        p.laserTipSprite.visible = true;

        if (p.laserTargetText) {
          tempVec.copy(skyTip).project(this.camera);
          // Check if tip is in front of camera
          if (tempVec.z < 1.0) {
            const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(tempVec.y * 0.5) + 0.5) * window.innerHeight;
            p.laserTargetBadge.textContent = p.laserTargetText;
            p.laserTargetBadge.style.display = 'block';
            p.laserTargetBadge.style.left = `${x}px`;
            p.laserTargetBadge.style.top = `${y}px`;
          } else {
            p.laserTargetBadge.style.display = 'none';
          }
        } else {
          p.laserTargetBadge.style.display = 'none';
        }
      } else {
        p.laserBeam.visible = false;
        p.laserTipSprite.visible = false;
        p.laserTargetBadge.style.display = 'none';
      }

      // 2. Project overhead nametag and speech bubble to 2D screen space
      tempVec.set(p.group.position.x, p.group.position.y + 1.85, p.group.position.z);
      tempVec.project(this.camera);

      // Check if behind camera
      if (tempVec.z > 1.0) {
        p.containerEl.style.display = 'none';
      } else {
        p.containerEl.style.display = 'flex';
        const screenX = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (-(tempVec.y * 0.5) + 0.5) * window.innerHeight;
        p.containerEl.style.left = `${screenX}px`;
        p.containerEl.style.top = `${screenY}px`;
      }
    });
  }

  public dispose() {
    this.players.forEach((p) => {
      this.scene.remove(p.group);
      this.scene.remove(p.laserBeam);
      this.scene.remove(p.laserTipSprite);
      p.laserBeamGeo.dispose();
      p.laserTipSprite.material.dispose();
      p.laserTargetBadge.remove();
      p.containerEl.remove();
    });
    this.players.clear();
    this.laserDotTexture.dispose();
    this.domOverlay.remove();
  }
}
