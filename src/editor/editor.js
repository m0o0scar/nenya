/**
 * Screenshot Editor Logic
 */

class Shape {
    constructor(type, color, opacity) {
        this.type = type;
        this.color = color;
        this.opacity = opacity;
        this.selected = false;
        this.id = Date.now() + Math.random();
    }

    draw(ctx) {
        ctx.globalAlpha = this.opacity;
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 4;
    }

    contains(x, y, ctx) { return false; }
    move(dx, dy) {}

    // Returns list of handles: {x, y, type, cursor}
    getHandles() { return []; }

    // Update shape based on handle drag
    updateHandle(handleType, x, y, dx, dy) {}
}

class RectShape extends Shape {
    constructor(x, y, w, h, color, opacity) {
        super('rect', color, opacity);
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
        // Normalize rect
        const nx = this.w < 0 ? this.x + this.w : this.x;
        const ny = this.h < 0 ? this.y + this.h : this.y;
        const nw = Math.abs(this.w);
        const nh = Math.abs(this.h);

        // Check if point is near the border (stroke)
        const outer = (x >= nx - 4 && x <= nx + nw + 4 && y >= ny - 4 && y <= ny + nh + 4);
        const inner = (x >= nx + 4 && x <= nx + nw - 4 && y >= ny + 4 && y <= ny + nh - 4);
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
        // Simplification: We assume rect logic based on corners
        // This logic handles resizing by updating x,y,w,h
        // It's a bit tricky with negative width/height, so let's normalize first
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
}

class ArrowShape extends Shape {
    constructor(x1, y1, x2, y2, color, opacity) {
        super('arrow', color, opacity);
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }

    draw(ctx) {
        super.draw(ctx);
        const headlen = 15;
        const angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1);

        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x2, this.y2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(this.x2, this.y2);
        ctx.lineTo(this.x2 - headlen * Math.cos(angle - Math.PI / 6), this.y2 - headlen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(this.x2 - headlen * Math.cos(angle + Math.PI / 6), this.y2 - headlen * Math.sin(angle + Math.PI / 6));
        ctx.fill();

        if (this.selected) {
             ctx.fillStyle = 'white';
             ctx.strokeStyle = '#00a1ff';
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

        return dist < 8;
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
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.shapes = [];
        this.backgroundImage = null;
        this.tool = 'select';
        this.currentShape = null;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.lastPos = { x: 0, y: 0 };
        this.draggingHandle = null; // { shape, type }

        this.cropRect = null;
        this.isCropping = false;
        this.cropHandle = null;

        this.color = '#ff0000';
        this.opacity = 1.0;
        this.fontFamily = 'Arial';
        this.fontSize = 24;

        this.init();
    }

    async init() {
        this.attachToolbarListeners();
        this.attachCanvasListeners();
        await this.loadImage();
        this.updateUI();
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
                    this.render();
                };
                this.backgroundImage.src = dataUrl;
            }
        } catch (e) {
            console.error('Failed to load image', e);
        }
    }

    attachToolbarListeners() {
        const tools = ['select', 'crop', 'arrow', 'rect', 'text'];
        tools.forEach(t => {
            document.getElementById(`tool-${t}`).addEventListener('click', () => {
                this.setTool(t);
            });
        });

        document.getElementById('prop-color').addEventListener('input', (e) => {
            this.color = e.target.value;
            this.updateSelectedShape();
        });

        document.getElementById('prop-opacity').addEventListener('input', (e) => {
            this.opacity = parseFloat(e.target.value);
            this.updateSelectedShape();
        });

        document.getElementById('prop-font-family').addEventListener('change', (e) => {
            this.fontFamily = e.target.value;
            this.updateSelectedShape();
        });

        document.getElementById('prop-font-size').addEventListener('change', (e) => {
            this.fontSize = parseInt(e.target.value);
            this.updateSelectedShape();
        });

        document.getElementById('action-delete').addEventListener('click', () => {
            this.deleteSelected();
        });

        document.getElementById('action-save').addEventListener('click', () => {
            this.saveImage();
        });

        document.getElementById('action-copy').addEventListener('click', () => {
            this.copyToClipboard();
        });
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
        document.querySelectorAll('.join-item').forEach(btn => btn.classList.remove('tool-active'));
        document.getElementById(`tool-${this.tool}`).classList.add('tool-active');

        const canvas = document.getElementById('editor-canvas');
        if (this.tool === 'select') canvas.className = 'cursor-default shadow-lg bg-white';
        else canvas.className = 'cursor-crosshair shadow-lg bg-white';

        const textProps = document.getElementById('text-props');
        if (this.tool === 'text' || (this.getSelectedShape() instanceof TextShape)) {
            textProps.classList.remove('hidden');
        } else {
            textProps.classList.add('hidden');
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
            if (shape instanceof TextShape) {
                shape.fontFamily = this.fontFamily;
                shape.fontSize = this.fontSize;
            }
            this.render();
        }
    }

    deleteSelected() {
        this.shapes = this.shapes.filter(s => !s.selected);
        this.updateUI();
        this.render();
    }

    updateUI() {
        const shape = this.getSelectedShape();
        const deleteBtn = document.getElementById('action-delete');

        if (shape) {
            deleteBtn.disabled = false;
            document.getElementById('prop-color').value = shape.color;
            document.getElementById('prop-opacity').value = shape.opacity;

            if (shape instanceof TextShape) {
                document.getElementById('text-props').classList.remove('hidden');
                document.getElementById('prop-font-family').value = shape.fontFamily;
                document.getElementById('prop-font-size').value = shape.fontSize;
            } else {
                if (this.tool !== 'text') {
                     document.getElementById('text-props').classList.add('hidden');
                }
            }
        } else {
            deleteBtn.disabled = true;
            if (this.tool !== 'text') {
                 document.getElementById('text-props').classList.add('hidden');
            }
        }
    }

    attachCanvasListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.deleteSelected();
            }
            if (e.key === 'Enter' && this.tool === 'crop' && this.cropRect) {
                this.applyCrop();
            }
        });
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    handleDoubleClick(e) {
        if (this.tool !== 'select') return;
        const pos = this.getMousePos(e);

        for (let i = this.shapes.length - 1; i >= 0; i--) {
            if (this.shapes[i] instanceof TextShape && this.shapes[i].contains(pos.x, pos.y, this.ctx)) {
                const newText = prompt('Edit text:', this.shapes[i].text);
                if (newText !== null) {
                    this.shapes[i].text = newText;
                    this.render();
                }
                break;
            }
        }
    }

    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        this.dragStart = pos;
        this.lastPos = pos;
        this.isDragging = true;
        this.draggingHandle = null;

        if (this.tool === 'select') {
            // Check handles of selected shape first
            const selected = this.getSelectedShape();
            if (selected) {
                const handles = selected.getHandles();
                for (let h of handles) {
                    if (Math.abs(pos.x - h.x) < 6 && Math.abs(pos.y - h.y) < 6) {
                        this.draggingHandle = { shape: selected, type: h.type };
                        return; // Found handle, stop
                    }
                }
            }

            // Hit test shapes
            let hit = false;
            for (let i = this.shapes.length - 1; i >= 0; i--) {
                if (this.shapes[i].contains(pos.x, pos.y, this.ctx)) {
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
            this.currentShape = new RectShape(pos.x, pos.y, 0, 0, this.color, this.opacity);
            this.shapes.push(this.currentShape);
        } else if (this.tool === 'arrow') {
            this.currentShape = new ArrowShape(pos.x, pos.y, pos.x, pos.y, this.color, this.opacity);
            this.shapes.push(this.currentShape);
        } else if (this.tool === 'text') {
            const text = prompt('Enter text:');
            if (text) {
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
        const pos = this.getMousePos(e);
        const dx = pos.x - this.lastPos.x;
        const dy = pos.y - this.lastPos.y;
        this.lastPos = pos;

        // Update cursors
        if (this.tool === 'select') {
            // Check handles
            const selected = this.getSelectedShape();
            let cursor = 'default';
            if (selected) {
                 const handles = selected.getHandles();
                 for (let h of handles) {
                     if (Math.abs(pos.x - h.x) < 6 && Math.abs(pos.y - h.y) < 6) {
                         cursor = h.cursor;
                         break;
                     }
                 }
                 if (cursor === 'default' && selected.contains(pos.x, pos.y, this.ctx)) {
                     cursor = 'move';
                 }
            } else {
                // Check if hovering over any shape
                 for (let i = this.shapes.length - 1; i >= 0; i--) {
                    if (this.shapes[i].contains(pos.x, pos.y, this.ctx)) {
                        cursor = 'move';
                        break;
                    }
                }
            }
            this.canvas.style.cursor = cursor;
        } else if (this.tool === 'crop' && this.cropRect && !this.isDragging) {
             const handle = this.getCropHandle(pos.x, pos.y);
             if (handle) this.canvas.style.cursor = handle === 'move' ? 'move' : 'nwse-resize';
             else this.canvas.style.cursor = 'crosshair';
        }

        if (!this.isDragging) return;

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
        const dist = 10;
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
        handles.forEach(([hx, hy]) => ctx.fillRect(hx - 3, hy - 3, 6, 6));

        ctx.restore();
    }

    saveImage() {
        this.shapes.forEach(s => s.selected = false);
        this.render();

        const link = document.createElement('a');
        link.download = `screenshot-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.jpg`;
        link.href = this.canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    }

    async copyToClipboard() {
        this.shapes.forEach(s => s.selected = false);
        this.render();

        try {
            const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
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
    window.editor = new Editor('editor-canvas');
});
