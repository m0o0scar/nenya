/**
 * Screenshot Editor Logic
 */

class Shape {
    constructor(type, color, opacity, lineWidth = 4) {
        this.type = type;
        this.color = color;
        this.opacity = opacity;
        this.lineWidth = lineWidth;
        this.selected = false;
        this.id = Date.now() + Math.random();
    }

    draw(ctx) {
        ctx.globalAlpha = this.opacity;
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
    }

    contains(x, y, ctx) { return false; }
    move(dx, dy) {}

    getHandles() { return []; }
    updateHandle(handleType, x, y, dx, dy) {}

    clone() {
        const copy = new Shape(this.type, this.color, this.opacity, this.lineWidth);
        copy.selected = this.selected;
        copy.id = this.id;
        return copy;
    }
}

class RectShape extends Shape {
    constructor(x, y, w, h, color, opacity, lineWidth) {
        super('rect', color, opacity, lineWidth);
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    draw(ctx) {
        super.draw(ctx);
        ctx.beginPath();
        ctx.rect(this.x, this.y, this.w, this.h);
        ctx.stroke();

        if (this.selected) {
            drawSelectionBox(ctx, this.x, this.y, this.w, this.h);
        }
    }

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

    clone() {
        const copy = new RectShape(this.x, this.y, this.w, this.h, this.color, this.opacity, this.lineWidth);
        copy.selected = this.selected;
        copy.id = this.id;
        return copy;
    }
}

class ArrowShape extends Shape {
    constructor(x1, y1, x2, y2, color, opacity, lineWidth) {
        super('arrow', color, opacity, lineWidth);
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }

    draw(ctx) {
        super.draw(ctx);
        const headlen = 15 + this.lineWidth * 2;
        const angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1);

        // Shorten line so it doesn't poke through the head
        // The head length along the shaft is roughly headlen * cos(30deg) ~= headlen * 0.866
        const shaftShorten = headlen * 0.8;
        const lineEndX = this.x2 - shaftShorten * Math.cos(angle);
        const lineEndY = this.y2 - shaftShorten * Math.sin(angle);

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
             ctx.lineWidth = 1; // Selection handle line width
             ctx.fillRect(this.x1 - 4, this.y1 - 4, 8, 8);
             ctx.strokeRect(this.x1 - 4, this.y1 - 4, 8, 8);
             ctx.fillRect(this.x2 - 4, this.y2 - 4, 8, 8);
             ctx.strokeRect(this.x2 - 4, this.y2 - 4, 8, 8);
        }
    }

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

    move(dx, dy) {
        this.x1 += dx;
        this.y1 += dy;
        this.x2 += dx;
        this.y2 += dy;
    }

    getHandles() {
        if (!this.selected) return [];
        return [
            { x: this.x1, y: this.y1, type: 'start', cursor: 'move' },
            { x: this.x2, y: this.y2, type: 'end', cursor: 'move' }
        ];
    }

    updateHandle(handleType, x, y, dx, dy) {
        if (handleType === 'start') {
            this.x1 = x;
            this.y1 = y;
        } else if (handleType === 'end') {
            this.x2 = x;
            this.y2 = y;
        }
    }

    clone() {
        const copy = new ArrowShape(this.x1, this.y1, this.x2, this.y2, this.color, this.opacity, this.lineWidth);
        copy.selected = this.selected;
        copy.id = this.id;
        return copy;
    }
}

class TextShape extends Shape {
    constructor(x, y, text, color, opacity, fontFamily, fontSize) {
        super('text', color, opacity);
        this.x = x;
        this.y = y;
        this.text = text;
        this.fontFamily = fontFamily;
        this.fontSize = fontSize;
    }

    draw(ctx) {
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.font = `${this.fontSize}px "${this.fontFamily}"`;
        ctx.textBaseline = 'top';
        ctx.fillText(this.text, this.x, this.y);

        if (this.selected) {
            const width = ctx.measureText(this.text).width;
            const height = this.fontSize; // Approximate
            drawSelectionBox(ctx, this.x, this.y, width, height);
        }
    }

    contains(x, y, ctx) {
        ctx.font = `${this.fontSize}px "${this.fontFamily}"`;
        const width = ctx.measureText(this.text).width;
        const height = this.fontSize;
        return (x >= this.x && x <= this.x + width && y >= this.y && y <= this.y + height);
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }

    clone() {
        const copy = new TextShape(this.x, this.y, this.text, this.color, this.opacity, this.fontFamily, this.fontSize);
        copy.selected = this.selected;
        copy.id = this.id;
        return copy;
    }
}

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
    constructor(canvasId, containerId) {
        this.canvas = document.getElementById(canvasId);
        this.container = document.getElementById(containerId);
        this.ctx = this.canvas.getContext('2d');

        this.shapes = [];
        this.backgroundImage = null;
        this.tool = 'select';
        this.currentShape = null;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.lastPos = { x: 0, y: 0 };
        this.draggingHandle = null;

        this.cropRect = null;
        this.isCropping = false;
        this.cropHandle = null;

        // Properties
        this.color = '#ff0000';
        this.opacity = 1.0;
        this.lineWidth = 4;
        this.fontFamily = 'Arial';
        this.fontSize = 24;

        // Zoom/Pan
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;

        // History for undo/redo
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;

        this.init();
    }

    async init() {
        this.attachToolbarListeners();
        this.attachCanvasListeners();
        await this.loadSettings();
        await this.loadImage();
        this.updateUI();
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get('editorSettings');
            if (result.editorSettings) {
                const s = result.editorSettings;
                if (s.color) this.color = s.color;
                if (s.opacity !== undefined) this.opacity = s.opacity;
                if (s.lineWidth !== undefined) this.lineWidth = s.lineWidth;
                if (s.fontFamily) this.fontFamily = s.fontFamily;
                if (s.fontSize !== undefined) this.fontSize = s.fontSize;
            }
        } catch (e) {
            console.error('Failed to load settings', e);
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.local.set({
                editorSettings: {
                    color: this.color,
                    opacity: this.opacity,
                    lineWidth: this.lineWidth,
                    fontFamily: this.fontFamily,
                    fontSize: this.fontSize
                }
            });
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

    applySnapshot(snapshot) {
        this.shapes = snapshot.shapes.map(s => s.clone());
        this.backgroundImage = snapshot.backgroundImage;
        this.canvas.width = snapshot.canvasWidth;
        this.canvas.height = snapshot.canvasHeight;
        this.render();
        this.updateUI();
        this.updateUndoRedoUI();
    }

    updateUndoRedoUI() {
        const undoBtn = document.getElementById('action-undo');
        const redoBtn = document.getElementById('action-redo');
        if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
    }

    async loadImage() {
        try {
            const result = await chrome.storage.local.get('editorScreenshot');
            const dataUrl = result.editorScreenshot;
            if (dataUrl) {
                this.backgroundImage = new Image();
                this.backgroundImage.onload = () => {
                    this.canvas.width = this.backgroundImage.width;
                    this.canvas.height = this.backgroundImage.height;
                    this.fitToScreen();
                    this.render();
                };
                this.backgroundImage.src = dataUrl;
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
        this.panX = (containerW - imgW * this.scale) / 2;
        this.panY = (containerH - imgH * this.scale) / 2;

        this.updateTransform();
        this.updateZoomUI();
    }

    updateTransform() {
        // We apply transform style to canvas for zoom/pan
        // But for high DPI clarity we might want to scale the context?
        // For simplicity and performance, CSS transform is good for view,
        // but we need to map events correctly.
        this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    }

    attachToolbarListeners() {
        const tools = ['select', 'pan', 'crop', 'arrow', 'rect', 'text'];
        tools.forEach(t => {
            const el = document.getElementById(`tool-${t}`);
            if (el) el.addEventListener('click', () => this.setTool(t));
        });

        // Zoom
        document.getElementById('zoom-in').addEventListener('click', () => this.zoom(0.1));
        document.getElementById('zoom-out').addEventListener('click', () => this.zoom(-0.1));
        document.getElementById('zoom-fit').addEventListener('click', () => this.fitToScreen());

        // Props
        document.getElementById('prop-color').addEventListener('input', (e) => {
            this.color = e.target.value;
            this.updateSelectedShape();
            this.saveSettings();
        });
        document.getElementById('prop-opacity').addEventListener('input', (e) => {
            this.opacity = parseFloat(e.target.value);
            this.updateSelectedShape();
            this.saveSettings();
        });
        document.getElementById('prop-stroke').addEventListener('input', (e) => {
            this.lineWidth = parseInt(e.target.value);
            this.updateSelectedShape();
            this.saveSettings();
        });

        ['prop-color', 'prop-opacity', 'prop-stroke'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('mousedown', () => this.saveHistory());
        });

        document.getElementById('prop-font-family').addEventListener('change', (e) => {
            this.saveHistory();
            this.fontFamily = e.target.value;
            this.updateSelectedShape();
            this.saveSettings();
        });
        document.getElementById('prop-font-size').addEventListener('change', (e) => {
            this.saveHistory();
            this.fontSize = parseInt(e.target.value);
            this.updateSelectedShape();
            this.saveSettings();
        });

        document.getElementById('action-delete').addEventListener('click', () => this.deleteSelected());
        document.getElementById('action-save').addEventListener('click', () => this.saveImage());
        document.getElementById('action-copy').addEventListener('click', () => this.copyToClipboard());
        document.getElementById('action-undo').addEventListener('click', () => this.undo());
        document.getElementById('action-redo').addEventListener('click', () => this.redo());

        // Color Presets
        document.getElementById('color-presets').addEventListener('click', (e) => {
            const preset = e.target.closest('.color-preset');
            if (preset) {
                this.saveHistory();
                const newColor = preset.dataset.color;
                this.color = newColor;
                document.getElementById('prop-color').value = newColor;
                this.updateSelectedShape();
                this.saveSettings();
            }
        });
    }

    zoom(delta) {
        this.scale = Math.max(0.1, Math.min(5, this.scale + delta));
        this.updateTransform();
        this.updateZoomUI();
    }

    updateZoomUI() {
        document.getElementById('zoom-level').textContent = `${Math.round(this.scale * 100)}%`;
    }

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
        this.canvas.style.cursor = cursor;

        // Visibility
        const textProps = document.getElementById('text-props');
        if (this.tool === 'text' || (this.getSelectedShape() instanceof TextShape)) {
            textProps.classList.remove('hidden');
        } else {
            textProps.classList.add('hidden');
        }

        const strokeProp = document.getElementById('stroke-prop');
        if (this.tool === 'rect' || this.tool === 'arrow' || (this.getSelectedShape() instanceof RectShape) || (this.getSelectedShape() instanceof ArrowShape)) {
            strokeProp.classList.remove('hidden');
        } else {
            strokeProp.classList.add('hidden');
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
        const deleteBtn = document.getElementById('action-delete');

        // Always sync global state to UI first
        document.getElementById('prop-color').value = this.color;
        document.getElementById('prop-opacity').value = this.opacity;
        document.getElementById('prop-stroke').value = this.lineWidth;
        document.getElementById('prop-font-family').value = this.fontFamily;
        document.getElementById('prop-font-size').value = this.fontSize;

        if (shape) {
            deleteBtn.disabled = false;
            document.getElementById('prop-color').value = shape.color;
            document.getElementById('prop-opacity').value = shape.opacity;
            if (shape.lineWidth) document.getElementById('prop-stroke').value = shape.lineWidth;

            if (shape instanceof TextShape) {
                document.getElementById('text-props').classList.remove('hidden');
                document.getElementById('prop-font-family').value = shape.fontFamily;
                document.getElementById('prop-font-size').value = shape.fontSize;
            } else {
                 if (this.tool !== 'text') document.getElementById('text-props').classList.add('hidden');
            }
        } else {
            deleteBtn.disabled = true;
            if (this.tool !== 'text') document.getElementById('text-props').classList.add('hidden');
        }
        this.updateToolbarUI(); // To update visibility of stroke prop
    }

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

                if (shape.type === 'text') {
                    const step = 2;
                    shape.fontSize = Math.max(8, Math.min(200, shape.fontSize + delta * step));
                    this.fontSize = shape.fontSize; // Sync global prop
                } else if (shape.lineWidth !== undefined) {
                    shape.lineWidth = Math.max(1, Math.min(40, shape.lineWidth + delta));
                    this.lineWidth = shape.lineWidth; // Sync global prop
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
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
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
            if (key === 'v') this.setTool('select');
            if (key === 'p' || e.key === ' ') this.setTool('pan');
            if (key === 'c') this.setTool('crop');
            if (key === 'r') this.setTool('rect');
            if (key === 'a') this.setTool('arrow');
            if (key === 't') this.setTool('text');
        });
    }

    // Convert screen coordinates (clientX) to Canvas coordinates (accounting for scale/pan)
    getCanvasPos(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / this.scale,
            y: (clientY - rect.top) / this.scale
        };
    }

    handleDoubleClick(e) {
        if (this.tool !== 'select') return;
        const pos = this.getCanvasPos(e.clientX, e.clientY);

        for (let i = this.shapes.length - 1; i >= 0; i--) {
            if (this.shapes[i] instanceof TextShape && this.shapes[i].contains(pos.x, pos.y, this.ctx)) {
                this.saveHistory();
                const newText = prompt('Edit text:', this.shapes[i].text);
                if (newText !== null) {
                    this.shapes[i].text = newText;
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
        } else if (this.tool === 'arrow') {
            this.saveHistory();
            this.currentShape = new ArrowShape(pos.x, pos.y, pos.x, pos.y, this.color, this.opacity, this.lineWidth);
            this.shapes.push(this.currentShape);
        } else if (this.tool === 'text') {
            const text = prompt('Enter text:');
            if (text) {
                this.saveHistory();
                const shape = new TextShape(pos.x, pos.y, text, this.color, this.opacity, this.fontFamily, this.fontSize);
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
                 const handle = this.getCropHandle(pos.x, pos.y);
                 if (handle) this.canvas.style.cursor = handle === 'move' ? 'move' : 'nwse-resize';
                 else this.canvas.style.cursor = 'crosshair';
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
        } else if (this.tool === 'rect' && this.currentShape) {
            this.currentShape.w = pos.x - this.currentShape.x;
            this.currentShape.h = pos.y - this.currentShape.y;
            this.render();
        } else if (this.tool === 'arrow' && this.currentShape) {
            this.currentShape.x2 = pos.x;
            this.currentShape.y2 = pos.y;
            this.render();
        } else if (this.tool === 'crop' && this.cropRect) {
            this.updateCropRect(pos.x, pos.y, dx, dy);
            this.render();
        }
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'grab';
            return;
        }

        this.isDragging = false;
        this.draggingHandle = null;
        if (this.tool === 'rect' || this.tool === 'arrow') {
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
            const [hx, hy] = handles[h];
            if (Math.abs(x - hx) < dist && Math.abs(y - hy) < dist) return h;
        }

        let nx = r.w < 0 ? r.x + r.w : r.x;
        let ny = r.h < 0 ? r.y + r.h : r.y;
        let nw = Math.abs(r.w);
        let nh = Math.abs(r.h);

        if (x >= nx && x <= nx + nw && y >= ny && y <= ny + nh) return 'move';
        return null;
    }

    updateCropRect(x, y, dx, dy) {
        const r = this.cropRect;
        switch(this.cropHandle) {
            case 'se': r.w = x - r.x; r.h = y - r.y; break;
            case 'sw': r.x = x; r.w -= dx; r.h = y - r.y; break;
            case 'ne': r.y = y; r.w = x - r.x; r.h -= dy; break;
            case 'nw': r.x = x; r.y = y; r.w -= dx; r.h -= dy; break;
            case 'move': r.x += dx; r.y += dy; break;
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

        if (nw <= 0 || nh <= 0) return;

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

    render() {
        if (!this.backgroundImage) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.backgroundImage, 0, 0);

        this.ctx.save();
        this.shapes.forEach(shape => shape.draw(this.ctx));
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
        const hSize = 6 / this.scale;
        handles.forEach(([hx, hy]) => ctx.fillRect(hx - hSize/2, hy - hSize/2, hSize, hSize));

        ctx.restore();
    }

    getExportCanvas() {
        // If crop is active (visible but not applied), use it for export
        // Otherwise use full canvas
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
        this.cropRect = prevCrop;
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
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            setTimeout(() => btn.innerHTML = originalText, 2000);
        } catch (err) {
            console.error('Failed to copy', err);
            alert('Failed to copy to clipboard.');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.editor = new Editor('editor-canvas', 'canvas-container');
});
