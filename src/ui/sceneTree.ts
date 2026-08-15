// 左侧场景树面板：点选 / 双击重命名 / 右键菜单 / 拖拽排序（Godot 式）

import type { HdNode } from '../core/types';
import type { Store } from '../editor/store';
import { showNodeMenu, canAddChild } from './nodeMenu';
import { startRename } from './rename';
import { reparent } from '../editor/commands';
import { findNode } from '../core/serialize';

const collapsed = new Set<string>();

export function createSceneTree(store: Store, el: HTMLElement): { render(): void } {
  // 拖拽状态
  let dragNodeId: string | null = null;
  let ghost: HTMLElement | null = null;
  let hoverRow: HTMLElement | null = null;
  let dropKind: 'before' | 'after' | 'child' | null = null;

  function clearHover(): void {
    if (hoverRow) hoverRow.classList.remove('drop-before', 'drop-after', 'drop-child');
    hoverRow = null;
    dropKind = null;
  }

  function render(): void {
    el.innerHTML = '';
    const list = document.createElement('ul');
    list.className = 'tree-list';
    list.appendChild(row(store.project.root));
    el.appendChild(list);
  }

  function row(node: HdNode): HTMLLIElement {
    const li = document.createElement('li');
    const div = document.createElement('div');
    div.className = 'tree-node' + (store.selection === node.id ? ' selected' : '');
    div.dataset.id = node.id;

    const hasKids = node.children.length > 0;
    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.textContent = hasKids ? (collapsed.has(node.id) ? '▸' : '▾') : '';
    if (hasKids) {
      twisty.addEventListener('click', (e) => {
        e.stopPropagation();
        if (collapsed.has(node.id)) collapsed.delete(node.id);
        else collapsed.add(node.id);
        render();
      });
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'tname';
    nameEl.textContent = node.name;
    nameEl.title = `${node.name}（${node.type}）`;

    // 隐藏开关（Godot 式眼睛，仅编辑器）：隐藏后画布上点不到/拖不到它，导出不受影响
    if (node.id !== store.project.root.id) {
      const eye = document.createElement('span');
      eye.className = 't-eye' + (node.hidden ? ' off' : '');
      eye.textContent = node.hidden ? '🚫' : '👁';
      eye.title = node.hidden ? '已隐藏（仅编辑器，不影响导出）— 点击显示' : '隐藏（仅编辑器，不影响导出）';
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        store.mutate((p) => {
          const n = findNode(p, node.id);
          if (n) n.node.hidden = !n.node.hidden;
        }, 'structure');
      });
      div.appendChild(eye);
    }

    const typeEl = document.createElement('span');
    typeEl.className = 'ttype';
    typeEl.textContent = node.type;

    div.appendChild(twisty);
    div.appendChild(nameEl);
    div.appendChild(typeEl);

    div.addEventListener('click', () => store.select(node.id));
    div.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(store, node.id);
    });
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      store.select(node.id);
      showNodeMenu(store, e.clientX, e.clientY, node.id);
    });

    // ---------- 拖拽排序 ----------
    div.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let started = false;

      const move = (ev: PointerEvent): void => {
        if (!started) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return; // 区分点击
          started = true;
          if (node.id === store.project.root.id) return; // 根不可拖
          dragNodeId = node.id;
          ghost = document.createElement('div');
          ghost.className = 'tree-drag-ghost';
          ghost.textContent = node.name;
          document.body.appendChild(ghost);
          el.classList.add('tree-dragging');
        }
        updateDrag(ev);
      };
      const up = (): void => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (started && dragNodeId) commitDrag();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });

    function updateDrag(ev: PointerEvent): void {
      if (!ghost) return;
      ghost.style.left = `${ev.clientX + 12}px`;
      ghost.style.top = `${ev.clientY + 8}px`;
      clearHover();
      const hitEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.tree-node') ?? null;
      if (!hitEl || !dragNodeId) return;
      const tid = hitEl.dataset.id;
      if (!tid || tid === dragNodeId) return;
      const rect = hitEl.getBoundingClientRect();
      const rel = ev.clientY - rect.top;
      const isRoot = tid === store.project.root.id;
      let kind: 'before' | 'after' | 'child';
      if (isRoot) kind = 'child'; // 根没有父，只能成为其子
      else if (rel < rect.height * 0.3) kind = 'before';
      else if (rel > rect.height * 0.7) kind = 'after';
      else kind = 'child';
      if (kind === 'child') {
        const tn = findNode(store.project, tid)?.node;
        if (!tn || !canAddChild(tn.type)) kind = rel < rect.height * 0.5 ? 'before' : 'after';
      }
      hoverRow = hitEl;
      dropKind = kind;
      hitEl.classList.add(kind === 'child' ? 'drop-child' : kind === 'before' ? 'drop-before' : 'drop-after');
    }

    function commitDrag(): void {
      const nodeId = dragNodeId;
      dragNodeId = null;
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
      el.classList.remove('tree-dragging');
      const rowEl = hoverRow;
      const kind = dropKind;
      clearHover();
      if (!nodeId || !rowEl || !kind) return;
      const tid = rowEl.dataset.id;
      if (!tid) return;
      const hit = findNode(store.project, tid);
      if (!hit) return;
      let parentId: string;
      let index: number;
      if (kind === 'child') {
        parentId = tid;
        index = hit.node.children.length; // 追加到目标容器末尾
        collapsed.delete(tid); // 自动展开目标容器
      } else {
        parentId = hit.parent ? hit.parent.id : tid;
        const arr = hit.parent ? hit.parent.children : [];
        const i = arr.findIndex((c) => c.id === tid);
        index = kind === 'after' ? i + 1 : i;
      }
      store.mutate((p) => {
        reparent(p, nodeId, parentId, index);
      }, 'structure');
    }

    li.appendChild(div);
    if (hasKids && !collapsed.has(node.id)) {
      const ul = document.createElement('ul');
      ul.className = 'tree-children';
      for (const c of node.children) ul.appendChild(row(c));
      li.appendChild(ul);
    }
    return li;
  }

  return { render };
}
