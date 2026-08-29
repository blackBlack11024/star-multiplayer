import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { gameStore } from '../game/GameStore';
import { GameMode } from '../types';
import { TelescopeOptics } from '../telescope/TelescopeOptics';
import { CelestialSphere } from '../astronomy/CelestialSphere';
import { StarTrailCamera } from '../telescope/StarTrailCamera';

/**
 * Handles all player input and camera control across game modes.
 */
export class PlayerController {
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private scene: THREE.Scene;
  private controls: PointerLockControls;
  private optics?: TelescopeOptics;
  private celestialSphere?: CelestialSphere;
  private starTrailCamera?: StarTrailCamera;

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private isSprinting = false;
  private isAltHeld = false;

  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();

  private playerHeight = 1.7;
  private currentHeight = 1.7;
  private targetHeight = 1.7;
  private isLyingDown = false;
  private walkSpeed = 5.0;

  private unsubscribe: () => void;
  private lieDownHint: HTMLElement;
  private telescopeModeOrigin = new THREE.Vector3();

  private exposureCycle = [5, 15, 30, 60, 120, 300];

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, scene: THREE.Scene) {
    this.camera = camera;
    this.canvas = canvas;
    this.scene = scene;

    this.controls = new PointerLockControls(this.camera, document.body);
    this.scene.add(this.controls.getObject());
    this.controls.getObject().position.y = this.playerHeight;

    // Lie Down Hint
    this.lieDownHint = document.createElement('div');
    this.lieDownHint.className = 'lie-down-hint';
    this.lieDownHint.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);border:1px solid rgba(56,189,248,0.3);color:#e2e8f0;padding:8px 18px;border-radius:20px;font-size:13px;font-weight:500;display:none;z-index:90;pointer-events:none;letter-spacing:0.05em;';
    this.lieDownHint.textContent = '[Z] 起身 · [空白鍵] 起身 · [X] 指星筆';
    document.getElementById('ui-overlay')?.appendChild(this.lieDownHint);

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onWheel = this.onWheel.bind(this);

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('wheel', this.onWheel, { passive: false });

    // Prevent browser context menu on right click
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Reset Alt state when window loses focus
    window.addEventListener('blur', () => {
      this.isAltHeld = false;
    });

    // Click to lock pointer in walk or telescope mode (left click)
    const handleViewportLock = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only left click locks pointer
      if (this.isAltHeld) return; // While holding Alt, clicks are for UI interaction
      if (this.isAnyModalActive()) return;
      const target = e.target as HTMLElement;
      if (target && target.closest('.hud-panel, .studio-panel, button, input, select, .guide-badge, .money-badge, .weather-badge, .audio-badge, .story-box, .codex-panel, .finder-panel, .lightbox-content, .multiplayer-modal, .camp-laptop-modal, .multiplayer-panel, .camp-laptop-panel')) {
        return;
      }
      const mode = gameStore.getState().gameMode;
      if ((mode === GameMode.Walk || mode === GameMode.Telescope) && !this.controls.isLocked) {
        this.controls.lock();
      }
    };

    this.canvas.addEventListener('mousedown', handleViewportLock);
    window.addEventListener('click', handleViewportLock);

    this.unsubscribe = gameStore.subscribe((state, prevState) => {
      if (state.gameMode !== prevState.gameMode) {
        this.handleModeChange(state.gameMode, prevState.gameMode);
      }
    });
  }

  private isAnyModalActive(): boolean {
    const modalSelectors = [
      '.finder-panel',
      '.codex-panel',
      '.lightbox-overlay',
      '#codex-ref-modal',
      '.guide-modal',
      '.location-modal',
      '.time-reversal-panel',
      '.audio-modal',
      '.story-modal',
      '.multiplayer-modal',
      '.camp-laptop-modal'
    ];
    for (const sel of modalSelectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none') {
        return true;
      }
    }
    return false;
  }

  private handleModeChange(newMode: GameMode, oldMode: GameMode) {
    if (newMode === GameMode.Walk) {
      if (oldMode === GameMode.Telescope) {
        this.camera.position.copy(this.telescopeModeOrigin);
        this.camera.fov = this.isLyingDown ? 98 : 60;
        this.camera.updateProjectionMatrix();
      }
    } else if (newMode === GameMode.Telescope) {
      this.telescopeModeOrigin.copy(this.camera.position);
      // Auto-lock pointer to hide cursor and enable direct mouse look in telescope view
      setTimeout(() => {
        if (gameStore.getState().gameMode === GameMode.Telescope && !this.controls.isLocked) {
          this.controls.lock();
        }
      }, 50);
    } else if (newMode === GameMode.Studio) {
      this.controls.unlock();
    }
  }

  private onKeyDown(event: KeyboardEvent) {
    // If typing in input/textarea, do NOT trigger any game controls
    const activeTag = (document.activeElement?.tagName || '').toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea') {
      if (event.code === 'Escape') {
        (document.activeElement as HTMLElement).blur();
      }
      return;
    }

    const state = gameStore.getState();
    const mode = state.gameMode;

    // In Telescope mode, pressing F toggles the FinderUI
    if (mode === GameMode.Telescope && (event.code === 'KeyF' || event.key.toLowerCase() === 'f')) {
      document.dispatchEvent(new CustomEvent('toggle-finder-ui'));
      return;
    }

    // Alt key: Hold Alt to free mouse cursor for UI interaction
    if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
      event.preventDefault();
      if (!this.isAltHeld) {
        this.isAltHeld = true;
        this.controls.unlock();
      }
      return;
    }

    // ESC key: Universal return/back handler
    if (event.code === 'Escape') {
      if (this.isAnyModalActive()) {
        return; // Open modals will close themselves first on ESC
      }
      if (mode === GameMode.Telescope || mode === GameMode.Studio) {
        state.setGameMode(GameMode.Walk);
        return;
      }
    }

    // If any modal (Finder, Codex, Lightbox, etc.) is active, ignore all other game/telescope shortcuts!
    if (this.isAnyModalActive()) {
      return;
    }

    if (mode === GameMode.Walk) {
      if (event.code === 'KeyT' || event.code === 'KeyR') {
        event.preventDefault();
        event.stopPropagation();
        if (this.starTrailCamera?.isEquipped()) {
          this.starTrailCamera.onKeyDown(event.code === 'KeyT' ? 'T' : 'R');
        } else {
          document.dispatchEvent(new CustomEvent('show-notification', {
            detail: { message: '按住 T / R 為星軌相機快門（需先獲得星軌相機）；開啟時空倒流星曆面板請按 B 鍵', type: 'info' }
          }));
        }
        return;
      }

      if (this.isLyingDown && (event.code === 'Space' || event.code === 'KeyW' || event.code === 'KeyA' || event.code === 'KeyS' || event.code === 'KeyD')) {
        this.toggleLieDown();
        return;
      }

      switch (event.code) {
        case 'KeyZ':
          this.toggleLieDown();
          break;
        case 'KeyX':
          this.toggleLaserPointer();
          break;
        case 'KeyW': this.moveForward = true; break;
        case 'KeyA': this.moveLeft = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyD': this.moveRight = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.isSprinting = true; break;
        case 'KeyV':
          document.dispatchEvent(new CustomEvent('deploy-telescope'));
          break;
        case 'Enter':
          document.dispatchEvent(new CustomEvent('open-multiplayer-chat'));
          break;
        case 'KeyE':
          if (this.isLyingDown) this.toggleLieDown();
          document.dispatchEvent(new CustomEvent('player-interact-e'));
          break;
        case 'KeyQ':
        case 'KeyH':
          document.dispatchEvent(new CustomEvent('toggle-headlamp'));
          break;
        case 'KeyF':
          if (this.isLyingDown) this.toggleLieDown();
          state.setGameMode(GameMode.Studio);
          break;
      }
    } else if (mode === GameMode.Telescope) {
      switch (event.code) {
        case 'KeyX':
          this.toggleMountedLaser();
          break;
        case 'Space':
        case 'KeyE':
          document.dispatchEvent(new CustomEvent('capture-photo'));
          return;
        case 'Digit1':
          state.setFrameType('light');
          document.dispatchEvent(new CustomEvent('frame-type-changed', { detail: 'light' }));
          return;
        case 'Digit2':
          state.setFrameType('dark');
          document.dispatchEvent(new CustomEvent('frame-type-changed', { detail: 'dark' }));
          return;
        case 'Digit3':
          state.setFrameType('flat');
          document.dispatchEvent(new CustomEvent('frame-type-changed', { detail: 'flat' }));
          return;
        case 'Digit4':
          state.setFrameType('bias');
          document.dispatchEvent(new CustomEvent('frame-type-changed', { detail: 'bias' }));
          return;
        case 'KeyV': {
          const types: ('light' | 'dark' | 'flat' | 'bias')[] = ['light', 'dark', 'flat', 'bias'];
          const nextIdx = (types.indexOf(state.currentFrameType) + 1) % types.length;
          state.setFrameType(types[nextIdx]);
          document.dispatchEvent(new CustomEvent('frame-type-changed', { detail: types[nextIdx] }));
          return;
        }
        case 'KeyQ':
        case 'KeyL': {
          document.dispatchEvent(new CustomEvent('toggle-telescope-lock'));
          return;
        }
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          this.handleTelescopeSlew(event.code);
          document.dispatchEvent(new CustomEvent('telescope-slew'));
          break;
      }
    }

    // ---- Global shortcuts (Walk & Studio) ----
    switch (event.code) {
      case 'Digit1': if (mode !== GameMode.Telescope) state.setTimeScale(1); break;
      case 'Digit2': if (mode !== GameMode.Telescope) state.setTimeScale(10); break;
      case 'Digit3': if (mode !== GameMode.Telescope) state.setTimeScale(60); break;
      case 'Digit4': if (mode !== GameMode.Telescope) state.setTimeScale(300); break;
      case 'Digit5': if (mode !== GameMode.Telescope) state.setTimeScale(1000); break;
      case 'KeyP': state.toggleTimePause(); break;
      case 'KeyC': state.toggleConstellations(); break;
      case 'KeyN': state.toggleStarNames(); break;
      case 'KeyM': state.toggleMute(); break;
      case 'KeyU': state.toggleUIVisibility(); break;
    }
  }

  private handleTelescopeSlew(key: string) {
    const state = gameStore.getState();
    if (state.isTelescopeLocked) return;

    const fovFactor = state.currentFov / 60;
    const stepDec = 0.5 * fovFactor;
    const stepRa = (0.5 / 15) * fovFactor;

    let deltaRa = 0;
    let deltaDec = 0;

    if (key === 'ArrowUp') deltaDec += stepDec;
    if (key === 'ArrowDown') deltaDec -= stepDec;
    if (key === 'ArrowLeft') deltaRa -= stepRa;
    if (key === 'ArrowRight') deltaRa += stepRa;

    this.slewEquatorial(deltaRa, deltaDec);
    document.dispatchEvent(new CustomEvent('telescope-slew'));
  }

  /** Slew telescope along equatorial mount axes (RA and Dec) */
  private slewEquatorial(deltaRa: number, deltaDec: number) {
    const state = gameStore.getState();
    if (state.isTelescopeLocked) return;

    let ra = state.telescopeRa + deltaRa;
    let dec = state.telescopeDec + deltaDec;

    // Declination clamp: stop smoothly at celestial poles (+89.5° and -89.5°)
    // Never flip or roll camera upside down
    dec = Math.max(-89.5, Math.min(89.5, dec));

    // Right ascension wrap: continuous 0h ~ 24h circle
    if (ra < 0) ra += 24;
    if (ra >= 24) ra %= 24;

    state.setTelescopePointing(ra, dec);
  }

  private onKeyUp(event: KeyboardEvent) {
    if (event.key === 'Alt' || event.code === 'AltLeft' || event.code === 'AltRight') {
      event.preventDefault();
      this.isAltHeld = false;
      const state = gameStore.getState();
      const mode = state.gameMode;
      if ((mode === GameMode.Walk || mode === GameMode.Telescope) && !this.isAnyModalActive() && !this.controls.isLocked) {
        this.controls.lock();
      }
      return;
    }

    switch (event.code) {
      case 'KeyW': this.moveForward = false; break;
      case 'KeyA': this.moveLeft = false; break;
      case 'KeyS': this.moveBackward = false; break;
      case 'KeyD': this.moveRight = false; break;
      case 'ShiftLeft':
      case 'ShiftRight': this.isSprinting = false; break;
    }

    if (this.starTrailCamera?.isEquipped() && (event.code === 'KeyT' || event.code === 'KeyR')) {
      this.starTrailCamera.onKeyUp(event.code === 'KeyT' ? 'T' : 'R');
    }
  }

  private onMouseMove(event: MouseEvent) {
    if (this.isAnyModalActive() || this.starTrailCamera?.active) return;
    const mode = gameStore.getState().gameMode;
    if (mode === GameMode.Telescope) {
      // If view is locked, ignore mouse movement
      if (gameStore.getState().isTelescopeLocked) return;

      // Slew if pointer is locked or user is dragging mouse
      if (this.controls.isLocked || event.buttons > 0) {
        const state = gameStore.getState();
        const fovFactor = state.currentFov / 60;
        
        // Right-click: Micro precision slew (0.25x); Normal: 1.0x
        const speedMultiplier = event.buttons === 2 ? 0.25 : 1.0;
        
        // Authentic equatorial mount slew:
        // Moving mouse UP/DOWN tilts along Dec axis (赤緯); moving mouse LEFT/RIGHT slews along RA axis (赤經)
        const deltaRa = -event.movementX * (0.025 / 15) * fovFactor * speedMultiplier;
        const deltaDec = -event.movementY * 0.025 * fovFactor * speedMultiplier;

        this.slewEquatorial(deltaRa, deltaDec);

        if (Math.abs(event.movementX) > 2 || Math.abs(event.movementY) > 2) {
          document.dispatchEvent(new CustomEvent('telescope-slew'));
        }
      }
    }
  }

  public setOptics(optics: TelescopeOptics) {
    this.optics = optics;
  }

  public setCelestialSphere(celestialSphere: CelestialSphere) {
    this.celestialSphere = celestialSphere;
  }

  public setStarTrailCamera(cam: StarTrailCamera) {
    this.starTrailCamera = cam;
  }

  private onWheel(event: WheelEvent) {
    if (this.isAnyModalActive()) return;
    const state = gameStore.getState();
    if (state.gameMode === GameMode.Telescope) {
      event.preventDefault();
      let fov = state.currentFov;
      fov *= event.deltaY > 0 ? 1.1 : 0.9;
      const [minFov, maxFov] = this.optics ? this.optics.getEffectiveFovRange() : [0.2, 60];
      fov = Math.max(minFov, Math.min(maxFov, fov));
      state.setFov(fov);
    }
  }

  public toggleLieDown() {
    this.isLyingDown = !this.isLyingDown;
    this.targetHeight = this.isLyingDown ? 0.25 : 1.7;
    gameStore.getState().setLyingDown(this.isLyingDown);

    if (this.isLyingDown) {
      this.lieDownHint.style.display = 'block';
      // Smoothly tilt camera up towards zenith (82 degrees = 1.43 rad)
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(this.camera.quaternion);
      euler.x = 1.35; // Look up at zenith
      this.camera.quaternion.setFromEuler(euler);

      document.dispatchEvent(new CustomEvent('player-lie-down', { detail: { isLyingDown: true } }));
      document.dispatchEvent(new CustomEvent('show-notification', {
        detail: { message: '已平躺於草地，仰望天頂浩瀚星空', type: 'info' }
      }));
    } else {
      this.lieDownHint.style.display = 'none';
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(this.camera.quaternion);
      euler.x = 0.15; // Return to normal horizon view
      this.camera.quaternion.setFromEuler(euler);
      document.dispatchEvent(new CustomEvent('player-lie-down', { detail: { isLyingDown: false } }));
    }
  }

  public toggleLaserPointer() {
    const state = gameStore.getState();
    if (state.isLaserPointerMounted) {
      document.dispatchEvent(new CustomEvent('show-notification', {
        detail: { message: '指星筆目前已架設於望遠鏡上，可至望遠鏡取下後手持使用', type: 'warning' }
      }));
      return;
    }

    const next = !state.isLaserPointerActive;
    state.setLaserPointerActive(next);

    if (next) {
      // Unlock pointer lock so mouse cursor can point freely across screen!
      if (this.controls.isLocked) {
        this.controls.unlock();
      }
    } else {
      // Re-lock pointer for normal head look
      if (!this.controls.isLocked && state.gameMode === GameMode.Walk) {
        this.controls.lock();
      }
    }
  }

  public toggleMountedLaser() {
    const state = gameStore.getState();
    const nextMounted = !state.isLaserPointerMounted;
    state.setLaserPointerMounted(nextMounted);

    if (nextMounted) {
      // If was handheld, turn off handheld
      state.setLaserPointerActive(false);
      document.dispatchEvent(new CustomEvent('show-notification', {
        detail: { message: '已將指星筆安裝至望遠鏡尋星座 · 綠色光柱正持續朝鏡筒正前方射出', type: 'success' }
      }));
    } else {
      document.dispatchEvent(new CustomEvent('show-notification', {
        detail: { message: '已取下指星筆 · 指星筆已放回手中，可手持自由使用', type: 'info' }
      }));
    }
    document.dispatchEvent(new CustomEvent('laser-mounted-changed', { detail: { isMounted: nextMounted } }));
  }

  public update(deltaTime: number) {
    // Smooth height adjustment for lie-down animation
    this.currentHeight += (this.targetHeight - this.currentHeight) * Math.min(1, deltaTime * 6.0);
    this.controls.getObject().position.y = this.currentHeight;

    const mode = gameStore.getState().gameMode;
    if (mode === GameMode.Walk && this.controls.isLocked) {
      if (this.isLyingDown || this.starTrailCamera?.active) {
        this.velocity.set(0, 0, 0);
        return;
      }

      this.velocity.x -= this.velocity.x * 10.0 * deltaTime;
      this.velocity.z -= this.velocity.z * 10.0 * deltaTime;

      this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
      this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
      this.direction.normalize();

      const speed = this.isSprinting ? this.walkSpeed * 2 : this.walkSpeed;

      if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * speed * 10.0 * deltaTime;
      if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * speed * 10.0 * deltaTime;

      this.controls.moveRight(-this.velocity.x * deltaTime);
      this.controls.moveForward(-this.velocity.z * deltaTime);
    }
  }

  public getPosture(): 'stand' | 'walk' | 'run' | 'lie_down' | 'in_telescope' {
    const state = gameStore.getState();
    if (state.gameMode === GameMode.Telescope) return 'in_telescope';
    if (this.isLyingDown) return 'lie_down';
    const isMoving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
    if (isMoving) {
      return this.isSprinting ? 'run' : 'walk';
    }
    return 'stand';
  }

  public dispose() {
    this.unsubscribe();
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('wheel', this.onWheel);
    this.controls.disconnect();
    this.lieDownHint.remove();
  }
}
