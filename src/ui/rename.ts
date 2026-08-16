// 节点原地重命名：优先在场景树里内联编辑，树里不可见时退回 prompt

import type { Store } from '../editor/store';
import { findNode } from '../core/serialize';
import { uniqueNameAmongSiblings } from '../core/schema';

export function startRename(store: Store, nodeId: string): void {
  const hit = findNode(store.project, nodeId);
  if (!hit) return;
  const el = document.querySelector<HTMLElement>(`#scene-tree [data-id="${nodeId}"] .tname`);
  if (el) {
    beginInlineEdit(store, nodeId, el, hit.node.name);
  } else {
    // 父节点折叠导致树里没有该行，退回弹窗
    const name = window.prompt('节点名称', hit.node.name);
    if (name && name.trim()) {
      store.mutate((p) => {
        const n = findNode(p, nodeId);
        if (n) n.node.name = uniqueNameAmongSiblings(n.parent?.children ?? [], name.trim(), nodeId);
      }, 'structure');
    }
  }
}

function beginInlineEdit(store: Store, nodeId: string, nameEl: HTMLElement, original: string): void {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tree-rename';
  input.value = original;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  // 阻止事件冒泡到行级处理（否则点击输入框会触发选择 → 整树重渲染 → 输入框被销毁）
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());

  let done = false;
  const finish = (commit: boolean): void => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (commit && v && v !== original) {
      store.mutate((p) => {
        const n = findNode(p, nodeId);
        // 同级不允许重名：冲突时自动加编号
        if (n) n.node.name = uniqueNameAmongSiblings(n.parent?.children ?? [], v, nodeId);
      }, 'structure');
    } else {
      // 无改动：把输入框还原为名称 span
      const span = document.createElement('span');
      span.className = 'tname';
      span.textContent = original;
      input.replaceWith(span);
    }
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}
