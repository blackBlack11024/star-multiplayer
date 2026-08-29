import { NetworkManager } from './NetworkManager';
import { PacketType } from './NetworkProtocol';

export class MultiplayerUI {
  private network: NetworkManager;
  private modalEl: HTMLElement;
  private chatBarEl: HTMLElement;
  private chatInputEl: HTMLInputElement;
  private isModalOpen = false;
  public isChatOpen = false;

  private onSendChatCallback?: (text: string) => void;

  constructor(network: NetworkManager) {
    this.network = network;
    this.modalEl = this.createModalDOM();
    const chatDOM = this.createChatBarDOM();
    this.chatBarEl = chatDOM.container;
    this.chatInputEl = chatDOM.input;

    this.setupEvents();
    this.checkUrlForRoomCode();
  }

  public onSendChat(cb: (text: string) => void) {
    this.onSendChatCallback = cb;
  }

  private createChatBarDOM(): { container: HTMLElement; input: HTMLInputElement } {
    const container = document.createElement('div');
    container.className = 'chat-bubble-input-bar';
    container.style.position = 'fixed';
    container.style.bottom = '18%';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.zIndex = '250';
    container.style.display = 'none';
    container.style.width = '360px';
    container.style.maxWidth = '90vw';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 50;
    input.placeholder = '發言... (Enter 發送 / Esc 取消)';
    input.style.width = '100%';
    input.style.background = 'rgba(15, 23, 42, 0.9)';
    input.style.color = '#f8fafc';
    input.style.border = '1px solid #38bdf8';
    input.style.borderRadius = '24px';
    input.style.padding = '10px 18px';
    input.style.fontSize = '14px';
    input.style.outline = 'none';
    input.style.boxShadow = '0 8px 32px rgba(0,0,0,0.6)';

    container.appendChild(input);
    document.getElementById('ui-overlay')?.appendChild(container);

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text && this.onSendChatCallback) {
          this.onSendChatCallback(text);
        }
        input.value = '';
        this.closeChat();
      } else if (e.key === 'Escape') {
        this.closeChat();
      }
    });

    return { container, input };
  }

  public openChat() {
    this.isChatOpen = true;
    this.chatBarEl.style.display = 'block';
    this.chatInputEl.focus();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  public closeChat() {
    this.isChatOpen = false;
    this.chatBarEl.style.display = 'none';
    this.chatInputEl.blur();
  }

  private createModalDOM(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'multiplayer-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '300';
    modal.style.display = 'none';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.backgroundColor = 'rgba(2, 6, 23, 0.85)';
    modal.style.backdropFilter = 'blur(10px)';

    modal.innerHTML = `
      <div class="multiplayer-panel" style="width: 480px; max-width: 92vw; background: #090d16; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 14px; padding: 24px; box-shadow: 0 16px 48px rgba(0,0,0,0.8); color: #f8fafc;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div style="font-size: 18px; font-weight: 700; color: #f8fafc; letter-spacing: 0.03em;">多人即時觀星小隊</div>
          <button id="mp-close-btn" style="background: none; border: none; color: #94a3b8; font-size: 24px; cursor: pointer;">&times;</button>
        </div>

        <!-- Player Profile Configuration -->
        <div style="margin-bottom: 20px; background: rgba(255,255,255,0.03); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
          <div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px; font-weight: 600;">觀星者稱號與外觀裝扮</div>
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <input type="text" id="mp-player-name" value="${this.network.localName}" maxlength="12" style="flex: 1; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 13px;" />
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <span style="font-size: 12px; color: #64748b;">羽絨大衣色彩：</span>
            <div id="mp-color-pills" style="display: flex; gap: 6px;"></div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 12px; color: #64748b;">特色保暖帽飾：</span>
            <select id="mp-hat-select" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
              <option value="0">毛線球球毛帽</option>
              <option value="1">蓬鬆保暖耳罩</option>
              <option value="2">趣味星光造型眼鏡</option>
              <option value="3">厚毛防風兜帽</option>
              <option value="4">暗夜飛行護目鏡</option>
            </select>
          </div>
        </div>

        <!-- Room Action Tabs / Status -->
        <div id="mp-disconnected-view">
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <button id="mp-create-btn" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #0284c7, #0369a1); border: none; border-radius: 8px; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer;">建立新觀星房間 (當房主)</button>
            <div style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
              <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
              <span style="font-size: 12px; color: #64748b;">或輸入房號加入</span>
              <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
            </div>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="mp-room-input" placeholder="輸入5碼房號 (如 STAR-8821)" style="flex: 1; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 13px;" />
              <button id="mp-join-btn" style="padding: 8px 20px; background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; border-radius: 6px; color: #38bdf8; font-weight: 600; font-size: 13px; cursor: pointer;">加入</button>
            </div>
          </div>
        </div>

        <div id="mp-connected-view" style="display: none;">
          <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="font-size: 12px; color: #4ade80; margin-bottom: 4px;">連線房間已就緒</div>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span id="mp-room-badge" style="font-size: 20px; font-weight: 800; color: #f8fafc; letter-spacing: 0.05em;">STAR-0000</span>
              <button id="mp-copy-link-btn" style="padding: 6px 12px; background: #22c55e; border: none; border-radius: 6px; color: #000; font-weight: 700; font-size: 12px; cursor: pointer;">複製邀請連結</button>
            </div>
          </div>
          <div id="mp-player-count-info" style="font-size: 12px; color: #94a3b8; margin-bottom: 16px;">目前小隊成員：1 人</div>
          <button id="mp-leave-btn" style="width: 100%; padding: 8px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; color: #f87171; font-size: 13px; font-weight: 600; cursor: pointer;">離開目前房間</button>
        </div>

        <div id="mp-status-msg" style="margin-top: 14px; font-size: 12px; color: #38bdf8; text-align: center; display: none;"></div>
      </div>
    `;

    document.getElementById('ui-overlay')?.appendChild(modal);

    // Setup color pills
    const colors = ['#facc15', '#06b6d4', '#f43f5e', '#a855f7', '#fb923c', '#4ade80'];
    const pillsContainer = modal.querySelector('#mp-color-pills') as HTMLElement;
    colors.forEach((c) => {
      const pill = document.createElement('div');
      pill.style.width = '20px';
      pill.style.height = '20px';
      pill.style.borderRadius = '50%';
      pill.style.backgroundColor = c;
      pill.style.cursor = 'pointer';
      pill.style.border = c === this.network.localColor ? '2px solid #fff' : '2px solid transparent';
      pill.onclick = () => {
        this.network.localColor = c;
        pillsContainer.querySelectorAll('div').forEach((p) => (p.style.border = '2px solid transparent'));
        pill.style.border = '2px solid #fff';
      };
      pillsContainer.appendChild(pill);
    });

    const hatSelect = modal.querySelector('#mp-hat-select') as HTMLSelectElement;
    hatSelect.value = String(this.network.localHatType);
    hatSelect.onchange = () => {
      this.network.localHatType = parseInt(hatSelect.value) || 0;
    };

    return modal;
  }

  private setupEvents() {
    document.addEventListener('toggle-multiplayer-modal', () => this.toggleModal());
    this.modalEl.querySelector('#mp-close-btn')?.addEventListener('click', () => this.closeModal());

    const nameInput = this.modalEl.querySelector('#mp-player-name') as HTMLInputElement;
    nameInput.addEventListener('change', () => {
      const val = nameInput.value.trim() || '觀星者';
      this.network.localName = val;
      localStorage.setItem('stargazer_player_name', val);
    });

    // Create Room button
    const createBtn = this.modalEl.querySelector('#mp-create-btn') as HTMLButtonElement;
    createBtn.addEventListener('click', async () => {
      this.showStatus('正在建立連線房間...');
      createBtn.disabled = true;
      try {
        const code = await this.network.createRoom();
        this.showStatus('');
        this.updateConnectedView(code);
        document.dispatchEvent(new CustomEvent('show-notification', {
          detail: { message: `房間 ${code} 建立成功！專屬連結已自動複製至剪貼簿`, type: 'success' }
        }));
        this.copyInviteLink(code);
      } catch (err: any) {
        this.showStatus(`建立失敗：${err.message || err}`);
      } finally {
        createBtn.disabled = false;
      }
    });

    // Join Room button
    const joinBtn = this.modalEl.querySelector('#mp-join-btn') as HTMLButtonElement;
    const roomInput = this.modalEl.querySelector('#mp-room-input') as HTMLInputElement;
    joinBtn.addEventListener('click', async () => {
      const code = roomInput.value.trim();
      if (!code) {
        this.showStatus('請輸入房間代碼');
        return;
      }
      this.showStatus(`正在連線加入房間 ${code}...`);
      joinBtn.disabled = true;
      try {
        const joinedCode = await this.network.joinRoom(code);
        this.showStatus('');
        this.updateConnectedView(joinedCode);
        document.dispatchEvent(new CustomEvent('show-notification', {
          detail: { message: `已成功加入房間 ${joinedCode}！`, type: 'success' }
        }));
        this.closeModal();
      } catch (err: any) {
        this.showStatus(`加入失敗：${err.message || err}`);
      } finally {
        joinBtn.disabled = false;
      }
    });

    // Copy Link button
    this.modalEl.querySelector('#mp-copy-link-btn')?.addEventListener('click', () => {
      if (this.network.roomId) {
        this.copyInviteLink(this.network.roomId);
        document.dispatchEvent(new CustomEvent('show-notification', {
          detail: { message: '房間專屬邀請連結已複製至剪貼簿！', type: 'success' }
        }));
      }
    });

    // Leave Room button
    this.modalEl.querySelector('#mp-leave-btn')?.addEventListener('click', () => {
      this.network.disconnect();
      this.updateDisconnectedView();
      document.dispatchEvent(new CustomEvent('show-notification', {
        detail: { message: '已離開房間', type: 'info' }
      }));
    });

    // Network connection state changes
    this.network.onPeerConnect(() => this.updatePlayerCount());
    this.network.onPeerDisconnect(() => this.updatePlayerCount());
  }

  private copyInviteLink(code: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    navigator.clipboard?.writeText(url.toString());
  }

  private checkUrlForRoomCode() {
    const url = new URL(window.location.href);
    const roomCode = url.searchParams.get('room');
    if (roomCode) {
      setTimeout(() => {
        const roomInput = this.modalEl.querySelector('#mp-room-input') as HTMLInputElement;
        if (roomInput) roomInput.value = roomCode;
        this.openModal();
        this.showStatus(`偵測到邀請連結房間 ${roomCode}，點擊「加入」即可進入`);
      }, 1000);
    }
  }

  private updateConnectedView(code: string) {
    const disView = this.modalEl.querySelector('#mp-disconnected-view') as HTMLElement;
    const conView = this.modalEl.querySelector('#mp-connected-view') as HTMLElement;
    const badge = this.modalEl.querySelector('#mp-room-badge') as HTMLElement;

    if (disView) disView.style.display = 'none';
    if (conView) conView.style.display = 'block';
    if (badge) badge.textContent = code;

    const btn = document.getElementById('hud-multiplayer-btn');
    if (btn) {
      btn.innerHTML = `<span>房間: ${code}</span>`;
      btn.style.borderColor = '#22c55e';
      btn.style.color = '#86efac';
    }

    this.updatePlayerCount();
  }

  private updateDisconnectedView() {
    const disView = this.modalEl.querySelector('#mp-disconnected-view') as HTMLElement;
    const conView = this.modalEl.querySelector('#mp-connected-view') as HTMLElement;

    if (disView) disView.style.display = 'block';
    if (conView) conView.style.display = 'none';

    const btn = document.getElementById('hud-multiplayer-btn');
    if (btn) {
      btn.innerHTML = `<span>多人連線</span>`;
      btn.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      btn.style.color = '#38bdf8';
    }
  }

  private updatePlayerCount() {
    const count = this.network.getConnectedPeerCount();
    const info = this.modalEl.querySelector('#mp-player-count-info') as HTMLElement;
    if (info) {
      info.textContent = `目前小隊成員：${count} 人 (含自己)`;
    }
    const btn = document.getElementById('hud-multiplayer-btn');
    if (btn && this.network.roomId) {
      btn.innerHTML = `<span>房間: ${this.network.roomId} (${count}人)</span>`;
    }
  }

  private showStatus(msg: string) {
    const el = this.modalEl.querySelector('#mp-status-msg') as HTMLElement;
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
    } else {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }

  public openModal() {
    this.isModalOpen = true;
    this.modalEl.style.display = 'flex';
  }

  public closeModal() {
    this.isModalOpen = false;
    this.modalEl.style.display = 'none';
  }

  public toggleModal() {
    if (this.isModalOpen) this.closeModal();
    else this.openModal();
  }

  public dispose() {
    this.modalEl.remove();
    this.chatBarEl.remove();
  }
}
