// Godot 锚点布局算法（纯函数，供编辑器命中测试/交互数学 + 单测）

import type { HdNode, GrowDir, Measure, Project, Rect, Size2D } from './types';
import { containerIsHorizontal, isContainerNode, isScrollNode } from './types';

/**
 * 单轴 clamp：先按 maxSize 收缩，再按 minSize 扩展。
 * 关键不变量 —— grow 决定 clamp 时哪条边钉住：
 *   END    start 边钉住，end 边伸缩（对应 CSS `left+width` / `top+height`）
 *   BEGIN  end 边钉住（对应 CSS `right+width` / `bottom+height`）
 *   BOTH   中心钉住（CSS 无法表达，导出近似为 END）
 */
export function clampAxis(
  lo: number,
  hi: number,
  minSz: number,
  maxSz: number,
  grow: GrowDir,
): [number, number] {
  let w = hi - lo;
  // 收缩到 max
  if (maxSz > 0 && w > maxSz) {
    const d = w - maxSz;
    if (grow === 'BEGIN') lo += d;
    else if (grow === 'END') hi -= d;
    else { lo += d / 2; hi -= d / 2; }
    w = hi - lo;
  }
  // 扩展到 min
  if (w < minSz) {
    const d = minSz - w;
    if (grow === 'BEGIN') lo -= d;
    else if (grow === 'END') hi += d;
    else { lo -= d / 2; hi += d / 2; }
  }
  return [lo, hi];
}

/**
 * 计算单个自由布局节点在父矩形内的锚点矩形（Godot 公式）：
 *   pos  = parent_size × anchor + offset（每轴）
 *   size = (parent_size × anchorEnd + offsetEnd) − (parent_size × anchorStart + offsetStart)
 * 然后 clamp 到 min/max（grow 决定钉住的边）。
 */
export function computeRect(node: HdNode, parent: Rect): Rect {
  let x = parent.w * node.anchors.left + node.offsets.left;
  let y = parent.h * node.anchors.top + node.offsets.top;
  let x2 = parent.w * node.anchors.right + node.offsets.right;
  let y2 = parent.h * node.anchors.bottom + node.offsets.bottom;
  // 倒置锚点规范化
  if (x2 < x) x2 = x;
  if (y2 < y) y2 = y;
  const [nx, nxx] = clampAxis(x, x2, node.minSize.x, node.maxSize.x, node.growH);
  const [ny, nyy] = clampAxis(y, y2, node.minSize.y, node.maxSize.y, node.growV);
  return { x: nx, y: ny, w: nxx - nx, h: nyy - ny };
}

export function fontSpec(node: HdNode): { fontSize: number; bold: boolean; fontFamily?: string } {
  const t = node.theme ?? {};
  return {
    fontSize: t.fontSize ?? 16,
    bold: !!t.bold,
    fontFamily: t.fontFamily,
  };
}

function textSize(node: HdNode, measure: Measure): Size2D {
  const text = node.text ?? '';
  const f = fontSpec(node);
  const h = Math.ceil(f.fontSize * 1.4);
  if (!text) return { x: 0, y: h };
  const m = measure.text(text, f);
  return { x: m.x, y: Math.max(m.y, h) };
}

/** 内容最小尺寸（递归）。measure 由编辑器 canvas / 测试 stub 注入。 */
export function minSizeFor(node: HdNode, measure: Measure): Size2D {
  let content: Size2D;
  const pad = node.theme?.padding ?? 0;
  switch (node.type) {
    case 'Label': {
      content = textSize(node, measure);
      break;
    }
    case 'Button': {
      const t = textSize(node, measure);
      content = { x: t.x + pad * 2, y: t.y + pad * 2 };
      break;
    }
    case 'LineEdit': {
      const f = fontSpec(node);
      content = {
        x: Math.round(f.fontSize * 8),
        y: Math.ceil(f.fontSize * 1.4) + pad * 2,
      };
      break;
    }
    case 'CheckBox': {
      const t = textSize(node, measure);
      const box = Math.round(Math.min(18, Math.max(12, fbox(node))));
      content = { x: box + 6 + t.x, y: Math.max(box, t.y) };
      break;
    }
    case 'Spacer':
    case 'Control':
    case 'Panel':
    case 'Image':
    case 'Scroll':
      content = { x: 0, y: 0 };
      break;
    case 'HBox':
    case 'VBox': {
      const sep = node.container?.separation ?? 0;
      const kids = node.children.map((c) => minSizeFor(c, measure));
      if (node.type === 'HBox') {
        content = {
          x: kids.reduce((s, k) => s + k.x, 0) + sep * Math.max(0, kids.length - 1),
          y: kids.reduce((s, k) => Math.max(s, k.y), 0),
        };
      } else {
        content = {
          x: kids.reduce((s, k) => Math.max(s, k.x), 0),
          y: kids.reduce((s, k) => s + k.y, 0) + sep * Math.max(0, kids.length - 1),
        };
      }
      break;
    }
  }
  // 应用 min/max
  content.x = Math.max(node.minSize.x, content.x);
  content.y = Math.max(node.minSize.y, content.y);
  if (node.maxSize.x > 0) content.x = Math.min(content.x, node.maxSize.x);
  if (node.maxSize.y > 0) content.y = Math.min(content.y, node.maxSize.y);
  return content;
}

function fbox(node: HdNode): number {
  return (node.theme?.fontSize ?? 16) * 0.9;
}

export interface LayoutChild {
  node: HdNode;
  rect: Rect;
}

/**
 * 容器子节点布局（Godot BoxContainer）：
 * 每个子节点先拿到最小尺寸，再把多余主轴空间按 expand 子节点的 ratio 比例分配。
 * 空间不足则保留最小尺寸并溢出。
 */
export function layoutContainer(container: HdNode, box: Rect, measure: Measure): LayoutChild[] {
  const horizontal = containerIsHorizontal(container);
  const kids = container.children;
  const n = kids.length;
  if (n === 0) return [];
  const sep = container.container?.separation ?? 0;
  const alignCross = container.container?.alignCross ?? 'fill';

  const mins = kids.map((c) => minSizeFor(c, measure));
  const main = horizontal ? 'x' : 'y';
  const cross = horizontal ? 'y' : 'x';
  const boxMain = horizontal ? box.w : box.h;
  const boxCross = horizontal ? box.h : box.w;

  const sumMin = mins.reduce((s, m) => s + m[main], 0);
  const extra = boxMain - sumMin - sep * (n - 1);

  const expandIdx: number[] = [];
  let totalRatio = 0;
  kids.forEach((c, i) => {
    if (c.sizeFlags?.expandMain) {
      expandIdx.push(i);
      totalRatio += c.sizeFlags?.ratio ?? 1;
    }
  });
  const mainSizes = mins.map((m) => m[main]);
  if (extra > 0 && totalRatio > 0) {
    for (const i of expandIdx) {
      mainSizes[i] += extra * ((kids[i].sizeFlags?.ratio ?? 1) / totalRatio);
    }
  }

  const mainStart = horizontal ? box.x : box.y;
  const crossStart = horizontal ? box.y : box.x;
  const out: LayoutChild[] = [];
  let p = mainStart;
  for (let i = 0; i < n; i++) {
    const k = kids[i];
    const align = k.sizeFlags?.alignCross ?? alignCross;
    let cs = boxCross;
    let cp = crossStart;
    if (align !== 'fill') {
      cs = mins[i][cross];
      if (align === 'center') cp = crossStart + (boxCross - cs) / 2;
      else if (align === 'end') cp = crossStart + (boxCross - cs);
    }
    const rect = horizontal
      ? { x: p, y: cp, w: mainSizes[i], h: cs }
      : { x: cp, y: p, w: cs, h: mainSizes[i] };
    out.push({ node: k, rect });
    p += mainSizes[i] + sep;
  }
  return out;
}

export interface LayoutResult {
  rects: Map<string, Rect>;
  parentOf: Map<string, string>;
}

/** 整棵树布局：返回每个节点的矩形与父 id（供命中测试、交互数学、状态栏）。 */
export function computeLayout(project: Project, measure: Measure): LayoutResult {
  const rects = new Map<string, Rect>();
  const parentOf = new Map<string, string>();
  const viewport: Rect = { x: 0, y: 0, w: project.viewport.x, h: project.viewport.y };
  const rootRect = computeRect(project.root, viewport);
  rects.set(project.root.id, rootRect);

  walk(project.root, rootRect);
  return { rects, parentOf };

  function walk(parent: HdNode, parentRect: Rect): void {
    if (isContainerNode(parent)) {
      for (const c of layoutContainer(parent, parentRect, measure)) {
        rects.set(c.node.id, c.rect);
        parentOf.set(c.node.id, parent.id);
        walk(c.node, c.rect);
      }
    } else {
      for (const c of parent.children) {
        const r = computeRect(c, parentRect);
        rects.set(c.id, r);
        parentOf.set(c.id, parent.id);
        walk(c, r);
      }
    }
  }
}

/**
 * 页面内容向下超出视口的高度（px）。竖直锚点 >1 或大偏移把内容放到首屏之下时：
 * 编辑器画布据此向下扩展编辑区，导出时根节点增高、页面可滚动。
 * 跳过 Scroll 容器内部的内容（靠容器自身滚动条查看，不撑高页面）。
 */
export function contentExtent(project: Project, measure: Measure): number {
  const layout = computeLayout(project, measure);
  let maxBottom = project.viewport.y;
  const walk = (node: HdNode, underScroll: boolean): void => {
    if (!underScroll) {
      const r = layout.rects.get(node.id);
      if (r && r.y + r.h > maxBottom) maxBottom = r.y + r.h;
    }
    const scroll = underScroll || isScrollNode(node);
    for (const c of node.children) walk(c, scroll);
  };
  walk(project.root, false);
  return Math.max(0, Math.ceil(maxBottom - project.viewport.y));
}
