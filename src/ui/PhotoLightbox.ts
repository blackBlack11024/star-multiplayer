import { PhotoExporter } from '../game/PhotoExporter';

export class PhotoLightbox {
    private overlay: HTMLElement;
    private currentPhotos: any[] = [];
    private currentIndex = 0;

    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'lightbox-overlay';
        this.overlay.style.display = 'none';
        this.overlay.innerHTML = `
            <div class="lightbox-backdrop"></div>
            <div class="lightbox-content">
                <button class="lightbox-close">&times;</button>
                <button class="lightbox-prev">&#8592;</button>
                <button class="lightbox-next">&#8594;</button>
                <div class="lightbox-img-wrap">
                    <img class="lightbox-img" src="" alt="" />
                </div>
                <div class="lightbox-details"></div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.overlay.querySelector('.lightbox-close')?.addEventListener('click', () => this.close());
        this.overlay.querySelector('.lightbox-backdrop')?.addEventListener('click', () => this.close());
        this.overlay.querySelector('.lightbox-prev')?.addEventListener('click', () => this.prev());
        this.overlay.querySelector('.lightbox-next')?.addEventListener('click', () => this.next());

        document.addEventListener('keydown', (e) => {
            if (this.overlay.style.display !== 'none') {
                if (e.code === 'Escape') this.close();
                if (e.code === 'ArrowLeft') this.prev();
                if (e.code === 'ArrowRight') this.next();
            }
        });
    }

    public open(photos: any[], startIndex: number) {
        if (!photos || photos.length === 0) return;
        this.currentPhotos = photos;
        this.currentIndex = Math.max(0, Math.min(startIndex, photos.length - 1));
        this.overlay.style.display = 'flex';
        this.showPhoto();
    }

    private close() {
        this.overlay.style.display = 'none';
    }

    private prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.showPhoto();
        }
    }

    private next() {
        if (this.currentIndex < this.currentPhotos.length - 1) {
            this.currentIndex++;
            this.showPhoto();
        }
    }

    private showPhoto() {
        const photo = this.currentPhotos[this.currentIndex];
        if (!photo) return;
        const img = this.overlay.querySelector('.lightbox-img') as HTMLImageElement;
        img.src = photo.imageDataUrl;

        const weatherLabels: Record<string, string> = {
            clear: '晴朗',
            partly_cloudy: '部分多雲',
            cloudy: '多雲',
            rainy: '雨天'
        };
        const details = this.overlay.querySelector('.lightbox-details') as HTMLElement;
        const timestamp = photo.timestamp instanceof Date ? photo.timestamp : new Date(photo.timestamp);
        const authorRow = photo.photographerName
            ? `<div class="lb-row"><span class="lb-label">拍攝作者</span><span style="font-weight:600; color:#38bdf8">${photo.photographerName}</span></div>`
            : '';
        
        details.innerHTML = `
            <div class="lb-row"><span class="lb-label">拍攝天體</span><span style="font-weight:600">${photo.targetName}</span></div>
            ${authorRow}
            <div class="lb-row"><span class="lb-label">品質評級</span><span class="quality ${photo.quality}">${photo.quality}級 (${photo.score || 95}分)</span></div>
            <div class="lb-row"><span class="lb-label">曝光時長</span><span>${photo.exposureSeconds} 秒</span></div>
            <div class="lb-row"><span class="lb-label">望遠鏡</span><span>第 ${photo.telescopeLevel || 1} 級</span></div>
            <div class="lb-row"><span class="lb-label">拍攝天氣</span><span>${weatherLabels[photo.weatherCondition] || photo.weatherCondition}</span></div>
            <div class="lb-row"><span class="lb-label">拍攝時間</span><span>${timestamp.toLocaleString('zh-TW')}</span></div>
            <div class="lb-row"><span class="lb-label">市場售價</span><span>${photo.sold ? '已售出' : (photo.sellPrice === 0 ? '市場飽和 $0' : `$${photo.sellPrice}`)}</span></div>
            <div class="lb-export-actions" style="margin-top: 14px; display: flex; gap: 8px;">
                <button id="lb-btn-raw" style="flex: 1; padding: 7px 10px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 6px; color: #38bdf8; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">下載原始照片</button>
                <button id="lb-btn-plate" style="flex: 1.2; padding: 7px 10px; background: rgba(245, 158, 11, 0.18); border: 1px solid rgba(245, 158, 11, 0.5); border-radius: 6px; color: #fbbf24; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">匯出天文展覽銘牌</button>
            </div>
            <div class="lb-nav-hint" style="margin-top: 10px;">${this.currentIndex + 1} / ${this.currentPhotos.length} · ← → 切換照片 · ESC 關閉</div>
        `;

        this.overlay.querySelector('#lb-btn-raw')?.addEventListener('click', () => {
            PhotoExporter.downloadRawPhoto(photo);
        });

        this.overlay.querySelector('#lb-btn-plate')?.addEventListener('click', () => {
            PhotoExporter.downloadExhibitionPlate(photo);
        });
    }

    public dispose() {
        this.overlay.remove();
    }
}
