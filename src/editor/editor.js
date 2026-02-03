/**
 * Screenshot Editor Logic
 */
const chrome = /** @type {any} */ (window).chrome;

class Shape {
    /**
     * @param {string} type
     * @param {string} color
     * @param {number} opacity
     * @param {number} lineWidth
     */
    constructor(type, color, opacity, lineWidth = 4) {
        this.type = type;
        this.color = color;
        this.opacity = opacity;
        this.lineWidth = lineWidth;
        this.selected = false;
        this.id = Date.now() + Math.random();
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {HTMLImageElement} [backgroundImage]
     */
    draw(ctx, backgroundImage) {
        ctx.globalAlpha = this.opacity;
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {CanvasRenderingContext2D} ctx
     * @returns {boolean}
     */
    contains(x, y, ctx) { return false; }

    /**
     * @param {number} dx
     * @param {number} dy
     */
    move(dx, dy) {}

    /**
     * @returns {Array<{x: number, y: number, type: string, cursor: string}>}
     */
    getHandles() { return []; }

    /**
     * @param {string} handleType
     * @param {number} x
     * @param {number} y
     * @param {number} dx
     * @param {number} dy
     */
    updateHandle(handleType, x, y, dx, dy) {}

    /**
     * @returns {Shape}
     */
    clone() {
        const copy = new Shape(this.type, this.color, this.opacity, this.lineWidth);
        copy.selected = this.selected;
        copy.id = this.id;
        return copy;
    }
}

class RectShape extends Shape {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {string} color
     * @param {number} opacity
     * @param {number} lineWidth
     */
    constructor(x, y, w, h, color, opacity, lineWidth) {
        super('rect', color, opacity, lineWidth);
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        super.draw(ctx);
        ctx.beginPath();
        ctx.rect(this.x, this.y, this.w, this.h);
        ctx.stroke();

        if (this.selected) {
            drawSelectionBox(ctx, this.x, this.y, this.w, this.h);
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    contains(x, y) {
        let nx = this.w < 0 ? this.x + this.w : this.x;
        let ny = this.h < 0 ? this.y + this.h : this.y;
        let nw = Math.abs(this.w);
        let nh = Math.abs(this.h);

        const t = Math.max(5, this.lineWidth / 2);
        const outer = (x >= nx - t && x <= nx + nw + t && y >= ny - t && y <= ny + nh + t);
        const inner = (x >= nx + t && x <= nx + nw - t && y >= ny + t && y <= ny + nh - t);
        return outer && !inner;
    }

    /**
     * @param {number} dx
     * @param {number} dy
     */
    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }

    getHandles() {
        if (!this.selected) return [];
        let nx = this.w < 0 ? this.x + this.w : this.x;
        let ny = this.h < 0 ? this.y + this.h : this.y;
        let nw = Math.abs(this.w);
        let nh = Math.abs(this.h);

        return [
            { x: nx, y: ny, type: 'nw', cursor: 'nwse-resize' },
            { x: nx + nw, y: ny, type: 'ne', cursor: 'nesw-resize' },
            { x: nx + nw, y: ny + nh, type: 'se', cursor: 'nwse-resize' },
            { x: nx, y: ny + nh, type: 'sw', cursor: 'nesw-resize' }
        ];
    }

    /**
     * @param {string} handleType
     * @param {number} x
     * @param {number} y
     * @param {number} dx
     * @param {number} dy
     */
    updateHandle(handleType, x, y, dx, dy) {
        let nx = this.w < 0 ? this.x + this.w : this.x;
        let ny = this.h < 0 ? this.y + this.h : this.y;
        let nw = Math.abs(this.w);
        let nh = Math.abs(this.h);

        switch(handleType) {
            case 'nw': nx = x; ny = y; nw -= dx; nh -= dy; break;
            case 'ne': ny = y; nw = x - nx; nh -= dy; break;
            case 'se': nw = x - nx; nh = y - ny; break;
            case 'sw': nx = x; nw -= dx; nh = y - ny; break;
        }

        this.x = nx;
        this.y = ny;
        this.w = nw;
        this.h = nh;
    }

    /**
     * @returns {RectShape}
     */
    clone() {
        const copy = new RectShape(this.x, this.y, this.w, this.h, this.color, this.opacity, this.lineWidth);
        copy.selected = this.selected;
        copy.id = this.id;
        return copy;
    }
}

class ArrowShape extends Shape {
    /**
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {string} color
     * @param {number} opacity
     * @param {number} lineWidth
     */
    constructor(x1, y1, x2, y2, color, opacity, lineWidth) {
        super('arrow', color, opacity, lineWidth);
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        super.draw(ctx);
        const headlen = 15 + this.lineWidth * 2;
        const angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1);

        // Calculate the base of the arrowhead triangle
        // The triangle is formed by (x2, y2) and two points at headlen distance 30 degrees off-axis.
        // The midpoint of the base is on the shaft, headlen * cos(30deg) back from the tip.
        const shaftShorten = headlen * Math.cos(Math.PI / 6);
        const lineEndX = this.x2 - shaftShorten * Math.cos(angle);
        const lineEndY = this.y2 - shaftShorten * Math.sin(angle);

        // Use butt cap so it doesn't poke through the transparent head
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(lineEndX, lineEndY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(this.x2, this.y2);
        ctx.lineTo(this.x2 - headlen * Math.cos(angle - Math.PI / 6), this.y2 - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(this.x2 - headlen * Math.cos(angle + Math.PI / 6), this.y2 - headlen * Math.sin(angle + Math.PI / 6));
        ctx.fill();

        if (this.selected) {
             ctx.fillStyle = 'white';
             ctx.strokeStyle = '#00a1ff';
             ctx.lineWidth = 1;
             ctx.lineCap = 'butt'; // Reset for handles if needed
             ctx.fillRect(this.x1 - 4, this.y1 - 4, 8, 8);
             ctx.strokeRect(this.x1 - 4, this.y1 - 4, 8, 8);
             ctx.fillRect(this.x2 - 4, this.y2 - 4, 8, 8);
             ctx.strokeRect(this.x2 - 4, this.y2 - 4, 8, 8);
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    contains(x, y) {
        const A = x - this.x1;
        const B = y - this.y1;
        const C = this.x2 - this.x1;
        const D = this.y2 - this.y1;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;

        let xx, yy;

        if (param < 0) { xx = this.x1; yy = this.y1; }
        else if (param > 1) { xx = this.x2; yy = this.y2; }
        else { xx = this.x1 + param * C; yy = this.y1 + param * D; }

        const dx = x - xx;
        const dy = y - yy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        return dist < Math.max(6, this.lineWidth);
    }

    /**
     * @param {number} dx
     * @param {number} dy
     */
    move(dx, dy) {
        this.x1 += dx;
        this.y1 += dy;
        this.x2 += dx;
        this.y2 += dy;
    }

    /**
     * @returns {Array<{x: number, y: number, type: string, cursor: string}>}
     */
    getHandles() {
        if (!this.selected) return [];
        return [
            { x: this.x1, y: this.y1, type: 'start', cursor: 'move' },
            { x: this.x2, y: this.y2, type: 'end', cursor: 'move' }
        ];
    }

    /**
     * @param {string} handleType
     * @param {number} x
     * @param {number} y
     * @param {number} dx
     * @param {number} dy
     */
    updateHandle(handleType, x, y, dx, dy) {
        if (handleType === 'start') {
            this.x1 = x;
            this.y1 = y;
        } else if (handleType === 'end') {
            this.x2 = x;
            this.y2 = y;
        }
    }

    /**
     * @returns {ArrowShape}
     */
    clone() {
        const copy = new ArrowShape(this.x1, this.y1, this.x2, this.y2, this.color, this.opacity, this.lineWidth);
        copy.selected = this.selected;
        copy.id = this.id;
        return copy;
    }
}

class TextShape extends Shape {
    /**
     * @param {number} x
     * @param {number} y
     * @param {string} text
     * @param {string} color
     * @param {number} opacity
     * @param {string} fontFamily
     * @param {number} fontSize
     * @param {boolean} [isBold]
     * @param {boolean} [isItalic]
     * @param {boolean} [isUnderline]
     * @param {boolean} [hasShadow]
     */
    constructor(x, y, text, color, opacity, fontFamily, fontSize, isBold = false, isItalic = false, isUnderline = false, hasShadow = false) {
        super('text', color, opacity);
        this.x = x;
        this.y = y;
        this.text = text;
        this.fontFamily = fontFamily;
        this.fontSize = fontSize;
        this.isBold = isBold;
        this.isItalic = isItalic;
        this.isUnderline = isUnderline;
        this.hasShadow = hasShadow;
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;

        const style = this.isItalic ? 'italic ' : '';
        const weight = this.isBold ? 'bold ' : '';
        ctx.font = `${style}${weight}${this.fontSize}px "${this.fontFamily}"`;
        ctx.textBaseline = 'top';

        if (this.hasShadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
        }

        ctx.fillText(this.text, this.x, this.y);

        if (this.isUnderline) {
            const width = ctx.measureText(this.text).width;
            ctx.beginPath();
            ctx.strokeStyle = this.color;
            ctx.lineWidth = Math.max(1, this.fontSize / 15);
            ctx.moveTo(this.x, this.y + this.fontSize * 0.9);
            ctx.lineTo(this.x + width, this.y + this.fontSize * 0.9);
            ctx.stroke();
        }

        if (this.selected) {
            const width = ctx.measureText(this.text).width;
            const height = this.fontSize; // Approximate
            drawSelectionBox(ctx, this.x, this.y, width, height);
        }
        ctx.restore();
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {CanvasRenderingContext2D} ctx
     * @returns {boolean}
     */
    contains(x, y, ctx) {
        const style = this.isItalic ? 'italic ' : '';
        const weight = this.isBold ? 'bold ' : '';
        ctx.font = `${style}${weight}${this.fontSize}px "${this.fontFamily}"`;
        const width = ctx.measureText(this.text).width;
        const height = this.fontSize;
        return (x >= this.x && x <= this.x + width && y >= this.y && y <= this.y + height);
    }

    /**
     * @param {number} dx
     * @param {number} dy
     */
    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }

    /**
     * @returns {TextShape}
     */
    clone() {
        const copy = new TextShape(this.x, this.y, this.text, this.color, this.opacity, this.fontFamily, this.fontSize, this.isBold, this.isItalic, this.isUnderline, this.hasShadow);
        copy.selected = this.selected;
        copy.id = this.id;
        return copy;
    }
}

class BlurShape extends Shape {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} opacity
     */
    constructor(x, y, w, h, opacity) {
        super('blur', '#000', opacity, 0);
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {HTMLImageElement} [backgroundImage]
     */
    draw(ctx, backgroundImage) {
        if (!backgroundImage) return;

        let nx = this.w < 0 ? this.x + this.w : this.x;
        let ny = this.h < 0 ? this.y + this.h : this.y;
        let nw = Math.abs(this.w);
        let nh = Math.abs(this.h);

        if (nw === 0 || nh === 0) return;

        ctx.save();
        ctx.beginPath();
        ctx.rect(nx, ny, nw, nh);
        ctx.clip();

        // Apply blur - scale with opacity
        const blurAmount = 15 * (this.opacity || 1);
        ctx.filter = `blur(${blurAmount}px)`;
        ctx.drawImage(backgroundImage, 0, 0);
        ctx.restore();

        if (this.selected) {
            drawSelectionBox(ctx, nx, ny, nw, nh);
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    contains(x, y) {
        let nx = this.w < 0 ? this.x + this.w : this.x;
        let ny = this.h < 0 ? this.y + this.h : this.y;
        let nw = Math.abs(this.w);
        let nh = Math.abs(this.h);
        return (x >= nx && x <= nx + nw && y >= ny && y <= ny + nh);
    }

    /**
     * @param {number} dx
     * @param {number} dy
     */
    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }

    /**
     * @returns {Array<{x: number, y: number, type: string, cursor: string}>}
     */
    getHandles() {
        if (!this.selected) return [];
        let nx = this.w < 0 ? this.x + this.w : this.x;
        let ny = this.h < 0 ? this.y + this.h : this.y;
        let nw = Math.abs(this.w);
        let nh = Math.abs(this.h);

        return [
            { x: nx, y: ny, type: 'nw', cursor: 'nwse-resize' },
            { x: nx + nw, y: ny, type: 'ne', cursor: 'nesw-resize' },
            { x: nx + nw, y: ny + nh, type: 'se', cursor: 'nwse-resize' },
            { x: nx, y: ny + nh, type: 'sw', cursor: 'nesw-resize' }
        ];
    }

    /**
     * @param {string} handleType
     * @param {number} x
     * @param {number} y
     * @param {number} dx
     * @param {number} dy
     */
    updateHandle(handleType, x, y, dx, dy) {
        let nx = this.w < 0 ? this.x + this.w : this.x;
        let ny = this.h < 0 ? this.y + this.h : this.y;
        let nw = Math.abs(this.w);
        let nh = Math.abs(this.h);

        switch(handleType) {
            case 'nw': nx = x; ny = y; nw -= dx; nh -= dy; break;
            case 'ne': ny = y; nw = x - nx; nh -= dy; break;
            case 'se': nw = x - nx; nh = y - ny; break;
            case 'sw': nx = x; nw -= dx; nh = y - ny; break;
        }

        this.x = nx;
        this.y = ny;
        this.w = nw;
        this.h = nh;
    }

    /**
     * @returns {BlurShape}
     */
    clone() {
        const copy = new BlurShape(this.x, this.y, this.w, this.h, this.opacity);
        copy.selected = this.selected;
        copy.id = this.id;
        return copy;
    }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 */
function drawSelectionBox(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = '#00a1ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);

    let nx = x, ny = y, nw = w, nh = h;
    if (w < 0) { nx = x + w; nw = -w; }
    if (h < 0) { ny = y + h; nh = -h; }

    ctx.strokeRect(nx - 2, ny - 2, nw + 4, nh + 4);

    // Handles
    ctx.fillStyle = 'white';
    ctx.strokeStyle = '#00a1ff';
    ctx.setLineDash([]);
    const handles = [
        [nx - 4, ny - 4], [nx + nw - 4, ny - 4],
        [nx + nw - 4, ny + nh - 4], [nx - 4, ny + nh - 4]
    ];
    handles.forEach(([hx, hy]) => {
        ctx.fillRect(hx, hy, 8, 8);
        ctx.strokeRect(hx, hy, 8, 8);
    });
    ctx.restore();
}

class Editor {
    /**
     * @param {string} canvasId
     * @param {string} containerId
     */
    constructor(canvasId, containerId) {
        this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById(canvasId));
        this.container = /** @type {HTMLElement} */ (document.getElementById(containerId));
        this.ctx = /** @type {CanvasRenderingContext2D} */ (this.canvas.getContext('2d'));

        /** @type {Shape[]} */
        this.shapes = [];
        /** @type {HTMLImageElement | null} */
        this.backgroundImage = null;
        this.tool = 'select';
        /** @type {Shape | null} */
        this.currentShape = null;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.lastPos = { x: 0, y: 0 };
        /** @type {{shape: Shape, type: string} | null} */
        this.draggingHandle = null;

        /** @type {{x: number, y: number, w: number, h: number} | null} */
        this.cropRect = null;
        this.isCropping = false;
        /** @type {string | null} */
        this.cropHandle = null;

        // Properties
        this.color = '#ff0000';
        this.opacity = 1.0;
        this.lineWidth = 4;
        this.fontFamily = 'Arial';
        this.fontSize = 24;
        this.isBold = false;
        this.isItalic = false;
        this.isUnderline = false;
        this.hasShadow = false;

        // Zoom/Pan
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;

        // History for undo/redo
        /** @type {any[]} */
        this.undoStack = [];
        /** @type {any[]} */
        this.redoStack = [];
        this.maxHistory = 50;

        this.init();
    }

    async init() {
        this.attachToolbarListeners();
        this.attachCanvasListeners();
        this.initTheme();
        await this.loadSettings();
        await this.loadImage();
        this.updateUI();
    }

    initTheme() {
        const updateTheme = (e) => {
            const theme = e.matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', theme);
        };

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        updateTheme(mediaQuery);
        mediaQuery.addEventListener('change', updateTheme);
    }

    /**
     * Loads editor settings from chrome.storage.local.
     * @returns {Promise<void>}
     */
    async loadSettings() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                const result = await chrome.storage.local.get('editorSettings');
                if (result.editorSettings) {
                    const s = result.editorSettings;
                    if (s.color) this.color = s.color;
                    if (s.opacity !== undefined) this.opacity = s.opacity;
                    if (s.lineWidth !== undefined) this.lineWidth = s.lineWidth;
                    if (s.fontFamily) this.fontFamily = s.fontFamily;
                    if (s.fontSize !== undefined) this.fontSize = s.fontSize;
                    if (s.isBold !== undefined) this.isBold = s.isBold;
                    if (s.isItalic !== undefined) this.isItalic = s.isItalic;
                    if (s.isUnderline !== undefined) this.isUnderline = s.isUnderline;
                    if (s.hasShadow !== undefined) this.hasShadow = s.hasShadow;
                }
            }
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    }

    async saveSettings() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                await chrome.storage.local.set({
                    editorSettings: {
                        color: this.color,
                        opacity: this.opacity,
                        lineWidth: this.lineWidth,
                        fontFamily: this.fontFamily,
                        fontSize: this.fontSize,
                        isBold: this.isBold,
                        isItalic: this.isItalic,
                        isUnderline: this.isUnderline,
                        hasShadow: this.hasShadow
                    }
                });
            }
        } catch (e) {
            console.error('Failed to save settings', e);
        }
    }

    saveHistory() {
        const snapshot = {
            shapes: this.shapes.map(s => s.clone()),
            backgroundImage: this.backgroundImage,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height
        };
        this.undoStack.push(snapshot);
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = []; // Clear redo on new action
        this.updateUndoRedoUI();
    }

    undo() {
        if (this.undoStack.length === 0) return;

        const currentSnapshot = {
            shapes: this.shapes.map(s => s.clone()),
            backgroundImage: this.backgroundImage,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height
        };
        this.redoStack.push(currentSnapshot);

        const snapshot = this.undoStack.pop();
        this.applySnapshot(snapshot);
    }

    redo() {
        if (this.redoStack.length === 0) return;

        const currentSnapshot = {
            shapes: this.shapes.map(s => s.clone()),
            backgroundImage: this.backgroundImage,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height
        };
        this.undoStack.push(currentSnapshot);

        const snapshot = this.redoStack.pop();
        this.applySnapshot(snapshot);
    }

    /**
     * @param {any} snapshot
     */
    applySnapshot(snapshot) {
        this.shapes = snapshot.shapes.map(/** @param {Shape} s */ s => s.clone());
        this.backgroundImage = snapshot.backgroundImage;
        if (this.canvas) {
            this.canvas.width = snapshot.canvasWidth;
            this.canvas.height = snapshot.canvasHeight;
        }
        this.fitToScreen();
        this.render();
        this.updateUI();
        this.updateUndoRedoUI();
    }

    updateUndoRedoUI() {
        const undoBtn = /** @type {HTMLButtonElement} */ (document.getElementById('action-undo'));
        const redoBtn = /** @type {HTMLButtonElement} */ (document.getElementById('action-redo'));
        if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
    }

    async loadImage() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                const result = await chrome.storage.local.get('editorScreenshot');
                const dataUrl = result.editorScreenshot;
                if (dataUrl) {
                    const img = new Image();
                    this.backgroundImage = img;
                    img.onload = () => {
                        if (this.canvas && this.backgroundImage) {
                            this.canvas.width = this.backgroundImage.width;
                            this.canvas.height = this.backgroundImage.height;
                            this.fitToScreen();
                            this.render();
                        }
                    };
                    img.src = dataUrl;
                }
            }
        } catch (e) {
            console.error('Failed to load image', e);
        }
    }

    fitToScreen() {
        if (!this.backgroundImage) return;
        const containerW = this.container.clientWidth;
        const containerH = this.container.clientHeight;
        const imgW = this.canvas.width;
        const imgH = this.canvas.height;

        const scaleX = (containerW - 40) / imgW; // Padding
        const scaleY = (containerH - 40) / imgH;
        this.scale = Math.min(scaleX, scaleY, 1); // Don't zoom in by default if image is small

        // Center
        if (this.container && this.canvas) {
            this.panX = (this.container.clientWidth - this.canvas.width) / 2;
            this.panY = (this.container.clientHeight - this.canvas.height) / 2;
        }

        this.updateTransform();
        this.updateZoomUI();
    }

    updateTransform() {
        // We apply transform style to canvas for zoom/pan
        // But for high DPI clarity we might want to scale the context?
        // For simplicity and performance, CSS transform is good for view,
        // but we need to map events correctly.
        if (this.canvas) {
            this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
        }
    }

    attachToolbarListeners() {
        const tools = ['select', 'pan', 'crop', 'arrow', 'rect', 'text', 'blur'];
        tools.forEach(t => {
            const el = document.getElementById(`tool-${t}`);
            if (el) el.addEventListener('click', () => this.setTool(t));
        });

        // Zoom
        const zoomIn = document.getElementById('zoom-in');
        if (zoomIn) zoomIn.addEventListener('click', () => this.zoom(0.1));
        const zoomOut = document.getElementById('zoom-out');
        if (zoomOut) zoomOut.addEventListener('click', () => this.zoom(-0.1));
        const zoomFit = document.getElementById('zoom-fit');
        if (zoomFit) zoomFit.addEventListener('click', () => this.fitToScreen());

        // Props
        const propColor = /** @type {HTMLInputElement} */ (document.getElementById('prop-color'));
        if (propColor) propColor.addEventListener('input', (e) => {
            this.color = /** @type {HTMLInputElement} */ (e.target).value;
            this.updateSelectedShape();
            this.saveSettings();
        });
        const propOpacity = /** @type {HTMLInputElement} */ (document.getElementById('prop-opacity'));
        if (propOpacity) propOpacity.addEventListener('input', (e) => {
            this.opacity = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
            this.updateSelectedShape();
            this.saveSettings();
        });
        const propStroke = /** @type {HTMLInputElement} */ (document.getElementById('prop-stroke'));
        if (propStroke) propStroke.addEventListener('input', (e) => {
            this.lineWidth = parseInt(/** @type {HTMLInputElement} */ (e.target).value);
            this.updateSelectedShape();
            this.saveSettings();
        });

        ['prop-color', 'prop-opacity', 'prop-stroke'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('mousedown', () => this.saveHistory());
        });

        const propFontFamily = /** @type {HTMLSelectElement} */ (document.getElementById('prop-font-family'));
        if (propFontFamily) propFontFamily.addEventListener('change', (e) => {
            this.saveHistory();
            this.fontFamily = /** @type {HTMLSelectElement} */ (e.target).value;
            this.updateSelectedShape();
            this.saveSettings();
        });
        const propFontSize = /** @type {HTMLInputElement} */ (document.getElementById('prop-font-size'));
        if (propFontSize) propFontSize.addEventListener('change', (e) => {
            this.saveHistory();
            this.fontSize = parseInt(/** @type {HTMLInputElement} */ (e.target).value);
            this.updateSelectedShape();
            this.saveSettings();
        });

        const deleteBtn = document.getElementById('action-delete');
        if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteSelected());
        const saveBtn = document.getElementById('action-save');
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveImage());
        const copyBtn = document.getElementById('action-copy');
        if (copyBtn) copyBtn.addEventListener('click', () => this.copyToClipboard());
        const undoBtn = document.getElementById('action-undo');
        if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
        const redoBtn = document.getElementById('action-redo');
        if (redoBtn) redoBtn.addEventListener('click', () => this.redo());

        // Color Presets
        const colorPresets = document.getElementById('color-presets');
        if (colorPresets) colorPresets.addEventListener('click', (e) => {
            const preset = /** @type {HTMLElement} */ (e.target).closest('.color-preset');
            if (preset) {
                this.saveHistory();
                const newColor = /** @type {HTMLElement} */ (preset).dataset.color;
                if (newColor) {
                    this.color = newColor;
                    const propColor = /** @type {HTMLInputElement} */ (document.getElementById('prop-color'));
                    if (propColor) propColor.value = newColor;
                    this.updateSelectedShape();
                    this.saveSettings();
                }
            }
        });

        // Text Styles (Bold, Italic, Underline, Shadow)
        ['bold', 'italic', 'underline', 'shadow'].forEach(s => {
            const el = document.getElementById(`prop-${s}`);
            if (el) el.addEventListener('click', () => {
                this.saveHistory();
                if (s === 'bold') this.isBold = !this.isBold;
                else if (s === 'italic') this.isItalic = !this.isItalic;
                else if (s === 'underline') this.isUnderline = !this.isUnderline;
                else if (s === 'shadow') this.hasShadow = !this.hasShadow;

                this.updateSelectedShape();
                this.saveSettings();
                this.updateUI();
            });
        });
    }

    /**
     * @param {number} delta
     */
    zoom(delta) {
        this.scale = Math.max(0.1, Math.min(5, this.scale + delta));
        this.updateTransform();
        this.updateZoomUI();
    }

    updateZoomUI() {
        const zoomLevel = document.getElementById('zoom-level');
        if (zoomLevel) zoomLevel.textContent = `${Math.round(this.scale * 100)}%`;
    }

    /**
     * @param {string} tool
     */
    setTool(tool) {
        this.tool = tool;
        if (tool !== 'select') {
            this.shapes.forEach(s => s.selected = false);
            this.updateUI();
        }
        if (tool !== 'crop' && this.cropRect) {
            this.cropRect = null;
        }
        this.render();
        this.updateToolbarUI();
    }

    updateToolbarUI() {
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('btn-tool-active'));
        const activeBtn = document.getElementById(`tool-${this.tool}`);
        if(activeBtn) activeBtn.classList.add('btn-tool-active');

        // Cursor
        let cursor = 'default';
        if (this.tool === 'pan') cursor = 'grab';
        else if (this.tool === 'select') cursor = 'default';
        else cursor = 'crosshair';
        if (this.canvas) {
            this.canvas.style.cursor = cursor;
        }

        // Visibility
        const textProps = document.getElementById('text-props');
        if (textProps) {
            if (this.tool === 'text' || (this.getSelectedShape() instanceof TextShape)) {
                textProps.classList.remove('hidden');
            } else {
                textProps.classList.add('hidden');
            }
        }

        const strokeProp = document.getElementById('stroke-prop');
        if (strokeProp) {
            if (this.tool === 'rect' || this.tool === 'arrow' || (this.getSelectedShape() instanceof RectShape) || (this.getSelectedShape() instanceof ArrowShape)) {
                strokeProp.classList.remove('hidden');
            } else {
                strokeProp.classList.add('hidden');
            }
        }
    }

    getSelectedShape() {
        return this.shapes.find(s => s.selected);
    }

    updateSelectedShape() {
        const shape = this.getSelectedShape();
        if (shape) {
            shape.color = this.color;
            shape.opacity = this.opacity;
            if (shape.lineWidth !== undefined) shape.lineWidth = this.lineWidth;
            if (shape instanceof TextShape) {
                shape.fontFamily = this.fontFamily;
                shape.fontSize = this.fontSize;
                shape.isBold = this.isBold;
                shape.isItalic = this.isItalic;
                shape.isUnderline = this.isUnderline;
                shape.hasShadow = this.hasShadow;
            }
            this.render();
        }
    }

    deleteSelected() {
        if (this.shapes.some(s => s.selected)) {
            this.saveHistory();
            this.shapes = this.shapes.filter(s => !s.selected);
            this.updateUI();
            this.render();
        }
    }

    updateUI() {
        const shape = this.getSelectedShape();
        const deleteBtn = /** @type {HTMLButtonElement} */ (document.getElementById('action-delete'));

        // Always sync global state to UI first
        const propColor = /** @type {HTMLInputElement} */ (document.getElementById('prop-color'));
        if (propColor) propColor.value = this.color;
        const propOpacity = /** @type {HTMLInputElement} */ (document.getElementById('prop-opacity'));
        if (propOpacity) propOpacity.value = this.opacity.toString();
        const propStroke = /** @type {HTMLInputElement} */ (document.getElementById('prop-stroke'));
        if (propStroke) propStroke.value = this.lineWidth.toString();
        const propFontFamily = /** @type {HTMLSelectElement} */ (document.getElementById('prop-font-family'));
        if (propFontFamily) propFontFamily.value = this.fontFamily;
        const propFontSize = /** @type {HTMLInputElement} */ (document.getElementById('prop-font-size'));
        if (propFontSize) propFontSize.value = this.fontSize.toString();

        const textProps = document.getElementById('text-props');

        if (shape) {
            if (deleteBtn) deleteBtn.disabled = false;
            if (propColor) propColor.value = shape.color;
            if (propOpacity) propOpacity.value = shape.opacity.toString();
            if (shape.lineWidth && propStroke) propStroke.value = shape.lineWidth.toString();

            if (shape instanceof TextShape) {
                if (textProps) textProps.classList.remove('hidden');
                if (propFontFamily) propFontFamily.value = shape.fontFamily;
                if (propFontSize) propFontSize.value = shape.fontSize.toString();

                // Sync global state from selected shape
                this.fontFamily = shape.fontFamily;
                this.fontSize = shape.fontSize;
                this.isBold = shape.isBold;
                this.isItalic = shape.isItalic;
                this.isUnderline = shape.isUnderline;
                this.hasShadow = shape.hasShadow;
            } else {
                 if (this.tool !== 'text' && textProps) textProps.classList.add('hidden');
            }
        } else {
            if (deleteBtn) deleteBtn.disabled = true;
            if (this.tool !== 'text' && textProps) textProps.classList.add('hidden');
        }

        // Sync Style Buttons (Bold, Italic, Underline, Shadow)
        ['bold', 'italic', 'underline', 'shadow'].forEach(s => {
            const btn = document.getElementById(`prop-${s}`);
            if (btn) {
                let isActive = false;
                if (s === 'bold') isActive = this.isBold;
                else if (s === 'italic') isActive = this.isItalic;
                else if (s === 'underline') isActive = this.isUnderline;
                else if (s === 'shadow') isActive = this.hasShadow;
                btn.classList.toggle('btn-style-active', isActive);
            }
        });

        this.updateToolbarUI(); // To update visibility of stroke prop
    }

    /**
     * @param {{x: number, y: number}} pos
     * @returns {Shape | null}
     */
    getShapeAt(pos) {
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            if (this.shapes[i].contains(pos.x, pos.y, this.ctx)) {
                return this.shapes[i];
            }
        }
        return null;
    }

    attachCanvasListeners() {
        // Container listener for wheel zoom
        this.container.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                this.zoom(e.deltaY > 0 ? -0.1 : 0.1);
                return;
            }

            // Enhanced UX: Hover + scroll to adjust properties
            const pos = this.getCanvasPos(e.clientX, e.clientY);
            const shape = this.getShapeAt(pos);

            if (shape) {
                e.preventDefault();

                // Auto-select the shape to provide visual feedback and stay in sync with UI properties
                if (!shape.selected) {
                    this.shapes.forEach(s => s.selected = false);
                    shape.selected = true;
                }

                this.saveHistory();
                const delta = e.deltaY > 0 ? -1 : 1;

                if (shape instanceof TextShape) {
                    const step = 2;
                    shape.fontSize = Math.max(8, Math.min(200, shape.fontSize + delta * step));
                    this.fontSize = shape.fontSize; // Sync global prop
                } else if (shape instanceof RectShape || shape instanceof ArrowShape || shape instanceof BlurShape) {
                    const s = /** @type {RectShape | ArrowShape | BlurShape} */ (shape);
                    if (s.lineWidth !== undefined) {
                        s.lineWidth = Math.max(1, Math.min(40, s.lineWidth + delta));
                        this.lineWidth = s.lineWidth; // Sync global prop
                    }
                }

                this.saveSettings();
                this.render();
                this.updateUI();
            }
        }, { passive: false });

        // Event listeners on container/window to handle drag outside canvas
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        window.addEventListener('mousemove', this.handleMouseMove.bind(this));
        window.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));

        window.addEventListener('keydown', (e) => {
            // If active element is an input, don't trigger shortcuts
            if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                return;
            }

            const isCmd = e.metaKey || e.ctrlKey;
            const key = e.key.toLowerCase();

            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.deleteSelected();
                return;
            }
            if (e.key === 'Enter' && this.tool === 'crop' && this.cropRect) {
                this.applyCrop();
                return;
            }

            if (isCmd) {
                if (key === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) this.redo();
                    else this.undo();
                    return;
                }
                if (key === 'y') {
                    e.preventDefault();
                    this.redo();
                    return;
                }
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    this.zoom(0.1);
                    return;
                }
                if (e.key === '-') {
                    e.preventDefault();
                    this.zoom(-0.1);
                    return;
                }
                if (e.key === '0') {
                    e.preventDefault();
                    this.fitToScreen();
                    return;
                }
            }

            // Shortcuts
            if (key === 'v' || key === 's') this.setTool('select');
            if (key === 'q' || e.key === ' ') this.setTool('pan');
            if (key === 'c') this.setTool('crop');
            if (key === 'r') this.setTool('rect');
            if (key === 'a') this.setTool('arrow');
            if (key === 't') this.setTool('text');
            if (key === 'b') this.setTool('blur');
        });
    }

    // Convert screen coordinates (clientX) to Canvas coordinates (accounting for scale/pan)
    /**
     * @param {number} clientX
     * @param {number} clientY
     * @returns {{x: number, y: number}}
     */
    getCanvasPos(clientX, clientY) {
        if (!this.canvas) return { x: 0, y: 0 };
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / this.scale,
            y: (clientY - rect.top) / this.scale
        };
    }

    /**
     * @param {MouseEvent} e
     */
    handleDoubleClick(e) {
        if (this.tool !== 'select') return;
        const pos = this.getCanvasPos(e.clientX, e.clientY);

        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const shape = this.shapes[i];
            if (shape instanceof TextShape && shape.contains(pos.x, pos.y, this.ctx)) {
                this.saveHistory();
                const textShape = /** @type {TextShape} */ (shape);
                const newText = prompt('Edit text:', textShape.text);
                if (newText !== null) {
                    textShape.text = newText;
                    this.render();
                } else {
                    // If cancelled, remove the history state we just added
                    this.undoStack.pop();
                    this.updateUndoRedoUI();
                }
                break;
            }
        }
    }

    /**
     * @param {MouseEvent} e
     */
    handleMouseDown(e) {
        const pos = this.getCanvasPos(e.clientX, e.clientY);
        this.dragStart = { x: e.clientX, y: e.clientY }; // Screen coords for panning
        this.lastPos = pos; // Canvas coords for drawing
        this.isDragging = true;
        this.draggingHandle = null;

        if (this.tool === 'pan') {
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        if (this.tool === 'select') {
            // Check handles
            const selected = this.getSelectedShape();
            if (selected) {
                const handles = selected.getHandles();
                for (let h of handles) {
                    if (Math.abs(pos.x - h.x) < 8/this.scale && Math.abs(pos.y - h.y) < 8/this.scale) {
                        this.saveHistory();
                        this.draggingHandle = { shape: selected, type: h.type };
                        return;
                    }
                }
            }

            // Hit test
            let hit = false;
            for (let i = this.shapes.length - 1; i >= 0; i--) {
                if (this.shapes[i].contains(pos.x, pos.y, this.ctx)) {
                    this.saveHistory();
                    this.shapes.forEach(s => s.selected = false);
                    this.shapes[i].selected = true;
                    this.currentShape = this.shapes[i];
                    hit = true;
                    this.shapes.push(this.shapes.splice(i, 1)[0]);
                    break;
                }
            }
            if (!hit) {
                this.shapes.forEach(s => s.selected = false);
                this.currentShape = null;
            }
            this.updateUI();
            this.render();
        } else if (this.tool === 'crop') {
            if (this.cropRect) {
                 // Check Action Buttons
                 if (this.cropConfirmBtn && 
                     pos.x >= this.cropConfirmBtn.x && pos.x <= this.cropConfirmBtn.x + this.cropConfirmBtn.w &&
                     pos.y >= this.cropConfirmBtn.y && pos.y <= this.cropConfirmBtn.y + this.cropConfirmBtn.h) {
                     this.applyCrop();
                     return;
                 }
                 if (this.cropCancelBtn && 
                     pos.x >= this.cropCancelBtn.x && pos.x <= this.cropCancelBtn.x + this.cropCancelBtn.w &&
                     pos.y >= this.cropCancelBtn.y && pos.y <= this.cropCancelBtn.y + this.cropCancelBtn.h) {
                     this.cancelCrop();
                     return;
                 }

                 this.cropHandle = this.getCropHandle(pos.x, pos.y);
                 if (!this.cropHandle) {
                     this.cropRect = { x: pos.x, y: pos.y, w: 0, h: 0 };
                     this.cropHandle = 'se';
                 }
            } else {
                this.cropRect = { x: pos.x, y: pos.y, w: 0, h: 0 };
                this.cropHandle = 'se';
            }
        } else if (this.tool === 'rect') {
            this.saveHistory();
            this.currentShape = new RectShape(pos.x, pos.y, 0, 0, this.color, this.opacity, this.lineWidth);
            this.shapes.push(this.currentShape);
        } else if (this.tool === 'blur') {
            this.saveHistory();
            this.currentShape = new BlurShape(pos.x, pos.y, 0, 0, this.opacity);
            this.shapes.push(this.currentShape);
        } else if (this.tool === 'arrow') {
            this.saveHistory();
            this.currentShape = new ArrowShape(pos.x, pos.y, pos.x, pos.y, this.color, this.opacity, this.lineWidth);
            this.shapes.push(this.currentShape);
        } else if (this.tool === 'text') {
            const text = prompt('Enter text:');
            if (text) {
                this.saveHistory();
                const shape = new TextShape(pos.x, pos.y, text, this.color, this.opacity, this.fontFamily, this.fontSize, this.isBold, this.isItalic, this.isUnderline, this.hasShadow);
                this.shapes.push(shape);
                shape.selected = true;
                this.tool = 'select';
                this.updateToolbarUI();
                this.updateUI();
                this.render();
            }
            this.isDragging = false;
        }
    }

    /**
     * @param {MouseEvent} e
     */
    handleMouseMove(e) {
        if (this.isPanning) {
            const dx = e.clientX - this.dragStart.x;
            const dy = e.clientY - this.dragStart.y;
            this.panX += dx;
            this.panY += dy;
            this.dragStart = { x: e.clientX, y: e.clientY };
            this.updateTransform();
            return;
        }

        const pos = this.getCanvasPos(e.clientX, e.clientY);
        const dx = pos.x - this.lastPos.x;
        const dy = pos.y - this.lastPos.y;

        // Update cursors if not dragging
        if (!this.isDragging) {
             this.lastPos = pos;
             if (this.tool === 'select') {
                const selected = this.getSelectedShape();
                let cursor = 'default';
                if (selected) {
                     const handles = selected.getHandles();
                     for (let h of handles) {
                         if (Math.abs(pos.x - h.x) < 8/this.scale && Math.abs(pos.y - h.y) < 8/this.scale) {
                             cursor = h.cursor;
                             break;
                         }
                     }
                     if (cursor === 'default' && selected.contains(pos.x, pos.y, this.ctx)) {
                         cursor = 'move';
                     }
                } else {
                     for (let i = this.shapes.length - 1; i >= 0; i--) {
                        if (this.shapes[i].contains(pos.x, pos.y, this.ctx)) {
                            cursor = 'move';
                            break;
                        }
                    }
                }
                this.canvas.style.cursor = cursor;
            } else if (this.tool === 'crop' && this.cropRect) {
                 // Check Action Buttons for cursor
                 if ((this.cropConfirmBtn && 
                      pos.x >= this.cropConfirmBtn.x && pos.x <= this.cropConfirmBtn.x + this.cropConfirmBtn.w &&
                      pos.y >= this.cropConfirmBtn.y && pos.y <= this.cropConfirmBtn.y + this.cropConfirmBtn.h) ||
                     (this.cropCancelBtn && 
                      pos.x >= this.cropCancelBtn.x && pos.x <= this.cropCancelBtn.x + this.cropCancelBtn.w &&
                      pos.y >= this.cropCancelBtn.y && pos.y <= this.cropCancelBtn.y + this.cropCancelBtn.h)) {
                     this.canvas.style.cursor = 'pointer';
                 } else {
                     const handle = this.getCropHandle(pos.x, pos.y);
                     if (handle) this.canvas.style.cursor = handle === 'move' ? 'move' : 'nwse-resize';
                     else this.canvas.style.cursor = 'crosshair';
                 }
            }
            return;
        }

        // Processing Drag
        this.lastPos = pos;

        if (this.tool === 'select') {
            if (this.draggingHandle) {
                this.draggingHandle.shape.updateHandle(this.draggingHandle.type, pos.x, pos.y, dx, dy);
                this.render();
            } else if (this.currentShape) {
                this.currentShape.move(dx, dy);
                this.render();
            }
        } else if ((this.tool === 'rect' || this.tool === 'blur') && this.currentShape) {
            const s = /** @type {RectShape | BlurShape} */ (this.currentShape);
            s.w = pos.x - s.x;
            s.h = pos.y - s.y;
            this.render();
        } else if (this.tool === 'arrow' && this.currentShape) {
            const s = /** @type {ArrowShape} */ (this.currentShape);
            s.x2 = pos.x;
            s.y2 = pos.y;
            this.render();
        } else if (this.tool === 'crop' && this.cropRect) {
            this.updateCropRect(pos.x, pos.y, dx, dy);
            this.render();
        }
    }

    /**
     * @param {MouseEvent} e
     */
    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'grab';
            return;
        }

        this.isDragging = false;
        this.draggingHandle = null;
        if (this.tool === 'rect' || this.tool === 'arrow' || this.tool === 'blur') {
            if (this.currentShape) {
                this.currentShape.selected = true;
                this.tool = 'select';
                this.updateToolbarUI();
                this.updateUI();
                this.render();
            }
        }
        this.currentShape = null;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {string | null}
     */
    getCropHandle(x, y) {
        const r = this.cropRect;
        if (!r) return null;
        const handles = {
            nw: [r.x, r.y],
            ne: [r.x + r.w, r.y],
            sw: [r.x, r.y + r.h],
            se: [r.x + r.w, r.y + r.h]
        };
        const dist = 10 / this.scale;
        for (let h in handles) {
            const [hx, hy] = /** @type {Record<string, number[]>} */ (handles)[h];
            if (Math.abs(x - hx) < dist && Math.abs(y - hy) < dist) return h;
        }

        let nx = r.w < 0 ? r.x + r.w : r.x;
        let ny = r.h < 0 ? r.y + r.h : r.y;
        let nw = Math.abs(r.w);
        let nh = Math.abs(r.h);

        if (x >= nx && x <= nx + nw && y >= ny && y <= ny + nh) return 'move';
        return null;
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} dx
     * @param {number} dy
     */
    updateCropRect(x, y, dx, dy) {
        const r = this.cropRect;
        if (!r) return;

        // Canvas bounds
        const maxW = this.canvas.width;
        const maxH = this.canvas.height;

        // Get current normalized bounds
        let nx = r.w < 0 ? r.x + r.w : r.x;
        let ny = r.h < 0 ? r.y + r.h : r.y;
        let nw = Math.abs(r.w);
        let nh = Math.abs(r.h);

        if (this.cropHandle === 'move') {
            // Proposed new position
            let newNx = nx + dx;
            let newNy = ny + dy;

            // Clamp
            if (newNx < 0) dx = -nx;
            if (newNx + nw > maxW) dx = maxW - (nx + nw);
            if (newNy < 0) dy = -ny;
            if (newNy + nh > maxH) dy = maxH - (ny + nh);

            r.x += dx;
            r.y += dy;
        } else {
            // Clamp mouse position
            const mx = Math.max(0, Math.min(x, maxW));
            const my = Math.max(0, Math.min(y, maxH));

            // Determine anchor based on handle
            // anchors are based on current normalized bounds
            let anchorX, anchorY;

            switch (this.cropHandle) {
                case 'nw': anchorX = nx + nw; anchorY = ny + nh; break; // Anchor SE
                case 'ne': anchorX = nx; anchorY = ny + nh; break; // Anchor SW
                case 'sw': anchorX = nx + nw; anchorY = ny; break; // Anchor NE
                case 'se': anchorX = nx; anchorY = ny; break; // Anchor NW
            }

            if (anchorX !== undefined && anchorY !== undefined) {
                r.x = anchorX;
                r.y = anchorY;
                r.w = mx - anchorX;
                r.h = my - anchorY;
            }
        }
    }

    applyCrop() {
        if (!this.cropRect) return;

        const r = this.cropRect;
        let nx = r.w < 0 ? r.x + r.w : r.x;
        let ny = r.h < 0 ? r.y + r.h : r.y;
        let nw = Math.abs(r.w);
        let nh = Math.abs(r.h);

        nx = Math.max(0, nx);
        ny = Math.max(0, ny);
        nw = Math.min(nw, this.canvas.width - nx);
        nh = Math.min(nh, this.canvas.height - ny);

        if (nw <= 0 || nh <= 0 || !this.canvas) return;

        this.saveHistory();
        this.tool = 'select';
        this.render();

        const data = this.ctx.getImageData(nx, ny, nw, nh);
        this.canvas.width = nw;
        this.canvas.height = nh;
        this.ctx.putImageData(data, 0, 0);

        const newImg = new Image();
        newImg.onload = () => {
            this.backgroundImage = newImg;
            this.shapes = [];
            this.cropRect = null;
            this.fitToScreen(); // Re-fit after crop
            this.render();
        };
        newImg.src = this.canvas.toDataURL();

        this.tool = 'select';
        this.updateToolbarUI();
    }

    cancelCrop() {
        this.cropRect = null;
        this.render();
    }

    render() {
        if (!this.backgroundImage) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.backgroundImage, 0, 0);

        this.ctx.save();
        this.shapes.forEach(shape => shape.draw(this.ctx, this.backgroundImage || undefined));
        this.ctx.restore();

        if (this.tool === 'crop' && this.cropRect) {
            this.drawCropOverlay();
        }
    }

    drawCropOverlay() {
        const ctx = this.ctx;
        const r = this.cropRect;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        if (!r) return;
        let nx = r.w < 0 ? r.x + r.w : r.x;
        let ny = r.h < 0 ? r.y + r.h : r.y;
        let nw = Math.abs(r.w);
        let nh = Math.abs(r.h);

        // Draw overlay in 4 parts
        ctx.fillRect(0, 0, this.canvas.width, ny);
        ctx.fillRect(0, ny + nh, this.canvas.width, this.canvas.height - (ny + nh));
        ctx.fillRect(0, ny, nx, nh);
        ctx.fillRect(nx + nw, ny, this.canvas.width - (nx + nw), nh);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(nx, ny, nw, nh);

        ctx.fillStyle = '#fff';
        const handles = [
            [nx, ny], [nx + nw, ny],
            [nx, ny + nh], [nx + nw, ny + nh]
        ];
        const hSize = 8 / this.scale;
        handles.forEach(([hx, hy]) => ctx.fillRect(hx - hSize/2, hy - hSize/2, hSize, hSize));

        // Draw Action Buttons (Confirm and Cancel)
        if (nw > 40 && nh > 40) {
            const btnSize = 32 / this.scale;
            const margin = 10 / this.scale;
            const gap = 8 / this.scale;
            const pillHeight = btnSize + margin * 2;

            const bx = nx + nw - (btnSize * 2 + gap + margin * 2);
            let by = ny + nh + margin;

            if (by + pillHeight > this.canvas.height) {
                by = ny + nh - margin - pillHeight;
            }

            // Pill Background
            ctx.setLineDash([]);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 10 / this.scale;
            ctx.shadowOffsetY = 2 / this.scale;
            
            ctx.fillStyle = 'rgba(45, 55, 72, 0.9)'; // Dark slate gray
            ctx.beginPath();
            ctx.roundRect(bx, by, btnSize * 2 + gap + margin * 2, btnSize + margin * 2, (btnSize + margin * 2) / 2);
            ctx.fill();

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // Confirm Button Circle
            this.cropConfirmBtn = { x: bx + margin, y: by + margin, w: btnSize, h: btnSize };
            ctx.fillStyle = '#22c55e'; // Modern emerald green
            ctx.beginPath();
            ctx.arc(this.cropConfirmBtn.x + btnSize/2, this.cropConfirmBtn.y + btnSize/2, btnSize/2, 0, Math.PI * 2);
            ctx.fill();

            // Draw Checkmark Icon
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5 / this.scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const cx = this.cropConfirmBtn.x + btnSize/2;
            const cy = this.cropConfirmBtn.y + btnSize/2;
            ctx.moveTo(cx - btnSize * 0.2, cy);
            ctx.lineTo(cx - btnSize * 0.05, cy + btnSize * 0.15);
            ctx.lineTo(cx + btnSize * 0.2, cy - btnSize * 0.2);
            ctx.stroke();

            // Cancel Button Circle
            this.cropCancelBtn = { x: bx + margin + btnSize + gap, y: by + margin, w: btnSize, h: btnSize };
            ctx.fillStyle = '#ef4444'; // Modern rose red
            ctx.beginPath();
            ctx.arc(this.cropCancelBtn.x + btnSize/2, this.cropCancelBtn.y + btnSize/2, btnSize/2, 0, Math.PI * 2);
            ctx.fill();

            // Draw Cross Icon
            ctx.beginPath();
            const xcx = this.cropCancelBtn.x + btnSize/2;
            const xcy = this.cropCancelBtn.y + btnSize/2;
            const s = btnSize * 0.18;
            ctx.moveTo(xcx - s, xcy - s);
            ctx.lineTo(xcx + s, xcy + s);
            ctx.moveTo(xcx + s, xcy - s);
            ctx.lineTo(xcx - s, xcy + s);
            ctx.stroke();
        } else {
            this.cropConfirmBtn = null;
            this.cropCancelBtn = null;
        }

        ctx.restore();
    }

    getExportCanvas() {
        // If crop is active (visible but not applied), use it for export
        // Otherwise use full canvas
        if (!this.canvas) return document.createElement('canvas'); // Should not happen
        let exportX = 0, exportY = 0, exportW = this.canvas.width, exportH = this.canvas.height;

        if (this.tool === 'crop' && this.cropRect) {
             const r = this.cropRect;
             let nx = r.w < 0 ? r.x + r.w : r.x;
             let ny = r.h < 0 ? r.y + r.h : r.y;
             let nw = Math.abs(r.w);
             let nh = Math.abs(r.h);

             // Clamp
             nx = Math.max(0, nx);
             ny = Math.max(0, ny);
             nw = Math.min(nw, this.canvas.width - nx);
             nh = Math.min(nh, this.canvas.height - ny);

             if (nw > 0 && nh > 0) {
                 exportX = nx; exportY = ny; exportW = nw; exportH = nh;
             }
        }

        // Create temp canvas
        const tCanvas = document.createElement('canvas');
        tCanvas.width = exportW;
        tCanvas.height = exportH;
        const tCtx = tCanvas.getContext('2d');
        if (!tCtx) return tCanvas;

        // Render current state to main canvas first (without overlay)
        const prevTool = this.tool;
        const prevCrop = this.cropRect;

        // Temporarily disable tool overlay for rendering
        this.tool = 'select'; // or 'none'
        this.cropRect = null;
        this.render();

        // Copy to temp canvas
        tCtx.drawImage(this.canvas, exportX, exportY, exportW, exportH, 0, 0, exportW, exportH);

        // Restore
        this.tool = prevTool;
        this.cropRect = /** @type {any} */ (prevCrop);
        this.render();

        return tCanvas;
    }

    saveImage() {
        this.shapes.forEach(s => s.selected = false);
        this.render();

        const canvas = this.getExportCanvas();

        const link = document.createElement('a');
        link.download = `screenshot-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    }

    async copyToClipboard() {
        this.shapes.forEach(s => s.selected = false);
        this.render();

        const canvas = this.getExportCanvas();

        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);

            const btn = document.getElementById('action-copy');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✅ Copied!';
                setTimeout(() => {
                    if (btn) btn.innerHTML = originalText;
                }, 2000);
            }
        } catch (err) {
            console.error('Failed to copy', err);
            alert('Failed to copy to clipboard.');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    /** @type {any} */ (window).editor = new Editor('editor-canvas', 'canvas-container');
});
