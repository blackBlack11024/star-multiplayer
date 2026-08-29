import * as THREE from 'three';
import SunCalc from 'suncalc';
import { TargetType } from '../types';
import { PlanetaryTextureFactory } from './PlanetaryTextureFactory';

export interface PlanetData {
  id: string;
  name: string;
  nameEn: string;
  type: TargetType;
  ra: number;        // in hours (0-24)
  dec: number;       // in degrees (-90 to +90)
  magnitude: number; // visual apparent magnitude
  angularSizeArcsec: number;
  description: string;
  features: string;
}

export interface PlanetOrbitalElements {
  a0: number; a1: number; // semi-major axis (AU)
  e0: number; e1: number; // eccentricity
  I0: number; I1: number; // inclination (deg)
  L0: number; L1: number; // mean longitude (deg)
  w0: number; w1: number; // longitude of perihelion (deg)
  node0: number; node1: number; // longitude of ascending node (deg)
  baseMag: number;
  baseSizeArcsec: number;
}

const PLANET_ELEMENTS: Record<string, PlanetOrbitalElements> = {
  mercury: {
    a0: 0.387098, a1: 0,
    e0: 0.205630, e1: 0.000025,
    I0: 7.0049,   I1: -0.0059,
    L0: 252.2509, L1: 4.09233445,
    w0: 77.4561,  w1: 0.0016,
    node0: 48.3309, node1: -0.0125,
    baseMag: -0.4,
    baseSizeArcsec: 8.0,
  },
  venus: {
    a0: 0.723330, a1: 0,
    e0: 0.006772, e1: -0.000048,
    I0: 3.3946,   I1: -0.0008,
    L0: 181.9798, L1: 1.60213034,
    w0: 131.5637, w1: 0.0050,
    node0: 76.6799, node1: -0.0278,
    baseMag: -4.3,
    baseSizeArcsec: 25.0,
  },
  mars: {
    a0: 1.523688, a1: 0,
    e0: 0.093400, e1: 0.000090,
    I0: 1.8497,   I1: -0.0006,
    L0: 355.4330, L1: 0.52403304,
    w0: 336.0602, w1: 0.0018,
    node0: 49.5581, node1: -0.0295,
    baseMag: -1.5,
    baseSizeArcsec: 14.0,
  },
  jupiter: {
    a0: 5.202603, a1: 0.00000002,
    e0: 0.048497, e1: 0.000163,
    I0: 1.3033,   I1: -0.0002,
    L0: 34.3515,  L1: 0.08308529,
    w0: 14.3312,  w1: 0.0078,
    node0: 100.4644, node1: 0.0064,
    baseMag: -2.6,
    baseSizeArcsec: 45.0,
  },
  saturn: {
    a0: 9.554909, a1: -0.000002,
    e0: 0.055510, e1: -0.000346,
    I0: 2.4889,   I1: 0.0005,
    L0: 50.0774,  L1: 0.03344414,
    w0: 93.0568,  w1: 0.0196,
    node0: 113.6655, node1: -0.0072,
    baseMag: 0.5,
    baseSizeArcsec: 40.0,
  },
  uranus: {
    a0: 19.218446, a1: -0.0000004,
    e0: 0.046296, e1: -0.000027,
    I0: 0.7732,   I1: 0.0001,
    L0: 314.0550, L1: 0.01172835,
    w0: 173.0053, w1: 0.0149,
    node0: 74.0060, node1: 0.0074,
    baseMag: 5.7,
    baseSizeArcsec: 3.8,
  },
  neptune: {
    a0: 30.110387, a1: 0.0000004,
    e0: 0.008988, e1: 0.000006,
    I0: 1.7700,   I1: 0.0004,
    L0: 304.3487, L1: 0.00598103,
    w0: 48.1203,  w1: 0.0274,
    node0: 131.7841, node1: -0.0006,
    baseMag: 7.8,
    baseSizeArcsec: 2.4,
  },
};

const EARTH_ELEMENTS: PlanetOrbitalElements = {
  a0: 1.000003, a1: 0,
  e0: 0.016710, e1: -0.000042,
  I0: 0.00005,  I1: -0.0133,
  L0: 100.4664, L1: 0.98564736,
  w0: 102.9373, w1: 0.00005,
  node0: 0.0,   node1: 0.0,
  baseMag: 0,
  baseSizeArcsec: 0,
};

export class PlanetarySystem {
  private celestialGroup: THREE.Group;
  private planetSprites: Map<string, THREE.Sprite> = new Map();
  private planetDataList: PlanetData[] = [];
  private textures: Map<string, THREE.Texture> = new Map();

  // Real NASA Lunar Photographic Texture System
  private moonCanvas!: HTMLCanvasElement;
  private moonCtx!: CanvasRenderingContext2D;
  private moonTexture!: THREE.CanvasTexture;
  private moonImage: HTMLImageElement | null = null;
  private lastRenderedMoonPhase: number = -1;

  constructor(celestialGroup: THREE.Group) {
    this.celestialGroup = celestialGroup;
    this.initMoonSystem();
    this.initTextures();
    this.createPlanetSprites();
  }

  private initMoonSystem() {
    this.moonCanvas = document.createElement('canvas');
    this.moonCanvas.width = 1024;
    this.moonCanvas.height = 1024;
    this.moonCtx = this.moonCanvas.getContext('2d')!;

    this.moonTexture = new THREE.CanvasTexture(this.moonCanvas);
    this.moonTexture.generateMipmaps = true;
    this.moonTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.moonTexture.magFilter = THREE.LinearFilter;

    // Load real NASA Photographic Moon Map from public directory
    const baseUrl = (import.meta as any).env?.BASE_URL || './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const moonUrl = `${cleanBase}textures/planets/moon.png`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.moonImage = img;
      this.redrawMoon(this.lastRenderedMoonPhase >= 0 ? this.lastRenderedMoonPhase : 0.5);
    };
    img.onerror = () => {
      console.warn('Could not load NASA Moon texture, using high-res procedural fallback');
      this.redrawMoon(0.5);
    };
    img.src = moonUrl;

    // Initial render
    this.redrawMoon(0.5);
  }

  private redrawMoon(phase: number) {
    this.lastRenderedMoonPhase = phase;
    const ctx = this.moonCtx;
    const w = 1024, h = 1024;
    const cx = 512, cy = 512, R = 440;

    ctx.clearRect(0, 0, w, h);

    // 1. Lunar outer glow / atmospheric halo
    const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.18);
    halo.addColorStop(0, 'rgba(241, 245, 249, 0.45)');
    halo.addColorStop(0.5, 'rgba(203, 213, 225, 0.12)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // 2. Draw Real NASA Orthographic Photographic Moon Disk (or fallback)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    if (this.moonImage && this.moonImage.complete && this.moonImage.naturalWidth > 0) {
      // Draw real NASA mathematically projected near-side photo
      ctx.drawImage(this.moonImage, cx - R, cy - R, R * 2, R * 2);
    } else {
      // Procedural lunar base
      const base = ctx.createRadialGradient(cx - 50, cy - 50, 50, cx, cy, R);
      base.addColorStop(0, '#f8fafc');
      base.addColorStop(0.5, '#cbd5e1');
      base.addColorStop(0.8, '#94a3b8');
      base.addColorStop(1, '#475569');
      ctx.fillStyle = base;
      ctx.fill();

      // Procedural Maria (Oceanus Procellarum, Mare Tranquillitatis, etc.)
      ctx.fillStyle = 'rgba(71, 85, 105, 0.65)';
      ctx.beginPath();
      ctx.ellipse(cx - 140, cy - 100, 180, 140, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 100, cy - 60, 120, 100, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + 40, cy + 110, 140, 80, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Dynamic Lunar Phase Terminator & Earthshine Shadow
    // phase: 0=New Moon, 0.25=First Quarter, 0.5=Full Moon, 0.75=Last Quarter, 1=New Moon
    const normPhase = ((phase % 1) + 1) % 1;
    
    // Draw Earthshine / Dark side overlay (not pitch black!)
    ctx.fillStyle = 'rgba(6, 10, 18, 0.92)';

    if (normPhase < 0.02 || normPhase > 0.98) {
      // New Moon: completely in shadow
      ctx.fillRect(0, 0, w, h);
    } else if (normPhase > 0.48 && normPhase < 0.52) {
      // Full Moon: fully lit, no shadow
    } else {
      // Crescent / Quarter / Gibbous terminator curve
      ctx.beginPath();
      if (normPhase < 0.5) {
        // Waxing (First Quarter side): Right side is lit, Left side is in shadow
        ctx.arc(cx, cy, R + 2, Math.PI * 0.5, Math.PI * 1.5, false);
        const k = Math.cos(normPhase * Math.PI * 2); // 1 at new -> 0 at quarter -> -1 at full
        ctx.ellipse(cx, cy, Math.abs(k) * R, R + 2, 0, Math.PI * 1.5, Math.PI * 0.5, k > 0);
      } else {
        // Waning (Last Quarter side): Left side is lit, Right side is in shadow
        ctx.arc(cx, cy, R + 2, Math.PI * 1.5, Math.PI * 0.5, false);
        const k = Math.cos(normPhase * Math.PI * 2);
        ctx.ellipse(cx, cy, Math.abs(k) * R, R + 2, 0, Math.PI * 0.5, Math.PI * 1.5, k > 0);
      }
      ctx.fill();
    }

    // Subtle 3D limb darkening along the outer circular edge
    const limb = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
    limb.addColorStop(0, 'rgba(0, 0, 0, 0)');
    limb.addColorStop(1, 'rgba(15, 23, 42, 0.45)');
    ctx.fillStyle = limb;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();

    this.moonTexture.needsUpdate = true;
  }

  private initTextures() {
    this.textures.set('mercury', PlanetaryTextureFactory.getPlanetTexture('mercury'));
    this.textures.set('venus', PlanetaryTextureFactory.getPlanetTexture('venus'));
    this.textures.set('mars', PlanetaryTextureFactory.getPlanetTexture('mars'));
    this.textures.set('jupiter', PlanetaryTextureFactory.getPlanetTexture('jupiter'));
    this.textures.set('saturn', PlanetaryTextureFactory.getPlanetTexture('saturn'));
    this.textures.set('uranus', PlanetaryTextureFactory.getPlanetTexture('uranus'));
    this.textures.set('neptune', PlanetaryTextureFactory.getPlanetTexture('neptune'));
    this.textures.set('moon', this.moonTexture);
  }

  // =========================================================================
  // 512x512 High Resolution Procedural Planetary Textures
  // =========================================================================

  /** Saturn with banded sphere and angled 3D ring system with Cassini division */
  private createSaturnTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256, cy = 256;

    // Outer faint glow
    const glow = ctx.createRadialGradient(cx, cy, 50, cx, cy, 240);
    glow.addColorStop(0, 'rgba(253, 230, 138, 0.25)');
    glow.addColorStop(0.5, 'rgba(217, 119, 6, 0.08)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.45); // Tilted ring angle

    // Back half of rings (rendered behind globe)
    ctx.save();
    ctx.beginPath();
    ctx.rect(-250, -250, 500, 250); // top half
    ctx.clip();
    this.drawSaturnRings(ctx);
    ctx.restore();

    // Planet globe (golden bands)
    const globeR = 64;
    ctx.beginPath();
    ctx.arc(0, 0, globeR, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(-18, -18, 5, 0, 0, globeR);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.4, '#eab308');
    grad.addColorStop(0.7, '#ca8a04');
    grad.addColorStop(1, '#854d0e');
    ctx.fillStyle = grad;
    ctx.fill();

    // Atmospheric cloud bands on globe
    for (let y = -globeR; y < globeR; y += 4) {
      const halfW = Math.sqrt(globeR * globeR - y * y);
      ctx.fillStyle = (Math.abs(y) % 12 < 6) ? 'rgba(202, 138, 4, 0.4)' : 'rgba(254, 240, 138, 0.35)';
      ctx.fillRect(-halfW, y, halfW * 2, 3);
    }

    // Globe shadow on back ring
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, globeR, 0, Math.PI * 2);
    ctx.fill();

    // Front half of rings (rendered in front of globe)
    ctx.save();
    ctx.beginPath();
    ctx.rect(-250, 0, 500, 250); // bottom half
    ctx.clip();
    this.drawSaturnRings(ctx);
    ctx.restore();

    // Ring shadow cast on front globe
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.beginPath();
    ctx.ellipse(0, 0, globeR + 4, 18, 0, 0, Math.PI);
    ctx.fill();

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private drawSaturnRings(ctx: CanvasRenderingContext2D) {
    const rings = [
      { rX: 220, rY: 62, color: 'rgba(234, 179, 8, 0.35)', width: 14 },   // Ring A
      { rX: 198, rY: 54, color: 'rgba(0, 0, 0, 0.85)', width: 6 },        // Cassini Division
      { rX: 185, rY: 50, color: 'rgba(254, 240, 138, 0.75)', width: 28 }, // Ring B (Brightest)
      { rX: 145, rY: 38, color: 'rgba(180, 83, 9, 0.45)', width: 12 },    // Ring C (Crepe ring)
    ];

    for (const r of rings) {
      ctx.beginPath();
      ctx.ellipse(0, 0, r.rX, r.rY, 0, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.stroke();
    }
  }

  /** Jupiter with creamy atmospheric bands, Great Red Spot, and 4 Galilean moons */
  private createJupiterTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256, cy = 256, R = 90;

    // Outer glow
    const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 2.2);
    glow.addColorStop(0, 'rgba(254, 215, 170, 0.3)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);

    // Planet disk base
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    const baseGrad = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    baseGrad.addColorStop(0, '#fed7aa');
    baseGrad.addColorStop(0.3, '#c2410c');
    baseGrad.addColorStop(0.5, '#ffedd5');
    baseGrad.addColorStop(0.7, '#9a3412');
    baseGrad.addColorStop(1, '#fed7aa');
    ctx.fillStyle = baseGrad;
    ctx.fill();

    // Equatorial and temperate cloud bands
    const bandHeights = [-70, -50, -32, -14, 0, 18, 38, 58, 72];
    const bandColors = [
      'rgba(154, 52, 18, 0.7)',
      'rgba(255, 237, 213, 0.85)',
      'rgba(194, 65, 12, 0.85)',
      'rgba(254, 215, 170, 0.9)',
      'rgba(180, 83, 9, 0.75)',
      'rgba(254, 240, 138, 0.85)',
      'rgba(154, 52, 18, 0.8)',
      'rgba(255, 237, 213, 0.8)',
      'rgba(124, 45, 18, 0.65)'
    ];

    for (let i = 0; i < bandHeights.length; i++) {
      ctx.fillStyle = bandColors[i];
      ctx.fillRect(cx - R, cy + bandHeights[i], R * 2, 12);
    }

    // Great Red Spot (大紅斑 in Southern hemisphere)
    ctx.beginPath();
    ctx.ellipse(cx + 28, cy + 32, 18, 11, -0.1, 0, Math.PI * 2);
    const grs = ctx.createRadialGradient(cx + 28, cy + 32, 2, cx + 28, cy + 32, 18);
    grs.addColorStop(0, '#ef4444');
    grs.addColorStop(0.6, '#b91c1c');
    grs.addColorStop(1, 'rgba(185, 28, 28, 0.4)');
    ctx.fillStyle = grs;
    ctx.fill();

    // Spherical 3D shading
    const shade = ctx.createRadialGradient(cx - 30, cy - 30, 20, cx, cy, R);
    shade.addColorStop(0, 'rgba(255,255,255,0.2)');
    shade.addColorStop(0.8, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 4 Galilean Moons (Io, Europa, Ganymede, Callisto)
    const moons = [
      { x: cx - 210, y: cy + 4, r: 4.5, color: '#fef08a', name: 'Callisto' },
      { x: cx - 140, y: cy - 2, r: 5.5, color: '#fed7aa', name: 'Ganymede' },
      { x: cx + 130, y: cy + 3, r: 4.0, color: '#e0f2fe', name: 'Europa' },
      { x: cx + 180, y: cy - 5, r: 4.8, color: '#facc15', name: 'Io' },
    ];
    for (const m of moons) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fillStyle = m.color;
      ctx.shadowColor = m.color;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /** Mars with red-orange desert surface, dark Syrtis Major, and white polar ice cap */
  private createMarsTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256, cy = 256, R = 110;

    // Red glow
    const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 2.0);
    glow.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
    glow.addColorStop(0.5, 'rgba(185, 28, 28, 0.1)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // Red base
    const base = ctx.createRadialGradient(cx - 30, cy - 30, 20, cx, cy, R);
    base.addColorStop(0, '#f87171');
    base.addColorStop(0.4, '#dc2626');
    base.addColorStop(0.8, '#991b1b');
    base.addColorStop(1, '#450a0a');
    ctx.fillStyle = base;
    ctx.fill();

    // Dark Martian Maria / Syrtis Major features
    ctx.fillStyle = 'rgba(69, 10, 10, 0.65)';
    ctx.beginPath();
    ctx.ellipse(cx - 15, cy + 20, 45, 25, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 35, cy - 10, 30, 18, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // North Polar Ice Cap (白色極冠)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - R + 14, 38, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /** Venus with brilliant silvery-white cloud veil and atmospheric limb */
  private createVenusTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256, cy = 256, R = 110;

    // Blinding diamond glow
    const glow = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 2.2);
    glow.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    glow.addColorStop(0.3, 'rgba(254, 240, 138, 0.35)');
    glow.addColorStop(0.7, 'rgba(56, 189, 248, 0.1)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx - 35, cy - 35, 10, cx, cy, R);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#fef9c3');
    grad.addColorStop(0.8, '#fde047');
    grad.addColorStop(1, '#ca8a04');
    ctx.fillStyle = grad;
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /** Mercury with craters and warm gray rock surface */
  private createMercuryTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256, cy = 256, R = 95;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    const grad = ctx.createRadialGradient(cx - 30, cy - 30, 10, cx, cy, R);
    grad.addColorStop(0, '#e2e8f0');
    grad.addColorStop(0.5, '#94a3b8');
    grad.addColorStop(0.8, '#475569');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fill();

    // Crater dots
    ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
    for (let i = 0; i < 20; i++) {
      const rx = cx + (Math.sin(i * 9) * R * 0.7);
      const ry = cy + (Math.cos(i * 13) * R * 0.7);
      ctx.beginPath();
      ctx.arc(rx, ry, (i % 5) + 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /** Uranus with pale cyan/aquamarine gaseous veil */
  private createUranusTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256, cy = 256, R = 95;

    const grad = ctx.createRadialGradient(cx - 25, cy - 25, 10, cx, cy, R);
    grad.addColorStop(0, '#e0f2fe');
    grad.addColorStop(0.4, '#7dd3fc');
    grad.addColorStop(0.8, '#0284c7');
    grad.addColorStop(1, '#075985');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /** Neptune with deep cobalt/azure blue atmosphere */
  private createNeptuneTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256, cy = 256, R = 95;

    const grad = ctx.createRadialGradient(cx - 25, cy - 25, 10, cx, cy, R);
    grad.addColorStop(0, '#93c5fd');
    grad.addColorStop(0.4, '#2563eb');
    grad.addColorStop(0.8, '#1d4ed8');
    grad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /** Moon with detailed lunar maria (Sea of Tranquility, etc.) */
  private createMoonTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const cx = 256, cy = 256, R = 110;

    // Moonlight halo
    const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 2.2);
    glow.addColorStop(0, 'rgba(226, 232, 240, 0.45)');
    glow.addColorStop(0.5, 'rgba(148, 163, 184, 0.12)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // Lunar highland base
    const base = ctx.createRadialGradient(cx - 20, cy - 20, 20, cx, cy, R);
    base.addColorStop(0, '#f8fafc');
    base.addColorStop(0.5, '#cbd5e1');
    base.addColorStop(0.8, '#94a3b8');
    base.addColorStop(1, '#475569');
    ctx.fillStyle = base;
    ctx.fill();

    // Dark Lunar Maria (月海暗斑: 靜海、風暴洋、雨海)
    ctx.fillStyle = 'rgba(71, 85, 105, 0.65)';
    ctx.beginPath();
    ctx.ellipse(cx - 35, cy - 25, 45, 35, 0.2, 0, Math.PI * 2); // Oceanus Procellarum
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 25, cy - 15, 30, 25, -0.3, 0, Math.PI * 2); // Mare Tranquillitatis
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 10, cy + 28, 35, 20, 0.1, 0, Math.PI * 2); // Mare Nubium
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 45, cy - 35, 20, 18, 0.4, 0, Math.PI * 2); // Mare Serenitatis
    ctx.fill();

    // Tycho crater bright ray center
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + 8, cy + 62, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // =========================================================================
  // Ephemeris Position Calculation (Keplerian Orbital Mechanics)
  // =========================================================================

  private solveKepler(M_deg: number, e: number): number {
    const M = (M_deg * Math.PI) / 180;
    let E = M;
    for (let i = 0; i < 15; i++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-6) break;
    }
    return E;
  }

  /** Compute Heliocentric position (x, y, z in AU) */
  private getHeliocentric(elem: PlanetOrbitalElements, d: number): { x: number; y: number; z: number } {
    const T = d / 36525.0; // Julian centuries from J2000.0 (secular rates are per century)
    const a = elem.a0 + elem.a1 * T;
    const e = Math.max(0.00001, Math.min(0.9999, elem.e0 + elem.e1 * T));
    const I = (elem.I0 + elem.I1 * T) * (Math.PI / 180);
    const L = (elem.L0 + elem.L1 * d) % 360; // L1 is mean daily motion (deg/day)
    const w = (elem.w0 + elem.w1 * T) % 360;
    const node = (elem.node0 + elem.node1 * T) * (Math.PI / 180);

    const M = (L - w + 360) % 360;
    const E = this.solveKepler(M, e);

    const xv = a * (Math.cos(E) - e);
    const yv = a * (Math.sqrt(Math.max(0, 1 - e * e)) * Math.sin(E));

    const v = Math.atan2(yv, xv);
    const r = Math.sqrt(xv * xv + yv * yv);

    const w_rad = (w * Math.PI) / 180;
    const u = v + w_rad - node;

    const x = r * (Math.cos(node) * Math.cos(u) - Math.sin(node) * Math.sin(u) * Math.cos(I));
    const y = r * (Math.sin(node) * Math.cos(u) + Math.cos(node) * Math.sin(u) * Math.cos(I));
    const z = r * (Math.sin(u) * Math.sin(I));

    return { x, y, z };
  }

  /** Compute Geocentric RA and Dec for all planets for a given date */
  public calculatePlanets(date: Date, latitude: number = 24.14, longitude: number = 121.27): PlanetData[] {
    const jd = date.getTime() / 86400000.0 + 2440587.5;
    const d = jd - 2451545.0; // Days from J2000.0

    // Earth's position
    const earthPos = this.getHeliocentric(EARTH_ELEMENTS, d);
    const eps = (23.43929111 - 0.0000004 * d) * (Math.PI / 180); // Earth obliquity

    const planetsMeta = [
      { id: 'mercury', name: '水星 Mercury', nameEn: 'Mercury', desc: '距離太陽最近的行星，暮光中的敏捷信使', feat: '岩質坑洞表面' },
      { id: 'venus',   name: '金星 Venus',   nameEn: 'Venus',   desc: '夜空中最璀璨的啟明星與長庚星', feat: '耀眼銀白雲海 · 呈現金星相位' },
      { id: 'mars',    name: '火星 Mars',    nameEn: 'Mars',    desc: '紅色荒漠行星，人類太空探索的下一個家園', feat: '紅色鐵鏽地貌 · 兩極白色極冠' },
      { id: 'jupiter', name: '木星 Jupiter', nameEn: 'Jupiter', desc: '太陽系行星之王，擁有絢麗氣態雲帶與大紅斑', feat: '雲帶斑紋 · 大紅斑旋渦 · 4大伽利略衛星同框' },
      { id: 'saturn',  name: '土星 Saturn',  nameEn: 'Saturn',  desc: '太陽系最美麗的寶石，擁有壯麗宏偉的光環系統', feat: '宏偉土星環 · 卡西尼縫 · 金黃雲帶' },
      { id: 'uranus',  name: '天王星 Uranus', nameEn: 'Uranus', desc: '側躺自轉的冰巨行星，散發淡雅青藍色光澤', feat: '青藍色氣態圓盤' },
      { id: 'neptune', name: '海王星 Neptune', nameEn: 'Neptune', desc: '太陽系最外側的大行星，深邃幽藍的風暴之王', feat: '深藍色冰巨星' },
    ];

    const result: PlanetData[] = [];

    for (const meta of planetsMeta) {
      const elem = PLANET_ELEMENTS[meta.id];
      if (!elem) continue;

      const pPos = this.getHeliocentric(elem, d);

      // Geocentric vector (AU)
      const X_geo = pPos.x - earthPos.x;
      const Y_geo = pPos.y - earthPos.y;
      const Z_geo = pPos.z - earthPos.z;

      // Equatorial transformation
      const X_eq = X_geo;
      const Y_eq = Y_geo * Math.cos(eps) - Z_geo * Math.sin(eps);
      const Z_eq = Y_geo * Math.sin(eps) + Z_geo * Math.cos(eps);

      const delta = Math.sqrt(X_eq * X_eq + Y_eq * Y_eq + Z_eq * Z_eq); // Distance to Earth (AU)

      let ra = Math.atan2(Y_eq, X_eq) * (12 / Math.PI);
      if (ra < 0) ra += 24;
      const dec = Math.asin(Z_eq / delta) * (180 / Math.PI);

      // Apparent visual magnitude approximation
      const r_sun = Math.sqrt(pPos.x * pPos.x + pPos.y * pPos.y + pPos.z * pPos.z);
      const mag = elem.baseMag + 5 * Math.log10(r_sun * delta);
      const angSize = (elem.baseSizeArcsec / delta);

      result.push({
        id: meta.id,
        name: meta.name,
        nameEn: meta.nameEn,
        type: TargetType.Planet,
        ra,
        dec,
        magnitude: parseFloat(mag.toFixed(2)),
        angularSizeArcsec: parseFloat(angSize.toFixed(1)),
        description: meta.desc,
        features: meta.feat,
      });
    }

    // Add Moon from SunCalc with exact Equatorial coordinate conversion
    const lat = latitude ?? 24.14;
    const lon = longitude ?? 121.27;
    const moonPos = SunCalc.getMoonPosition(date, lat, lon);
    const moonIllum = SunCalc.getMoonIllumination(date);
    const phaseNames = ['新月', '眉月', '上弦月', '盈凸月', '滿月', '虧凸月', '下弦月', '殘月'];
    const phaseIdx = Math.round(moonIllum.phase * 8) % 8;

    // Convert SunCalc horizontal coordinates (altitude, azimuth) to Three.js world vector
    const moonPhi = Math.PI / 2 - moonPos.altitude;
    const moonTheta = moonPos.azimuth;
    const moonWorldVec = new THREE.Vector3().setFromSphericalCoords(995, moonPhi, moonTheta);

    // Transform to local space of rotating celestialGroup
    this.celestialGroup.updateMatrixWorld(true);
    const moonLocalVec = moonWorldVec.clone();
    this.celestialGroup.worldToLocal(moonLocalVec);

    // Derive true Right Ascension (0-24h) and Declination (-90 to +90 deg)
    const normLocal = moonLocalVec.clone().normalize();
    const moonDec = Math.asin(Math.max(-1, Math.min(1, normLocal.y))) * (180 / Math.PI);
    let moonRa = Math.atan2(normLocal.z, normLocal.x) * (12 / Math.PI);
    if (moonRa < 0) moonRa += 24;

    result.push({
      id: 'moon',
      name: `月球 Moon (${phaseNames[phaseIdx]})`,
      nameEn: 'Moon',
      type: TargetType.Planet,
      ra: moonRa,
      dec: moonDec,
      magnitude: -12.5 + (1 - moonIllum.fraction) * 4.0,
      angularSizeArcsec: 1800,
      description: `地球唯一的天然衛星，目前照亮比例 ${Math.round(moonIllum.fraction * 100)}%`,
      features: `月海暗斑 · 第谷環形山輻射紋 · ${phaseNames[phaseIdx]}`,
    });

    this.planetDataList = result;
    return result;
  }

  private createPlanetSprites() {
    const planetIds = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon'];

    for (const id of planetIds) {
      const tex = this.textures.get(id);
      if (!tex) continue;

      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: 0xffffff,
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(mat);
      sprite.name = `planet_${id}`;
      this.planetSprites.set(id, sprite);
      this.celestialGroup.add(sprite);
    }
  }

  /** Update planet positions and visual scaling based on camera FOV */
  public update(date: Date, fov: number, latitude?: number, longitude?: number) {
    const planets = this.calculatePlanets(date, latitude, longitude);
    const R = 995; // Just slightly inside the star sphere

    // Dynamically update Moon phase on the NASA photographic texture (optimized threshold prevents canvas redraw lag during fast time speeds)
    const moonIllum = SunCalc.getMoonIllumination(date);
    if (Math.abs(moonIllum.phase - this.lastRenderedMoonPhase) > 0.02) {
      this.redrawMoon(moonIllum.phase);
    }

    for (const p of planets) {
      const sprite = this.planetSprites.get(p.id);
      if (!sprite) continue;

      const ra_rad = (p.ra * Math.PI) / 12;
      const dec_rad = (p.dec * Math.PI) / 180;

      const x = R * Math.cos(dec_rad) * Math.cos(ra_rad);
      const y = R * Math.sin(dec_rad);
      const z = R * Math.cos(dec_rad) * Math.sin(ra_rad);

      sprite.position.set(x, y, z);

      // True astronomical angular scale on celestial sphere (R = 998):
      // Perspective camera naturally magnifies sprites as FOV decreases from 60° down to 0.2°.
      // We do NOT artificially multiply by a giant power that blows them up into screen-blocking monsters!
      if (p.id === 'moon') {
        // Real lunar angular diameter: 31 arcmin (0.517°) = 9.0 units on R=998 sphere
        // At FOV 60°: takes 0.78% of screen (naked-eye Moon)
        // At FOV 22°: takes 2.2% of screen (realistic wide telescope view)
        // At FOV 1°: takes 52% of eyepiece
        // At FOV 0.5°: takes 100% of eyepiece
        const moonScale = 9.0;
        sprite.scale.set(moonScale, moonScale, 1);
      } else {
        // Planets: starlike points in wide FOV (1.8 - 3.2 units), resolving into crisp disks at high zoom (< 3.0°)
        let planetBaseScale = 1.8;
        if (p.id === 'saturn') planetBaseScale = 3.6;
        else if (p.id === 'jupiter') planetBaseScale = 3.2;
        else if (p.id === 'venus') planetBaseScale = 2.4;
        else if (p.id === 'mars') planetBaseScale = 2.0;

        // Gentle resolution boost at extreme telescope magnification (< 3.0°)
        const highPowerBoost = fov < 3.0 ? Math.min(1.8, 3.0 / fov) : 1.0;
        const scale = planetBaseScale * highPowerBoost;
        sprite.scale.set(scale, scale, 1);
      }
    }
  }

  public getPlanets(): PlanetData[] {
    return this.planetDataList;
  }

  public dispose() {
    for (const [, sprite] of this.planetSprites) {
      sprite.material.dispose();
      this.celestialGroup.remove(sprite);
    }
    for (const [, tex] of this.textures) {
      tex.dispose();
    }
    this.planetSprites.clear();
    this.textures.clear();
  }
}
