import * as THREE from 'three';
import { gameStore } from '../game/GameStore';
import { GameMode, WeatherState } from '../types';
import { calculateTargetVisibility } from '../astronomy/AstroTimeCalc';
import { DEEP_SKY_OBJECTS } from '../data/deepSkyObjects';

export class HUD {
    private container: HTMLElement;
    private timeDisplay: HTMLElement;
    private sunPhaseDisplay: HTMLElement;
    private moneyDisplay: HTMLElement;
    private weatherDisplay: HTMLElement;
    private quickVolSlider!: HTMLInputElement;
    private quickVolVal!: HTMLElement;
    private quickMuteBtn!: HTMLElement;
    private locationDisplay: HTMLElement;
    private promptDisplay: HTMLElement;
    private telescopeMarker: HTMLElement;
    private studioMarker: HTMLElement;
    private laptopMarker: HTMLElement;
    private starTargetBadge: HTMLElement;
    private audioModal: HTMLElement;
    private timeButtons: HTMLButtonElement[] = [];
    private unsubscribe: () => void;

    // Audio slider elements
    private masterSlider!: HTMLInputElement;
    private machineSlider!: HTMLInputElement;
    private ambientSlider!: HTMLInputElement;
    private weatherSlider!: HTMLInputElement;
    private muteBtn!: HTMLButtonElement;
    private masterValSpan!: HTMLElement;
    private machineValSpan!: HTMLElement;
    private ambientValSpan!: HTMLElement;
    private weatherValSpan!: HTMLElement;
    private shortcutGuide!: HTMLElement;

    constructor() {
        const overlay = document.getElementById('ui-overlay');
        if (!overlay) throw new Error("ui-overlay element not found in document");

        this.container = document.createElement('div');
        this.container.className = 'hud';

        // 1. Top-left panel: Integrated Date, Time, Reversal Shuttle & Presets
        const topLeft = document.createElement('div');
        topLeft.className = 'hud-panel top-left integrated-time-panel';
        
        // Row 1: Date/Time header, Sun phase badge, and Real-time reset
        const timeRow = document.createElement('div');
        timeRow.className = 'time-header-row';

        const timeWrap = document.createElement('div');
        timeWrap.className = 'time-display-wrap';

        this.timeDisplay = document.createElement('div');
        this.timeDisplay.className = 'time-display';
        this.timeDisplay.textContent = '--:--:--';
        this.timeDisplay.title = '點擊開啟完整星曆時空穿梭面板 [B]';
        this.timeDisplay.onclick = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: 'b' }));
        };

        this.sunPhaseDisplay = document.createElement('div');
        this.sunPhaseDisplay.className = 'sun-phase';
        this.sunPhaseDisplay.textContent = '觀星夜';
        this.sunPhaseDisplay.title = '目前天象相位 · 點擊開啟星曆面板 [B]';
        this.sunPhaseDisplay.onclick = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: 'b' }));
        };

        timeWrap.appendChild(this.timeDisplay);
        timeWrap.appendChild(this.sunPhaseDisplay);

        const nowBtn = document.createElement('button');
        nowBtn.className = 'time-btn-now';
        nowBtn.textContent = '現在';
        nowBtn.title = '一鍵重置至目前現實時間';
        nowBtn.onclick = () => {
            gameStore.getState().resetToRealTime();
        };

        timeRow.appendChild(timeWrap);
        timeRow.appendChild(nowBtn);
        topLeft.appendChild(timeRow);

        // Row 2: Time Flow Speed Controls
        const speedRow = document.createElement('div');
        speedRow.className = 'hud-time-row';
        const speedLabel = document.createElement('span');
        speedLabel.className = 'hud-time-label';
        speedLabel.textContent = '流速';
        speedRow.appendChild(speedLabel);

        const speedBtnGroup = document.createElement('div');
        speedBtnGroup.className = 'hud-btn-group';

        const scales = [
            { label: '暫停', value: 0 },
            { label: '1x', value: 1 },
            { label: '10x', value: 10 },
            { label: '60x', value: 60 },
            { label: '5分', value: 300 },
            { label: '16分', value: 1000 }
        ];
        
        scales.forEach(scale => {
            const btn = document.createElement('button');
            btn.className = `hud-ctrl-btn ${scale.value === 1 ? 'active' : ''}`;
            btn.textContent = scale.label;
            btn.title = `設定流速為 ${scale.label}`;
            btn.onclick = () => {
                if (scale.value === 0) {
                    gameStore.getState().toggleTimePause();
                } else {
                    if (gameStore.getState().isTimePaused) {
                        gameStore.getState().toggleTimePause();
                    }
                    gameStore.getState().setTimeScale(scale.value);
                }
            };
            this.timeButtons.push(btn);
            speedBtnGroup.appendChild(btn);
        });
        speedRow.appendChild(speedBtnGroup);
        topLeft.appendChild(speedRow);

        // Row 3: Integrated Time Shuttle & Reversal (即時倒流與跳轉)
        const shuttleRow = document.createElement('div');
        shuttleRow.className = 'hud-time-row';
        const shuttleLabel = document.createElement('span');
        shuttleLabel.className = 'hud-time-label';
        shuttleLabel.textContent = '穿梭';
        shuttleRow.appendChild(shuttleLabel);

        const shuttleBtnGroup = document.createElement('div');
        shuttleBtnGroup.className = 'hud-btn-group';

        const shuttles = [
            { label: '-1天', action: () => gameStore.getState().advanceTimeDays(-1), title: '時間倒流 1 天' },
            { label: '-6時', action: () => gameStore.getState().reverseTime(6), title: '時間倒流 6 小時' },
            { label: '-1時', action: () => gameStore.getState().reverseTime(1), title: '時間倒流 1 小時' },
            { label: '+1時', action: () => gameStore.getState().advanceTimeHours(1), title: '時間快轉 1 小時' },
            { label: '+6時', action: () => gameStore.getState().advanceTimeHours(6), title: '時間快轉 6 小時' },
            { label: '+1天', action: () => gameStore.getState().advanceTimeDays(1), title: '時間快轉 1 天' }
        ];

        shuttles.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'hud-shuttle-btn';
            btn.textContent = s.label;
            btn.title = s.title;
            btn.onclick = () => s.action();
            shuttleBtnGroup.appendChild(btn);
        });
        shuttleRow.appendChild(shuttleBtnGroup);
        topLeft.appendChild(shuttleRow);

        // Row 4: Golden Observation Presets (一鍵切換黃金天象時段)
        const presetsRow = document.createElement('div');
        presetsRow.className = 'hud-time-row';
        const presetsLabel = document.createElement('span');
        presetsLabel.className = 'hud-time-label';
        presetsLabel.textContent = '時刻';
        presetsRow.appendChild(presetsLabel);

        const presetsBtnGroup = document.createElement('div');
        presetsBtnGroup.className = 'hud-btn-group';

        const jumpToTime = (h: number, m: number) => {
            const curr = new Date(gameStore.getState().currentTime);
            curr.setHours(h, m, 0, 0);
            gameStore.getState().setTime(curr);
        };

        const presets = [
            { label: '黃昏', h: 18, m: 30, title: '跳轉至日落黃昏 (18:30)' },
            { label: '初夜', h: 21, m: 0, title: '跳轉至初夜 (21:00)' },
            { label: '深空', h: 1, m: 0, title: '跳轉至最佳深空觀測 (01:00)' },
            { label: '黎明', h: 5, m: 30, title: '跳轉至黎明 (05:30)' },
            { label: '正午', h: 12, m: 0, title: '跳轉至正午 (12:00)' },
        ];

        presets.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'hud-preset-btn';
            btn.textContent = p.label;
            btn.title = p.title;
            btn.onclick = () => jumpToTime(p.h, p.m);
            presetsBtnGroup.appendChild(btn);
        });

        const moreBtn = document.createElement('button');
        moreBtn.className = 'hud-preset-btn more-btn';
        moreBtn.textContent = '星曆';
        moreBtn.title = '開啟完整穿梭星曆面板 [B]（自訂日期、年份與四季星空）';
        moreBtn.onclick = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', key: 'b' }));
        };
        presetsBtnGroup.appendChild(moreBtn);

        presetsRow.appendChild(presetsBtnGroup);
        topLeft.appendChild(presetsRow);

        // 2. Top-right panel: Money, Weather, and Audio Toggle
        const topRight = document.createElement('div');
        topRight.className = 'hud-panel top-right';

        this.moneyDisplay = document.createElement('div');
        this.moneyDisplay.className = 'money-badge';
        this.moneyDisplay.innerHTML = `$0`;

        this.weatherDisplay = document.createElement('div');
        this.weatherDisplay.className = 'weather-badge';
        this.weatherDisplay.textContent = '晴朗';

        this.weatherDisplay.className = 'weather-badge';
        this.weatherDisplay.textContent = '晴朗';

        // 2. Direct on-HUD Volume Slider Bar
        const volumeBar = document.createElement('div');
        volumeBar.className = 'hud-volume-bar';

        this.quickMuteBtn = document.createElement('button');
        this.quickMuteBtn.className = 'hud-vol-icon-btn';
        this.quickMuteBtn.textContent = '音量';
        this.quickMuteBtn.title = '點擊靜音 / 解除靜音 [M]';
        this.quickMuteBtn.onclick = () => gameStore.getState().toggleMute();

        this.quickVolSlider = document.createElement('input');
        this.quickVolSlider.type = 'range';
        this.quickVolSlider.className = 'hud-quick-vol-slider';
        this.quickVolSlider.min = '0';
        this.quickVolSlider.max = '100';
        this.quickVolSlider.value = '70';
        this.quickVolSlider.title = '拖曳直接調整音量大小';
        this.quickVolSlider.oninput = () => {
            const frac = parseInt(this.quickVolSlider.value) / 100;
            if (gameStore.getState().isMuted) {
                gameStore.getState().toggleMute();
            }
            gameStore.getState().setMasterVolume(frac);
        };

        this.quickVolVal = document.createElement('span');
        this.quickVolVal.className = 'hud-vol-percent';
        this.quickVolVal.textContent = '70%';

        const mixerBtn = document.createElement('button');
        mixerBtn.className = 'hud-vol-mixer-btn';
        mixerBtn.textContent = '設定';
        mixerBtn.title = '開啟四聲道混音設定 (蟲鳴/鳥叫/微風/馬達/雨聲)';
        mixerBtn.onclick = () => this.toggleAudioModal();

        volumeBar.appendChild(this.quickMuteBtn);
        volumeBar.appendChild(this.quickVolSlider);
        volumeBar.appendChild(this.quickVolVal);
        volumeBar.appendChild(mixerBtn);

        const codexBtn = document.createElement('div');
        codexBtn.className = 'guide-badge';
        codexBtn.innerHTML = `<span>圖鑑</span>`;
        codexBtn.title = '開啟觀測圖鑑與任務日誌 [G]';
        codexBtn.onclick = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', code: 'KeyG' }));
        };

        const guideBtn = document.createElement('div');
        guideBtn.className = 'guide-badge';
        guideBtn.innerHTML = `<span>說明</span>`;
        guideBtn.title = '開啟操作說明書與觀星指南 [H]';
        guideBtn.onclick = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
        };

        const multiplayerBtn = document.createElement('div');
        multiplayerBtn.id = 'hud-multiplayer-btn';
        multiplayerBtn.className = 'guide-badge';
        multiplayerBtn.innerHTML = `<span>多人連線</span>`;
        multiplayerBtn.title = '開啟多人連線小隊房間面板';
        multiplayerBtn.onclick = () => {
            document.dispatchEvent(new CustomEvent('toggle-multiplayer-modal'));
        };

        const verBadge = document.createElement('div');
        verBadge.className = 'version-badge';
        verBadge.style.fontSize = '11px';
        verBadge.style.color = '#38bdf8';
        verBadge.style.opacity = '0.85';
        verBadge.style.fontWeight = '700';
        verBadge.style.padding = '4px 8px';
        verBadge.style.background = 'rgba(56, 189, 248, 0.12)';
        verBadge.style.borderRadius = '6px';
        verBadge.style.border = '1px solid rgba(56, 189, 248, 0.3)';
        verBadge.textContent = 'v2.1.4';
        verBadge.title = 'v2.1.4';

        topRight.appendChild(this.moneyDisplay);
        topRight.appendChild(this.weatherDisplay);
        topRight.appendChild(volumeBar);
        topRight.appendChild(codexBtn);
        topRight.appendChild(guideBtn);
        topRight.appendChild(multiplayerBtn);
        topRight.appendChild(verBadge);

        // 3. Audio Settings Mixer Modal
        this.audioModal = this.createAudioModal();

        // 4. Bottom-left panel: Location & Coordinates
        const bottomLeft = document.createElement('div');
        bottomLeft.className = 'hud-panel bottom-left';
        this.locationDisplay = document.createElement('div');
        this.locationDisplay.style.cursor = 'pointer';
        this.locationDisplay.title = '點擊開啟全球觀測地點選單 [L]';
        this.locationDisplay.onclick = () => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', code: 'KeyL' }));
        };
        bottomLeft.appendChild(this.locationDisplay);

        // 5. Bottom-right panel: Shortcut Guide
        this.shortcutGuide = document.createElement('div');
        this.shortcutGuide.className = 'hud-panel bottom-right';
        this.shortcutGuide.innerHTML = `
            <span><span class="key-tag">Q</span>頭燈</span>
            <span><span class="key-tag">Z</span>平躺</span>
            <span><span class="key-tag">X</span>指星筆</span>
            <span><span class="key-tag">Alt</span>游標</span>
            <span><span class="key-tag">C</span>星座</span>
            <span><span class="key-tag">L</span>地點</span>
            <span><span class="key-tag">B</span>星曆倒流</span>
            <span><span class="key-tag">M</span>音量</span>
            <span><span class="key-tag">U</span>無UI</span>
        `;

        // 6. Interaction Prompt (center floating pill)
        this.promptDisplay = document.createElement('div');
        this.promptDisplay.className = 'interact-prompt';
        this.promptDisplay.innerHTML = `<span>按 [E] 使用望遠鏡</span>`;

        // 3D Waypoint Markers
        this.telescopeMarker = document.createElement('div');
        this.telescopeMarker.className = 'waypoint-marker telescope';
        this.telescopeMarker.innerHTML = `<span>望遠鏡</span><span class="key-hint">E</span><span class="dist" style="opacity:0.6"></span>`;

        this.studioMarker = document.createElement('div');
        this.studioMarker.className = 'waypoint-marker studio';
        this.studioMarker.innerHTML = `<span>工作室</span><span class="key-hint">F</span><span class="dist" style="opacity:0.6"></span>`;

        this.laptopMarker = document.createElement('div');
        this.laptopMarker.className = 'waypoint-marker laptop';
        this.laptopMarker.innerHTML = `<span>營地終端筆電</span><span class="key-hint">E</span><span class="dist" style="opacity:0.6"></span>`;

        // Looking Star Identifier Badge (Walk / Binoculars mode)
        this.starTargetBadge = document.createElement('div');
        this.starTargetBadge.className = 'hud-star-target-badge';
        this.starTargetBadge.style.display = 'none';

        this.container.appendChild(topLeft);
        this.container.appendChild(topRight);
        this.container.appendChild(this.audioModal);
        this.container.appendChild(bottomLeft);
        this.container.appendChild(this.shortcutGuide);
        this.container.appendChild(this.promptDisplay);
        this.container.appendChild(this.telescopeMarker);
        this.container.appendChild(this.studioMarker);
        this.container.appendChild(this.laptopMarker);
        this.container.appendChild(this.starTargetBadge);

        overlay.appendChild(this.container);

        this.unsubscribe = gameStore.subscribe((state) => this.update(state));
        this.update(gameStore.getState());
    }

    private createAudioModal(): HTMLElement {
        const modal = document.createElement('div');
        modal.className = 'audio-modal';
        modal.style.display = 'none';

        const header = document.createElement('div');
        header.className = 'audio-modal-header';
        header.innerHTML = `<h3>音效與音量設定</h3>`;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.style.width = '26px';
        closeBtn.style.height = '26px';
        closeBtn.style.fontSize = '14px';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => this.toggleAudioModal(false);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        // Sliders config
        const rows = [
            { id: 'master', label: '全局音量 (Master)', val: 70, prop: 'masterVolume', setter: 'setMasterVolume' },
            { id: 'machine', label: '機器音量 (馬達/齒輪/快門)', val: 70, prop: 'machineVolume', setter: 'setMachineVolume' },
            { id: 'ambient', label: '環境音量 (自然夜風氛圍)', val: 80, prop: 'ambientVolume', setter: 'setAmbientVolume' },
            { id: 'weather', label: '天氣音量 (雨聲)', val: 80, prop: 'weatherVolume', setter: 'setWeatherVolume' }
        ];

        rows.forEach(r => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'audio-row';

            const labelRow = document.createElement('div');
            labelRow.className = 'audio-label-row';
            labelRow.innerHTML = `<span>${r.label}</span><span class="val" id="val-${r.id}">${r.val}%</span>`;

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '100';
            slider.value = r.val.toString();

            slider.oninput = () => {
                const num = parseInt(slider.value);
                const frac = num / 100;
                (gameStore.getState() as any)[r.setter](frac);
            };

            if (r.id === 'master') {
                this.masterSlider = slider;
                this.masterValSpan = labelRow.querySelector('.val')!;
            } else if (r.id === 'machine') {
                this.machineSlider = slider;
                this.machineValSpan = labelRow.querySelector('.val')!;
            } else if (r.id === 'ambient') {
                this.ambientSlider = slider;
                this.ambientValSpan = labelRow.querySelector('.val')!;
            } else if (r.id === 'weather') {
                this.weatherSlider = slider;
                this.weatherValSpan = labelRow.querySelector('.val')!;
            }

            rowDiv.appendChild(labelRow);
            rowDiv.appendChild(slider);
            modal.appendChild(rowDiv);
        });

        // Mute button
        this.muteBtn = document.createElement('button');
        this.muteBtn.className = 'audio-mute-btn';
        this.muteBtn.textContent = '一鍵靜音 (Mute)';
        this.muteBtn.onclick = () => {
            gameStore.getState().toggleMute();
        };
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && this.audioModal.classList.contains('visible')) {
                this.toggleAudioModal(false);
            }
        });

        return modal;
    }

    public toggleAudioModal(show?: boolean) {
        if (show !== undefined) {
            this.audioModal.classList.toggle('visible', show);
        } else {
            this.audioModal.classList.toggle('visible');
        }
    }

    private formatTime(time: Date): string {
        return time.toLocaleTimeString('zh-TW', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });
    }

    private formatDate(time: Date): string {
        return time.toLocaleDateString('zh-TW', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    }

    private getSunPhaseText(time: Date): string {
        const hour = time.getHours();
        if (hour >= 6 && hour < 17) return '白晝';
        if (hour >= 17 && hour < 19) return '黃昏';
        if (hour >= 19 || hour < 5) return '觀星夜';
        return '黎明';
    }

    private getWeatherBadge(weather: WeatherState): string {
        switch (weather) {
            case WeatherState.Clear: return '萬里無雲';
            case WeatherState.PartlyCloudy: return '局部多雲';
            case WeatherState.Cloudy: return '密雲';
            case WeatherState.Rainy: return '降雨中';
            default: return '晴朗';
        }
    }

    public update(state: any) {
        const overlay = document.getElementById('ui-overlay');
        if (overlay) {
            overlay.classList.toggle('ui-hidden', !state.isUIVisible);
        }

        if (state.gameMode === GameMode.Studio || state.gameMode === GameMode.Telescope) {
            this.container.style.display = 'none';
            this.toggleAudioModal(false);
            return;
        } else {
            this.container.style.display = 'block';
        }

        if (state.currentTime) {
            this.timeDisplay.innerHTML = `<span style="font-size:11px;color:#94a3b8;margin-right:6px">${this.formatDate(state.currentTime)}</span>${this.formatTime(state.currentTime)}`;
            this.sunPhaseDisplay.textContent = this.getSunPhaseText(state.currentTime);
        }
        
        this.moneyDisplay.innerHTML = `$${state.money}`;
        this.weatherDisplay.textContent = this.getWeatherBadge(state.weather);
        
        // Update audio badge, quick slider, & modal values
        const masterPct = Math.round(state.masterVolume * 100);
        const machinePct = Math.round(state.machineVolume * 100);
        const ambientPct = Math.round(state.ambientVolume * 100);
        const weatherPct = Math.round(state.weatherVolume * 100);

        if (this.quickVolSlider) {
            this.quickVolSlider.value = (state.isMuted ? 0 : masterPct).toString();
            this.quickVolVal.textContent = state.isMuted ? '靜音' : `${masterPct}%`;
            this.quickMuteBtn.textContent = state.isMuted ? '靜音' : '音量';
            this.quickMuteBtn.classList.toggle('muted', state.isMuted);
        }

        if (this.muteBtn) {
            if (state.isMuted) {
                this.muteBtn.textContent = '解除靜音 (Unmute)';
                this.muteBtn.classList.add('active');
            } else {
                this.muteBtn.textContent = '一鍵靜音 (Mute)';
                this.muteBtn.classList.remove('active');
            }
        }

        if (this.masterSlider) {
            this.masterSlider.value = masterPct.toString();
            this.masterValSpan.textContent = `${masterPct}%`;
            this.machineSlider.value = machinePct.toString();
            this.machineValSpan.textContent = `${machinePct}%`;
            this.ambientSlider.value = ambientPct.toString();
            this.ambientValSpan.textContent = `${ambientPct}%`;
            this.weatherSlider.value = weatherPct.toString();
            this.weatherValSpan.textContent = `${weatherPct}%`;
        }

        if (state.currentLocation) {
            const loc = state.currentLocation;
            this.locationDisplay.innerHTML = `
                <div class="location-title">${loc.name}</div>
                <div class="location-coords">
                    緯度 ${loc.latitude > 0 ? `${loc.latitude.toFixed(2)}°N` : `${(-loc.latitude).toFixed(2)}°S`} · 
                    經度 ${loc.longitude > 0 ? `${loc.longitude.toFixed(2)}°E` : `${(-loc.longitude).toFixed(2)}°W`} · 
                    ${loc.altitude}m
                </div>
            `;
        }

        // Update active time button state
        const currentScale = state.isTimePaused ? 0 : state.timeScale;
        const scales = [0, 1, 10, 60, 300, 1000];
        this.timeButtons.forEach((btn, idx) => {
            btn.classList.toggle('active', scales[idx] === currentScale);
        });

        // Hide quest tracker when inside Studio or Telescope mode to prevent UI blockage
        const tracker = document.getElementById('quest-tracker-hud');
        if (tracker && state.gameMode !== GameMode.Walk) {
            tracker.style.display = 'none';
        }

        // Update shortcut guide if Star Trail Camera is equipped
        const completedIds: string[] = state.completedQuestIds || [];
        const hasCompletedStarTrailQuest = completedIds.includes('ch5_all_planets') ||
                                           completedIds.includes('ch6_southern_wonders') ||
                                           completedIds.includes('ch5_mount_laser');
        const hasStarTrail = hasCompletedStarTrailQuest || (state.accessories || []).some((a: any) => a.id === 'camera_startrail' && a.owned && a.equipped !== false);
        if (hasStarTrail) {
            this.shortcutGuide.innerHTML = `
                <span><span class="key-tag" style="background:rgba(245,158,11,0.25);color:#fbbf24;border-color:rgba(245,158,11,0.5);">按住T/R</span>星軌(快/倒轉)</span>
                <span><span class="key-tag">B</span>星曆倒流</span>
                <span><span class="key-tag">Z</span>平躺</span>
                <span><span class="key-tag">X</span>指星筆</span>
                <span><span class="key-tag">Alt</span>游標</span>
                <span><span class="key-tag">C</span>星座</span>
                <span><span class="key-tag">L</span>地點</span>
                <span><span class="key-tag">M</span>音量</span>
                <span><span class="key-tag">H</span>說明</span>
                <span><span class="key-tag">U</span>無UI</span>
            `;
        } else {
            this.shortcutGuide.innerHTML = `
                <span><span class="key-tag">Z</span>平躺</span>
                <span><span class="key-tag">X</span>指星筆</span>
                <span><span class="key-tag">Alt</span>游標</span>
                <span><span class="key-tag">C</span>星座</span>
                <span><span class="key-tag">L</span>地點</span>
                <span><span class="key-tag">B</span>星曆倒流</span>
                <span><span class="key-tag">M</span>音量</span>
                <span><span class="key-tag">H</span>說明</span>
                <span><span class="key-tag">U</span>無UI</span>
            `;
        }
    }

    public showInteractPrompt(text: string) {
        this.promptDisplay.innerHTML = `<span>${text}</span>`;
        this.promptDisplay.classList.add('visible');
    }

    public hideInteractPrompt() {
        this.promptDisplay.classList.remove('visible');
    }

    public showNotification(text: string, type: string = 'info') {
        const notif = document.createElement('div');
        notif.className = `notification notification-${type}`;
        notif.textContent = text;
        document.getElementById('ui-overlay')?.appendChild(notif);
        // Animate in
        requestAnimationFrame(() => notif.classList.add('visible'));
        const duration = type === 'warning' ? 4500 : type === 'success' ? 3500 : 3000;
        setTimeout(() => {
            notif.classList.remove('visible');
            setTimeout(() => notif.remove(), 400);
        }, duration);
    }

    private lastQuestTrackerKey = '';

    /** Update the quest tracker widget on the HUD. */
    public updateQuestTracker(activeQuest: any) {
        let tracker = document.getElementById('quest-tracker-hud');
        const state = gameStore.getState();
        if (!activeQuest || state.gameMode !== GameMode.Walk) {
            if (tracker) tracker.style.display = 'none';
            this.lastQuestTrackerKey = '';
            return;
        }
        if (!tracker) {
            tracker = document.createElement('div');
            tracker.id = 'quest-tracker-hud';
            tracker.className = 'quest-tracker-hud';
            tracker.style.cursor = 'pointer';
            tracker.title = '點擊聆聽角色教學對話 · 按 G 開啟圖鑑';
            document.getElementById('ui-overlay')?.appendChild(tracker);
        }

        const photos = state.photos || [];
        const isObjMet = (obj: any) => {
            if (obj.type === 'capture_target') {
                const targetId = (obj.targetId || '').toLowerCase();
                const dso = DEEP_SKY_OBJECTS.find(d => d.id.toLowerCase() === targetId || d.name.toLowerCase() === targetId);
                return photos.some((p: any) => {
                    const tn = (p.targetName || '').toLowerCase();
                    let matched = tn.includes(targetId);
                    if (!matched && dso) {
                        matched = tn.includes(dso.commonName.toLowerCase()) || tn.includes(dso.name.toLowerCase());
                    }
                    if (!matched) return false;
                    if (obj.minQuality) {
                        const grades = ['D', 'C', 'B', 'A', 'S', 'SSS'];
                        return grades.indexOf(p.quality) >= grades.indexOf(obj.minQuality);
                    }
                    return true;
                });
            } else if (obj.type === 'quality_min') {
                const grades = ['D', 'C', 'B', 'A', 'S', 'SSS'];
                return photos.some((p: any) => grades.indexOf(p.quality) >= grades.indexOf(obj.minQuality || 'A'));
            } else if (obj.type === 'capture_any') {
                return photos.length > 0;
            }
            return false;
        };

        let timeAdvice = '';
        const targetObj = (activeQuest.objectives || []).find((o: any) => o.targetId && !isObjMet(o)) || (activeQuest.objectives || []).find((o: any) => o.targetId);
        if (targetObj?.targetId) {
            const dso = DEEP_SKY_OBJECTS.find(d => d.id === targetObj.targetId || d.name === targetObj.targetId);
            if (dso) {
                const vis = calculateTargetVisibility(dso, state.currentLocation.latitude, state.currentLocation.longitude, state.currentTime);
                if (vis.isCurrentlyVisible) {
                    timeAdvice = `<div class="qt-time-badge visible">目前可見 · 仰角 ${Math.round(vis.currentAltitude)}°</div>`;
                } else if (vis.riseTimeStr) {
                    timeAdvice = `<div class="qt-time-badge waiting">${vis.riseTimeStr} 升起 · 最佳 ${vis.bestTimeStr}</div>`;
                } else {
                    timeAdvice = `<div class="qt-time-badge waiting">最佳觀測：${vis.bestTimeStr}</div>`;
                }
            }
        }

        const cacheKey = `${activeQuest.id}_${activeQuest.title}_${timeAdvice}_${(activeQuest.objectives || []).map((o: any) => o.description + isObjMet(o)).join('')}`;
        if (this.lastQuestTrackerKey === cacheKey) {
            return;
        }
        this.lastQuestTrackerKey = cacheKey;

        tracker.onclick = (e) => {
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent('play-story-dialogue', {
                detail: { quest: activeQuest, mode: 'intro' }
            }));
        };

        tracker.style.display = 'block';
        tracker.innerHTML = `
            <div class="qt-header">
                <span class="qt-avatar">${activeQuest.character?.avatarIcon || ''}</span>
                <div>
                    <div class="qt-title">${activeQuest.character?.name || '任務導師'} · 主線任務</div>
                    <div class="qt-quest">${activeQuest.title}</div>
                </div>
            </div>
            <div class="qt-objectives">
                ${(activeQuest.objectives || []).map((o: any) => {
                    const done = isObjMet(o);
                    return `<div class="qt-obj" style="${done ? 'color:#34d399;font-weight:600;' : 'color:#cbd5e1;'}">${done ? '[已拍] ' : '· '}${o.description}</div>`;
                }).join('')}
            </div>
            ${timeAdvice}
            <div class="qt-hint">點擊重播角色對話</div>
        `;
    }

    public updateWaypoints(camera: THREE.Camera, telescopePos: THREE.Vector3, studioPos: THREE.Vector3, laptopPos?: THREE.Vector3) {
        const state = gameStore.getState();
        if (state.gameMode !== GameMode.Walk) {
            this.telescopeMarker.style.display = 'none';
            this.studioMarker.style.display = 'none';
            this.laptopMarker.style.display = 'none';
            return;
        }

        // Project Telescope Marker
        const telVec = telescopePos.clone().add(new THREE.Vector3(0, 1.8, 0));
        const telDist = camera.position.distanceTo(telescopePos);
        telVec.project(camera);

        if (telVec.z < 1.0) {
            const x = (telVec.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-telVec.y * 0.5 + 0.5) * window.innerHeight;
            this.telescopeMarker.style.left = `${x}px`;
            this.telescopeMarker.style.top = `${y}px`;
            this.telescopeMarker.style.display = 'flex';
            const distSpan = this.telescopeMarker.querySelector('.dist') as HTMLElement;
            if (distSpan) distSpan.textContent = `(${telDist.toFixed(1)}m)`;
        } else {
            this.telescopeMarker.style.display = 'none';
        }

        // Project Studio Marker
        const studioVec = studioPos.clone().add(new THREE.Vector3(0, 2.5, 0));
        const studioDist = camera.position.distanceTo(studioPos);
        studioVec.project(camera);

        if (studioVec.z < 1.0) {
            const x = (studioVec.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-studioVec.y * 0.5 + 0.5) * window.innerHeight;
            this.studioMarker.style.left = `${x}px`;
            this.studioMarker.style.top = `${y}px`;
            this.studioMarker.style.display = 'flex';
            const distSpan = this.studioMarker.querySelector('.dist') as HTMLElement;
            if (distSpan) distSpan.textContent = `(${studioDist.toFixed(1)}m)`;
        } else {
            this.studioMarker.style.display = 'none';
        }

        // Project Camp Laptop Marker
        if (laptopPos) {
            const laptopVec = laptopPos.clone().add(new THREE.Vector3(0, 1.2, 0));
            const laptopDist = camera.position.distanceTo(laptopPos);
            laptopVec.project(camera);

            if (laptopVec.z < 1.0) {
                const x = (laptopVec.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-laptopVec.y * 0.5 + 0.5) * window.innerHeight;
                this.laptopMarker.style.left = `${x}px`;
                this.laptopMarker.style.top = `${y}px`;
                this.laptopMarker.style.display = 'flex';
                const distSpan = this.laptopMarker.querySelector('.dist') as HTMLElement;
                if (distSpan) distSpan.textContent = `(${laptopDist.toFixed(1)}m)`;
            } else {
                this.laptopMarker.style.display = 'none';
            }
        } else {
            this.laptopMarker.style.display = 'none';
        }
    }

    /** No HUD target badge in Walk or Binoculars mode. */
    public updateStarLookTarget(_target: any) {
        this.starTargetBadge.style.display = 'none';
    }

    public dispose() {
        this.unsubscribe();
        this.container.remove();
    }
}
