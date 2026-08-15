// 编辑画布：注入与导出完全相同的 CSS 渲染场景，提供选择/拖拽/缩放交互。
// 舞台是一个大虚拟世界，画布居中摆放；中键平移、滚轮缩放，四周均可移出。

import type { HdNode, Rect } from '../core/types';
import { isContainerNode } from '../core/types';
import { computeLayout } from '../core/layout';
import { buildCss } from '../export/css';
import { buildMarkup } from '../export/markup';
import { moveNode, resizeBy, type ResizeEdge } from '../editor/interact';
import { findNode } from '../core/serialize';
import type { Store } from '../editor/store';

const WORLD = 20000; // 虚拟世界尺寸（px），画布居中摆放，四周留足平移空间
const WORLD_CENTER = WORLD / 2;

export interface CanvasEls {
  scroll: HTMLElement;
  stage: HTMLElement;
  viewport: HTMLElement;
  overlay: HTMLElement;
  info: HTMLElement;
  viewportLabel: HTMLElement;
}

interface DragMove {
  kind: 'move';
  node: HdNode;
  parent: Rect;
  last: { x: number; y: number };
  moved: boolean;
}
interface DragResize {
  kind: 'resize';
  node: HdNode;
  parent: Rect;
  hEdges: ResizeEdge[]; // 拖动的水平边缘（可能为空）
  vEdges: ResizeEdge[]; // 拖动的垂直边缘（可能为空）
  lastClient: { x: number; y: number };
  moved: boolean;
}
type DragState = DragMove | DragResize;

const HANDLES: Array<{ edge: string; cls: string; h: ResizeEdge | null; v: ResizeEdge | null }> = [
  { edge: 'nw', cls: 'hnw', h: 'left', v: 'top' },
  { edge: 'n', cls: 'hn', h: null, v: 'top' },
  { edge: 'ne', cls: 'hne', h: 'right', v: 'top' },
  { edge: 'e', cls: 'he', h: 'right', v: null },
  { edge: 'se', cls: 'hse', h: 'right', v: 'bottom' },
  { edge: 's', cls: 'hs', h: null, v: 'bottom' },
  { edge: 'sw', cls: 'hsw', h: 'left', v: 'bottom' },
  { edge: 'w', cls: 'hw', h: 'left', v: null },
];

function clampZoom(z: number): number {
  return Math.min(4, Math.max(0.1, z));
}

export function createCanvas(
  store: Store,
  els: CanvasEls,
  onContextMenu: (clientX: number, clientY: number, nodeId: string) => void,
): {
  scheduleRender(): void;
  zoomBy(factor: number): void;
  fitToViewport(): void;
  centerCanvas(): void;
} {
  const styleEl = document.createElement('style');
  document.head.appendChild(styleEl);

  let raf = 0;
  let drag: DragState | null = null;
  let dragActive = false;
  let pan: { startX: number; startY: number; sx: number; sy: number } | null = null;

  function scheduleRender(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      render();
    });
  }

  function canvasLeft(z: number): number {
    return WORLD_CENTER - (store.project.viewport.x * z) / 2;
  }
  function canvasTop(z: number): number {
    return WORLD_CENTER - (store.project.viewport.y * z) / 2;
  }

  function render(): void {
    const p = store.project;
    const z = store.zoom;
    const vp = els.viewport;

    vp.className = `hd-root hd-canvas hd-${p.root.id}`;
    vp.dataset.hd = p.root.id;
    styleEl.textContent = buildCss(p, { mode: 'editor' }, store.measure);
    vp.innerHTML = buildMarkup(p);

    els.stage.style.width = `${WORLD}px`;
    els.stage.style.height = `${WORLD}px`;
    vp.style.position = 'absolute';
    vp.style.left = `${canvasLeft(z)}px`;
    vp.style.top = `${canvasTop(z)}px`;
    vp.style.transform = `scale(${z})`;
    vp.style.transformOrigin = '0 0';

    els.viewportLabel.textContent = `${p.viewport.x} × ${p.viewport.y}`;
    updateSelectionOverlay();
    updateInfo();
  }

  // ---------- 缩放（绕指定点 / 视口中心 / 适配） ----------
  function setZoomAt(newZoom: number, clientX: number, clientY: number): void {
    const z0 = store.zoom;
    if (newZoom === z0) return;
    const rect = els.scroll.getBoundingClientRect();
    const cx = clientX - rect.left; // 视口相对坐标
    const cy = clientY - rect.top;
    const px = (els.scroll.scrollLeft + cx - canvasLeft(z0)) / z0; // 光标下画布坐标
    const py = (els.scroll.scrollTop + cy - canvasTop(z0)) / z0;
    store.setZoom(newZoom);
    els.scroll.scrollLeft = px * newZoom + canvasLeft(newZoom) - cx;
    els.scroll.scrollTop = py * newZoom + canvasTop(newZoom) - cy;
  }

  function zoomBy(factor: number): void {
    const rect = els.scroll.getBoundingClientRect();
    setZoomAt(clampZoom(store.zoom * factor), rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function fitToViewport(): void {
    const p = store.project;
    const vw = els.scroll.clientWidth;
    const vh = els.scroll.clientHeight;
    const z = clampZoom(Math.min((vw - 40) / p.viewport.x, (vh - 40) / p.viewport.y));
    store.setZoom(z);
    els.scroll.scrollLeft = WORLD_CENTER - vw / 2;
    els.scroll.scrollTop = WORLD_CENTER - vh / 2;
  }

  function centerCanvas(): void {
    els.scroll.scrollLeft = WORLD_CENTER - els.scroll.clientWidth / 2;
    els.scroll.scrollTop = WORLD_CENTER - els.scroll.clientHeight / 2;
  }

  // ---------- 中键平移 / 滚轮缩放 ----------
  els.scroll.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoomAt(clampZoom(store.zoom * factor), e.clientX, e.clientY);
  }, { passive: false });

  els.scroll.addEventListener('mousedown', (e) => {
    if (e.button === 1) e.preventDefault(); // 阻止浏览器中键自动滚动
  });
  els.scroll.addEventListener('pointerdown', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    pan = { startX: e.clientX, startY: e.clientY, sx: els.scroll.scrollLeft, sy: els.scroll.scrollTop };
    els.scroll.setPointerCapture(e.pointerId);
    els.scroll.classList.add('panning');
  });
  els.scroll.addEventListener('pointermove', (e) => {
    if (!pan) return;
    e.preventDefault();
    els.scroll.scrollLeft = pan.sx - (e.clientX - pan.startX);
    els.scroll.scrollTop = pan.sy - (e.clientY - pan.startY);
  });
  const endPan = (): void => {
    if (!pan) return;
    pan = null;
    els.scroll.classList.remove('panning');
  };
  els.scroll.addEventListener('pointerup', endPan);
  els.scroll.addEventListener('pointercancel', endPan);

  // ---------- 画布指针：选择 + 移动 ----------
  els.viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // 阻止 LineEdit 等获得焦点
    const nodeId = hitNode(e.clientX, e.clientY);
    if (!nodeId) return;
    store.select(nodeId);
    const hit = findNode(store.project, nodeId);
    if (!hit) return;
    const layout = computeLayout(store.project, store.measure);
    const parentId = layout.parentOf.get(nodeId);
    if (parentId) {
      const parent = findNode(store.project, parentId);
      if (parent && isContainerNode(parent.node)) return; // 容器子节点不可拖拽
    }
    const parentRect = parentId ? layout.rects.get(parentId)! : { x: 0, y: 0, w: store.project.viewport.x, h: store.project.viewport.y };
    drag = { kind: 'move', node: hit.node, parent: parentRect, last: toRef(e.clientX, e.clientY), moved: false };
    dragActive = true;
    els.viewport.setPointerCapture(e.pointerId);
  });

  els.viewport.addEventListener('pointermove', (e) => {
    if (!dragActive || !drag || drag.kind !== 'move') return;
    e.preventDefault();
    const ref = toRef(e.clientX, e.clientY);
    const dx = ref.x - drag.last.x;
    const dy = ref.y - drag.last.y;
    drag.last = ref;
    applyDrag(drag, dx, dy);
  });

  // ---------- 选择层手柄：缩放 ----------
  els.overlay.addEventListener('pointerdown', (e) => {
    const handleEl = (e.target as HTMLElement).closest('[data-edge]');
    if (!handleEl) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const id = store.selection;
    if (!id) return;
    const hit = findNode(store.project, id);
    if (!hit) return;
    const edge = handleEl.getAttribute('data-edge')!;
    const def = HANDLES.find((h) => h.edge === edge);
    if (!def) return;
    const parentRect = parentRectOf(id);
    drag = {
      kind: 'resize',
      node: hit.node,
      parent: parentRect,
      hEdges: def.h ? [def.h] : [],
      vEdges: def.v ? [def.v] : [],
      lastClient: { x: e.clientX, y: e.clientY },
      moved: false,
    };
    dragActive = true;
    els.overlay.setPointerCapture(e.pointerId);
  });

  els.overlay.addEventListener('pointermove', (e) => {
    if (!dragActive || !drag || drag.kind !== 'resize') return;
    e.preventDefault();
    const scale = els.viewport.getBoundingClientRect().width / Math.max(1, store.project.viewport.x);
    const dx = (e.clientX - drag.lastClient.x) / scale;
    const dy = (e.clientY - drag.lastClient.y) / scale;
    drag.lastClient = { x: e.clientX, y: e.clientY };
    applyDrag(drag, dx, dy);
  });

  function applyDrag(d: DragState, dx: number, dy: number): void {
    if (!dragActive) return;
    if (!d.moved && Math.hypot(dx, dy) < 0.5) return;
    if (!d.moved) {
      d.moved = true;
      store.pushSnapshot();
    }
    if (d.kind === 'move') {
      store.mutateLive(() => moveNode(d.node, d.parent, dx, dy), 'drag');
    } else {
      store.mutateLive(() => {
        for (const h of d.hEdges) resizeBy(d.node, d.parent, h, dx);
        for (const v of d.vEdges) resizeBy(d.node, d.parent, v, dy);
      }, 'drag');
    }
  }

  function endDrag(): void {
    if (!dragActive) return;
    dragActive = false;
    drag = null;
    store.mutateLive(() => {}, 'drag-end');
  }
  els.viewport.addEventListener('pointerup', endDrag);
  els.viewport.addEventListener('pointercancel', endDrag);
  els.overlay.addEventListener('pointerup', endDrag);
  els.overlay.addEventListener('pointercancel', endDrag);

  // ---------- 右键菜单 ----------
  els.viewport.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const nodeId = hitNode(e.clientX, e.clientY);
    if (!nodeId) return;
    store.select(nodeId);
    onContextMenu(e.clientX, e.clientY, nodeId);
  });

  // ---------- 命中测试 ----------
  function toRef(clientX: number, clientY: number): { x: number; y: number } {
    const vRect = els.viewport.getBoundingClientRect();
    const scale = vRect.width / Math.max(1, store.project.viewport.x);
    return {
      x: (clientX - vRect.left) / scale,
      y: (clientY - vRect.top) / scale,
    };
  }

  function hitNode(clientX: number, clientY: number): string | null {
    const elsAt = document.elementsFromPoint(clientX, clientY);
    for (const el of elsAt) {
      const id = el.getAttribute?.('data-hd');
      if (id) return id;
    }
    return null;
  }

  function parentRectOf(nodeId: string): Rect {
    const layout = computeLayout(store.project, store.measure);
    const parentId = layout.parentOf.get(nodeId);
    if (parentId && layout.rects.get(parentId)) return layout.rects.get(parentId)!;
    return { x: 0, y: 0, w: store.project.viewport.x, h: store.project.viewport.y };
  }

  // ---------- 选择覆盖层（随内容滚动，画布缩放自动对齐） ----------
  function updateSelectionOverlay(): void {
    els.overlay.innerHTML = '';
    const id = store.selection;
    if (!id) return;
    const el = els.viewport.querySelector(`[data-hd="${id}"]`);
    if (!el) return;
    const z = store.zoom;
    const vpRect = els.viewport.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // 覆盖层坐标 = 画布在舞台中的位置 + 节点相对画布的屏幕偏移
    const ox = canvasLeft(z) + (r.left - vpRect.left);
    const oy = canvasTop(z) + (r.top - vpRect.top);
    const w = r.width;
    const h = r.height;

    const box = document.createElement('div');
    box.className = 'sel-box';
    box.style.left = `${ox}px`;
    box.style.top = `${oy}px`;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    els.overlay.appendChild(box);

    for (const def of HANDLES) {
      const x = def.edge.includes('w') ? ox : def.edge.includes('e') ? ox + w : ox + w / 2;
      const y = def.edge.includes('n') ? oy : def.edge.includes('s') ? oy + h : oy + h / 2;
      const hd = document.createElement('div');
      hd.className = `sel-handle ${def.cls}`;
      hd.dataset.edge = def.edge;
      hd.style.left = `${x - 4}px`;
      hd.style.top = `${y - 4}px`;
      els.overlay.appendChild(hd);
    }
  }

  function updateInfo(): void {
    const id = store.selection;
    if (!id) {
      els.info.textContent = '';
      return;
    }
    const hit = findNode(store.project, id);
    if (!hit) return;
    const layout = computeLayout(store.project, store.measure);
    const r = layout.rects.get(id);
    const txt = r
      ? `${hit.node.name}  x=${Math.round(r.x)} y=${Math.round(r.y)}  ${Math.round(r.w)}×${Math.round(r.h)}`
      : hit.node.name;
    els.info.textContent = txt;
  }

  return { scheduleRender, zoomBy, fitToViewport, centerCanvas };
}
