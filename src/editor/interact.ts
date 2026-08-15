// 拖拽/缩放的纯函数（编辑器的交互数学）。返回是否发生了可感知的移动。

import type { HdNode, Rect } from '../core/types';
import { computeRect } from '../core/layout';

export type ResizeEdge = 'left' | 'right' | 'top' | 'bottom';

/**
 * 移动节点。每轴独立：
 *  - 固定尺寸（a1===a2）：偏移量平移（尺寸不变）
 *  - 拉伸（a1<a2）：锚点平移（span 不变），越界时整体平移夹到 [0,1]
 */
export function moveNode(node: HdNode, parent: Rect, dx: number, dy: number): void {
  moveAxis(node, 'left', 'right', dx, parent.w);
  moveAxis(node, 'top', 'bottom', dy, parent.h);
}

function moveAxis(node: HdNode, sKey: 'left' | 'top', eKey: 'right' | 'bottom', d: number, parentSize: number): void {
  const P = Math.max(parentSize, 0.001);
  const a1 = node.anchors[sKey];
  const a2 = node.anchors[eKey];
  if (a1 === a2) {
    node.offsets[sKey] += d;
    node.offsets[eKey] += d;
  } else {
    let na1 = a1 + d / P;
    let na2 = a2 + d / P;
    if (na1 < 0) {
      na2 -= na1;
      na1 = 0;
    } else if (na2 > 1) {
      na1 -= na2 - 1;
      na2 = 1;
    }
    node.anchors[sKey] = na1;
    node.anchors[eKey] = na2;
  }
}

/**
 * 按边缘缩放。固定尺寸改 offset，拉伸改对应锚点；随后用 min/max 反向夹紧被拖的边。
 */
export function resizeBy(node: HdNode, parent: Rect, edge: ResizeEdge, d: number): void {
  const horiz = edge === 'left' || edge === 'right';
  const P = Math.max(horiz ? parent.w : parent.h, 0.001);
  const sKey = horiz ? 'left' : 'top';
  const eKey = horiz ? 'right' : 'bottom';
  const minSz = horiz ? node.minSize.x : node.minSize.y;
  const maxSz = horiz ? node.maxSize.x : node.maxSize.y;
  const a1 = node.anchors[sKey];
  const a2 = node.anchors[eKey];
  const isStart = edge === 'left' || edge === 'top';

  // 1) 移动被拖的边
  if (a1 === a2) {
    node.offsets[isStart ? sKey : eKey] += d;
  } else {
    if (isStart) {
      node.anchors[sKey] = Math.min(a1 + d / P, a2 - 0.0001);
    } else {
      node.anchors[eKey] = Math.max(a2 + d / P, a1 + 0.0001);
    }
  }

  // 2) 用 min/max 夹紧：另一条边不动，被拖边定位到夹紧后的位置
  const r = computeRect(node, parent);
  const size = horiz ? r.w : r.h;
  const other = isStart
    ? horiz
      ? r.x + r.w
      : r.y + r.h
    : horiz
      ? r.x
      : r.y;
  let newSize = size;
  if (maxSz > 0) newSize = Math.min(newSize, maxSz);
  newSize = Math.max(newSize, minSz);
  const target = isStart ? other - newSize : other + newSize;

  if (a1 === a2) {
    const anchorVal = node.anchors[sKey];
    node.offsets[isStart ? sKey : eKey] = target - anchorVal * P;
  } else {
    const o = node.offsets[isStart ? sKey : eKey];
    node.anchors[isStart ? sKey : eKey] = (target - o) / P;
  }
}

/** 判断给定额外像素，节点最终位置是否发生变化（用于拖拽阈值判断）。 */
export function rectAfterMove(node: HdNode, parent: Rect, dx: number, dy: number): Rect {
  const clone = JSON.parse(JSON.stringify(node)) as HdNode;
  moveNode(clone, parent, dx, dy);
  return computeRect(clone, parent);
}
