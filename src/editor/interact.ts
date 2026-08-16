// 拖拽/缩放的纯函数（编辑器的交互数学）。返回是否发生了可感知的移动。

import type { HdNode, Rect } from '../core/types';
import { computeRect } from '../core/layout';
import { ANCHOR_H_MAX, ANCHOR_H_MIN, ANCHOR_V_MAX, ANCHOR_V_MIN } from '../core/schema';

export type ResizeEdge = 'left' | 'right' | 'top' | 'bottom';
/** 锚点手柄的角 */
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

/**
 * 移动节点。每轴独立：
 *  - 固定尺寸（a1===a2）：偏移量平移（尺寸不变）
 *  - 拉伸（a1<a2）：锚点平移（span 不变），越界时整体平移夹到锚点允许范围
 * 竖直锚点允许超过 1（滚动页面），水平仍夹在 [0,1]。
 */
export function moveNode(node: HdNode, parent: Rect, dx: number, dy: number): void {
  moveAxis(node, 'left', 'right', dx, parent.w, ANCHOR_H_MIN, ANCHOR_H_MAX);
  moveAxis(node, 'top', 'bottom', dy, parent.h, ANCHOR_V_MIN, ANCHOR_V_MAX);
}

function moveAxis(
  node: HdNode,
  sKey: 'left' | 'top',
  eKey: 'right' | 'bottom',
  d: number,
  parentSize: number,
  lo: number,
  hi: number,
): void {
  const P = Math.max(parentSize, 0.001);
  const a1 = node.anchors[sKey];
  const a2 = node.anchors[eKey];
  if (a1 === a2) {
    node.offsets[sKey] += d;
    node.offsets[eKey] += d;
  } else {
    let na1 = a1 + d / P;
    let na2 = a2 + d / P;
    if (na1 < lo) {
      na2 -= na1 - lo;
      na1 = lo;
    } else if (na2 > hi) {
      na1 -= na2 - hi;
      na2 = hi;
    }
    node.anchors[sKey] = na1;
    node.anchors[eKey] = na2;
  }
}

/**
 * 按边缘缩放。两种对称模式，锚点只在 Alt 时被改动：
 *  - 非 Alt（默认）：像素 resize —— 被拖边偏移 ±d，锚点不动；min/max 钳制被拖边位置（另一条边不动）。
 *  - Alt（Godot 互换）：锚点 resize —— 被拖边锚点跟随，偏移补偿使边像素位置不动；钳制到合法范围且不越过对侧锚点。
 */
export function resizeBy(node: HdNode, parent: Rect, edge: ResizeEdge, d: number, alt = false): void {
  const horiz = edge === 'left' || edge === 'right';
  const P = Math.max(horiz ? parent.w : parent.h, 0.001);
  const sKey = horiz ? 'left' : 'top';
  const eKey = horiz ? 'right' : 'bottom';
  const minSz = horiz ? node.minSize.x : node.minSize.y;
  const maxSz = horiz ? node.maxSize.x : node.maxSize.y;
  const a1 = node.anchors[sKey];
  const a2 = node.anchors[eKey];
  const isStart = edge === 'left' || edge === 'top';
  const K = isStart ? sKey : eKey; // 被拖的边

  if (alt) {
    // 改锚点：被拖边像素位置不动（偏移补偿），变父级缩放时的行为
    const r0 = computeRect(node, parent);
    const edgePx = isStart ? (horiz ? r0.x : r0.y) : (horiz ? r0.x + r0.w : r0.y + r0.h);
    const lo = horiz ? ANCHOR_H_MIN : ANCHOR_V_MIN;
    const hi = horiz ? ANCHOR_H_MAX : ANCHOR_V_MAX;
    const other = isStart ? a2 : a1;
    let na = node.anchors[K] + d / P;
    na = Math.max(lo, Math.min(hi, na));
    na = isStart ? Math.min(na, other) : Math.max(na, other);
    node.anchors[K] = na;
    node.offsets[K] = edgePx - na * P;
    return;
  }

  // 改偏移：只动被拖边（锚点不动），min/max 把被拖边夹到另一条边 ± 尺寸
  const r0 = computeRect(node, parent);
  const otherEdge = isStart ? (horiz ? r0.x + r0.w : r0.y + r0.h) : (horiz ? r0.x : r0.y);
  node.offsets[K] += d;
  const r = computeRect(node, parent);
  const size = horiz ? r.w : r.h;
  let newSize = size;
  if (maxSz > 0) newSize = Math.min(newSize, maxSz);
  newSize = Math.max(newSize, minSz);
  const target = isStart ? otherEdge - newSize : otherEdge + newSize;
  node.offsets[K] = target - node.anchors[K] * P;
}

/** 判断给定额外像素，节点最终位置是否发生变化（用于拖拽阈值判断）。 */
export function rectAfterMove(node: HdNode, parent: Rect, dx: number, dy: number): Rect {
  const clone = JSON.parse(JSON.stringify(node)) as HdNode;
  moveNode(clone, parent, dx, dy);
  return computeRect(clone, parent);
}

/**
 * 拖动锚点手柄（Godot 风格）：只改锚点，控件角在父级内的像素位置不动（偏移自动补偿）。
 * 这样拖完控件视觉位置不变，但锚点变了 → 父级缩放时行为随之改变。
 * @param zeroOffset 固定偏移为0：拖锚点时把所有偏移直接置 0（控件跟随锚点位置），不再补偿像素位置
 * dx/dy 为本次拖拽增量（父级像素坐标）。
 */
export function dragAnchor(node: HdNode, parent: Rect, corner: Corner, dx: number, dy: number, zeroOffset = false): void {
  const Px = Math.max(parent.w, 0.001);
  const Py = Math.max(parent.h, 0.001);
  // aKey 是水平锚点：tl/bl 属左侧角 → left，tr/br 属右侧角 → right
  const aKey = corner === 'tl' || corner === 'bl' ? 'left' : 'right';
  // bKey 是竖直锚点：tl/tr 属上侧角 → top，bl/br 属下侧角 → bottom
  const bKey = corner === 'tl' || corner === 'tr' ? 'top' : 'bottom';
  let na = node.anchors[aKey] + dx / Px;
  let nb = node.anchors[bKey] + dy / Py;
  // 钳制到允许范围：水平 [0,1]，竖直 [0, ANCHOR_V_MAX]（>1 允许滚动页）
  na = Math.max(ANCHOR_H_MIN, Math.min(ANCHOR_H_MAX, na));
  nb = Math.max(ANCHOR_V_MIN, Math.min(ANCHOR_V_MAX, nb));
  // 不与对侧锚点倒置
  const otherA = node.anchors[aKey === 'left' ? 'right' : 'left'];
  const otherB = node.anchors[bKey === 'top' ? 'bottom' : 'top'];
  na = aKey === 'left' ? Math.min(na, otherA) : Math.max(na, otherA);
  nb = bKey === 'top' ? Math.min(nb, otherB) : Math.max(nb, otherB);

  if (zeroOffset) {
    // 固定偏移为0：控件跟随锚点位置 —— 所有偏移归零
    node.anchors[aKey] = na;
    node.anchors[bKey] = nb;
    node.offsets.left = 0;
    node.offsets.top = 0;
    node.offsets.right = 0;
    node.offsets.bottom = 0;
    return;
  }

  // 角当前像素位置（拖拽过程中保持不动）
  const cornerX = parent.w * node.anchors[aKey] + node.offsets[aKey];
  const cornerY = parent.h * node.anchors[bKey] + node.offsets[bKey];
  node.anchors[aKey] = na;
  node.anchors[bKey] = nb;
  // 偏移补偿：角像素位置不变
  node.offsets[aKey] = cornerX - na * parent.w;
  node.offsets[bKey] = cornerY - nb * parent.h;
}
