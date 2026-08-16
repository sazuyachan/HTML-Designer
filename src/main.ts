// 应用入口：装配 Store 与所有面板，连接订阅，绑定快捷键

import './style.css';
import { Store } from './editor/store';
import { canvasMeasure } from './export/measure';
import { createCanvas } from './ui/canvas';
import { createSceneTree } from './ui/sceneTree';
import { createInspector } from './ui/inspectorPanel';
import { createToolbar } from './ui/toolbar';
import { showNodeMenu, canAddChild } from './ui/nodeMenu';
import { exportHtmlTo, exportProjectToZip, loadProjectFile, previewHtml, saveProjectTo } from './ui/fileIO';
import { hasExternalImages } from './export/images';
import { showDialog, showHelpDialog } from './ui/dialogs';
import { createProject } from './core/schema';
import { addChild, deleteNode, duplicateNode } from './editor/commands';
import { findNode } from './core/serialize';
import { isContainerNode } from './core/types';
import { computeLayout } from './core/layout';
import { moveNode } from './editor/interact';
import type { HdNode } from './core/types';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少元素 #${id}`);
  return el;
}

/** 左右栏拖拽：side 是面板相对分隔条的方向（'left'=面板在条左边，'right'=在右边） */
function attachPanelResizer(handle: HTMLElement, panel: HTMLElement, side: 'left' | 'right'): void {
  const KEY = side === 'left' ? 'hd-tree-w' : 'hd-inspector-w';
  const saved = localStorage.getItem(KEY);
  if (saved) panel.style.width = `${saved}px`;

  let dragging = false;
  let startX = 0;
  let startW = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // 条向左拖 → 左栏变宽；条向右拖 → 右栏变窄
    const w = side === 'left' ? startW + (e.clientX - startX) : startW - (e.clientX - startX);
    panel.style.width = `${Math.min(480, Math.max(160, w))}px`;
  });
  const end = (): void => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    localStorage.setItem(KEY, String(panel.offsetWidth));
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

const store = new Store(createProject(), canvasMeasure());

// ---------- 画布 ----------
const canvasScroll = $('canvas-scroll');
const canvasStage = $('zoom-stage');
const overlay = document.createElement('div');
overlay.id = 'selection-layer';
canvasStage.appendChild(overlay); // 覆盖层随舞台滚动，画布缩放时自动对齐

const canvas = createCanvas(
  store,
  {
    scroll: canvasScroll,
    stage: canvasStage,
    viewport: $('canvas'),
    overlay,
    info: $('canvas-info'),
    viewportLabel: $('viewport-label'),
  },
  (x, y, id) => showNodeMenu(store, x, y, id),
);

// ---------- 面板 ----------
const sceneTree = createSceneTree(store, $('scene-tree'));
const inspector = createInspector(store, $('inspector'));
const statusbar = $('statusbar');

// ---------- 订阅：各面板按来源过滤，避免不必要的重建 ----------
store.subscribe(canvas.scheduleRender);
store.subscribe((src) => {
  if (src === 'drag') return;
  sceneTree.render();
});
store.subscribe(inspector.handleChange);
store.subscribe((src) => {
  if (src === 'drag') return;
  updateStatusbar();
});

function updateStatusbar(): void {
  let count = 0;
  const walk = (n: HdNode): void => {
    count += 1;
    for (const c of n.children) walk(c);
  };
  walk(store.project.root);
  const sel = store.selection
    ? (findNode(store.project, store.selection)?.node.name ?? '')
    : '未选中';
  statusbar.textContent = `${store.project.name} · ${count} 个节点 · 选择：${sel} · Ctrl+Z 撤销 · Ctrl+D 复制 · Ctrl+E 导出 · Delete 删除`;
}

// ---------- 文件操作 ----------
function doNew(): void {
  store.load(createProject());
  canvas.centerCanvas();
}
async function doOpen(): Promise<void> {
  try {
    const p = await loadProjectFile();
    store.load(p);
    canvas.centerCanvas();
  } catch {
    // 用户取消或文件无效，忽略
  }
}
async function doSave(): Promise<void> {
  const v = await showDialog({
    title: '保存工程',
    fields: [{ key: 'name', label: '文件名', kind: 'text', initial: store.project.name || 'Untitled' }],
    confirmLabel: '保存',
  });
  if (!v) return;
  const name = v.name.replace(/\.hdproj$/i, '').trim();
  if (name) saveProjectTo(`${name}.hdproj`, store.project);
}
async function doExport(): Promise<void> {
  const zip = hasExternalImages(store.project); // 存在未嵌入的图片 → 自动打包 ZIP
  const v = await showDialog({
    title: zip ? '导出 ZIP（含未嵌入图片）' : '导出 HTML',
    fields: [
      { key: 'name', label: '文件名', kind: 'text', initial: store.project.name || 'Untitled' },
      { key: 'includeVars', label: '附带节点变量脚本（const 父__子 = document.querySelector）', kind: 'checkbox', checked: true },
    ],
    confirmLabel: '导出',
  });
  if (!v) return;
  const name = v.name.replace(/\.(html|zip)$/i, '').trim();
  if (!name) return;
  const opts = { fixedScale: store.fixedScale, includeVars: v.includeVars === '1' };
  if (zip) void exportProjectToZip(`${name}.zip`, store.project, store.measure, opts);
  else exportHtmlTo(`${name}.html`, store.project, store.measure, opts);
}
function doPreview(): void {
  previewHtml(store.project, store.measure, { includeVars: true, fixedScale: store.fixedScale });
}

// ---------- 结构操作（工具栏 / 场景树按钮共用） ----------
function addChildTo(targetId: string | null): void {
  const id = targetId && canAddChild(findNode(store.project, targetId)?.node.type ?? 'Control')
    ? targetId
    : store.project.root.id;
  const created = store.mutate((p) => addChild(p, id, 'Control', store.measure), 'structure');
  store.select(created.id);
}
function doDuplicate(): void {
  const id = store.selection;
  if (!id) return;
  const newId = store.mutate((p) => duplicateNode(p, id), 'structure');
  store.select(newId);
}
function doDelete(): void {
  const id = store.selection;
  if (!id || id === store.project.root.id) return;
  store.mutate((p) => deleteNode(p, id), 'structure');
  store.select(null);
}

// ---------- 工具栏 ----------
createToolbar(store, $('toolbar'), {
  onNew: doNew,
  onOpen: () => void doOpen(),
  onSave: () => void doSave(),
  onExport: () => void doExport(),
  onPreview: doPreview,
  onAddChild: () => addChildTo(store.selection),
  onDuplicate: doDuplicate,
  onDelete: doDelete,
  onFit: () => canvas.fitToViewport(),
  onZoomIn: () => canvas.zoomBy(1.15),
  onZoomOut: () => canvas.zoomBy(1 / 1.15),
  onHelp: showHelpDialog,
  onToggleFixedScale: () => store.setFixedScale(!store.fixedScale),
  onToggleAnchorZeroOffset: () => store.setAnchorZeroOffset(!store.anchorZeroOffset),
});

// ---------- 场景树工具按钮 ----------
$('tree-add').addEventListener('click', () => addChildTo(store.selection));
$('tree-del').addEventListener('click', doDelete);
$('tree-dup').addEventListener('click', doDuplicate);

// ---------- 键盘快捷键 ----------
function isEditingText(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

function nudge(dx: number, dy: number): void {
  const id = store.selection;
  if (!id) return;
  const hit = findNode(store.project, id);
  if (!hit || !hit.parent) return;
  const parent = hit.parent;
  if (isContainerNode(parent)) return; // 容器子节点由容器布局，不可移动
  const layout = computeLayout(store.project, store.measure);
  const parentId = layout.parentOf.get(id);
  const pRect = parentId
    ? layout.rects.get(parentId)!
    : { x: 0, y: 0, w: store.project.viewport.x, h: store.project.viewport.y };
  store.mutate(() => moveNode(hit.node, pRect, dx, dy), 'drag-end');
}

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key;

  if (isEditingText()) return;

  if (mod) {
    switch (key.toLowerCase()) {
      case 'z':
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      case 'y':
        e.preventDefault();
        store.redo();
        return;
      case 'd':
        e.preventDefault();
        doDuplicate();
        return;
      case 's':
        e.preventDefault();
        void doSave();
        return;
      case 'e':
        e.preventDefault();
        void doExport();
        return;
      case 'n':
        e.preventDefault();
        doNew();
        return;
      case 'o':
        e.preventDefault();
        void doOpen();
        return;
    }
    return;
  }

  switch (key) {
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      doDelete();
      return;
    case 'Escape':
      store.select(null);
      return;
    case 'ArrowLeft':
      e.preventDefault();
      nudge(e.shiftKey ? -10 : -1, 0);
      return;
    case 'ArrowRight':
      e.preventDefault();
      nudge(e.shiftKey ? 10 : 1, 0);
      return;
    case 'ArrowUp':
      e.preventDefault();
      nudge(0, e.shiftKey ? -10 : -1);
      return;
    case 'ArrowDown':
      e.preventDefault();
      nudge(0, e.shiftKey ? 10 : 1);
      return;
  }
});

// ---------- 左右栏拖拽 ----------
attachPanelResizer($('resize-tree'), $('tree-panel'), 'left');
attachPanelResizer($('resize-inspector'), $('inspector-panel'), 'right');

// ---------- 首次渲染 ----------
canvas.scheduleRender();
canvas.centerCanvas();
sceneTree.render();
inspector.render();
updateStatusbar();
