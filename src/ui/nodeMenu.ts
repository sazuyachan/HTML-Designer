// 通用右键菜单 + 节点操作菜单（画布与场景树共用）

import type { NodeType } from '../core/types';
import { isContainerNode } from '../core/types';
import type { Store } from '../editor/store';
import { addChild, deleteNode, duplicateNode, moveChild } from '../editor/commands';
import { findNode } from '../core/serialize';
import { computeLayout } from '../core/layout';
import { applyPreset, findPreset, PRESETS } from '../core/presets';
import { startRename } from './rename';

export interface MenuItem {
  label?: string;
  onClick?: () => void;
  danger?: boolean;
  separator?: boolean;
  children?: MenuItem[];
}

const NODE_TYPES: Array<{ type: NodeType; label: string }> = [
  { type: 'Control', label: 'Control' },
  { type: 'Panel', label: 'Panel' },
  { type: 'Label', label: 'Label' },
  { type: 'Button', label: 'Button' },
  { type: 'LineEdit', label: 'LineEdit' },
  { type: 'CheckBox', label: 'CheckBox' },
  { type: 'Image', label: 'Image' },
  { type: 'Scroll', label: 'Scroll' },
  { type: 'HBox', label: 'HBox' },
  { type: 'VBox', label: 'VBox' },
  { type: 'Spacer', label: 'Spacer' },
];

let currentMenu: HTMLElement | null = null;

function removeMenu(): void {
  // 无论从哪里移除菜单，都一并清掉 document 监听，避免重复注册累积
  document.removeEventListener('click', onClickOutside, true);
  document.removeEventListener('contextmenu', onClickOutside, true);
  if (currentMenu) {
    currentMenu.remove();
    currentMenu = null;
  }
}

export function showContextMenu(clientX: number, clientY: number, items: MenuItem[]): void {
  removeMenu();
  const menu = document.createElement('div');
  menu.id = 'context-menu';
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'cm-sep';
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'cm-item';
    if (item.danger) row.classList.add('danger');
    if (item.children) {
      row.classList.add('cm-sub-wrap');
      row.innerHTML = `<span>${item.label}</span><span>›</span>`;
      const sub = document.createElement('div');
      sub.className = 'cm-sub';
      for (const child of item.children) {
        const subRow = document.createElement('div');
        subRow.className = 'cm-item';
        subRow.textContent = child.label ?? '';
        subRow.addEventListener('click', () => {
          removeMenu();
          child.onClick?.();
        });
        sub.appendChild(subRow);
      }
      row.appendChild(sub);
    } else {
      row.textContent = item.label ?? '';
      row.addEventListener('click', () => {
        removeMenu();
        item.onClick?.();
      });
    }
    menu.appendChild(row);
  }
  currentMenu = menu;
  document.body.appendChild(menu);

  // 定位并防止溢出
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const x = Math.min(clientX, window.innerWidth - w - 8);
  const y = Math.min(clientY, window.innerHeight - h - 8);
  menu.style.left = `${Math.max(4, x)}px`;
  menu.style.top = `${Math.max(4, y)}px`;

  setTimeout(() => {
    document.addEventListener('click', onClickOutside, true);
    document.addEventListener('contextmenu', onClickOutside, true);
  }, 0);
}

function onClickOutside(): void {
  removeMenu();
}

/** 节点可添加子节点吗？（Image 是叶子，不可有子节点） */
export function canAddChild(type: NodeType): boolean {
  return type === 'Control' || type === 'Panel' || type === 'Scroll' || type === 'HBox' || type === 'VBox';
}

/** 显示某个节点的操作菜单 */
export function showNodeMenu(store: Store, clientX: number, clientY: number, nodeId: string): void {
  const hit = findNode(store.project, nodeId);
  if (!hit) return;
  const { node, parent } = hit;
  const layout = computeLayout(store.project, store.measure);
  const parentId = parent ? parent.id : null;
  const parentRect = parentId ? layout.rects.get(parentId)! : { x: 0, y: 0, w: store.project.viewport.x, h: store.project.viewport.y };
  const parentIsContainer = parent ? isContainerNode(parent) : false;
  const siblingIndex = parent ? parent.children.findIndex((c) => c.id === nodeId) : -1;
  const siblingCount = parent ? parent.children.length : 0;

  const items: MenuItem[] = [];

  if (canAddChild(node.type)) {
    items.push({
      label: '添加子节点',
      children: NODE_TYPES.map((t) => ({
        label: t.label,
        onClick: () => {
          const created = store.mutate((p) => addChild(p, nodeId, t.type, store.measure), 'structure');
          store.select(created.id);
        },
      })),
    });
  }

  if (!parentIsContainer && nodeId !== store.project.root.id) {
    items.push({
      label: '锚点预设',
      children: PRESETS.map((preset) => {
        const active = findPreset(node)?.key === preset.key;
        return {
          label: `${preset.label}${active ? ' ✓' : ''}`,
          onClick: () => {
            store.mutate((p) => {
              const n = findNode(p, nodeId);
              if (n) applyPreset(n.node, preset, parentRect);
            }, 'structure');
          },
        };
      }),
    });
  }

  if (siblingCount > 1) {
    items.push({ label: '上移', onClick: () => parentId && store.mutate((p) => moveChild(p, parentId, siblingIndex, -1), 'structure') });
    items.push({ label: '下移', onClick: () => parentId && store.mutate((p) => moveChild(p, parentId, siblingIndex, 1), 'structure') });
  }

  items.push({ separator: true });

  items.push({
    label: '复制',
    onClick: () => {
      const newId = store.mutate((p) => duplicateNode(p, nodeId), 'structure');
      store.select(newId);
    },
  });
  items.push({
    label: '重命名',
    onClick: () => startRename(store, nodeId),
  });

  if (nodeId !== store.project.root.id) {
    items.push({
      label: '删除',
      danger: true,
      onClick: () => {
        store.mutate((p) => deleteNode(p, nodeId), 'structure');
        if (store.selection === nodeId) store.select(null);
      },
    });
  }

  showContextMenu(clientX, clientY, items);
}
