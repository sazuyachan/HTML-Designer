// 编辑画布：注入与导出完全相同的 CSS 渲染场景，提供选择/拖拽/缩放交互。
// 舞台是一个大虚拟世界，画布居中摆放；中键平移、滚轮缩放，四周均可移出。

import type { HdNode, Rect } from '../core/types';
import { isContainerNode } from '../core/types';
import { computeLayout, contentExtent } from '../core/layout';
import { buildCss } from '../export/css';
import { buildMarkup } from '../export/markup';
import { dragAnchor, moveNode, resizeBy, type Corner, type ResizeEdge } from '../editor/interact';
import { findNode } from '../core/serialize';
import type { Store } from '../editor/store';

const WORLD = 20000; // 虚拟世界尺寸（px），画布居中摆放，四周留足平移空间
const WORLD_CENTER = WORLD / 2;
const SVG_NS = 'http://www.w3.org/2000/svg';

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
  alt: boolean;         // Alt：临时互换改锚点/改偏移
  lastClient: { x: number; y: number };
  moved: boolean;
}
interface DragAnchor {
  kind: 'anchor';
  node: HdNode;
  parent: Rect;
  corner: Corner;
  last: { x: number; y: number };
  moved: boolean;
}
type DragState = DragMove | DragResize | DragAnchor;

/**
 * 锚点手柄箭头（鼠标指针式）：16×16 框内，每个角的三角是半个框的楔形，
 * 直角（尖端）在框中心 = 锚点位置，底边在朝该角的框边 → 指向锚点。
 * 上/右/下/左四条楔形划分整框、互不重叠 → 全 0 重叠时是完好的四向星形，可分别抓到。
 */
const ANCHOR_ARROW: Record<Corner, string> = {
  tl: '8,8 2,2 14,2',   // 从上方指向锚点（tl 角 → 箭头朝下）
  tr: '8,8 14,2 14,14', // 从右方指向锚点（tr 角 → 箭头朝左）
  br: '8,8 14,14 2,14', // 从下方指向锚点（br 角 → 箭头朝上）
  bl: '8,8 2,14 2,2',   // 从左方指向锚点（bl 角 → 箭头朝右）
};

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
    // 画布高度 = 视口 + 滚动页延伸（一张连续的纸），与 buildCss 的根规则一致
    const ext = contentExtent(store.project, store.measure);
    return WORLD_CENTER - ((store.project.viewport.y + ext) * z) / 2;
  }

  function render(): void {
    const p = store.project;
    const z = store.zoom;
    const vp = els.viewport;

    vp.className = `hd-root hd-canvas hd-${p.root.id}`;
    vp.dataset.hd = p.root.id;
    styleEl.textContent = buildCss(p, { mode: 'editor' }, store.measure);
    vp.innerHTML = buildMarkup(p);

    // 滚动页内容延伸由 buildCss 的 .hd-root 规则负责（高度 = H+ext，一张连续的纸）
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
    const ext = contentExtent(p, store.measure);
    const h = p.viewport.y + ext; // 含滚动页扩展内容
    const z = clampZoom(Math.min((vw - 40) / p.viewport.x, (vh - 40) / h));
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
    // 指针在 Scroll 上：交给原生滚动（浏览内部内容），不缩放
    if (scrollElAt(e.clientX, e.clientY)) return;
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
    // Scroll 的滚动条区域：让原生滑条拖动生效（否则会被编辑器移动节点吃掉）
    if (scrollbarHit(e.clientX, e.clientY)) return;
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
    if (e.button !== 0) return;
    e.preventDefault();
    const id = store.selection;
    if (!id) return;
    const hit = findNode(store.project, id);
    if (!hit) return;

    // 锚点手柄：只改锚点，控件像素位置不动（偏移自动补偿）
    const anchorEl = (e.target as HTMLElement).closest('[data-anchor]');
    if (anchorEl) {
      drag = {
        kind: 'anchor',
        node: hit.node,
        parent: parentRectOf(id),
        corner: anchorEl.getAttribute('data-anchor') as Corner,
        last: toRef(e.clientX, e.clientY),
        moved: false,
      };
      dragActive = true;
      els.overlay.setPointerCapture(e.pointerId);
      return;
    }

    const handleEl = (e.target as HTMLElement).closest('[data-edge]');
    if (!handleEl) return;
    const edge = handleEl.getAttribute('data-edge')!;
    const def = HANDLES.find((h) => h.edge === edge);
    if (!def) return;
    drag = {
      kind: 'resize',
      node: hit.node,
      parent: parentRectOf(id),
      hEdges: def.h ? [def.h] : [],
      vEdges: def.v ? [def.v] : [],
      alt: e.altKey, // Alt：临时互换改锚点/改偏移（Godot 风格）
      lastClient: { x: e.clientX, y: e.clientY },
      moved: false,
    };
    dragActive = true;
    els.overlay.setPointerCapture(e.pointerId);
  });

  els.overlay.addEventListener('pointermove', (e) => {
    if (!dragActive || !drag) return;
    e.preventDefault();
    if (drag.kind === 'anchor') {
      const ref = toRef(e.clientX, e.clientY);
      const dx = ref.x - drag.last.x;
      const dy = ref.y - drag.last.y;
      drag.last = ref;
      applyDrag(drag, dx, dy);
      return;
    }
    if (drag.kind !== 'resize') return;
    const scale = els.viewport.getBoundingClientRect().width / Math.max(1, store.project.viewport.x);
    const dx = (e.clientX - drag.lastClient.x) / scale;
    const dy = (e.clientY - drag.lastClient.y) / scale;
    drag.lastClient = { x: e.clientX, y: e.clientY };
    applyDrag(drag, dx, dy);
  });

  // Alt 在拖拽中按住/松开可随时切换互换模式（Godot 行为）
  const onAltKey = (e: KeyboardEvent): void => {
    if (!dragActive || !drag || drag.kind !== 'resize') return;
    drag.alt = e.altKey;
  };
  window.addEventListener('keydown', onAltKey);
  window.addEventListener('keyup', onAltKey);

  function applyDrag(d: DragState, dx: number, dy: number): void {
    if (!dragActive) return;
    if (!d.moved && Math.hypot(dx, dy) < 0.5) return;
    if (!d.moved) {
      d.moved = true;
      store.pushSnapshot();
    }
    if (d.kind === 'move') {
      store.mutateLive(() => moveNode(d.node, d.parent, dx, dy), 'drag');
    } else if (d.kind === 'resize') {
      store.mutateLive(() => {
        for (const h of d.hEdges) resizeBy(d.node, d.parent, h, dx, d.alt);
        for (const v of d.vEdges) resizeBy(d.node, d.parent, v, dy, d.alt);
      }, 'drag');
    } else {
      store.mutateLive(() => dragAnchor(d.node, d.parent, d.corner, dx, dy, store.anchorZeroOffset), 'drag');
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

  // ---------- Scroll 内部预览 ----------
  // 编辑器默认把滚轮（缩放）和指针拖拽（移动节点）吃掉了，Scroll 的滑条/滚轮用不了。
  // 指针落在 Scroll 容器上时，把操作交还给原生滚动，让内部内容能滚动浏览。

  /** 指针下最近的 Scroll 节点元素（含其内部子节点，沿 data-hd 祖先链查找） */
  function scrollElAt(clientX: number, clientY: number): HTMLElement | null {
    const elsAt = document.elementsFromPoint(clientX, clientY);
    for (const el of elsAt) {
      if (!(el instanceof HTMLElement)) continue;
      const first = el.closest('[data-hd]') as HTMLElement | null;
      if (!first) continue;
      let cur: HTMLElement | null = first;
      while (cur) {
        const hit = findNode(store.project, cur.dataset.hd!);
        if (hit && hit.node.type === 'Scroll') return cur;
        cur = cur.parentElement ? cur.parentElement.closest('[data-hd]') : null;
      }
      return null;
    }
    return null;
  }

  /** 指针是否落在 Scroll 的可见滚动条区域（给原生滑条拖动让路） */
  function scrollbarHit(clientX: number, clientY: number): boolean {
    const sc = scrollElAt(clientX, clientY);
    if (!sc) return false;
    const r = sc.getBoundingClientRect();
    const band = 15; // 覆盖各平台滚动条宽度
    const hasV = sc.scrollHeight > sc.clientHeight + 1;
    const hasH = sc.scrollWidth > sc.clientWidth + 1;
    const xIn = clientX - r.left;
    const yIn = clientY - r.top;
    if (hasV && xIn >= r.width - band && yIn >= 0 && yIn < r.height) return true;
    if (hasH && yIn >= r.height - band && xIn >= 0 && xIn < r.width) return true;
    return false;
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

    // 锚点手柄：仅自由布局的非根节点（容器子节点由容器布局，无锚点/偏移概念）
    const hit = findNode(store.project, id);
    if (hit && hit.parent && !isContainerNode(hit.parent) && id !== store.project.root.id) {
      drawAnchorHandles(id);
    }
  }

  // 锚点手柄（Godot 风格）：画在锚点位置（父级矩形内），引导线连到父级四角
  function drawAnchorHandles(nodeId: string): void {
    const hit = findNode(store.project, nodeId);
    if (!hit) return;
    const node = hit.node;
    const z = store.zoom;
    const pr = parentRectOf(nodeId); // 父矩形（工程像素）
    const psx = canvasLeft(z) + pr.x * z;
    const psy = canvasTop(z) + pr.y * z;
    const pw = pr.w * z;
    const ph = pr.h * z;
    const a = node.anchors;

    const pts: Array<{ corner: Corner; x: number; y: number }> = [
      { corner: 'tl', x: psx + a.left * pw, y: psy + a.top * ph },
      { corner: 'tr', x: psx + a.right * pw, y: psy + a.top * ph },
      { corner: 'bl', x: psx + a.left * pw, y: psy + a.bottom * ph },
      { corner: 'br', x: psx + a.right * pw, y: psy + a.bottom * ph },
    ];

    // 引导线：父级四角 → 对应锚点
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'anchor-guides');
    svg.setAttribute('overflow', 'visible');
    const pCorners: Array<[number, number]> = [
      [psx, psy],
      [psx + pw, psy],
      [psx, psy + ph],
      [psx + pw, psy + ph],
    ];
    pts.forEach((c, i) => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(pCorners[i][0]));
      line.setAttribute('y1', String(pCorners[i][1]));
      line.setAttribute('x2', String(c.x));
      line.setAttribute('y2', String(c.y));
      svg.appendChild(line);
    });
    els.overlay.appendChild(svg);

    // 锚点手柄：箭头（三角）指向各自对角方向，全 0 重叠时也能逐个抓到
    for (const c of pts) {
      const arrow = document.createElementNS(SVG_NS, 'svg');
      arrow.setAttribute('class', 'sel-anchor');
      arrow.setAttribute('width', '16');
      arrow.setAttribute('height', '16');
      arrow.dataset.anchor = c.corner;
      arrow.style.left = `${c.x - 8}px`;
      arrow.style.top = `${c.y - 8}px`;
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', ANCHOR_ARROW[c.corner]);
      poly.setAttribute('fill', '#4a9de0');
      poly.setAttribute('stroke', '#ffffff');
      poly.setAttribute('stroke-width', '1.5');
      poly.setAttribute('stroke-linejoin', 'round');
      arrow.appendChild(poly);
      els.overlay.appendChild(arrow);
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
