// 节点树 → HTML 标记（编辑画布与导出共用）

import type { HdNode, Project } from '../core/types';
import { collectExternalImages } from './images';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface MarkupOptions {
  /** 导出模式：embed=false 的图片用 assets/images/<文件名> 引用；编辑器用 data URL 预览 */
  export?: boolean;
}

/** 空图片占位（1×1 透明 GIF），避免 <img src=""> 出现裂图图标 */
const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

function imgSrc(node: HdNode, opts: MarkupOptions, ext?: Map<string, string>): string {
  const img = node.image;
  if (!img) return TRANSPARENT;
  if (opts.export && !img.embed) {
    const fname = ext?.get(node.id) ?? img.filename;
    return fname ? `assets/images/${fname}` : TRANSPARENT;
  }
  return img.src || TRANSPARENT;
}

/** 根节点的 children 内部标记（画布自身是 .hd-root 元素，由调用方生成外层） */
export function buildMarkup(project: Project, opts: MarkupOptions = {}): string {
  const ext = new Map(collectExternalImages(project).map((i) => [i.nodeId, i.filename]));
  return project.root.children.map((c) => nodeMarkup(c, opts, ext)).join('');
}

export function nodeMarkup(node: HdNode, opts: MarkupOptions = {}, ext?: Map<string, string>): string {
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
    case 'Image':
      return `<img ${attr} src="${esc(imgSrc(node, opts, ext))}" alt="">`;
    case 'Scroll':
    case 'HBox':
    case 'VBox':
    case 'Panel':
    case 'Control':
    case 'Spacer':
      return `<div ${attr}>${node.children.map((c) => nodeMarkup(c, opts, ext)).join('')}</div>`;
  }
}
