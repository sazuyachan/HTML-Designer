// 顶部工具栏

import type { Store } from '../editor/store';

export interface ToolbarActions {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  onPreview: () => void;
  onAddChild: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHelp: () => void;
  onToggleFixedScale: () => void;
  onToggleAnchorZeroOffset: () => void;
}

const VIEWPORTS = [
  { label: '800 × 600', w: 800, h: 600 },
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '1366 × 768', w: 1366, h: 768 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
];

export function createToolbar(store: Store, el: HTMLElement, actions: ToolbarActions): void {
  el.innerHTML = '';
  const title = document.createElement('span');
  title.className = 'app-title';
  title.textContent = 'HTML Designer';
  el.appendChild(title);

  // 项目名（原地编辑）
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'tb-project-name';
  nameInput.value = store.project.name;
  nameInput.title = '项目名（影响导出文件名）';
  nameInput.addEventListener('focus', () => {
    nameInput.dataset.sn = '1';
  });
  nameInput.addEventListener('input', () => {
    if (nameInput.dataset.sn === '1') {
      delete nameInput.dataset.sn;
      store.pushSnapshot();
    }
    store.mutateLive((p) => {
      p.name = nameInput.value.trim() || 'Untitled';
    }, 'inspector');
  });
  el.appendChild(nameInput);

  const group = (): HTMLElement => {
    const g = document.createElement('div');
    g.className = 'tb-group';
    el.appendChild(g);
    return g;
  };
  const btn = (g: HTMLElement, label: string, onClick: () => void, id?: string, title?: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (id) b.id = id;
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    g.appendChild(b);
    return b;
  };

  // 文件
  const file = group();
  btn(file, '新建', actions.onNew, undefined, 'Ctrl+N');
  btn(file, '打开', actions.onOpen, undefined, 'Ctrl+O');
  btn(file, '保存', actions.onSave, 'tb-save', 'Ctrl+S');
  btn(file, '导出 HTML', actions.onExport, 'tb-export', 'Ctrl+E');
  btn(file, '预览', actions.onPreview, 'tb-preview');

  // 编辑
  const edit = group();
  const undoBtn = btn(edit, '↶ 撤销', () => store.undo(), 'tb-undo', 'Ctrl+Z');
  const redoBtn = btn(edit, '↷ 重做', () => store.redo(), 'tb-redo', 'Ctrl+Y');
  const dupBtn = btn(edit, '⧉ 复制', actions.onDuplicate, undefined, 'Ctrl+D');
  const delBtn = btn(edit, '🗑 删除', actions.onDelete, undefined, 'Delete');
  btn(edit, '＋ 添加', actions.onAddChild, undefined, '向选中节点添加子控件');

  // 视图
  const view = group();
  const vpSelect = document.createElement('select');
  vpSelect.title = '设计视口尺寸';
  vpSelect.innerHTML = VIEWPORTS.map((v, i) => `<option value="${i}">${v.label}</option>`).join('');
  vpSelect.value = '1'; // 1280x720 默认
  vpSelect.addEventListener('change', () => {
    const v = VIEWPORTS[Number(vpSelect.value)];
    if (v) {
      store.mutate((p) => {
        p.viewport.x = v.w;
        p.viewport.y = v.h;
      }, 'structure');
    }
  });
  view.appendChild(vpSelect);

  btn(view, '－', actions.onZoomOut, undefined, '缩小');
  const zoomVal = document.createElement('span');
  zoomVal.className = 'zoom-val';
  zoomVal.title = '缩放（滚轮在画布上缩放）';
  view.appendChild(zoomVal);
  btn(view, '＋', actions.onZoomIn, undefined, '放大');
  btn(view, '适配', actions.onFit, undefined, '填满视口');
  const wsy = btn(view, '所见即所得', actions.onToggleFixedScale, undefined, '固定参考分辨率，整体等比缩放适配窗口（导出/预览共用）');
  wsy.classList.add('tb-toggle');
  const azo = btn(view, '固定偏移为0', actions.onToggleAnchorZeroOffset, undefined, '拖锚点时自动把所有偏移设为 0（控件跟随锚点位置）');
  azo.classList.add('tb-toggle');
  btn(view, '帮助', actions.onHelp, undefined, '使用说明');

  function refresh(): void {
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;
    zoomVal.textContent = `${Math.round(store.zoom * 100)}%`;
    delBtn.disabled = !store.selection;
    dupBtn.disabled = !store.selection;
    wsy.classList.toggle('on', store.fixedScale);
    wsy.textContent = store.fixedScale ? '所见即所得 ✓' : '所见即所得';
    azo.classList.toggle('on', store.anchorZeroOffset);
    azo.textContent = store.anchorZeroOffset ? '固定偏移为0 ✓' : '固定偏移为0';
    if (nameInput !== document.activeElement && nameInput.value !== store.project.name) {
      nameInput.value = store.project.name;
    }
  }

  store.subscribe((src) => {
    if (src === 'drag') return;
    refresh();
  });
  refresh();
}
