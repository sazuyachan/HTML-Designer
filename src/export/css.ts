// 唯一的 锚点→CSS 映射器。编辑画布与导出共用同一份 buildCss → WYSIWYG 天然成立。

import type { HdNode, Measure, Project } from '../core/types';
import { isContainerNode } from '../core/types';
import { fmtCalc } from '../core/fmt';
import { minSizeFor } from '../core/layout';
import { ACCENT, CHECKBOX_SIZE, GLOBAL_RESET_EDITOR, GLOBAL_RESET_EXPORT } from './consts';

export type CssMode = 'editor' | 'export';

export interface BuildCssOptions {
  mode: CssMode;
  /** 导出：固定按参考分辨率缩放适配窗口（所见即所得）。仅 mode==='export' 时有效 */
  fixedScale?: boolean;
}

function mapAlign(a: string): string {
  switch (a) {
    case 'begin':
      return 'flex-start';
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    default:
      return 'stretch';
  }
}

function decls(d: Map<string, string>): string {
  return [...d.entries()].map(([k, v]) => `${k}:${v}`).join(';');
}

/** 主题 → CSS 声明 */
function applyTheme(d: Map<string, string>, node: HdNode): void {
  const t = node.theme ?? {};
  if (t.bg) d.set('background', t.bg);
  if (t.color) d.set('color', t.color);
  if (t.fontSize) d.set('font-size', `${t.fontSize}px`);
  if (t.bold) d.set('font-weight', 'bold');
  if (t.fontFamily) d.set('font-family', t.fontFamily);
  if (t.opacity != null) d.set('opacity', String(t.opacity));
  if (t.textAlign) d.set('text-align', t.textAlign);
  if (t.radius != null) d.set('border-radius', `${t.radius}px`);
  if (t.padding != null) d.set('padding', `${t.padding}px`);
  if (t.border && t.border.style !== 'none') {
    const b = t.border;
    d.set('border', `${b.width}px ${b.style} ${b.color}`);
  }
}

/** 类型专属的样式（先应用，theme 后覆盖） */
function applyTypeStyles(d: Map<string, string>, node: HdNode): void {
  switch (node.type) {
    case 'Label': {
      // flex column：justify-content 控制垂直对齐（top/center/bottom），文本块全宽由 text-align 控制水平
      d.set('display', 'flex');
      d.set('flex-direction', 'column');
      d.set('align-items', 'stretch');
      const va = node.theme?.vAlign ?? 'top';
      d.set('justify-content', va === 'center' ? 'center' : va === 'bottom' ? 'flex-end' : 'flex-start');
      d.set('overflow', 'hidden');
      if (node.theme?.autowrap) {
        d.set('white-space', 'normal');
        d.set('overflow-wrap', 'break-word');
      } else {
        d.set('white-space', 'nowrap');
      }
      break;
    }
    case 'Button': {
      d.set('appearance', 'none');
      d.set('-webkit-appearance', 'none');
      d.set('border', '0');
      d.set('margin', '0');
      d.set('font', 'inherit');
      d.set('cursor', 'pointer');
      d.set('user-select', 'none');
      d.set('display', 'flex');
      d.set('align-items', 'center');
      d.set('justify-content', 'center');
      break;
    }
    case 'LineEdit': {
      d.set('appearance', 'none');
      d.set('-webkit-appearance', 'none');
      d.set('margin', '0');
      d.set('font', 'inherit');
      d.set('outline', 'none');
      break;
    }
    case 'CheckBox': {
      d.set('display', 'flex');
      d.set('align-items', 'center');
      d.set('gap', '6px');
      d.set('cursor', 'pointer');
      d.set('user-select', 'none');
      break;
    }
    default:
      break;
  }
}

/** 自由布局子节点：绝对定位 + 锚点 calc + clamp */
function applyAnchored(d: Map<string, string>, node: HdNode): void {
  const { left, top, right, bottom } = node.anchors;
  const o = node.offsets;
  d.set('position', 'absolute');

  const wPct = (right - left) * 100;
  const wPx = o.right - o.left;
  const hPct = (bottom - top) * 100;
  const hPx = o.bottom - o.top;

  if (node.growH === 'BEGIN') {
    d.set('right', fmtCalc((1 - right) * 100, -o.right));
    d.set('width', fmtCalc(wPct, wPx));
  } else {
    d.set('left', fmtCalc(left * 100, o.left));
    d.set('width', fmtCalc(wPct, wPx));
  }
  if (node.growV === 'BEGIN') {
    d.set('bottom', fmtCalc((1 - bottom) * 100, -o.bottom));
    d.set('height', fmtCalc(hPct, hPx));
  } else {
    d.set('top', fmtCalc(top * 100, o.top));
    d.set('height', fmtCalc(hPct, hPx));
  }

  if (node.minSize.x > 0) d.set('min-width', `${Math.round(node.minSize.x)}px`);
  if (node.maxSize.x > 0) d.set('max-width', `${Math.round(node.maxSize.x)}px`);
  if (node.minSize.y > 0) d.set('min-height', `${Math.round(node.minSize.y)}px`);
  if (node.maxSize.y > 0) d.set('max-height', `${Math.round(node.maxSize.y)}px`);
}

/** 容器子节点：flex item */
function applyFlexItem(d: Map<string, string>, node: HdNode, parent: HdNode, measure: Measure): void {
  const horizontal = parent.type === 'HBox';
  const main = horizontal ? 'width' : 'height';
  const cross = horizontal ? 'height' : 'width';
  const expand = node.sizeFlags?.expandMain ?? false;
  const ratio = node.sizeFlags?.ratio ?? 1;
  const align = node.sizeFlags?.alignCross ?? parent.container?.alignCross ?? 'fill';
  const min = minSizeFor(node, measure);
  const minMain = horizontal ? min.x : min.y;
  const minCross = horizontal ? min.y : min.x;
  const isC = isContainerNode(node);

  if (expand) {
    d.set('flex', `${ratio} 0 0`);
    d.set(`min-${main}`, `${Math.round(minMain)}px`);
  } else if (isC) {
    // 嵌套容器作为 flex item 必须给显式主尺寸，内部绝对定位孙节点才能解析 calc(%)
    d.set('flex', '0 0 auto');
    d.set(main, `${Math.round(minMain)}px`);
    d.set(`min-${main}`, `${Math.round(minMain)}px`);
  } else {
    d.set('flex', '0 0 auto');
  }

  if (align === 'fill') {
    d.set('align-self', 'stretch');
  } else {
    d.set('align-self', mapAlign(align));
    if (isC) d.set(cross, `${Math.round(minCross)}px`);
  }
}

/** 容器自身：flex 容器 */
function applyContainer(d: Map<string, string>, node: HdNode): void {
  d.set('display', 'flex');
  d.set('flex-direction', node.type === 'HBox' ? 'row' : 'column');
  d.set('gap', `${node.container?.separation ?? 0}px`);
  d.set('align-items', mapAlign(node.container?.alignCross ?? 'fill'));
}

function buildNodeRule(node: HdNode, parent: HdNode | null, measure: Measure): string {
  const d = new Map<string, string>();
  d.set('box-sizing', 'border-box');
  applyTypeStyles(d, node);
  applyTheme(d, node);

  if (parent) {
    if (isContainerNode(parent)) applyFlexItem(d, node, parent, measure);
    else applyAnchored(d, node);
  }
  if (isContainerNode(node)) applyContainer(d, node);
  return `.hd-${node.id}{${decls(d)}}`;
}

/** 交互态（Button hover/active、LineEdit focus） */
function interactionRules(node: HdNode): string[] {
  if (node.type === 'Button') {
    return [
      `.hd-${node.id}:hover{filter:brightness(1.06)}`,
      `.hd-${node.id}:active{filter:brightness(0.92)}`,
    ];
  }
  if (node.type === 'LineEdit') {
    return [`.hd-${node.id}:focus{border-color:${ACCENT};box-shadow:0 0 0 2px rgba(74,157,224,0.35);outline:none}`];
  }
  return [];
}

/** 自定义复选框外观 */
function checkboxRules(node: HdNode): string[] {
  const size = CHECKBOX_SIZE;
  return [
    `.hd-${node.id} input[type=checkbox]{appearance:none;-webkit-appearance:none;width:${size}px;height:${size}px;border:1px solid #9aa0a6;border-radius:3px;background:#fff;margin:0;display:inline-block;position:relative;flex:none}`,
    `.hd-${node.id} input[type=checkbox]:checked{background:${ACCENT};border-color:${ACCENT}}`,
    `.hd-${node.id} input[type=checkbox]:checked::after{content:'';position:absolute;left:4px;top:1px;width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}`,
  ];
}

function rootRule(project: Project, mode: CssMode, fixedScale?: boolean): string {
  if (mode === 'export' && !fixedScale) {
    // 响应式：根节点填满窗口，锚点随窗口重排（Godot 运行时行为）
    return `.hd-root{position:fixed;left:0;top:0;right:0;bottom:0}`;
  }
  // 编辑器 & 所见即所得导出：固定参考分辨率（与编辑器画布完全一致）
  return `.hd-root{position:relative;width:${project.viewport.x}px;height:${project.viewport.y}px}`;
}

/**
 * 生成整棵场景的 CSS。
 * @param measure 文本测量（编辑模式传 canvas 测量，导出模式复用编辑器当前的 measure）
 */
export function buildCss(project: Project, opts: BuildCssOptions, measure: Measure): string {
  const out: string[] = [];
  out.push(opts.mode === 'export' ? GLOBAL_RESET_EXPORT : GLOBAL_RESET_EDITOR);
  if (opts.mode === 'export' && opts.fixedScale) {
    // 所见即所得：固定参考分辨率 + 整体等比缩放填满窗口（scale 取 number：长度÷长度）
    out.push(`.hd-fit{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden}`);
    out.push(`.hd-scaler{transform:scale(min(100vw / ${project.viewport.x}px, 100vh / ${project.viewport.y}px))}`);
  }
  out.push(rootRule(project, opts.mode, opts.fixedScale));

  const walk = (node: HdNode, parent: HdNode | null): void => {
    out.push(buildNodeRule(node, parent, measure));
    out.push(...interactionRules(node));
    if (node.type === 'CheckBox') out.push(...checkboxRules(node));
    // 隐藏节点仅编辑器生效（display:none 后点选/拖拽都碰不到它）；导出完全不受影响
    if (opts.mode === 'editor' && node.hidden && node !== project.root) {
      out.push(`.hd-${node.id}{display:none !important}`);
    }
    for (const c of node.children) walk(c, node);
  };
  walk(project.root, null);
  return out.join('\n');
}
