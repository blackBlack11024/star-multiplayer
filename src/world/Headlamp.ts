import * as THREE from 'three';

export type HeadlampMode = 'off' | 'red' | 'white';

export class Headlamp {
  private camera: THREE.Camera;
  private spotLight: THREE.SpotLight;
  private spotTarget: THREE.Object3D;
  private pointLight: THREE.PointLight;
  private currentMode: HeadlampMode = 'red';

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    // Spot target directly in front of camera
    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, 0, -8);
    this.camera.add(this.spotTarget);

    // Forward cone spotlight
    this.spotLight = new THREE.SpotLight(0xff2222, 2.4, 18, Math.PI / 4, 0.5, 1.2);
    this.spotLight.position.set(0, 0, 0);
    this.spotLight.target = this.spotTarget;
    this.camera.add(this.spotLight);

    // Soft point light for ambient fill around the player's immediate feet
    this.pointLight = new THREE.PointLight(0xff2222, 0.6, 5.0);
    this.pointLight.position.set(0, -0.3, 0);
    this.camera.add(this.pointLight);

    this.applyMode(this.currentMode);
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
      this.pointLight.visible = false;
    } else if (mode === 'red') {
      this.spotLight.visible = true;
      this.spotLight.color.setHex(0xff2222);
      this.spotLight.intensity = 2.5;

      this.pointLight.visible = true;
      this.pointLight.color.setHex(0xff2222);
      this.pointLight.intensity = 0.6;
    } else if (mode === 'white') {
      this.spotLight.visible = true;
      this.spotLight.color.setHex(0xfff5ea);
      this.spotLight.intensity = 3.2;

      this.pointLight.visible = true;
      this.pointLight.color.setHex(0xfff5ea);
      this.pointLight.intensity = 0.8;
    }
  }

  public setVisible(visible: boolean) {
    if (!visible) {
      this.spotLight.visible = false;
      this.pointLight.visible = false;
    } else {
      this.applyMode(this.currentMode);
    }
  }

  public dispose() {
    this.camera.remove(this.spotLight);
    this.camera.remove(this.spotTarget);
    this.camera.remove(this.pointLight);
  }
}
