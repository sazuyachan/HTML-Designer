// 节点树 → HTML 标记（编辑画布与导出共用）

import type { HdNode, Project } from '../core/types';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 根节点的 children 内部标记（画布自身是 .hd-root 元素，由调用方生成外层） */
export function buildMarkup(project: Project): string {
  return project.root.children.map((c) => nodeMarkup(c)).join('');
}

export function nodeMarkup(node: HdNode): string {
  const cls = `hd-${node.id}`;
  const attr = `class="${cls}" data-hd="${node.id}"`;
  switch (node.type) {
    case 'Label':
      return `<div ${attr}>${esc(node.text ?? '')}</div>`;
    case 'Button':
      return `<button type="button" ${attr}>${esc(node.text ?? '')}</button>`;
    case 'LineEdit':
      return `<input type="text" ${attr} value="${esc(node.text ?? '')}" placeholder="${esc(node.placeholder ?? '')}">`;
    case 'CheckBox':
      return `<label ${attr}><input type="checkbox"><span>${esc(node.text ?? '')}</span></label>`;
    case 'HBox':
    case 'VBox':
    case 'Panel':
    case 'Control':
    case 'Spacer':
      return `<div ${attr}>${node.children.map((c) => nodeMarkup(c)).join('')}</div>`;
  }
}
