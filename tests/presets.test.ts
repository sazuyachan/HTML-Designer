import { describe, expect, it } from 'vitest';
import { createNode } from '../src/core/schema';
import { computeRect } from '../src/core/layout';
import { applyPreset, findPreset, PRESETS } from '../src/core/presets';

const parent = { x: 0, y: 0, w: 800, h: 600 };

describe('presets', () => {
  it('共 9 个预设', () => {
    expect(PRESETS).toHaveLength(9);
  });

  it('应用预设后像素矩形不变', () => {
    const n = createNode('Control');
    n.anchors = { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 };
    n.offsets = { left: 10, top: 20, right: 210, bottom: 120 };
    const before = computeRect(n, parent);
    // 随便取一个不同的预设
    applyPreset(n, PRESETS[8], parent); // full rect
    const after = computeRect(n, parent);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(after.w).toBeCloseTo(before.w, 5);
    expect(after.h).toBeCloseTo(before.h, 5);
    expect(n.anchors).toEqual({ left: 0, top: 0, right: 1, bottom: 1 });
    expect(n.growH).toBe('BOTH');
  });

  it('应用右锚预设后 grow=BEGIN，保持矩形', () => {
    const n = createNode('Button');
    n.text = 'Btn';
    n.anchors = { left: 0, top: 0, right: 0, bottom: 0 };
    n.offsets = { left: 100, top: 50, right: 240, bottom: 100 };
    const before = computeRect(n, parent);
    applyPreset(n, PRESETS[1], parent); // top right
    expect(n.anchors.left).toBe(1);
    expect(n.anchors.right).toBe(1);
    expect(n.growH).toBe('BEGIN');
    const after = computeRect(n, parent);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.w).toBeCloseTo(before.w, 5);
    // 右上角像素位置不变
    expect(after.x + after.w).toBeCloseTo(before.x + before.w, 5);
  });

  it('findPreset 识别当前锚点配置', () => {
    const n = createNode('Control');
    n.anchors = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(findPreset(n)?.key).toBe('topLeft');
    n.anchors = { left: 0, top: 0, right: 1, bottom: 1 };
    expect(findPreset(n)?.key).toBe('fullRect');
    // 自定义锚点不匹配任何预设
    n.anchors = { left: 0.1, top: 0, right: 0.9, bottom: 1 };
    expect(findPreset(n)).toBeUndefined();
  });
});

