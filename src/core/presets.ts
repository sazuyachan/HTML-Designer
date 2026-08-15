// 锚点预设（9 个 Godot 预设）+ 应用逻辑（保持像素矩形不变）

import type { Anchors, GrowDir, HdNode, Rect } from './types';
import { computeRect } from './layout';

export interface AnchorPreset {
  key: string;
  label: string;
  anchors: Anchors;
  growH: GrowDir;
  growV: GrowDir;
}

export const PRESETS: AnchorPreset[] = [
  { key: 'topLeft', label: '左上', anchors: { left: 0, top: 0, right: 0, bottom: 0 }, growH: 'END', growV: 'END' },
  { key: 'topRight', label: '右上', anchors: { left: 1, top: 0, right: 1, bottom: 0 }, growH: 'BEGIN', growV: 'END' },
  { key: 'bottomLeft', label: '左下', anchors: { left: 0, top: 1, right: 0, bottom: 1 }, growH: 'END', growV: 'BEGIN' },
  { key: 'bottomRight', label: '右下', anchors: { left: 1, top: 1, right: 1, bottom: 1 }, growH: 'BEGIN', growV: 'BEGIN' },
  { key: 'topWide', label: '上横', anchors: { left: 0, top: 0, right: 1, bottom: 0 }, growH: 'BOTH', growV: 'END' },
  { key: 'bottomWide', label: '下横', anchors: { left: 0, top: 1, right: 1, bottom: 1 }, growH: 'BOTH', growV: 'BEGIN' },
  { key: 'leftWide', label: '左竖', anchors: { left: 0, top: 0, right: 0, bottom: 1 }, growH: 'END', growV: 'BOTH' },
  { key: 'rightWide', label: '右竖', anchors: { left: 1, top: 0, right: 1, bottom: 1 }, growH: 'BEGIN', growV: 'BOTH' },
  { key: 'fullRect', label: '全屏', anchors: { left: 0, top: 0, right: 1, bottom: 1 }, growH: 'BOTH', growV: 'BOTH' },
];

export function findPreset(node: HdNode): AnchorPreset | undefined {
  return PRESETS.find(
    (p) =>
      node.anchors.left === p.anchors.left &&
      node.anchors.top === p.anchors.top &&
      node.anchors.right === p.anchors.right &&
      node.anchors.bottom === p.anchors.bottom,
  );
}

/**
 * 应用锚点预设：读取当前像素矩形 → 设置预设锚点与 grow → 反推 offset 保持矩形不变。
 */
export function applyPreset(node: HdNode, preset: AnchorPreset, parent: Rect): void {
  const r = computeRect(node, parent);
  node.anchors = { ...preset.anchors };
  node.growH = preset.growH;
  node.growV = preset.growV;
  node.offsets.left = r.x - parent.w * preset.anchors.left;
  node.offsets.top = r.y - parent.h * preset.anchors.top;
  node.offsets.right = r.x + r.w - parent.w * preset.anchors.right;
  node.offsets.bottom = r.y + r.h - parent.h * preset.anchors.bottom;
}
