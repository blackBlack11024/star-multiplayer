import * as THREE from 'three';
import { TelescopeSpawnPacket, TelescopeStatePacket } from './NetworkProtocol';

export interface DeployedTelescope {
  id: string;
  ownerId: string;
  ownerName: string;
  level: number;
  group: THREE.Group;
  tubeMesh: THREE.Mesh;
  mountMesh: THREE.Group;
  ra: number;
  dec: number;
  fov: number;
  isLocked: boolean;
  operatorId: string | null;
}

export class MultiplayerTelescopes {
  private scene: THREE.Scene;
  private telescopes: Map<string, DeployedTelescope> = new Map();
  public myTelescopeId: string | null = null;
  public spectatingTelescopeId: string | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Build 3D telescope mesh matching optical tier */
  private createTelescopeMesh(level: number): { group: THREE.Group; tubeMesh: THREE.Mesh; mountMesh: THREE.Group } {
    const group = new THREE.Group();

    // Metallic tripod legs
    const legGeo = new THREE.CylinderGeometry(0.025, 0.035, 1.2, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222226, metalness: 0.8, roughness: 0.3 });

    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(Math.sin(angle) * 0.35, 0.55, Math.cos(angle) * 0.35);
      leg.rotation.z = Math.sin(angle) * 0.3;
      leg.rotation.x = -Math.cos(angle) * 0.3;
      leg.castShadow = true;
      group.add(leg);
    }

    // Mount head
    const mountMesh = new THREE.Group();
    mountMesh.position.y = 1.1;
    const baseHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.7, roughness: 0.3 })
    );
    mountMesh.add(baseHead);

    // Optical Tube Assembly (size and color scaled by level)
    const tubeRadius = Math.min(0.24, 0.06 + level * 0.025);
    const tubeLength = Math.min(1.4, 0.7 + level * 0.1);
    const tubeGeo = new THREE.CylinderGeometry(tubeRadius, tubeRadius, tubeLength, 24);
    tubeGeo.rotateX(Math.PI / 2);

    // Tube material: clean white or metallic dark blue
    const tubeColor = level >= 5 ? 0x0369a1 : level >= 3 ? 0x475569 : 0xf8fafc;
    const tubeMat = new THREE.MeshStandardMaterial({
      color: tubeColor,
      metalness: 0.4,
      roughness: 0.2,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    tubeMesh.castShadow = true;
    mountMesh.add(tubeMesh);

    // Eyepiece 90-degree diagonal & lens
    const eyepieceGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12);
    const eyepiece = new THREE.Mesh(eyepieceGeo, new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 }));
    eyepiece.position.set(0, tubeRadius + 0.05, -tubeLength * 0.35);
    mountMesh.add(eyepiece);

    group.add(mountMesh);
    return { group, tubeMesh, mountMesh };
  }

  /** Spawn or update a deployed telescope in the world */
  public handleTelescopeSpawn(data: TelescopeSpawnPacket) {
    if (this.telescopes.has(data.telescopeId)) {
      const existing = this.telescopes.get(data.telescopeId)!;
      existing.group.position.set(data.pos[0], data.pos[1], data.pos[2]);
      existing.group.rotation.y = data.rotY;
      return;
    }

    const { group, tubeMesh, mountMesh } = this.createTelescopeMesh(data.level);
    group.position.set(data.pos[0], data.pos[1], data.pos[2]);
    group.rotation.y = data.rotY;
    this.scene.add(group);

    this.telescopes.set(data.telescopeId, {
      id: data.telescopeId,
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      level: data.level,
      group,
      tubeMesh,
      mountMesh,
      ra: 0,
      dec: 0,
      fov: 45,
      isLocked: false,
      operatorId: null,
    });
  }

  /** Update pointing and lock status of a telescope */
  public handleTelescopeState(data: TelescopeStatePacket) {
    const t = this.telescopes.get(data.telescopeId);
    if (!t) return;

    t.ra = data.ra;
    t.dec = data.dec;
    t.fov = data.fov;
    t.isLocked = data.isLocked;
    t.operatorId = data.operatorId;

    // Slew optical tube to match RA / Dec
    const decRad = THREE.MathUtils.degToRad(data.dec);
    const raRad = THREE.MathUtils.degToRad(data.ra * 15);
    t.mountMesh.rotation.x = -decRad;
    t.mountMesh.rotation.y = raRad;
  }

  /** Find closest telescope to player position */
  public getClosestTelescope(playerPos: THREE.Vector3, maxDist: number = 2.8): DeployedTelescope | null {
    let closest: DeployedTelescope | null = null;
    let minDist = maxDist;

    this.telescopes.forEach((t) => {
      const dist = playerPos.distanceTo(t.group.position);
      if (dist < minDist) {
        minDist = dist;
        closest = t;
      }
    });

    return closest;
  }

  public getTelescope(id: string): DeployedTelescope | undefined {
    return this.telescopes.get(id);
  }

  public getAllTelescopes(): DeployedTelescope[] {
    return Array.from(this.telescopes.values());
  }

  public removeTelescope(id: string) {
    const t = this.telescopes.get(id);
    if (t) {
      this.scene.remove(t.group);
      this.telescopes.delete(id);
    }
  }

  public dispose() {
    this.telescopes.forEach((t) => this.scene.remove(t.group));
    this.telescopes.clear();
  }
}
