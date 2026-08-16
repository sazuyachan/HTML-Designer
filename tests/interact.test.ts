import { describe, expect, it } from 'vitest';
import type { HdNode } from '../src/core/types';
import { createNode } from '../src/core/schema';
import { computeRect } from '../src/core/layout';
import { dragAnchor, moveNode, resizeBy } from '../src/editor/interact';

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

  it('拉伸控件：改偏移，锚点不动', () => {
    const n = make({ anchors: { left: 0, top: 0, right: 0.5, bottom: 0.5 } });
    resizeBy(n, parent, 'right', 80);
    expect(n.anchors.right).toBeCloseTo(0.5, 5); // 锚点不动
    expect(n.offsets.right).toBeCloseTo(80, 5); // 只改偏移
    const r = computeRect(n, parent);
    expect(r.w).toBeCloseTo(480, 5);
    expect(r.x).toBe(0); // 左边缘保持不动
  });

  it('拉伸节点拖左边：改偏移，锚点不动，右边缘不动', () => {
    const n = make({ anchors: { left: 0.5, top: 0.5, right: 1, bottom: 1 } });
    resizeBy(n, parent, 'left', -40);
    expect(n.anchors.left).toBeCloseTo(0.5, 5); // 锚点不动
    const r = computeRect(n, parent);
    expect(r.w).toBeCloseTo(440, 5);
    expect(r.x + r.w).toBeCloseTo(800, 5); // 右边缘保持不动
  });

  it('拖左边：保持右边缘不动', () => {
    const n = make({ offsets: { left: 10, top: 20, right: 110, bottom: 70 } });
    resizeBy(n, parent, 'left', 20);
    expect(computeRect(n, parent).x).toBe(30);
    expect(computeRect(n, parent).x + computeRect(n, parent).w).toBe(110);
  });
});

describe('resizeBy Alt 互换模式（Godot：临时改锚点/改偏移）', () => {
  it('固定尺寸 + Alt 拖右边：改锚点，边像素不动（矩形不变）', () => {
    // 固定节点：锚点 (0.2,0.3,0.2,0.3)，偏移 → 矩形 x=200,y=240,w=200,h=120
    const n = make({
      anchors: { left: 0.2, top: 0.3, right: 0.2, bottom: 0.3 },
      offsets: { left: 40, top: 60, right: 240, bottom: 180 },
    });
    const before = computeRect(n, parent);
    resizeBy(n, parent, 'right', 80, true);
    expect(n.anchors.right).toBeCloseTo(0.3); // 锚点跟随拖拽
    expect(n.anchors.left).toBe(0.2); // 对侧锚点不动
    expect(n.offsets.right).toBeCloseTo(160); // 偏移补偿，边像素不动
    expect(computeRect(n, parent)).toEqual(before);
  });

  it('拉伸 + Alt 拖右边：改锚点，边像素不动（矩形不变）', () => {
    // 拉伸节点：锚点 (0.1,0.2,0.7,0.8)，偏移全 0 → 矩形 x=80,y=120,w=480,h=360
    const n = make({
      anchors: { left: 0.1, top: 0.2, right: 0.7, bottom: 0.8 },
      offsets: { left: 0, top: 0, right: 0, bottom: 0 },
    });
    const before = computeRect(n, parent);
    resizeBy(n, parent, 'right', 160, true);
    expect(n.anchors.right).toBeCloseTo(0.9); // 锚点跟随拖拽
    expect(n.offsets.right).toBeCloseTo(-160); // 偏移补偿，边像素不动
    expect(computeRect(n, parent)).toEqual(before);
  });

  it('拉伸 + Alt 拖过小：改锚点，视觉不变（尺寸不钳）', () => {
    const n = make({
      anchors: { left: 0.1, top: 0.2, right: 0.7, bottom: 0.8 },
      offsets: { left: 0, top: 0, right: 0, bottom: 0 },
      minSize: { x: 400, y: 0 },
    });
    const before = computeRect(n, parent);
    resizeBy(n, parent, 'right', -300, true);
    expect(n.anchors.right).toBeCloseTo(0.325); // 0.7 - 300/800
    expect(computeRect(n, parent)).toEqual(before); // 锚点模式不钳尺寸，视觉不动
  });
});

describe('dragAnchor（锚点手柄：只改锚点，控件不动）', () => {
  it('拖 tl：left/top 锚点跟随，角像素位置不变', () => {
    // 锚点 (0.2,0.3,0.6,0.7)，偏移 0 → 矩形 x=160,y=180,w=320,h=240
    const n = make({
      anchors: { left: 0.2, top: 0.3, right: 0.6, bottom: 0.7 },
      offsets: { left: 0, top: 0, right: 0, bottom: 0 },
    });
    const before = computeRect(n, parent);
    dragAnchor(n, parent, 'tl', 80, 120); // 80px→10% 宽，120px→20% 高
    expect(n.anchors.left).toBeCloseTo(0.3);
    expect(n.anchors.top).toBeCloseTo(0.5);
    expect(n.anchors.left * parent.w + n.offsets.left).toBeCloseTo(before.x);
    expect(n.anchors.top * parent.h + n.offsets.top).toBeCloseTo(before.y);
    expect(computeRect(n, parent)).toEqual(before);
  });

  it('拖 br：right/bottom 锚点跟随，角像素位置不变', () => {
    const n = make({
      anchors: { left: 0.2, top: 0.3, right: 0.6, bottom: 0.7 },
      offsets: { left: 0, top: 0, right: 0, bottom: 0 },
    });
    const before = computeRect(n, parent);
    dragAnchor(n, parent, 'br', -160, 60); // 160px→20% 宽，60px→10% 高
    expect(n.anchors.right).toBeCloseTo(0.4);
    expect(n.anchors.bottom).toBeCloseTo(0.8);
    expect(n.anchors.right * parent.w + n.offsets.right).toBeCloseTo(before.x + before.w);
    expect(n.anchors.bottom * parent.h + n.offsets.bottom).toBeCloseTo(before.y + before.h);
    expect(computeRect(n, parent)).toEqual(before);
  });

  it('拖 tr：right/top 锚点跟随，角像素位置不变', () => {
    const n = make({
      anchors: { left: 0.2, top: 0.3, right: 0.6, bottom: 0.7 },
      offsets: { left: 0, top: 0, right: 0, bottom: 0 },
    });
    const before = computeRect(n, parent);
    dragAnchor(n, parent, 'tr', -160, 120); // 160px→20% 宽，120px→20% 高
    expect(n.anchors.right).toBeCloseTo(0.4);
    expect(n.anchors.top).toBeCloseTo(0.5);
    expect(n.anchors.right * parent.w + n.offsets.right).toBeCloseTo(before.x + before.w);
    expect(n.anchors.top * parent.h + n.offsets.top).toBeCloseTo(before.y);
    expect(computeRect(n, parent)).toEqual(before);
  });

  it('拖 bl：left/bottom 锚点跟随，角像素位置不变', () => {
    const n = make({
      anchors: { left: 0.2, top: 0.3, right: 0.6, bottom: 0.7 },
      offsets: { left: 0, top: 0, right: 0, bottom: 0 },
    });
    const before = computeRect(n, parent);
    dragAnchor(n, parent, 'bl', 80, -60); // 80px→10% 宽，60px→10% 高
    expect(n.anchors.left).toBeCloseTo(0.3);
    expect(n.anchors.bottom).toBeCloseTo(0.6);
    expect(n.anchors.left * parent.w + n.offsets.left).toBeCloseTo(before.x);
    expect(n.anchors.bottom * parent.h + n.offsets.bottom).toBeCloseTo(before.y + before.h);
    expect(computeRect(n, parent)).toEqual(before);
  });

  it('锚点不越过对侧：拖 tl 越过 right 被钳制', () => {
    const n = make({
      anchors: { left: 0.2, top: 0.3, right: 0.8, bottom: 0.9 },
      offsets: { left: 0, top: 0, right: 0, bottom: 0 },
    });
    dragAnchor(n, parent, 'tl', 800, 800); // 大幅拖向对侧
    expect(n.anchors.left).toBeLessThanOrEqual(n.anchors.right);
    expect(n.anchors.top).toBeLessThanOrEqual(n.anchors.bottom);
    expect(n.anchors.left).toBeCloseTo(0.8); // 钳到 right
    expect(computeRect(n, parent).x).toBeCloseTo(160); // 左角像素仍不动
  });

  it('竖直锚点允许超过 1（滚动页），水平仍夹在 [0,1]', () => {
    const n = make({
      anchors: { left: 0.2, top: 1, right: 0.2, bottom: 1 }, // 固定尺寸，右下角锚点
      offsets: { left: 100, top: 0, right: 300, bottom: 200 },
    });
    dragAnchor(n, parent, 'br', 0, 600); // 垂直拖 600px→100% 高 → bottom 锚点 2
    expect(n.anchors.bottom).toBeCloseTo(2);
    dragAnchor(n, parent, 'br', 800, 0); // 水平拖 800px → 被夹在 1
    expect(n.anchors.right).toBeCloseTo(1);
  });

  it('zeroOffset：拖锚点把所有偏移归零，控件跟随锚点位置', () => {
    const n = make({
      anchors: { left: 0.2, top: 0.3, right: 0.6, bottom: 0.7 },
      offsets: { left: 10, top: 20, right: 110, bottom: 70 },
    });
    dragAnchor(n, parent, 'tl', 80, 120, true); // 80px→10% 宽，120px→20% 高
    expect(n.anchors.left).toBeCloseTo(0.3);
    expect(n.anchors.top).toBeCloseTo(0.5);
    expect(n.offsets).toEqual({ left: 0, top: 0, right: 0, bottom: 0 }); // 偏移全归零
    // 角位置 = 锚点 × 父级尺寸（跟随锚点，而非补偿保持不动）
    const r = computeRect(n, parent);
    expect(r.x).toBeCloseTo(0.3 * parent.w, 5);
    expect(r.y).toBeCloseTo(0.5 * parent.h, 5);
  });

  it('zeroOffset：锚点钳制后仍偏移全 0', () => {
    const n = make({ anchors: { left: 0.2, top: 0.3, right: 0.8, bottom: 0.9 } });
    dragAnchor(n, parent, 'tl', 800, 800, true); // 大幅拖向对侧
    expect(n.anchors.left).toBeCloseTo(0.8); // 钳到 right
    expect(n.offsets).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
});
