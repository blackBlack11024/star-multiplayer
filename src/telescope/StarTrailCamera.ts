import * as THREE from 'three';
import { gameStore } from '../game/GameStore';
import { GameMode, Photo, PhotoQuality, TargetType, WeatherState } from '../types';

export const StarTrailShader = {
  uniforms: {
    tDiffuse: { value: null },
    tAccum: { value: null },
    uActive: { value: 0.0 },
    uFirstFrame: { value: 0.0 },
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
    uniform sampler2D tAccum;
    uniform float uActive;
    varying vec2 vUv;

    void main() {
      if (uActive < 0.5) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      // When Star Trail Camera is active, display the clean accumulated texture
      gl_FragColor = texture2D(tAccum, vUv);
    }
  `
};

const rawBlendShader = {
  uniforms: {
    tCurrent: { value: null },
    tAccum: { value: null },
    uFirstFrame: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tCurrent;
    uniform sampler2D tAccum;
    uniform float uFirstFrame;
    varying vec2 vUv;

    void main() {
      vec4 curr = texture2D(tCurrent, vUv);
      if (uFirstFrame > 0.5) {
        gl_FragColor = curr;
        return;
      }
      vec4 acc = texture2D(tAccum, vUv);

      // Pure Max-Hold starlight accumulation:
      // Preserves pure dark night sky, traces crisp luminous star arcs without blowout
      vec3 maxColor = max(curr.rgb, acc.rgb);
      maxColor = clamp(maxColor, 0.0, 1.0);

      gl_FragColor = vec4(maxColor, 1.0);
    }
  `
};

export class StarTrailCamera {
  private renderer: THREE.WebGLRenderer;
  private width: number;
  private height: number;

  private accumTargetA: THREE.WebGLRenderTarget;
  private accumTargetB: THREE.WebGLRenderTarget;
  private bufferIdx = 0;

  private blendScene: THREE.Scene;
  private blendCamera: THREE.OrthographicCamera;
  private blendMaterial: THREE.ShaderMaterial;
  private blendQuad: THREE.Mesh;

  private isExposing = false;
  private isFirstFrame = true;
  private startTime = 0;
  private sampleCount = 0;

  // Key tracking
  private isHoldingT = false;
  private isHoldingR = false;
  private currentSpeedMagnitude = 60;
  private currentTimeScale = 60;
  private savedTimeScale = 1;
  private lastStoreUpdateTime = 0;

  // UI Viewfinder
  private overlay: HTMLElement | null = null;
  private speedLabel: HTMLElement | null = null;
  private timeLabel: HTMLElement | null = null;

  constructor(renderer: THREE.WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;
    this.width = width;
    this.height = height;

    const rtOptions = {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    };

    this.accumTargetA = new THREE.WebGLRenderTarget(width, height, rtOptions);
    this.accumTargetB = new THREE.WebGLRenderTarget(width, height, rtOptions);

    this.blendScene = new THREE.Scene();
    this.blendCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blendMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tAccum: { value: null },
        uFirstFrame: { value: 1.0 },
      },
      vertexShader: rawBlendShader.vertexShader,
      fragmentShader: rawBlendShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.blendQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blendMaterial);
    this.blendScene.add(this.blendQuad);

    this.createViewfinderUI();
  }

  private createViewfinderUI() {
    const parent = document.getElementById('ui-overlay');
    if (!parent) return;

    this.overlay = document.createElement('div');
    this.overlay.className = 'star-trail-viewfinder';
    this.overlay.style.display = 'none';

    this.overlay.innerHTML = `
      <div class="st-corners">
        <span class="st-corner tl"></span>
        <span class="st-corner tr"></span>
        <span class="st-corner bl"></span>
        <span class="st-corner br"></span>
      </div>
      <div class="st-header">
        <span class="st-rec-dot"></span>
        <span class="st-title">星軌專用相機 · 曝光累積中</span>
      </div>
      <div class="st-bottom">
        <div class="st-speed" id="st-speed-text">時間流速: +60x (時間快轉)</div>
        <div class="st-exposure" id="st-time-text">曝光累積: 0.0s</div>
        <div class="st-hints">按住 [T] 快轉加速 · 按住 [R] 倒轉加速（同等倍數） · 放開自動存入照片庫</div>
      </div>
    `;

    parent.appendChild(this.overlay);
    this.speedLabel = this.overlay.querySelector('#st-speed-text');
    this.timeLabel = this.overlay.querySelector('#st-time-text');
  }

  public isEquipped(): boolean {
    const state = gameStore.getState();
    const completedIds: string[] = state.completedQuestIds || [];

    // If player has completed the quest, automatically unlock and equip
    if (completedIds.includes('ch5_all_planets') || completedIds.includes('ch6_southern_wonders') || completedIds.includes('ch5_mount_laser')) {
      const acc = (state.accessories || []).find((a: any) => a.id === 'camera_startrail');
      if (acc && (!acc.owned || acc.equipped === false)) {
        state.unlockAccessory('camera_startrail');
      }
      return true;
    }

    return (state.accessories || []).some(
      (a: any) => a.id === 'camera_startrail' && a.owned && a.equipped !== false
    );
  }

  public get active(): boolean {
    return this.isExposing;
  }

  private lastSunElevation = -0.5;

  public onKeyDown(key: 'T' | 'R') {
    if (!this.isEquipped()) return;
    const state = gameStore.getState();
    if (state.gameMode !== GameMode.Walk) return;

    if (this.lastSunElevation > 0.05) {
      document.dispatchEvent(new CustomEvent('show-notification', {
        detail: { message: '日間陽光強烈，星軌相機僅限夜間觀星（按 B 鍵可跳轉至夜間時段）', type: 'info' }
      }));
      return;
    }

    if (key === 'T') this.isHoldingT = true;
    if (key === 'R') this.isHoldingR = true;

    if (!this.isExposing) {
      this.startExposure(key === 'R' ? 'reverse' : 'forward');
    }
  }

  public onKeyUp(key: 'T' | 'R') {
    if (key === 'T') this.isHoldingT = false;
    if (key === 'R') this.isHoldingR = false;

    // When both T and R are released, automatically finish and save to gallery!
    if (this.isExposing && !this.isHoldingT && !this.isHoldingR) {
      this.finishExposure();
    }
  }

  private startExposure(direction: 'forward' | 'reverse' = 'forward') {
    this.isExposing = true;
    this.isFirstFrame = true;
    this.startTime = performance.now();
    this.sampleCount = 0;
    this.savedTimeScale = gameStore.getState().timeScale || 1;
    this.currentSpeedMagnitude = 60;
    this.currentTimeScale = direction === 'reverse' ? -60 : 60;

    // Reset render targets
    this.renderer.setRenderTarget(this.accumTargetA);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.accumTargetB);
    this.renderer.clear();
    this.renderer.setRenderTarget(null);
    this.bufferIdx = 0;

    if (this.overlay) this.overlay.style.display = 'block';
    gameStore.getState().setTimeScale(this.currentTimeScale);
  }

  public update(deltaTime: number, sunElevation: number = -0.5) {
    this.lastSunElevation = sunElevation;
    if (!this.isExposing) return;

    // In astrophotography, star trail exposures stop before morning daylight floods the sky
    if (sunElevation > -0.05) {
      document.dispatchEvent(new CustomEvent('show-notification', {
        detail: { message: '黎明晨光破曉，星軌相機已自動為您保存夜空星軌作品！', type: 'info' }
      }));
      this.finishExposure();
      return;
    }

    this.sampleCount++;

    const growthRate = 2.5; // Exponential speed growth rate

    if (this.isHoldingT && !this.isHoldingR) {
      // Fast forward: accelerate from +60x up to +7200x
      this.currentSpeedMagnitude = Math.min(7200, this.currentSpeedMagnitude * Math.pow(growthRate, deltaTime));
      this.currentTimeScale = this.currentSpeedMagnitude;
    } else if (this.isHoldingR && !this.isHoldingT) {
      // Rewind: accelerate in reverse from -60x down to -7200x (identical multiplier rate!)
      this.currentSpeedMagnitude = Math.min(7200, this.currentSpeedMagnitude * Math.pow(growthRate, deltaTime));
      this.currentTimeScale = -this.currentSpeedMagnitude;
    } else if (this.isHoldingT && this.isHoldingR) {
      // Both held: gently stabilize
      this.currentSpeedMagnitude = Math.max(60, this.currentSpeedMagnitude * Math.pow(0.5, deltaTime));
      this.currentTimeScale = Math.sign(this.currentTimeScale || 1) * this.currentSpeedMagnitude;
    }

    // Throttle store updates to ~4Hz to prevent subscriber flood, DOM thrashing, and WebRTC network congestion
    const now = performance.now();
    if (now - this.lastStoreUpdateTime > 200) {
      this.lastStoreUpdateTime = now;
      const roundedScale = Math.round(this.currentTimeScale);
      if (gameStore.getState().timeScale !== roundedScale) {
        gameStore.getState().setTimeScale(roundedScale);
      }
    }

    const elapsed = (performance.now() - this.startTime) / 1000;
    const roundedScale = Math.round(this.currentTimeScale);
    const absScale = Math.abs(roundedScale);
    const isRewind = roundedScale < 0;

    if (this.speedLabel) {
      this.speedLabel.textContent = `時間流速: ${isRewind ? '-' : '+'}${absScale}x (${isRewind ? '時空倒轉' : '時間快轉'})`;
    }
    if (this.timeLabel) {
      const simMinutes = (elapsed * absScale) / 60;
      const simHours = simMinutes / 60;
      const timeSpanText = simHours >= 1 ? `${simHours.toFixed(1)} 小時` : `${Math.round(simMinutes)} 分鐘`;
      this.timeLabel.textContent = `曝光時間: ${elapsed.toFixed(1)}s (天球${isRewind ? '倒轉' : '運轉'}約 ${timeSpanText})`;
    }
  }

  public accumulateRawFrame(renderer: THREE.WebGLRenderer, rawTexture: THREE.Texture): THREE.Texture {
    if (!this.isExposing) return rawTexture;

    const currentAccum = this.bufferIdx === 0 ? this.accumTargetA : this.accumTargetB;
    const nextAccum = this.bufferIdx === 0 ? this.accumTargetB : this.accumTargetA;

    this.blendMaterial.uniforms.tCurrent.value = rawTexture;
    this.blendMaterial.uniforms.tAccum.value = currentAccum.texture;
    this.blendMaterial.uniforms.uFirstFrame.value = this.isFirstFrame ? 1.0 : 0.0;

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(nextAccum);
    renderer.render(this.blendScene, this.blendCamera);
    renderer.setRenderTarget(prevTarget);

    this.bufferIdx = 1 - this.bufferIdx;
    this.isFirstFrame = false;

    return nextAccum.texture;
  }

  private finishExposure() {
    if (!this.isExposing) return;
    this.isExposing = false;

    if (this.overlay) this.overlay.style.display = 'none';

    // Trigger visual shutter flash
    this.triggerShutterFlash();

    // Play camera shutter sound
    document.dispatchEvent(new CustomEvent('play-shutter-sound'));

    // Export accumulated photo
    const state = gameStore.getState();
    const finalTarget = this.bufferIdx === 0 ? this.accumTargetA : this.accumTargetB;
    const buffer = new Uint8Array(this.width * this.height * 4);
    this.renderer.readRenderTargetPixels(finalTarget, 0, 0, this.width, this.height, buffer);

    // Optimize export canvas resolution (max 1280px) to produce crisp ~120KB images that easily fit into localStorage
    const aspect = this.width / this.height;
    let exportW = this.width;
    let exportH = this.height;
    const maxDim = 1280;
    if (exportW > maxDim || exportH > maxDim) {
      if (exportW >= exportH) {
        exportW = maxDim;
        exportH = Math.round(maxDim / aspect);
      } else {
        exportH = maxDim;
        exportW = Math.round(maxDim * aspect);
      }
    }

    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = this.width;
    rawCanvas.height = this.height;
    const rawCtx = rawCanvas.getContext('2d');

    if (rawCtx && this.sampleCount >= 1) {
      const imgData = rawCtx.createImageData(this.width, this.height);
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const srcIdx = (y * this.width + x) * 4;
          const dstIdx = ((this.height - 1 - y) * this.width + x) * 4;
          imgData.data[dstIdx] = buffer[srcIdx];
          imgData.data[dstIdx + 1] = buffer[srcIdx + 1];
          imgData.data[dstIdx + 2] = buffer[srcIdx + 2];
          imgData.data[dstIdx + 3] = 255;
        }
      }
      rawCtx.putImageData(imgData, 0, 0);

      let dataUrl: string;
      if (exportW === this.width && exportH === this.height) {
        dataUrl = rawCanvas.toDataURL('image/jpeg', 0.88);
      } else {
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = exportW;
        scaledCanvas.height = exportH;
        const scaledCtx = scaledCanvas.getContext('2d');
        scaledCtx?.drawImage(rawCanvas, 0, 0, exportW, exportH);
        dataUrl = scaledCanvas.toDataURL('image/jpeg', 0.88);
      }

      const locName = state.currentLocation?.name || '合歡山';
      const elapsed = (performance.now() - this.startTime) / 1000;
      const weather = state.weather;

      // Weather-dependent scoring: clouds scatter light causing severe overexposure
      let score = 96;
      let quality: PhotoQuality = PhotoQuality.S;
      let sellPrice = 2500;
      let weatherNote = '';
      let weatherTip = '晴朗澄澈無瑕';

      if (weather === WeatherState.PartlyCloudy) {
        score = 66;
        quality = PhotoQuality.B;
        sellPrice = 850;
        weatherNote = '（雲隙光斑干擾）';
        weatherTip = '部分多雲浮雲散射，評級與售價降低';
      } else if (weather === WeatherState.Cloudy) {
        score = 42;
        quality = PhotoQuality.C;
        sellPrice = 380;
        weatherNote = '（雲層過曝嚴重）';
        weatherTip = '多雲天候導致光跡過曝泛白，售價相應折減';
      } else if (weather === WeatherState.Rainy) {
        score = 18;
        quality = PhotoQuality.D;
        sellPrice = 90;
        weatherNote = '（雨霧過曝遮蔽）';
        weatherTip = '雨夜能見度極低，星軌嚴重受損';
      }

      // If exposure was too short (< 2.0s), star trails haven't formed full arcs
      if (elapsed < 2.0) {
        score = Math.max(15, Math.round(score * 0.55));
        if (quality === PhotoQuality.S) quality = PhotoQuality.B;
        sellPrice = Math.max(100, Math.round(sellPrice * 0.5));
      }

      const targetName = weather === WeatherState.Clear
        ? `${locName} · 璀璨同心圓星軌光跡`
        : `${locName} · 同心圓星軌光跡 ${weatherNote}`;

      const photo: Photo = {
        id: `photo_startrail_${Date.now()}`,
        imageDataUrl: dataUrl,
        timestamp: new Date(),
        locationId: state.currentLocation?.id || 'hehuanshan',
        targetName,
        targetType: TargetType.SpecialEvent,
        exposureSeconds: parseFloat(elapsed.toFixed(1)),
        telescopeLevel: state.telescopeLevel || 1,
        weatherCondition: weather,
        quality,
        score,
        sellPrice,
        sold: false,
        frameType: 'light',
        hasMotionBlur: false,
        equipmentTags: ['星軌相機', '戶外廣角', '同心圓星軌'],
      };

      state.addPhoto(photo);

      // Notify other systems (Codex, Quests, Studio)
      document.dispatchEvent(
        new CustomEvent('photo-captured', {
          detail: { photo, targetInfo: { name: photo.targetName, type: 'special_event' } }
        })
      );

      document.dispatchEvent(
        new CustomEvent('show-notification', {
          detail: {
            message: `星軌攝影完成！已自動存入照片庫（${quality}級 · ${weatherTip} · 售價 $${photo.sellPrice}）`,
            type: quality === PhotoQuality.S ? 'success' : 'info',
          },
        })
      );
    }

    // Restore original normal time
    state.setTimeScale(this.savedTimeScale || 1);
  }

  private triggerShutterFlash() {
    const flash = document.createElement('div');
    flash.className = 'st-flash-effect';
    document.body.appendChild(flash);
    setTimeout(() => {
      flash.classList.add('fade');
      setTimeout(() => flash.remove(), 250);
    }, 20);
  }

  public resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.accumTargetA.setSize(width, height);
    this.accumTargetB.setSize(width, height);
  }

  public dispose() {
    if (this.overlay) this.overlay.remove();
    this.accumTargetA.dispose();
    this.accumTargetB.dispose();
    this.blendQuad.geometry.dispose();
    this.blendMaterial.dispose();
  }
}
