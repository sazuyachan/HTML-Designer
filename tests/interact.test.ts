import { describe, expect, it } from 'vitest';
import type { HdNode } from '../src/core/types';
import { createNode } from '../src/core/schema';
import { computeRect } from '../src/core/layout';
import { moveNode, resizeBy } from '../src/editor/interact';

const parent = { x: 0, y: 0, w: 800, h: 600 };

function make(overrides: Partial<HdNode> = {}): HdNode {
  const n = createNode('Control');
  return {
    ...n,
    ...overrides,
    anchors: { ...n.anchors, ...(overrides.anchors ?? {}) },
    offsets: { ...n.offsets, ...(overrides.offsets ?? {}) },
    minSize: { ...n.minSize, ...(overrides.minSize ?? {}) },
    maxSize: { ...n.maxSize, ...(overrides.maxSize ?? {}) },
  };
}

describe('moveNode', () => {
  it('固定尺寸：偏移量平移，尺寸不变', () => {
    const n = make({ offsets: { left: 10, top: 20, right: 110, bottom: 70 } });
    moveNode(n, parent, 5, 3);
    expect(n.offsets).toEqual({ left: 15, top: 23, right: 115, bottom: 73 });
    const r = computeRect(n, parent);
    expect(r.w).toBe(100);
    expect(r.h).toBe(50);
  });

  it('拉伸：锚点平移，span 不变', () => {
    const n = make({ anchors: { left: 0.5, top: 0.5, right: 1, bottom: 1 } });
    moveNode(n, parent, -40, -30);
    expect(n.anchors.left).toBeCloseTo(0.45, 6);
    expect(n.anchors.top).toBeCloseTo(0.45, 6);
    expect(n.anchors.right).toBeCloseTo(0.95, 6);
    expect(n.anchors.bottom).toBeCloseTo(0.95, 6);
    const r = computeRect(n, parent);
    expect(r.w).toBe(400);
    expect(r.h).toBe(300);
  });

  it('拉伸到边界：整体平移夹到 [0,1]', () => {
    const n = make({ anchors: { left: 0.5, top: 0, right: 1, bottom: 0.5 } });
    moveNode(n, parent, 400, 0);
    // 右边界已到 1，向右拖 400px 会整体平移回去，保持 span
    expect(n.anchors.left).toBeCloseTo(0.5, 6);
    expect(n.anchors.right).toBeCloseTo(1, 6);
  });
});

describe('resizeBy', () => {
  it('固定尺寸：改偏移，尺寸变化', () => {
    const n = make({ offsets: { left: 10, top: 20, right: 110, bottom: 70 } });
    resizeBy(n, parent, 'right', 20);
    expect(n.offsets.right).toBe(130);
    expect(computeRect(n, parent).w).toBe(120);
  });

  it('min 钳制：拖不过最小尺寸', () => {
    const n = make({ offsets: { left: 10, top: 20, right: 110, bottom: 70 }, minSize: { x: 100, y: 50 } });
    resizeBy(n, parent, 'right', -30);
    expect(computeRect(n, parent).w).toBe(100);
    expect(computeRect(n, parent).x).toBe(10);
    // 被拖边被夹回：右边缘 = 左边缘 + min
    expect(n.offsets.right).toBeCloseTo(110, 5);
  });

  it('max 钳制：拖不过最大尺寸', () => {
    const n = make({ offsets: { left: 10, top: 20, right: 110, bottom: 70 }, maxSize: { x: 80, y: 0 } });
    resizeBy(n, parent, 'right', 50);
    expect(computeRect(n, parent).w).toBe(80);
    expect(computeRect(n, parent).x).toBe(10);
  });

  it('拉伸控件：改锚点', () => {
    const n = make({ anchors: { left: 0, top: 0, right: 0.5, bottom: 0.5 } });
    resizeBy(n, parent, 'right', 80);
    expect(computeRect(n, parent).w).toBeCloseTo(480, 5);
    expect(n.anchors.right).toBeCloseTo(0.6, 5);
  });

  it('拖左边：保持右边缘不动', () => {
    const n = make({ offsets: { left: 10, top: 20, right: 110, bottom: 70 } });
    resizeBy(n, parent, 'left', 20);
    expect(computeRect(n, parent).x).toBe(30);
    expect(computeRect(n, parent).x + computeRect(n, parent).w).toBe(110);
  });
});
