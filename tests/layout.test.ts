import { describe, expect, it } from 'vitest';
import type { HdNode } from '../src/core/types';
import { createNode } from '../src/core/schema';
import { clampAxis, computeLayout, computeRect, layoutContainer, minSizeFor } from '../src/core/layout';
import { createProject } from '../src/core/schema';
import { stubMeasure } from '../src/export/measure';

const measure = stubMeasure();

function make(overrides: Partial<HdNode> = {}): HdNode {
  const n = createNode('Control');
  return {
    ...n,
    ...overrides,
    anchors: { ...n.anchors, ...(overrides.anchors ?? {}) },
    offsets: { ...n.offsets, ...(overrides.offsets ?? {}) },
    minSize: { ...n.minSize, ...(overrides.minSize ?? {}) },
    maxSize: { ...n.maxSize, ...(overrides.maxSize ?? {}) },
    theme: { ...n.theme, ...(overrides.theme ?? {}) },
    children: overrides.children ?? [],
  };
}

describe('computeRect 锚点数学', () => {
  it('固定尺寸：锚点 0 + 偏移', () => {
    const n = make({ anchors: { left: 0, top: 0, right: 0, bottom: 0 }, offsets: { left: 10, top: 20, right: 110, bottom: 70 } });
    expect(computeRect(n, { x: 0, y: 0, w: 800, h: 600 })).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it('拉伸：锚点百分比', () => {
    const n = make({ anchors: { left: 0.5, top: 0.5, right: 1, bottom: 1 }, offsets: { left: 0, top: 0, right: 0, bottom: 0 } });
    expect(computeRect(n, { x: 0, y: 0, w: 800, h: 600 })).toEqual({ x: 400, y: 300, w: 400, h: 300 });
  });

  it('锚点 + 偏移混合', () => {
    const n = make({
      anchors: { left: 0.25, top: 0.25, right: 0.75, bottom: 0.75 },
      offsets: { left: 10, top: 5, right: -10, bottom: -5 },
    });
    expect(computeRect(n, { x: 0, y: 0, w: 800, h: 600 })).toEqual({ x: 210, y: 155, w: 380, h: 290 });
  });
});

describe('clampAxis 与 grow 方向', () => {
  it('min 扩展：grow=END 时 start 边钉住', () => {
    expect(clampAxis(0, 50, 100, 0, 'END')).toEqual([0, 100]);
  });
  it('min 扩展：grow=BEGIN 时 end 边钉住', () => {
    expect(clampAxis(0, 50, 100, 0, 'BEGIN')).toEqual([-50, 50]);
  });
  it('min 扩展：grow=BOTH 中心钉住', () => {
    expect(clampAxis(0, 50, 100, 0, 'BOTH')).toEqual([-25, 75]);
  });
  it('max 收缩：grow=END 时 start 边钉住', () => {
    expect(clampAxis(0, 200, 0, 100, 'END')).toEqual([0, 100]);
  });
  it('max 收缩：grow=BEGIN 时 end 边钉住', () => {
    expect(clampAxis(0, 200, 0, 100, 'BEGIN')).toEqual([100, 200]);
  });
  it('computeRect 集成 clamp', () => {
    const n = make({
      anchors: { left: 0, top: 0, right: 0, bottom: 0 },
      offsets: { left: 0, top: 0, right: 50, bottom: 50 },
      minSize: { x: 100, y: 100 },
      growH: 'END',
      growV: 'END',
    });
    expect(computeRect(n, { x: 0, y: 0, w: 800, h: 600 })).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });
});

describe('minSizeFor', () => {
  it('Label 按文本测量', () => {
    const n = createNode('Label');
    n.text = 'Hello';
    const m = minSizeFor(n, measure);
    expect(m.x).toBeGreaterThan(0);
    expect(m.y).toBe(Math.ceil(14 * 1.4));
  });
  it('Button 加 padding', () => {
    const n = createNode('Button');
    n.text = 'Btn';
    n.theme.padding = 6;
    const t = measure.text('Btn', { fontSize: 14, bold: false });
    const m = minSizeFor(n, measure);
    expect(m.x).toBeCloseTo(t.x + 12, 1);
  });
  it('HBox 子项之和 + 间距', () => {
    const a = createNode('Label');
    a.text = 'AA';
    a.theme.fontSize = 14;
    const b = createNode('Label');
    b.text = 'BB';
    b.theme.fontSize = 14;
    const h = createNode('HBox');
    h.container = { separation: 4, alignCross: 'fill' };
    h.children = [a, b];
    const ma = minSizeFor(a, measure);
    const mb = minSizeFor(b, measure);
    const m = minSizeFor(h, measure);
    expect(m.x).toBeCloseTo(ma.x + mb.x + 4, 1);
    expect(m.y).toBeCloseTo(Math.max(ma.y, mb.y), 1);
  });
});

describe('layoutContainer', () => {
  it('HBox 无扩展：子节点取最小尺寸，按间距排布，交叉轴填满', () => {
    const a = make({ minSize: { x: 80, y: 30 } });
    const b = make({ minSize: { x: 80, y: 30 } });
    const h = make({ type: 'HBox', container: { separation: 4, alignCross: 'fill' }, children: [a, b] }) as HdNode;
    const out = layoutContainer(h, { x: 0, y: 0, w: 300, h: 40 }, measure);
    expect(out).toHaveLength(2);
    expect(out[0].rect).toEqual({ x: 0, y: 0, w: 80, h: 40 });
    expect(out[1].rect).toEqual({ x: 84, y: 0, w: 80, h: 40 });
  });

  it('HBox 有扩展：多余空间分给 expand 子节点', () => {
    const btn = make({ minSize: { x: 80, y: 30 } });
    const spacer = make({ minSize: { x: 0, y: 0 }, sizeFlags: { expandMain: true, ratio: 1, alignCross: 'fill' } });
    const h = make({ type: 'HBox', container: { separation: 4, alignCross: 'fill' }, children: [btn, spacer] }) as HdNode;
    const out = layoutContainer(h, { x: 0, y: 0, w: 300, h: 40 }, measure);
    expect(out[0].rect).toEqual({ x: 0, y: 0, w: 80, h: 40 });
    // 300 - 80 - 4 = 216 全部分给 spacer
    expect(out[1].rect.x).toBeCloseTo(84, 5);
    expect(out[1].rect.w).toBeCloseTo(216, 5);
  });

  it('VBox 垂直排布', () => {
    const a = make({ minSize: { x: 50, y: 30 } });
    const b = make({ minSize: { x: 50, y: 30 } });
    const v = make({ type: 'VBox', container: { separation: 0, alignCross: 'fill' }, children: [a, b] }) as HdNode;
    const out = layoutContainer(v, { x: 0, y: 0, w: 100, h: 100 }, measure);
    expect(out[0].rect).toEqual({ x: 0, y: 0, w: 100, h: 30 });
    expect(out[1].rect).toEqual({ x: 0, y: 30, w: 100, h: 30 });
  });

  it('空间不足：保留最小尺寸并溢出', () => {
    const a = make({ minSize: { x: 80, y: 30 } });
    const b = make({ minSize: { x: 80, y: 30 } });
    const h = make({ type: 'HBox', container: { separation: 4, alignCross: 'fill' }, children: [a, b] }) as HdNode;
    const out = layoutContainer(h, { x: 0, y: 0, w: 100, h: 40 }, measure);
    expect(out[0].rect.w).toBe(80);
    expect(out[1].rect.x).toBe(84); // 溢出到容器外
  });
});

describe('computeLayout', () => {
  it('遍历整棵树，记录 rect 与 parent', () => {
    const p = createProject('t', 800, 600);
    const btn = createNode('Button');
    btn.text = 'OK';
    const hbox = createNode('HBox');
    hbox.anchors = { left: 0, top: 0, right: 0, bottom: 0 };
    hbox.offsets = { left: 10, top: 10, right: 410, bottom: 60 };
    hbox.children = [btn];
    p.root.children.push(hbox);

    const layout = computeLayout(p, measure);
    const hrect = layout.rects.get(hbox.id)!;
    expect(hrect.w).toBe(400);
    expect(layout.parentOf.get(btn.id)).toBe(hbox.id);
    // btn 在容器内被布局
    const brect = layout.rects.get(btn.id)!;
    expect(brect).toBeDefined();
  });
});
