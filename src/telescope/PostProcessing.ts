import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 0.3 },
    offset: { value: 1.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float falloff = smoothstep(0.45, 0.75, length(uv));
      gl_FragColor = mix(texel, vec4(0.0, 0.0, 0.0, 1.0), falloff * darkness);
    }
  `
};

const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.000 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      if (amount <= 0.0001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 dir = vUv - vec2(0.5);
      vec4 cR = texture2D(tDiffuse, vUv + dir * amount);
      vec4 cG = texture2D(tDiffuse, vUv);
      vec4 cB = texture2D(tDiffuse, vUv - dir * amount);
      gl_FragColor = vec4(cR.r, cG.g, cB.b, 1.0);
    }
  `
};

import { StarTrailShader, StarTrailCamera } from './StarTrailCamera';

export class PostProcessing {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private rawTarget: THREE.WebGLRenderTarget;

  private composer: EffectComposer;
  private renderPass: RenderPass;
  private starTrailPass: ShaderPass;
  private bloomPass: UnrealBloomPass;
  private vignettePass: ShaderPass;
  private caPass: ShaderPass;

  // Ultra-fast single-pass direct screen blit for Star Trail mode
  private screenQuadScene: THREE.Scene;
  private screenQuadCamera: THREE.OrthographicCamera;
  private screenQuadMesh: THREE.Mesh;
  private screenQuadMat: THREE.MeshBasicMaterial;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.rawTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    });

    this.screenQuadScene = new THREE.Scene();
    this.screenQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.screenQuadMat = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false });
    this.screenQuadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.screenQuadMat);
    this.screenQuadScene.add(this.screenQuadMesh);

    this.composer = new EffectComposer(renderer);
    
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.starTrailPass = new ShaderPass(StarTrailShader);
    this.composer.addPass(this.starTrailPass);
    
    const bloomRes = new THREE.Vector2(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
    // Optimized half-resolution bloom for high FPS and smooth soft glow
    this.bloomPass = new UnrealBloomPass(bloomRes, 0.35, 0.2, 0.92);
    this.composer.addPass(this.bloomPass);
    
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms.darkness.value = 0.25;
    this.composer.addPass(this.vignettePass);
    
    this.caPass = new ShaderPass(ChromaticAberrationShader);
    this.caPass.uniforms.amount.value = 0.000;
    this.composer.addPass(this.caPass);
  }

  public setTelescopeMode(enabled: boolean, caAmount: number, sunElevation: number = -0.5) {
    const isDay = sunElevation > 0.02;
    if (enabled) {
      this.bloomPass.strength = isDay ? 0.05 : 0.55;
      this.bloomPass.threshold = isDay ? 0.99 : 0.88;
      this.vignettePass.uniforms.darkness.value = 1.0;
      this.caPass.uniforms.amount.value = Math.min(caAmount * 0.005, 0.015);
    } else {
      this.bloomPass.strength = isDay ? 0.02 : 0.25;
      this.bloomPass.threshold = isDay ? 0.99 : 0.93;
      this.vignettePass.uniforms.darkness.value = 0.2;
      this.caPass.uniforms.amount.value = 0.000;
    }
  }

  public render(starTrailCamera?: StarTrailCamera) {
    if (starTrailCamera && starTrailCamera.active) {
      // 1. Render pristine raw 3D scene ONCE (zero double scene rendering!)
      this.renderer.setRenderTarget(this.rawTarget);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);

      // 2. Accumulate raw frame with Max-Hold
      const accumTexture = starTrailCamera.accumulateRawFrame(this.renderer, this.rawTarget.texture);

      // 3. Ultra-fast single-pass direct screen blit (bypasses heavy 5-pass bloom and composer passes)
      this.screenQuadMat.map = accumTexture;
      this.renderer.render(this.screenQuadScene, this.screenQuadCamera);
      return;
    }

    this.starTrailPass.uniforms.uActive.value = 0.0;
    this.composer.render();
  }

  public resize(width: number, height: number) {
    this.rawTarget.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(Math.floor(width / 2), Math.floor(height / 2));
  }

  public dispose() {
    this.rawTarget.dispose();
    this.screenQuadMesh.geometry.dispose();
    this.screenQuadMat.dispose();
    this.composer.passes.forEach((p: any) => p.dispose?.());
  }
}
