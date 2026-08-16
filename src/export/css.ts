// 唯一的 锚点→CSS 映射器。编辑画布与导出共用同一份 buildCss → WYSIWYG 天然成立。

import type { HdNode, Measure, Project } from '../core/types';
import { containerIsHorizontal, isContainerNode } from '../core/types';
import { fmtCalc } from '../core/fmt';
import { computeLayout, contentExtent, minSizeFor } from '../core/layout';
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

/** 文本水平对齐 → flex 主轴对齐（Button/CheckBox 用 justify-content 实现，text-align 在收缩的 flex 项内不生效） */
function mapJustify(a: string | undefined, fallback: string): string {
  switch (a) {
    case 'left':
      return 'flex-start';
    case 'right':
      return 'flex-end';
    default:
      return fallback;
  }
}

function decls(d: Map<string, string>): string {
  return [...d.entries()].map(([k, v]) => `${k}:${v}`).join(';');
}

/** 主题 → CSS 声明 */
function applyTheme(d: Map<string, string>, node: HdNode): void {
  const t = node.theme ?? {};
  if (t.bg) d.set('background', t.bg);
  if (t.gradient && t.gradient.kind !== 'none') {
    const g = t.gradient;
    const colors = g.colors && g.colors.length > 0 ? g.colors : ['#000000', '#ffffff'];
    const stops = colors.length > 1
      ? colors.map((c, i) => `${c} ${Math.round((i / (colors.length - 1)) * 100)}%`).join(', ')
      : `${colors[0]} 0%, ${colors[0]} 100%`;
    d.set('background', g.kind === 'radial'
      ? `radial-gradient(circle, ${stops})`
      : `linear-gradient(${g.angle ?? 0}deg, ${stops})`);
  }
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
      d.set('justify-content', mapJustify(node.theme?.textAlign, 'center')); // 文本对齐（默认居中，textAlign 映射 justify-content）
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
      d.set('justify-content', mapJustify(node.theme?.textAlign, 'flex-start')); // 文本对齐（默认左）
      d.set('cursor', 'pointer');
      d.set('user-select', 'none');
      break;
    }
    case 'Image': {
      d.set('display', 'block');
      d.set('object-fit', node.image?.fit ?? 'fill');
      d.set('object-position', 'center');
      break;
    }
    case 'Scroll': {
      const dir = node.scroll?.dir ?? 'v';
      if (dir === 'both') {
        d.set('overflow', 'auto');
      } else if (dir === 'h') {
        d.set('overflow-x', 'auto');
        d.set('overflow-y', 'hidden');
      } else {
        d.set('overflow-y', 'auto');
        d.set('overflow-x', 'hidden');
      }
      break;
    }
    default:
      break;
  }
}

/** 自由布局子节点：绝对定位 + 锚点 calc + clamp。滚动模式下垂直方向用像素（相对父级设计高度），避免 % 随根节点增高而拉伸 */
function applyAnchored(d: Map<string, string>, node: HdNode, vertPx: boolean, parentH: number | null): void {
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
  if (vertPx && parentH != null) {
    const p = parentH;
    const topPx = Math.round(top * p + o.top);
    const hPx2 = Math.round((bottom - top) * p + (o.bottom - o.top));
    if (node.growV === 'BEGIN') {
      d.set('bottom', `${Math.round(p - (bottom * p + o.bottom))}px`);
    } else {
      d.set('top', `${topPx}px`);
    }
    d.set('height', `${hPx2}px`);
  } else if (node.growV === 'BEGIN') {
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
  const horizontal = containerIsHorizontal(parent);
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

/** 容器自身：flex 容器（Scroll 主轴随方向，其余同 HBox/VBox） */
function applyContainer(d: Map<string, string>, node: HdNode): void {
  d.set('display', 'flex');
  d.set('flex-direction', containerIsHorizontal(node) ? 'row' : 'column');
  d.set('gap', `${node.container?.separation ?? 0}px`);
  d.set('align-items', mapAlign(node.container?.alignCross ?? 'fill'));
}

function buildNodeRule(
  node: HdNode,
  parent: HdNode | null,
  measure: Measure,
  vertPx: boolean,
  parentH: number | null,
): string {
  const d = new Map<string, string>();
  d.set('box-sizing', 'border-box');
  applyTypeStyles(d, node);
  applyTheme(d, node);

  if (parent) {
    if (isContainerNode(parent)) applyFlexItem(d, node, parent, measure);
    else applyAnchored(d, node, vertPx, parentH);
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

/** Scroll 容器滚动条样式（编辑/导出一致） */
function scrollRules(node: HdNode): string[] {
  return [
    `.hd-${node.id}::-webkit-scrollbar{width:10px;height:10px}`,
    `.hd-${node.id}::-webkit-scrollbar-thumb{background:#c4c9d0;border-radius:5px;border:2px solid #fff}`,
    `.hd-${node.id}::-webkit-scrollbar-track{background:rgba(0,0,0,0.05)}`,
    `.hd-${node.id}{scrollbar-width:thin;scrollbar-color:#c4c9d0 rgba(0,0,0,0.05)}`,
  ];
}

function rootRule(project: Project, mode: CssMode, fixedScale: boolean, scrollExt: number): string {
  if (mode === 'export' && scrollExt > 0) {
    // 滚动页：内容超出首屏 → 根节点增高，页面纵向可滚；垂直用像素，水平仍随窗口宽度响应。
    // fixedScale（按参考宽缩放）时根用固定参考宽（供 .hd-scaler 按 100vw/W 缩放），否则响应式 width:100%
    const w = fixedScale ? `${project.viewport.x}px` : '100%';
    return `.hd-root{position:relative;width:${w};height:${project.viewport.y + scrollExt}px}`;
  }
  if (mode === 'editor' && scrollExt > 0) {
    // 编辑器画布也增高为 H+ext：一张连续的纸（节点垂直方向用像素，与导出一致）
    return `.hd-root{position:relative;width:${project.viewport.x}px;height:${project.viewport.y + scrollExt}px}`;
  }
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
  const fixedScale = opts.fixedScale === true;
  // 滚动页：内容超出首屏时垂直方向改用像素（相对父级设计高度，取自 computeLayout）。
  // 编辑器与导出都这样处理 → 根节点增高成一张连续的纸，两侧像素值一致 → WYSIWYG。
  const scrollExt = contentExtent(project, measure);
  const vertPx = scrollExt > 0;
  const layout = vertPx ? computeLayout(project, measure) : null;

  out.push(opts.mode === 'export' ? GLOBAL_RESET_EXPORT : GLOBAL_RESET_EDITOR);
  if (opts.mode === 'export' && fixedScale) {
    if (scrollExt === 0) {
      // 所见即所得：固定参考分辨率 + 整体等比缩放填满窗口（scale 取 number：长度÷长度）
      out.push(`.hd-fit{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden}`);
      out.push(`.hd-scaler{transform:scale(min(100vw / ${project.viewport.x}px, 100vh / ${project.viewport.y}px))}`);
    } else {
      // 滚动页 + 所见即所得：按参考宽缩放（100vw / W），仍纵向可滚。
      // scaler 布局尺寸 = 缩放后尺寸（宽 100vw、高按比例）→ fit 容器的滚动高度正好是整页
      const totalH = project.viewport.y + scrollExt;
      out.push(`.hd-fit{position:fixed;inset:0;overflow-y:auto;overflow-x:hidden}`);
      out.push(`.hd-scaler{width:100vw;height:calc(100vw / ${project.viewport.x}px * ${totalH}px);transform:scale(calc(100vw / ${project.viewport.x}px));transform-origin:top left}`);
    }
  }
  out.push(rootRule(project, opts.mode, fixedScale, scrollExt));

  const walk = (node: HdNode, parent: HdNode | null): void => {
    const parentH = parent && layout ? layout.rects.get(parent.id)?.h ?? null : null;
    out.push(buildNodeRule(node, parent, measure, vertPx, parentH));
    out.push(...interactionRules(node));
    if (node.type === 'CheckBox') out.push(...checkboxRules(node));
    if (node.type === 'Scroll') out.push(...scrollRules(node));
    // 隐藏节点仅编辑器生效（display:none 后点选/拖拽都碰不到它）；导出完全不受影响
    if (opts.mode === 'editor' && node.hidden && node !== project.root) {
      out.push(`.hd-${node.id}{display:none !important}`);
    }
    for (const c of node.children) walk(c, node);
  };
  walk(project.root, null);
  return out.join('\n');
}
