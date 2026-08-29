// ============================================================
// Stargazer Simulator — Main Game Orchestrator
// ============================================================
import * as THREE from 'three';
import { gameStore } from './game/GameStore';
import { GameMode, WeatherState } from './types';

// Systems
import { StarField } from './rendering/StarField';
import { CelestialSphere } from './astronomy/CelestialSphere';
import { Constellations } from './astronomy/Constellations';
import { StarIdentifier } from './astronomy/StarIdentifier';
import { DeepSkyObjects } from './astronomy/DeepSkyObjects';
import { PlanetarySystem } from './astronomy/PlanetarySystem';
import { AtmosphereManager } from './environment/AtmosphereManager';
import { TimeManager } from './environment/TimeManager';
import { WeatherSystem } from './environment/WeatherSystem';
import { CloudLayer } from './environment/CloudLayer';
import { RainEffect } from './environment/RainEffect';
import { AudioManager } from './environment/AudioManager';
import { PlayerController } from './controls/PlayerController';
import { Terrain } from './world/Terrain';
import { TelescopeModel } from './world/TelescopeModel';
import { Studio } from './world/Studio';
import { TelescopeOptics } from './telescope/TelescopeOptics';
import { LongExposure } from './telescope/LongExposure';
import { PostProcessing } from './telescope/PostProcessing';
import { BinocularsMode } from './telescope/BinocularsMode';
import { StarTrailCamera } from './telescope/StarTrailCamera';
import { PhotoManager } from './game/PhotoManager';
import { QuestManager } from './game/QuestManager';
import { EconomySystem } from './game/EconomySystem';
import { HUD } from './ui/HUD';
import { TelescopeHUD } from './ui/TelescopeHUD';
import { StudioUI } from './ui/StudioUI';
import { CodexUI } from './ui/CodexUI';
import { PhotoLightbox } from './ui/PhotoLightbox';
import { StoryDialogue } from './ui/StoryDialogue';
import { MenuSystem } from './ui/MenuSystem';
import { FinderUI } from './ui/FinderUI';
import { getTelescopeConfig } from './data/telescopes';
import { LaserPointer } from './astronomy/LaserPointer';
import { SpaceStation } from './astronomy/SpaceStation';
import { MeteorSystem } from './environment/MeteorSystem';
import { NetworkManager } from './multiplayer/NetworkManager';
import { AvatarManager } from './multiplayer/AvatarManager';
import { MultiplayerTelescopes } from './multiplayer/MultiplayerTelescopes';
import { CampLaptop } from './multiplayer/CampLaptop';
import { MultiplayerUI } from './multiplayer/MultiplayerUI';
import { PacketType, CampPhotoSharePacket } from './multiplayer/NetworkProtocol';
import { Headlamp } from './world/Headlamp';

type ProgressCallback = (pct: number, text: string) => void;

export class Game {
  // ---- Three.js core ----
  public renderer!: THREE.WebGLRenderer;
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock(false);

  // ---- Systems ----
  private starField!: StarField;
  private celestialSphere!: CelestialSphere;
  private constellations!: Constellations;
  private starIdentifier!: StarIdentifier;
  private deepSkyObjects!: DeepSkyObjects;
  private planetarySystem!: PlanetarySystem;
  private spaceStation!: SpaceStation;
  private meteorSystem!: MeteorSystem;
  private laserPointer!: LaserPointer;
  private headlamp!: Headlamp;

  private atmosphere!: AtmosphereManager;
  private timeManager!: TimeManager;
  private weatherSystem!: WeatherSystem;
  private cloudLayer!: CloudLayer;
  private rainEffect!: RainEffect;
  private audioManager!: AudioManager;

  private playerController!: PlayerController;
  private binocularsMode!: BinocularsMode;
  private terrain!: Terrain;
  private telescopeModel!: TelescopeModel;
  private studio!: Studio;

  private telescopeOptics!: TelescopeOptics;
  private longExposure!: LongExposure;
  private postProcessing!: PostProcessing;
  private starTrailCamera!: StarTrailCamera;

  private photoManager!: PhotoManager;
  private questManager!: QuestManager;
  private economySystem!: EconomySystem;

  // ---- UI ----
  private hud!: HUD;
  private telescopeHUD!: TelescopeHUD;
  private studioUI!: StudioUI;
  private codexUI!: CodexUI;
  private photoLightbox!: PhotoLightbox;
  private storyDialogue!: StoryDialogue;
  private menuSystem!: MenuSystem;
  private finderUI!: FinderUI;

  // ---- Multiplayer ----
  private networkManager!: NetworkManager;
  private avatarManager!: AvatarManager;
  private multiplayerTelescopes!: MultiplayerTelescopes;
  private campLaptop!: CampLaptop;
  private multiplayerUI!: MultiplayerUI;
  private netUpdateTimer: number = 0;
  private activeOperatingTelescopeId: string | null = null;
  private isSpectatingTelescope: boolean = false;
  private planetStoreUpdateTimer = 0;
  private lastStarTrailNotifTime = 0;
  private lastNetTimeSyncTime = 0;

  // GoTo auto-slew animation state
  private isGoToSlewing = false;
  private goToStartRa = 0;
  private goToStartDec = 0;
  private goToTargetRa = 0;
  private goToTargetDec = 0;
  private goToStartTime = 0;
  private goToDuration = 1800; // ms
  private goToTargetName = '';

  // ---- State ----
  private isRunning = false;
  private sunElevation = 0;
  private animationFrameId = 0;
  private savedWalkPos = new THREE.Vector3(0, 1.7, 0);
  private savedWalkRot = new THREE.Euler();
  private savedTelescopeFov = 20.0;
  private lastIdentifiedTarget: any = null;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500000,
    );
    this.camera.position.set(0, 1.7, 0);

    window.addEventListener('resize', this.onResize.bind(this));
  }

  /** Initialize all game systems. */
  async init(progress: ProgressCallback): Promise<void> {
    // ---- Star rendering ----
    progress(0, '正在載入星表數據...');
    this.starField = new StarField(this.scene);
    await this.starField.loadStars();

    // ---- Celestial sphere ----
    progress(0.15, '正在建構天球...');
    this.celestialSphere = new CelestialSphere(this.scene);
    // Add star group into celestial sphere so it rotates together
    this.celestialSphere.group.add(this.starField.getStarGroup());

    // ---- Constellations ----
    progress(0.2, '正在繪製星座...');
    this.constellations = new Constellations(this.celestialSphere.group);

    // ---- Deep sky objects ----
    progress(0.25, '正在放置深空天體...');
    this.deepSkyObjects = new DeepSkyObjects(this.celestialSphere.group);

    // ---- Solar System Planets & Moon ----
    progress(0.28, '正在計算太陽系行星與月球軌道...');
    this.planetarySystem = new PlanetarySystem(this.celestialSphere.group);

    // ---- Star identifier ----
    this.starIdentifier = new StarIdentifier();

    // ---- Atmosphere ----
    progress(0.3, '正在初始化大氣...');
    this.atmosphere = new AtmosphereManager(this.scene);

    // ---- Time ----
    this.timeManager = new TimeManager();

    // ---- Weather ----
    progress(0.4, '正在初始化天氣系統...');
    this.weatherSystem = new WeatherSystem();
    this.cloudLayer = new CloudLayer(this.scene);
    this.rainEffect = new RainEffect(this.scene);

    // ---- Audio ----
    progress(0.5, '正在初始化音效系統...');
    this.audioManager = new AudioManager();

    // ---- World ----
    progress(0.55, '正在建構觀測場景...');
    this.terrain = new Terrain(this.scene, gameStore.getState().currentLocation);
    this.telescopeModel = new TelescopeModel(this.scene);
    this.studio = new Studio(this.scene);

    // ---- Controls ----
    progress(0.65, '正在初始化控制器與雙筒望遠鏡...');
    this.playerController = new PlayerController(this.camera, this.renderer.domElement, this.scene);
    this.binocularsMode = new BinocularsMode(this.camera, this.renderer.domElement);

    // ---- Space Station, Meteors & Laser Pointer ----
    this.spaceStation = new SpaceStation(this.scene);
    this.meteorSystem = new MeteorSystem(this.scene);
    this.laserPointer = new LaserPointer(
      this.scene,
      this.camera,
      this.starIdentifier,
      () => this.planetarySystem.getPlanets(),
      this.celestialSphere,
      () => this.telescopeModel.getPosition(),
      () => this.telescopeModel.getOpticalDirection()
    );

    // ---- Telescope optics ----
    progress(0.7, '正在校準望遠鏡光學...');
    this.telescopeOptics = new TelescopeOptics();
    this.playerController.setOptics(this.telescopeOptics);
    this.playerController.setCelestialSphere(this.celestialSphere);
    this.longExposure = new LongExposure(
      this.renderer,
      window.innerWidth,
      window.innerHeight,
    );
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);
    this.starTrailCamera = new StarTrailCamera(this.renderer, window.innerWidth, window.innerHeight);
    this.playerController.setStarTrailCamera(this.starTrailCamera);
    this.headlamp = new Headlamp(this.camera, this.scene);

    // ---- Game systems ----
    progress(0.8, '正在載入遊戲與任務系統...');
    this.photoManager = new PhotoManager();
    this.questManager = new QuestManager();
    this.economySystem = new EconomySystem();

    // ---- UI ----
    progress(0.85, '正在建立介面與圖鑑...');
    this.hud = new HUD();
    this.telescopeHUD = new TelescopeHUD();
    this.studioUI = new StudioUI();
    this.codexUI = new CodexUI();
    this.photoLightbox = new PhotoLightbox();
    this.storyDialogue = new StoryDialogue();
    this.menuSystem = new MenuSystem();
    this.finderUI = new FinderUI();

    // ---- Multiplayer Subsystems ----
    progress(0.9, '正在初始化多人連線模組...');
    this.networkManager = new NetworkManager();
    this.avatarManager = new AvatarManager(this.scene, this.camera);
    this.multiplayerTelescopes = new MultiplayerTelescopes(this.scene);
    this.campLaptop = new CampLaptop(this.scene);
    this.multiplayerUI = new MultiplayerUI(this.networkManager);
    this.setupMultiplayerNetworking();

    // ---- Wire up interactions ----
    this.setupInteractions();
    this.savedTelescopeFov = gameStore.getState().currentFov || 20.0;

    progress(1.0, '初始化完成！');
  }

  private setupMultiplayerNetworking(): void {
    this.multiplayerTelescopes.setMyOwnerId(this.networkManager.localId);
    this.networkManager.onPeerConnect((peerId) => {
      // Send our own player info to new peers
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(this.camera.quaternion);
      this.networkManager.broadcast({
        type: PacketType.PLAYER_JOIN,
        id: this.networkManager.localId,
        name: this.networkManager.localName,
        color: this.networkManager.localColor,
        hatType: this.networkManager.localHatType,
        pos: [this.camera.position.x, this.camera.position.y - 1.7, this.camera.position.z],
        telescopeLevel: gameStore.getState().telescopeLevel || 1,
      });

      // Broadcast our own telescope position to the peer
      const tPos = this.telescopeModel.getPosition();
      this.networkManager.sendTo(peerId, {
        type: PacketType.TELESCOPE_SPAWN,
        telescopeId: `tel_${this.networkManager.localId}`,
        ownerId: this.networkManager.localId,
        ownerName: this.networkManager.localName,
        level: gameStore.getState().telescopeLevel || 1,
        pos: [tPos.x, tPos.y, tPos.z],
        rotY: this.telescopeModel.getRotationY(),
      });

      // If host, also broadcast our deployed telescopes and current game time
      if (this.networkManager.isHost) {
        this.multiplayerTelescopes.getAllTelescopes().forEach((t) => {
          this.networkManager.sendTo(peerId, {
            type: PacketType.TELESCOPE_SPAWN,
            telescopeId: t.id,
            ownerId: t.ownerId,
            ownerName: t.ownerName,
            level: t.level,
            pos: [t.group.position.x, t.group.position.y, t.group.position.z],
            rotY: t.group.rotation.y,
          });
        });

        const state = gameStore.getState();
        this.networkManager.sendTo(peerId, {
          type: PacketType.TIME_SYNC,
          timeScale: state.timeScale,
          gameTimeMs: state.currentTime.getTime(),
          senderId: this.networkManager.localId,
        });
      }
    });

    this.networkManager.on<any>(PacketType.PLAYER_JOIN, (pkt) => {
      if (pkt.id === this.networkManager.localId) return;
      this.avatarManager.addOrUpdatePlayer(pkt);
      this.hud.showNotification(`「${pkt.name}」加入了觀星小隊！`, 'info');
    });

    this.networkManager.on<any>(PacketType.PLAYER_UPDATE, (pkt) => {
      if (pkt.id === this.networkManager.localId) return;
      this.avatarManager.updatePlayerState(pkt);
    });

    this.networkManager.on<any>(PacketType.PLAYER_LEAVE, (pkt) => {
      this.avatarManager.removePlayer(pkt.id);
    });

    this.networkManager.on<any>(PacketType.CHAT_BUBBLE, (pkt) => {
      this.avatarManager.showSpeechBubble(pkt.id, pkt.text);
    });

    this.networkManager.on<any>(PacketType.TIME_SYNC, (pkt) => {
      if (pkt.senderId === this.networkManager.localId) return;
      const state = gameStore.getState();
      state.setTimeScale(pkt.timeScale);
      state.setTime(new Date(pkt.gameTimeMs));
      if (pkt.isStarTrailAccelerating) {
        const now = performance.now();
        if (now - this.lastStarTrailNotifTime > 12000) {
          this.lastStarTrailNotifTime = now;
          this.hud.showNotification('隊友正在長曝光旋轉夜空，天球時間飛速流動中', 'info');
        }
      }
    });

    this.networkManager.on<any>(PacketType.TELESCOPE_SPAWN, (pkt) => {
      this.multiplayerTelescopes.handleTelescopeSpawn(pkt);
    });

    this.networkManager.on<any>(PacketType.TELESCOPE_STATE, (pkt) => {
      this.multiplayerTelescopes.handleTelescopeState(pkt);
      if (this.isSpectatingTelescope && this.activeOperatingTelescopeId === pkt.telescopeId) {
        gameStore.getState().setTelescopePointing(pkt.ra, pkt.dec);
        gameStore.getState().setFov(pkt.fov);
      }
    });

    this.networkManager.on<any>(PacketType.TELESCOPE_SEIZE, (pkt) => {
      if (pkt.previousOperatorId === this.networkManager.localId && !this.isSpectatingTelescope) {
        gameStore.getState().setGameMode(GameMode.Walk);
        this.activeOperatingTelescopeId = null;
        this.hud.showNotification('望遠鏡已被隊友接管操作，已返回漫步模式', 'info');
      }
    });

    this.networkManager.on<any>(PacketType.CAMP_PHOTO_SHARE, (pkt) => {
      this.campLaptop.addSharedPhoto(pkt);
      this.hud.showNotification(`隊友「${pkt.photographerName}」拍下了「${pkt.targetName}」！已無線傳送至營地終端機`, 'success');
    });

    this.multiplayerUI.onSendChat((text) => {
      this.avatarManager.showSpeechBubble(this.networkManager.localId, text);
      if (this.networkManager.isConnected()) {
        this.networkManager.broadcast({
          type: PacketType.CHAT_BUBBLE,
          id: this.networkManager.localId,
          text,
        });
      }
    });
  }

  /** Start the game loop. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();

    // Initialize audio on first user gesture
    const initAudio = () => {
      this.audioManager.init();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);

    // If first time playing, show Chapter 0 intro dialogue
    const firstQuest = this.questManager.getNextQuest();
    if (firstQuest && (gameStore.getState().completedQuestIds || []).length === 0 && (gameStore.getState().photos || []).length === 0) {
      setTimeout(() => {
        this.storyDialogue.playIntroDialogue(firstQuest);
      }, 1500);
    }

    this.animate();
  }

  /** Main animation loop. */
  private animate = (): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    const deltaTime = Math.min(this.clock.getDelta(), 0.1);
    const elapsedTime = this.clock.getElapsedTime();
    this.update(deltaTime, elapsedTime);
    this.render();
  };

  /** Update all systems. */
  private update(deltaTime: number, elapsedTime: number): void {
    const state = gameStore.getState();

    // ---- Star Trail Camera ----
    this.starTrailCamera.update(deltaTime, this.sunElevation);

    // ---- Time ----
    this.timeManager.update(deltaTime);
    const gameTime = state.currentTime;
    const loc = state.currentLocation;

    // ---- Weather ----
    this.weatherSystem.update(deltaTime * state.timeScale);
    const cloudCoverage = this.weatherSystem.getCloudCoverage();

    // ---- Atmosphere (sun/moon) ----
    this.sunElevation = this.atmosphere.update(gameTime, loc.latitude, loc.longitude);
    this.timeManager.setSunElevation(this.sunElevation);

    // ---- Celestial sphere rotation ----
    this.celestialSphere.updateOrientation(loc.latitude, loc.longitude, gameTime);

    // ---- Star rendering & Optics-dependent limiting magnitude ----
    const telescopeConfig = getTelescopeConfig(state.telescopeLevel);
    const isTelescope = state.gameMode === GameMode.Telescope;
    const currentCameraFov = isTelescope ? state.currentFov : this.camera.fov;
    const lightPollution = loc.lightPollution || 0;

    let effectiveLimitingMag = 4.85;
    if (isTelescope) {
      // Telescope Mode (Level 1: 10.0, Level 2: 11.5, Level 3: 12.8, Level 4: 13.5, Level 5: 14.8)
      effectiveLimitingMag = telescopeConfig.limitingMagnitude - lightPollution * 1.2;
    } else if (currentCameraFov < 35.0) {
      // 8x42 Binoculars Mode (Hold Right Click): ~8.8 mag (resolves deep sky field)
      effectiveLimitingMag = 8.8 - lightPollution * 1.2;
    } else {
      // Rich Natural Mountain Night Sky Mode (~4.85 mag, ~1,000 sparkling stars, natural constellation canvas)
      effectiveLimitingMag = Math.max(3.8, 4.85 - lightPollution * 1.2);
    }

    this.starField.update(elapsedTime, currentCameraFov, this.sunElevation, effectiveLimitingMag);

    // ---- Deep sky objects & Planetary System ----
    this.deepSkyObjects.update(currentCameraFov, isTelescope, effectiveLimitingMag);
    this.planetarySystem.update(gameTime, currentCameraFov, loc.latitude, loc.longitude);
    const planets = this.planetarySystem.getPlanets();
    this.planetStoreUpdateTimer += deltaTime;
    if (this.planetStoreUpdateTimer > 2.0) {
      this.planetStoreUpdateTimer = 0;
      state.setPlanets(planets);
    }

    // ---- Constellations & Laser Pointer ----
    this.constellations.update(this.sunElevation);
    const isStarTrailExposing = Boolean(this.starTrailCamera && this.starTrailCamera.active);
    if (!state.showConstellations || state.gameMode === GameMode.Studio || isStarTrailExposing) {
      this.constellations.setVisible(false);
    } else {
      this.constellations.setVisible(true);
    }
    if (isStarTrailExposing) {
      this.laserPointer?.setVisibleForPhoto(false);
    }

    // ---- Cloud layer ----
    this.cloudLayer.update(deltaTime, cloudCoverage, new THREE.Vector2(1, 0.5), this.sunElevation);

    // ---- Rain ----
    const isRaining = state.weather === WeatherState.Rainy;
    this.rainEffect.setVisible(isRaining);
    if (isRaining) {
      this.rainEffect.update(deltaTime, this.camera.position, 1.0);
    }

    // ---- Audio ----
    const sunPhase = this.timeManager.getSunPhase();
    this.audioManager.setAmbientForPhase(sunPhase);
    this.audioManager.setWeatherAudio(state.weather, cloudCoverage);

    // ---- World objects ----
    this.telescopeModel.update(this.camera.position);
    const skyVec = this.celestialSphere.getRaDecToVector(state.telescopeRa, state.telescopeDec);
    skyVec.applyMatrix4(this.celestialSphere.group.matrixWorld);
    this.telescopeModel.updatePointing(skyVec);

    // ---- Player controller & Binoculars smooth zoom ----
    this.playerController.update(deltaTime);
    this.binocularsMode.update(deltaTime);
    this.headlamp.update();

    // ---- Space Station, Meteors & Laser Pointer ----
    this.spaceStation.update(deltaTime, state.currentFov, loc.latitude, this.sunElevation, gameTime);
    this.meteorSystem.update(deltaTime, this.camera, this.sunElevation);
    this.laserPointer.update();

    // ---- Multiplayer Avatars & State Synchronization ----
    this.avatarManager.update(deltaTime);

    if (this.networkManager && this.networkManager.isConnected()) {
      this.netUpdateTimer += deltaTime;
      if (this.netUpdateTimer >= 0.05) {
        this.netUpdateTimer = 0;
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(this.camera.quaternion);
        const posture = this.playerController.getPosture();
        const isLaserActive = this.laserPointer?.isActive() || false;
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);

        this.networkManager.broadcast({
          type: PacketType.PLAYER_UPDATE,
          id: this.networkManager.localId,
          pos: [this.camera.position.x, this.camera.position.y - 1.7, this.camera.position.z],
          yaw: euler.y,
          pitch: euler.x,
          posture,
          laserActive: isLaserActive,
          laserDir: isLaserActive ? [forward.x, forward.y, forward.z] : undefined,
          laserTarget: isLaserActive ? this.laserPointer?.getTargetName() : undefined,
          headlampMode: this.headlamp.getMode(),
        });

        const currentTelId = this.activeOperatingTelescopeId || `tel_${this.networkManager.localId}`;
        if (!this.isSpectatingTelescope) {
          this.networkManager.broadcast({
            type: PacketType.TELESCOPE_STATE,
            telescopeId: currentTelId,
            ra: state.telescopeRa,
            dec: state.telescopeDec,
            fov: state.currentFov,
            isLocked: Boolean(state.isTelescopeLocked),
            operatorId: this.networkManager.localId,
            laserMounted: Boolean(state.isLaserPointerMounted),
          });
        }
      }
    }

    // ---- GoTo Auto-Slewing Interpolation ----
    if (this.isGoToSlewing) {
      const elapsed = performance.now() - this.goToStartTime;
      const progress = Math.min(1.0, elapsed / this.goToDuration);
      // Smooth cosine easing
      const t = (1 - Math.cos(progress * Math.PI)) / 2;
      
      let dRa = this.goToTargetRa - this.goToStartRa;
      while (dRa > 12) dRa -= 24;
      while (dRa < -12) dRa += 24;
      
      let curRa = (this.goToStartRa + dRa * t) % 24;
      if (curRa < 0) curRa += 24;
      const curDec = Math.max(-89.5, Math.min(89.5, this.goToStartDec + (this.goToTargetDec - this.goToStartDec) * t));
      
      gameStore.getState().setTelescopePointing(curRa, curDec);

      if (progress >= 1.0) {
        this.isGoToSlewing = false;
        this.hud.showNotification(`GoTo 就緒：已對準 ${this.goToTargetName}`, 'success');
      }
    }

    // ---- Telescope mode logic ----
    if (state.gameMode === GameMode.Telescope) {
      // Position camera at optical center
      this.camera.position.set(0, 0.2, 0);

      const raRad = state.telescopeRa * Math.PI / 12;
      const decRad = state.telescopeDec * Math.PI / 180;
      const cosDec = Math.cos(decRad);
      const sinDec = Math.sin(decRad);
      const cosRa = Math.cos(raRad);
      const sinRa = Math.sin(raRad);

      // Local celestial orthonormal basis:
      // Forward: direction pointing at (RA, Dec)
      const uForward = new THREE.Vector3(cosDec * cosRa, sinDec, cosDec * sinRa);
      // Right: Eastward along celestial equator
      const uRight = new THREE.Vector3(-sinRa, 0, cosRa);
      // Up: Northward along celestial meridian towards North Celestial Pole
      const uUp = new THREE.Vector3(-sinDec * cosRa, cosDec, -sinDec * sinRa);

      // Transform celestial basis to world space
      const cMatrix = this.celestialSphere.group.matrixWorld;
      const wForward = uForward.clone().transformDirection(cMatrix).normalize();
      const wRight = uRight.clone().transformDirection(cMatrix).normalize();
      const wUp = uUp.clone().transformDirection(cMatrix).normalize();

      const hasEquatorialMount = this.telescopeOptics.hasAccessory('mount_eq') || this.telescopeOptics.hasAccessory('mount_goto');

      const camBasisMatrix = new THREE.Matrix4();
      // Eyepiece aligns with telescope optical axes (RA horizontal, Dec vertical)
      // Perfectly smooth rotation across all angles without gimbal lock or polar snap
      camBasisMatrix.makeBasis(wRight, wUp, wForward.clone().negate());

      this.camera.quaternion.setFromRotationMatrix(camBasisMatrix);
      this.camera.fov = state.currentFov;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld(true);

      // Star, Planet & Space Station identification (filtered by horizon)
      const identified = this.starIdentifier.identify(
        state.telescopeRa, state.telescopeDec, state.currentFov, this.celestialSphere, planets, this.spaceStation.getCurrentPassData()
      );
      this.lastIdentifiedTarget = identified;

      // Long exposure accumulation
      if (state.isExposing) {
        // Render scene to offscreen target and accumulate with telescope drift tracking
        const expGain = this.telescopeOptics.getExposureGain();
        const driftMitigation = this.telescopeOptics.getMountDriftMitigation();
        const timeScale = state.timeScale || 1.0;

        // Hide synthetic constellation lines and laser beams from astrophotography frames
        this.prepareSceneForPhoto(true);

        const isStarTrailMode = this.telescopeOptics.hasStarTrailMode();

        this.longExposure.accumulate(
          this.scene,
          this.camera,
          expGain,
          state.telescopeRa,
          state.telescopeDec,
          driftMitigation,
          hasEquatorialMount,
          timeScale,
          state.currentFov,
          isStarTrailMode
        );

        this.prepareSceneForPhoto(false);

        const elapsed = this.longExposure.getElapsedSeconds();
        state.updateExposureElapsed(elapsed);
      }

      // Update telescope HUD
      this.telescopeHUD.update(
        identified,
        state.isExposing,
        this.longExposure.getElapsedSeconds(),
        this.longExposure.getSampleCount(),
        state.currentFov,
        60 / state.currentFov,
        state.telescopeRa,
        state.telescopeDec,
      );
    }

    // ---- Interaction prompts ----
    if (state.gameMode === GameMode.Walk) {
      const closestTel = this.multiplayerTelescopes.getClosestTelescope(this.camera.position);
      if (this.campLaptop.isPlayerNear(this.camera.position)) {
        this.hud.showInteractPrompt('按 E 開啟營地共享相簿');
      } else if (closestTel) {
        if (closestTel.operatorId && closestTel.operatorId !== this.networkManager.localId) {
          if (closestTel.isLocked) {
            this.hud.showInteractPrompt(`按 E 共享「${closestTel.ownerName}」目鏡視野 (已鎖定)`);
          } else {
            this.hud.showInteractPrompt(`按 E 接管「${closestTel.ownerName}」望遠鏡操作 (未鎖定)`);
          }
        } else {
          this.hud.showInteractPrompt(`按 E 使用「${closestTel.ownerName}」的望遠鏡 (按 V 鍵可隨處架設)`);
        }
      } else if (this.telescopeModel.isPlayerNear(this.camera.position)) {
        this.hud.showInteractPrompt('按 E 使用望遠鏡 (按 V 鍵可在任意空地架設)');
      } else if (this.studio.isPlayerNear(this.camera.position)) {
        this.hud.showInteractPrompt('按 F 進入工作室');
      } else {
        this.hud.hideInteractPrompt();
      }
    } else if (state.gameMode === GameMode.Telescope) {
      if (this.isSpectatingTelescope) {
        this.hud.showInteractPrompt('目前為共享目鏡觀看模式 (不可調整視角，按 Esc 退出)');
      } else {
        const tel = this.activeOperatingTelescopeId ? this.multiplayerTelescopes.getTelescope(this.activeOperatingTelescopeId) : null;
        const lockStr = tel?.isLocked ? '已鎖定' : '未鎖定';
        this.hud.showInteractPrompt(`[L 鍵] 鎖定/解鎖視野 (${lockStr}) · [Space/E] 拍攝 · [Esc] 退出`);
      }
    } else {
      this.hud.hideInteractPrompt();
    }

    // ---- UI & 3D Waypoints & Quest Tracker ----
    this.hud.update(state);
    this.hud.updateWaypoints(this.camera, this.telescopeModel.getPosition(), this.studio.getPosition(), this.campLaptop.tablePosition);
    this.hud.updateQuestTracker(this.questManager.getNextQuest());
  }

  /** Render the scene. */
  private render(): void {
    const state = gameStore.getState();
    if (state.gameMode === GameMode.Telescope) {
      const chrAb = this.telescopeOptics.getChromaticAberration();
      this.postProcessing.setTelescopeMode(true, chrAb, this.sunElevation);
    } else {
      this.postProcessing.setTelescopeMode(false, 0, this.sunElevation);
    }
    this.postProcessing.render(this.starTrailCamera);
  }

  /** Wire up cross-system interactions. */
  private setupInteractions(): void {
    // Listen for mode changes & audio settings
    gameStore.subscribe((state, prevState) => {
      if (state.gameMode !== prevState.gameMode) {
        this.onModeChange(prevState.gameMode, state.gameMode);
      }
      if (state.masterVolume !== prevState.masterVolume || state.isMuted !== prevState.isMuted) {
        this.audioManager.setMasterVolume(state.isMuted ? 0 : state.masterVolume);
      }
      if (state.ambientVolume !== prevState.ambientVolume) {
        this.audioManager.setCategory('ambient', state.ambientVolume);
      }
      if (state.machineVolume !== prevState.machineVolume) {
        this.audioManager.setCategory('machine', state.machineVolume);
      }
      if (state.weatherVolume !== prevState.weatherVolume) {
        this.audioManager.setCategory('weather', state.weatherVolume);
      }
      if (state.sfxVolume !== prevState.sfxVolume) {
        this.audioManager.setCategory('sfx', state.sfxVolume);
      }
      if (state.currentLocation?.id !== prevState.currentLocation?.id) {
        this.terrain.updateLocation(state.currentLocation);
      }
      if (state.timeScale !== prevState.timeScale && this.networkManager && this.networkManager.isConnected()) {
        const now = performance.now();
        if (now - this.lastNetTimeSyncTime > 250) {
          this.lastNetTimeSyncTime = now;
          this.networkManager.broadcast({
            type: PacketType.TIME_SYNC,
            timeScale: state.timeScale,
            gameTimeMs: state.currentTime.getTime(),
            senderId: this.networkManager.localId,
            isStarTrailAccelerating: Math.abs(state.timeScale) > 60,
          });
        }
      }
    });

    // Quest completion event with story dialogue
    document.addEventListener('quest-completed', (e: any) => {
      const quest = e.detail.quest;
      this.hud.showNotification(`任務完成：${quest.title}！獲得 $${quest.rewards.money || 0}`, 'success');
      this.hud.updateQuestTracker(this.questManager.getNextQuest());

      // Trigger character dialogue
      this.storyDialogue.playCompleteDialogue(quest, () => {
        const nextQuest = this.questManager.getNextQuest();
        if (nextQuest) {
          setTimeout(() => {
            this.storyDialogue.playIntroDialogue(nextQuest);
          }, 800);
        }
      });
    });

    // Replay story dialogue event from Codex
    document.addEventListener('play-story-dialogue', (e: any) => {
      const { quest, mode } = e.detail;
      if (mode === 'complete') {
        this.storyDialogue.playCompleteDialogue(quest);
      } else {
        this.storyDialogue.playIntroDialogue(quest);
      }
    });

    // Shutter sound event
    document.addEventListener('play-shutter-sound', () => {
      this.audioManager.playShutter();
    });

    // Custom notification event
    document.addEventListener('show-notification', (e: any) => {
      this.hud.showNotification(e.detail.message, e.detail.type || 'info');
    });

    // Photo lightbox event
    document.addEventListener('open-lightbox', (e: any) => {
      const photos = [...(gameStore.getState().photos || [])]
        .filter((p: any) => !p.frameType || p.frameType === 'light')
        .sort((a: any, b: any) => {
          const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
          const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
          return tB - tA;
        });
      const idx = photos.findIndex((p: any) => p.id === e.detail.photoId);
      this.photoLightbox.open(photos, Math.max(0, idx));
    });

    document.addEventListener('open-camp-lightbox', (e: any) => {
      this.photoLightbox.open(e.detail.photos, e.detail.index);
    });

    // Photo capture event (Manual Start / Stop Exposure)
    document.addEventListener('capture-photo', () => {
      const state = gameStore.getState();
      if (state.gameMode !== GameMode.Telescope) return;

      if (!state.isExposing) {
        this.longExposure.startExposure(state.currentFrameType || 'light');
        state.startExposure();
        this.audioManager.playShutter();
      } else {
        const planets = this.planetarySystem.getPlanets();
        const hudTarget = this.telescopeHUD.getCurrentIdentifiedTarget();
        const identified = hudTarget || this.lastIdentifiedTarget || this.starIdentifier.identify(
          state.telescopeRa, state.telescopeDec, state.currentFov, this.celestialSphere, planets, this.spaceStation.getCurrentPassData()
        );
        this.finishExposure(identified);
      }
    });

    // Telescope motor sound on slew
    document.addEventListener('telescope-slew', () => {
      this.audioManager.playMotor(0.5);
    });

    // Electronic Finder UI events
    document.addEventListener('toggle-finder-ui', () => {
      this.finderUI.toggle();
    });

    document.addEventListener('goto-target', (e: any) => {
      const { ra, dec, targetName } = e.detail;
      this.startGoToSlew(ra, dec, targetName);
    });

    // Deploy personal telescope at current position
    document.addEventListener('deploy-telescope', () => {
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const spawnPos = this.camera.position.clone().addScaledVector(forward, 1.8);
      spawnPos.y = 0;
      const telescopeId = `tel_${this.networkManager.localId || 'local'}`;
      const level = gameStore.getState().telescopeLevel || 1;
      const rotY = Math.atan2(forward.x, forward.z);

      // Move local player's physical telescope (along with its mounted laser pointer) to current position
      this.telescopeModel.setPosition(spawnPos, rotY);

      if (this.networkManager.isConnected()) {
        this.networkManager.broadcast({
          type: PacketType.TELESCOPE_SPAWN,
          telescopeId,
          ownerId: this.networkManager.localId,
          ownerName: this.networkManager.localName,
          level,
          pos: [spawnPos.x, spawnPos.y, spawnPos.z],
          rotY,
        });
      }
      this.hud.showNotification('已將您的望遠鏡架設於當前位置！(靠近按 E 可觀測)', 'success');
    });

    // Toggle player headlamp (Off -> Red -> White -> Off)
    document.addEventListener('toggle-headlamp', () => {
      const mode = this.headlamp.toggle();
      this.audioManager.playClick();
      if (mode === 'red') {
        this.hud.showNotification('頭燈：天文紅光模式 (保護暗適應)', 'info');
      } else if (mode === 'white') {
        this.hud.showNotification('頭燈：日常白光模式 (高亮度照明)', 'info');
      } else {
        this.hud.showNotification('頭燈：已關閉', 'info');
      }
    });

    // Multiplayer chat input
    document.addEventListener('open-multiplayer-chat', () => {
      this.multiplayerUI.openChat();
    });

    // Toggle telescope lock status
    document.addEventListener('toggle-telescope-lock', () => {
      if (this.activeOperatingTelescopeId) {
        const tel = this.multiplayerTelescopes.getTelescope(this.activeOperatingTelescopeId);
        if (tel) {
          tel.isLocked = !tel.isLocked;
          this.hud.showNotification(tel.isLocked ? '望遠鏡視角：已鎖定 (隊友只能借看目鏡)' : '望遠鏡視角：未鎖定 (隊友可接管操作)', 'info');
          if (this.networkManager.isConnected()) {
            this.networkManager.broadcast({
              type: PacketType.TELESCOPE_STATE,
              telescopeId: tel.id,
              ra: tel.ra,
              dec: tel.dec,
              fov: tel.fov,
              isLocked: tel.isLocked,
              operatorId: this.networkManager.localId,
            });
          }
        }
      } else {
        gameStore.getState().toggleTelescopeLock();
        const isLocked = gameStore.getState().isTelescopeLocked;
        this.hud.showNotification(isLocked ? '望遠鏡視角：已鎖定' : '望遠鏡視角：未鎖定', 'info');
      }
    });

    // Player interact E key
    document.addEventListener('player-interact-e', () => {
      const state = gameStore.getState();
      if (state.gameMode !== GameMode.Walk) return;

      if (this.campLaptop.isPlayerNear(this.camera.position)) {
        this.campLaptop.toggle();
        return;
      }

      const closestTel = this.multiplayerTelescopes.getClosestTelescope(this.camera.position);
      if (closestTel) {
        if (closestTel.operatorId && closestTel.operatorId !== this.networkManager.localId) {
          if (closestTel.isLocked) {
            // Spectate mode
            this.isSpectatingTelescope = true;
            this.activeOperatingTelescopeId = closestTel.id;
            gameStore.getState().setTelescopePointing(closestTel.ra, closestTel.dec);
            gameStore.getState().setFov(closestTel.fov);
            gameStore.getState().setGameMode(GameMode.Telescope);
            this.hud.showNotification(`正在共享「${closestTel.ownerName}」的目鏡視野 (視角已鎖定)`, 'info');
            return;
          } else {
            // Seize control!
            this.isSpectatingTelescope = false;
            this.activeOperatingTelescopeId = closestTel.id;
            const prevOp = closestTel.operatorId;
            closestTel.operatorId = this.networkManager.localId;
            if (this.networkManager.isConnected()) {
              this.networkManager.broadcast({
                type: PacketType.TELESCOPE_SEIZE,
                telescopeId: closestTel.id,
                newOperatorId: this.networkManager.localId,
                previousOperatorId: prevOp,
              });
            }
            gameStore.getState().setGameMode(GameMode.Telescope);
            this.hud.showNotification(`已接管「${closestTel.ownerName}」的望遠鏡操作權`, 'success');
            return;
          }
        } else {
          // Free telescope
          this.isSpectatingTelescope = false;
          this.activeOperatingTelescopeId = closestTel.id;
          closestTel.operatorId = this.networkManager.localId;
          gameStore.getState().setGameMode(GameMode.Telescope);
          return;
        }
      }

      // Fallback: near default site telescope
      if (this.telescopeModel.isPlayerNear(this.camera.position)) {
        this.isSpectatingTelescope = false;
        this.activeOperatingTelescopeId = null;
        gameStore.getState().setGameMode(GameMode.Telescope);
      }
    });

    // Auto broadcast photos to Camp Laptop
    document.addEventListener('photo-captured', (e: any) => {
      const photo = e.detail?.photo;
      if (!photo) return;
      const sharePkt: CampPhotoSharePacket = {
        type: PacketType.CAMP_PHOTO_SHARE,
        id: photo.id,
        photographerName: this.networkManager.localName,
        targetName: photo.targetName,
        targetType: photo.targetType || 'special',
        exposureSeconds: photo.exposureSeconds,
        quality: photo.quality,
        timestamp: new Date().toISOString(),
        imageDataUrl: photo.imageDataUrl,
        locationName: gameStore.getState().currentLocation?.name || '合歡山',
        telescopeLevel: photo.telescopeLevel || 1,
      };
      this.campLaptop.addSharedPhoto(sharePkt);
      if (this.networkManager.isConnected()) {
        this.networkManager.broadcast(sharePkt);
      }
    });
  }

  /** Slew telescope smoothly to target coordinates with motor sound */
  private startGoToSlew(targetRa: number, targetDec: number, targetName: string) {
    const state = gameStore.getState();
    if (state.gameMode !== GameMode.Telescope) {
      state.setGameMode(GameMode.Telescope);
    }
    state.setCustomTrackedDso(targetName);
    this.goToStartRa = state.telescopeRa;
    this.goToStartDec = state.telescopeDec;
    this.goToTargetRa = targetRa;
    this.goToTargetDec = targetDec;
    this.goToTargetName = targetName;
    this.goToStartTime = performance.now();
    this.goToDuration = 1800;
    this.isGoToSlewing = true;
    this.audioManager.playMotor(2.0);
    this.hud.showNotification(`GoTo 自動導星轉向中：正在對準 ${targetName}...`, 'info');
  }

  /** Handle game mode transitions. */
  private onModeChange(from: GameMode, to: GameMode): void {
    if (to === GameMode.Telescope || to === GameMode.Studio) {
      this.headlamp.setVisible(false);
    } else if (to === GameMode.Walk) {
      this.headlamp.setVisible(true);
    }

    if (to === GameMode.Telescope) {
      this.savedWalkPos.copy(this.camera.position);
      this.savedWalkRot.copy(this.camera.rotation);
      this.telescopeModel.setVisible(false);
      this.terrain.setVisible(true);
      this.studio.setVisible(false);

      // Preserve telescope magnification / FOV
      const targetFov = this.savedTelescopeFov || gameStore.getState().currentFov || 20.0;
      gameStore.getState().setFov(targetFov);
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();

      this.telescopeHUD.show();
    } else if (from === GameMode.Telescope) {
      // Remember current telescope magnification before exiting
      this.savedTelescopeFov = gameStore.getState().currentFov;
      this.camera.position.copy(this.savedWalkPos);
      this.camera.rotation.copy(this.savedWalkRot);

      // Restore camera FOV for Walk mode (98° wide-angle if lying down, else 60°)
      this.camera.fov = gameStore.getState().isLyingDown ? 98 : 60;
      this.camera.updateProjectionMatrix();

      // Keep telescope's saved magnification in store and savedTelescopeFov (do NOT call setFov(60))
      this.telescopeModel.setVisible(true);
      this.terrain.setVisible(true);
      this.studio.setVisible(true);
      this.telescopeHUD.hide();

      if (this.activeOperatingTelescopeId) {
        const tel = this.multiplayerTelescopes.getTelescope(this.activeOperatingTelescopeId);
        if (tel && tel.operatorId === this.networkManager.localId) {
          tel.operatorId = null;
          if (this.networkManager.isConnected()) {
            this.networkManager.broadcast({
              type: PacketType.TELESCOPE_STATE,
              telescopeId: tel.id,
              ra: tel.ra,
              dec: tel.dec,
              fov: tel.fov,
              isLocked: tel.isLocked,
              operatorId: null,
            });
          }
        }
        this.activeOperatingTelescopeId = null;
        this.isSpectatingTelescope = false;
      }
    }

    if (to === GameMode.Studio) {
      this.studioUI.show();
    } else if (from === GameMode.Studio) {
      this.studioUI.hide();
    }
  }

  /** Complete a long exposure and save the photo. */
  private finishExposure(identified: { name: string; type: any; magnitude: number } | null): void {
    const state = gameStore.getState();
    const result = this.longExposure.finishExposure();
    state.stopExposure();

    // Determine target info
    const targetName = identified?.name || '未知星野';
    const targetType = identified?.type || 'star_field';

    const hasMeteor = this.meteorSystem.wasMeteorCaptured();
    const targetPayload = identified
      ? { id: (identified as any).id || targetName, name: identified.name, type: identified.type, hasMeteor }
      : { id: 'star_field', name: '未知星野', type: 'star_field', hasMeteor };

    // Capture and score the photo with true accumulated data URL and drift metrics
    this.prepareSceneForPhoto(true);

    const photo = this.photoManager.capturePhoto(
      this.renderer, this.scene, this.camera,
      targetPayload,
      result.elapsedSeconds,
      result.dataUrl,
      result.hasMotionBlur,
      result.totalDrift,
      state.currentFrameType || 'light'
    );

    this.prepareSceneForPhoto(false);

    this.audioManager.playShutter();
    const typeNames: Record<string, string> = {
      dark: '暗場校準底片',
      flat: '平場校準底片',
      bias: '偏壓校準底片',
      light: '天文照片',
    };
    const label = typeNames[state.currentFrameType || 'light'] || '照片';
    this.hud.showNotification(`${label}已儲存: ${photo.targetName}（曝光 ${result.elapsedSeconds.toFixed(1)} 秒 · ${photo.quality}級）`, 'success');
  }

  private wasConstellationsVisibleBeforePhoto = false;
  private prepareSceneForPhoto(isPhoto: boolean): void {
    if (isPhoto) {
      this.wasConstellationsVisibleBeforePhoto = this.constellations.isVisible();
      this.constellations.setVisible(false);
      this.laserPointer.setVisibleForPhoto(false);
      this.telescopeModel.setMountedLaserVisible(false);
      this.avatarManager.hideLasersForPhoto(true);
      this.multiplayerTelescopes.hideLasersForPhoto(true);
    } else {
      if (this.wasConstellationsVisibleBeforePhoto && gameStore.getState().showConstellations) {
        this.constellations.setVisible(true);
      }
      this.telescopeModel.setMountedLaserVisible(gameStore.getState().isLaserPointerMounted);
      this.avatarManager.hideLasersForPhoto(false);
      this.multiplayerTelescopes.hideLasersForPhoto(false);
    }
  }

  /** Handle window resize. */
  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.postProcessing.resize(width, height);
    this.longExposure.resize(width, height);
    this.starTrailCamera.resize(width, height);
  }

  /** Clean up all resources. */
  dispose(): void {
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);
    this.avatarManager.dispose();
    this.multiplayerTelescopes.dispose();
    this.campLaptop.dispose();
    this.multiplayerUI.dispose();
    this.headlamp.dispose();
    this.networkManager.disconnect();
    this.starField.dispose();
    this.deepSkyObjects.dispose();
    this.planetarySystem.dispose();
    this.atmosphere.dispose();
    this.cloudLayer.dispose();
    this.rainEffect.dispose();
    this.audioManager.dispose();
    this.terrain.dispose();
    this.telescopeModel.dispose();
    this.studio.dispose();
    this.playerController.dispose();
    this.binocularsMode.dispose();
    this.starTrailCamera.dispose();
    this.longExposure.dispose();
    this.postProcessing.dispose();
    this.hud.dispose();
    this.telescopeHUD.dispose();
    this.studioUI.dispose();
    this.codexUI.dispose();
    this.photoLightbox.dispose();
    this.storyDialogue.dispose();
    this.menuSystem.dispose();
    this.finderUI.dispose();
    this.renderer.dispose();
  }
}
