import * as THREE from 'three';
import { CampPhotoSharePacket } from './NetworkProtocol';
import { PhotoExporter } from '../game/PhotoExporter';

export class CampLaptop {
  private scene: THREE.Scene;
  private tableGroup: THREE.Group;
  private modalEl: HTMLElement;
  private isModalOpen = false;
  private photos: CampPhotoSharePacket[] = [];
  public tablePosition = new THREE.Vector3(3.2, 0, -2.2);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.tableGroup = this.createTableAndLaptop();
    this.tableGroup.position.copy(this.tablePosition);
    this.tableGroup.rotation.y = -Math.PI / 4;
    this.scene.add(this.tableGroup);

    this.modalEl = this.createModalDOM();
    this.setupEvents();
  }

  private createTableAndLaptop(): THREE.Group {
    const root = new THREE.Group();

    // Camping Tabletop
    const topGeo = new THREE.BoxGeometry(1.2, 0.04, 0.75);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.8 });
    const tabletop = new THREE.Mesh(topGeo, topMat);
    tabletop.position.y = 0.75;
    tabletop.castShadow = true;
    root.add(tabletop);

    // Aluminum table legs
    const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.75, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x71717a, metalness: 0.8, roughness: 0.3 });
    const legPositions = [
      [-0.52, 0.375, -0.3],
      [0.52, 0.375, -0.3],
      [-0.52, 0.375, 0.3],
      [0.52, 0.375, 0.3],
    ];
    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, y, z);
      root.add(leg);
    });

    // Rugged Field Laptop
    const laptopGroup = new THREE.Group();
    laptopGroup.position.set(0, 0.77, 0);

    // Base & Keyboard
    const baseGeo = new THREE.BoxGeometry(0.36, 0.015, 0.25);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.6, roughness: 0.4 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    laptopGroup.add(base);

    // Screen lid (tilted back 115 degrees)
    const lidGroup = new THREE.Group();
    lidGroup.position.set(0, 0.01, -0.12);
    lidGroup.rotation.x = THREE.MathUtils.degToRad(-25);

    const lidBack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.012), baseMat);
    lidBack.position.set(0, 0.12, 0);
    lidGroup.add(lidBack);

    // Glowing screen showing starry desktop
    const screenGeo = new THREE.PlaneGeometry(0.33, 0.21);
    const screenMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.12, 0.007);
    lidGroup.add(screen);

    laptopGroup.add(lidGroup);
    root.add(laptopGroup);

    // Cyan Field Lantern beside laptop
    const lanternGroup = new THREE.Group();
    lanternGroup.position.set(0.45, 0.77, 0.15);

    const lanternBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.14, 12),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.5 })
    );
    lanternBase.position.y = 0.07;

    const lanternGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
    );
    lanternGlass.position.y = 0.14;

    const lanternLight = new THREE.PointLight(0x38bdf8, 2.5, 9.0);
    lanternLight.position.y = 0.2;

    lanternGroup.add(lanternBase, lanternGlass, lanternLight);
    root.add(lanternGroup);

    return root;
  }

  private createModalDOM(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'camp-laptop-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '300';
    modal.style.display = 'none';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.backgroundColor = 'rgba(2, 6, 23, 0.85)';
    modal.style.backdropFilter = 'blur(10px)';
    modal.style.cursor = 'default';
    modal.style.pointerEvents = 'auto';

    modal.innerHTML = `
      <div class="camp-laptop-panel" style="width: 860px; max-width: 92vw; max-height: 85vh; background: #090d16; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 16px 48px rgba(0,0,0,0.8);">
        <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 17px; font-weight: 700; color: #f8fafc; letter-spacing: 0.03em;">營地野外終端機 · 共享星空相簿</div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">此終端機即時同步所有觀星隊友拍攝的星空影像與星軌作品（點擊照片可放大全螢幕檢視）</div>
          </div>
          <button id="camp-laptop-close" style="background: none; border: none; color: #94a3b8; font-size: 24px; cursor: pointer; padding: 4px 8px;">&times;</button>
        </div>
        <div id="camp-laptop-grid" style="flex: 1; overflow-y: auto; padding: 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;">
          <!-- Photo cards inserted dynamically -->
        </div>
      </div>
    `;

    modal.querySelector('#camp-laptop-close')?.addEventListener('click', () => this.close());
    document.getElementById('ui-overlay')?.appendChild(modal);
    return modal;
  }

  private setupEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isModalOpen) {
        this.close();
      }
    });
  }

  public isPlayerNear(playerPos: THREE.Vector3, threshold = 2.8): boolean {
    return playerPos.distanceTo(this.tablePosition) < threshold;
  }

  public open() {
    this.isModalOpen = true;
    this.modalEl.style.display = 'flex';
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.renderPhotoGrid();
  }

  public close() {
    this.isModalOpen = false;
    this.modalEl.style.display = 'none';
  }

  public toggle() {
    if (this.isModalOpen) this.close();
    else this.open();
  }

  public addSharedPhoto(photo: CampPhotoSharePacket) {
    // Avoid duplicate IDs
    if (!this.photos.some((p) => p.id === photo.id)) {
      this.photos.unshift(photo);
      if (this.isModalOpen) {
        this.renderPhotoGrid();
      }
    }
  }

  private renderPhotoGrid() {
    const grid = this.modalEl.querySelector('#camp-laptop-grid') as HTMLElement;
    if (!grid) return;

    if (this.photos.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #64748b;">
          <div style="font-size: 16px; font-weight: 600; color: #94a3b8; margin-bottom: 6px;">尚無隊友共享的照片</div>
          <div style="font-size: 13px;">任何人在星空下拍照或拍攝星軌，都會自動無線上傳至本終端機。</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = '';
    this.photos.forEach((photo, idx) => {
      const card = document.createElement('div');
      card.style.background = '#0f172a';
      card.style.border = '1px solid rgba(255,255,255,0.08)';
      card.style.borderRadius = '8px';
      card.style.overflow = 'hidden';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.transition = 'all 0.2s ease';

      card.innerHTML = `
        <div class="camp-card-img-wrap" style="position: relative; width: 100%; aspect-ratio: 16/9; overflow: hidden; cursor: pointer;">
          <img src="${photo.imageDataUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.2s ease;" />
          <div style="position: absolute; inset: 0; background: rgba(2, 6, 23, 0.3); opacity: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 600; transition: opacity 0.2s ease;" class="camp-hover-overlay">點擊放大檢視</div>
        </div>
        <div style="padding: 12px; display: flex; flex-direction: column; gap: 4px; flex: 1;">
          <div style="font-size: 13px; font-weight: 700; color: #f8fafc;">${photo.targetName}</div>
          <div style="font-size: 11px; color: #38bdf8;">由「${photo.photographerName}」拍攝</div>
          <div style="font-size: 11px; color: #64748b;">曝光: ${photo.exposureSeconds.toFixed(1)}s · ${photo.locationName}</div>
          <div style="margin-top: auto; padding-top: 8px; display: flex; gap: 6px;">
            <button class="camp-card-zoom-btn" style="flex: 1; padding: 5px 8px; font-size: 11px; background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 4px; cursor: pointer; font-weight: 600;">放大</button>
            <button class="camp-card-export-btn" style="flex: 1; padding: 5px 8px; font-size: 11px; background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.5); border-radius: 4px; cursor: pointer; font-weight: 600;">銘牌</button>
            <button class="camp-card-raw-btn" style="padding: 5px 8px; font-size: 11px; background: rgba(255, 255, 255, 0.06); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 4px; cursor: pointer;">原圖</button>
          </div>
        </div>
      `;

      // Hover effect
      const imgWrap = card.querySelector('.camp-card-img-wrap') as HTMLElement;
      const overlay = card.querySelector('.camp-hover-overlay') as HTMLElement;
      imgWrap.addEventListener('mouseenter', () => {
        overlay.style.opacity = '1';
      });
      imgWrap.addEventListener('mouseleave', () => {
        overlay.style.opacity = '0';
      });

      const openLightbox = () => {
        const formattedPhotos = this.photos.map((p) => ({
          id: p.id,
          imageDataUrl: p.imageDataUrl,
          targetName: p.targetName,
          exposureSeconds: p.exposureSeconds,
          quality: p.quality,
          locationName: p.locationName,
          timestamp: new Date(p.timestamp),
          photographerName: p.photographerName,
          telescopeLevel: p.telescopeLevel,
          targetType: p.targetType,
          weatherCondition: 'clear',
          score: 95,
          sellPrice: 0,
          sold: false,
          frameType: 'light',
        }));
        document.dispatchEvent(new CustomEvent('open-camp-lightbox', {
          detail: { photos: formattedPhotos, index: idx }
        }));
      };

      imgWrap.addEventListener('click', openLightbox);
      card.querySelector('.camp-card-zoom-btn')?.addEventListener('click', openLightbox);

      card.querySelector('.camp-card-export-btn')?.addEventListener('click', () => {
        PhotoExporter.downloadExhibitionPlate({
          id: photo.id,
          imageDataUrl: photo.imageDataUrl,
          targetName: photo.targetName,
          exposureSeconds: photo.exposureSeconds,
          telescopeLevel: photo.telescopeLevel,
          weatherCondition: 'clear' as any,
          quality: photo.quality as any,
          score: 95,
          sellPrice: 1000,
          sold: false,
          timestamp: new Date(photo.timestamp),
          locationId: 'camp',
          targetType: photo.targetType as any,
        });
      });

      card.querySelector('.camp-card-raw-btn')?.addEventListener('click', () => {
        PhotoExporter.downloadRawPhoto({
          id: photo.id,
          imageDataUrl: photo.imageDataUrl,
          targetName: photo.targetName,
          exposureSeconds: photo.exposureSeconds,
          telescopeLevel: photo.telescopeLevel,
          weatherCondition: 'clear' as any,
          quality: photo.quality as any,
          score: 95,
          sellPrice: 1000,
          sold: false,
          timestamp: new Date(photo.timestamp),
          locationId: 'camp',
          targetType: photo.targetType as any,
        });
      });

      grid.appendChild(card);
    });
  }

  public dispose() {
    this.scene.remove(this.tableGroup);
    this.modalEl.remove();
  }
}
