import * as THREE from 'three';

export type HeadlampMode = 'off' | 'red' | 'white';

export class Headlamp {
  private camera: THREE.Camera;
  private scene: THREE.Scene;
  private spotLight: THREE.SpotLight;
  private spotTarget: THREE.Object3D;
  private groundLight: THREE.PointLight;
  private currentMode: HeadlampMode = 'red';

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.camera = camera;
    this.scene = scene;

    // Spot target added to scene so its world transform is always accurate
    this.spotTarget = new THREE.Object3D();
    this.scene.add(this.spotTarget);

    // Forward beam spotlight (60-degree cone, soft edge, linear falloff)
    this.spotLight = new THREE.SpotLight(0xff2222, 6.5, 35, Math.PI / 3, 0.45, 1.0);
    this.spotLight.position.set(0, 0, 0);
    this.spotLight.target = this.spotTarget;
    this.camera.add(this.spotLight);

    // Dedicated ground illumination floodlight (positioned right in front of chest/waist)
    // Ensures the terrain, grass, and ground under and around the player are brightly lit
    this.groundLight = new THREE.PointLight(0xff2222, 4.5, 20.0, 1.0);
    this.groundLight.position.set(0, -0.6, -0.6);
    this.camera.add(this.groundLight);

    this.applyMode(this.currentMode);
  }

  public update() {
    if (this.currentMode === 'off') return;
    // Aim the spotlight forward and slightly downward towards the ground path in front of player
    const forward = new THREE.Vector3(0, -0.22, -1).normalize();
    forward.applyQuaternion(this.camera.quaternion);
    this.spotTarget.position.copy(this.camera.position).addScaledVector(forward, 12);
  }

  public getMode(): HeadlampMode {
    return this.currentMode;
  }

  public setMode(mode: HeadlampMode) {
    this.currentMode = mode;
    this.applyMode(mode);
  }

  public toggle(): HeadlampMode {
    if (this.currentMode === 'off') {
      this.setMode('red');
    } else if (this.currentMode === 'red') {
      this.setMode('white');
    } else {
      this.setMode('off');
    }
    return this.currentMode;
  }

  private applyMode(mode: HeadlampMode) {
    if (mode === 'off') {
      this.spotLight.visible = false;
      this.groundLight.visible = false;
    } else if (mode === 'red') {
      this.spotLight.visible = true;
      this.spotLight.color.setHex(0xff2222);
      this.spotLight.intensity = 6.0;

      this.groundLight.visible = true;
      this.groundLight.color.setHex(0xff2222);
      this.groundLight.intensity = 4.5;
    } else if (mode === 'white') {
      this.spotLight.visible = true;
      this.spotLight.color.setHex(0xfff5ea);
      this.spotLight.intensity = 7.5;

      this.groundLight.visible = true;
      this.groundLight.color.setHex(0xfff5ea);
      this.groundLight.intensity = 5.5;
    }
  }

  public setVisible(visible: boolean) {
    if (!visible) {
      this.spotLight.visible = false;
      this.groundLight.visible = false;
    } else {
      this.applyMode(this.currentMode);
    }
  }

  public dispose() {
    this.camera.remove(this.spotLight);
    this.camera.remove(this.groundLight);
    this.scene.remove(this.spotTarget);
  }
}
