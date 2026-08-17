import { describe, expect, it } from 'vitest';
import type { HdNode } from '../src/core/types';
import { createNode, createProject } from '../src/core/schema';
import { computeRect } from '../src/core/layout';
import { buildCss } from '../src/export/css';
import { buildHtml } from '../src/export/html';
import { stubMeasure } from '../src/export/measure';

const measure = stubMeasure();

function make(type: HdNode['type'], overrides: Partial<HdNode> = {}): HdNode {
  const n = createNode(type);
  return {
    ...n,
    ...overrides,
    anchors: { ...n.anchors, ...(overrides.anchors ?? {}) },
    offsets: { ...n.offsets, ...(overrides.offsets ?? {}) },
    minSize: { ...n.minSize, ...(overrides.minSize ?? {}) },
    maxSize: { ...n.maxSize, ...(overrides.maxSize ?? {}) },
    children: overrides.children ?? [],
  };
}

describe('buildCss 锚点 → calc()', () => {
  it('拉伸控件：left/top/width/height 均用 calc', () => {
    const p = createProject('t', 800, 600);
    const n = make('Control', {
      anchors: { left: 0.3, top: 0.2, right: 0.7, bottom: 0.8 },
      offsets: { left: 10, top: 5, right: -8, bottom: 0 },
    });
    p.root.children.push(n);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${n.id}`))!;
    expect(rule).toContain('position:absolute');
    expect(rule).toContain('left:calc(30% + 10px)');
    expect(rule).toContain('top:calc(20% + 5px)');
    expect(rule).toContain('width:calc(40% - 18px)');
    expect(rule).toContain('height:calc(60% - 5px)');
  });

  it('grow=BEGIN（右锚）用 right/bottom', () => {
    const p = createProject('t', 800, 600);
    const n = make('Control', {
      anchors: { left: 1, top: 0, right: 1, bottom: 0 },
      offsets: { left: -120, top: 10, right: 0, bottom: 60 },
      growH: 'BEGIN',
      growV: 'END',
    });
    p.root.children.push(n);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${n.id}`))!;
    expect(rule).toContain('right:0px');
    expect(rule).toContain('width:120px');
    expect(rule).toContain('top:10px');
    expect(rule).toContain('height:50px');
  });

  it('min/max 尺寸钳制', () => {
    const p = createProject('t', 800, 600);
    const n = make('Control', {
      anchors: { left: 0, top: 0, right: 0.5, bottom: 0.5 },
      offsets: { left: 0, top: 0, right: 0, bottom: 0 },
      minSize: { x: 100, y: 120 },
      maxSize: { x: 300, y: 0 },
    });
    p.root.children.push(n);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${n.id}`))!;
    expect(rule).toContain('min-width:100px');
    expect(rule).toContain('min-height:120px');
    expect(rule).toContain('max-width:300px');
  });

  it('grow=BOTH 未钳制：left/top 定位中心 + translate（位置与模型一致）', () => {
    const p = createProject('t', 800, 600);
    const n = make('Control', {
      anchors: { left: 0.3, top: 0.2, right: 0.7, bottom: 0.6 },
      offsets: { left: 10, top: 5, right: 30, bottom: 15 },
      growH: 'BOTH',
      growV: 'BOTH',
    });
    p.root.children.push(n);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${n.id}`))!;
    expect(rule).toContain('left:calc(50% + 20px)');
    expect(rule).toContain('width:calc(40% + 20px)');
    expect(rule).toContain('top:calc(40% + 10px)');
    expect(rule).toContain('height:calc(40% + 10px)');
    expect(rule).toContain('transform:translateX(-50%) translateY(-50%)');
    expect(rule).not.toContain('right:');
    expect(rule).not.toContain('margin-left:auto');
    // 与模型同款：盒子中心 = left/top 定位点（未钳制时 translate 后位置与 END 完全一致）
    expect(computeRect(n, { x: 0, y: 0, w: 800, h: 600 })).toEqual({ x: 250, y: 125, w: 340, h: 250 });
  });

  it('growH=BOTH 被 min-width 钳制：translate 让中心不动', () => {
    const p = createProject('t', 800, 600);
    const n = make('Control', {
      anchors: { left: 0, top: 0, right: 0.5, bottom: 0.5 },
      minSize: { x: 500, y: 0 },
      growH: 'BOTH',
    });
    p.root.children.push(n);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${n.id}`))!;
    // left 定位中心（25%）+ min-width 把宽度撑过 50% → translateX(-50%) 按已用宽度平移，中心不动
    expect(rule).toContain('left:25%');
    expect(rule).toContain('width:50%');
    expect(rule).toContain('min-width:500px');
    expect(rule).toContain('transform:translateX(-50%)');
    expect(rule).not.toContain('right:');
    // 模型同款 BOTH 中心钳制：clamp 后中心仍在 25%（=200px），盒子 [-50, 450]
    expect(computeRect(n, { x: 0, y: 0, w: 800, h: 600 })).toEqual({ x: -50, y: 0, w: 500, h: 300 });
  });
});

describe('buildCss 容器 → flexbox', () => {
  it('HBox 与子节点', () => {
    const p = createProject('t', 800, 600);
    const btn = make('Button', { text: 'OK' });
    const spacer = make('Spacer', { sizeFlags: { expandMain: true, ratio: 1, alignCross: 'fill' } });
    const h = make('HBox', {
      container: { separation: 4, alignCross: 'fill' },
      anchors: { left: 0, top: 0, right: 0, bottom: 0 },
      offsets: { left: 10, top: 10, right: 310, bottom: 60 },
      children: [btn, spacer],
    });
    p.root.children.push(h);
    const css = buildCss(p, { mode: 'export' }, measure);

    const hRule = css.split('\n').find((l) => l.startsWith(`.hd-${h.id}`))!;
    expect(hRule).toContain('display:flex');
    expect(hRule).toContain('flex-direction:row');
    expect(hRule).toContain('gap:4px');
    expect(hRule).toContain('align-items:stretch');

    const btnRule = css.split('\n').find((l) => l.startsWith(`.hd-${btn.id}`))!;
    expect(btnRule).toContain('flex:0 0 auto');
    expect(btnRule).toContain('align-self:stretch');

    const spacerRule = css.split('\n').find((l) => l.startsWith(`.hd-${spacer.id}`))!;
    expect(spacerRule).toContain('flex:1 0 0');
  });
});

describe('buildCss 组件样式', () => {
  it('按钮：重置外观 + hover', () => {
    const p = createProject('t');
    const b = make('Button', { text: 'Go' });
    p.root.children.push(b);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${b.id}`))!;
    expect(rule).toContain('appearance:none');
    expect(rule).toContain('cursor:pointer');
    expect(rule).toContain('justify-content:center');
    expect(css).toContain(`.hd-${b.id}:hover`);
  });

  it('复选框：自定义外观', () => {
    const p = createProject('t');
    const c = make('CheckBox', { text: 'Option' });
    p.root.children.push(c);
    const css = buildCss(p, { mode: 'export' }, measure);
    expect(css).toContain(`.hd-${c.id} input[type=checkbox]{`);
    expect(css).toContain(`.hd-${c.id} input[type=checkbox]:checked{`);
  });

  it('LineEdit：focus 高亮', () => {
    const p = createProject('t');
    const le = make('LineEdit', { text: '', placeholder: 'Type' });
    p.root.children.push(le);
    const css = buildCss(p, { mode: 'export' }, measure);
    expect(css).toContain(`.hd-${le.id}:focus`);
  });

  it('Label：nowrap', () => {
    const p = createProject('t');
    const l = make('Label', { text: 'Hi' });
    p.root.children.push(l);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((x) => x.startsWith(`.hd-${l.id}`))!;
    expect(rule).toContain('white-space:nowrap');
  });
});

describe('buildCss 根节点', () => {
  it('导出模式根占满窗口', () => {
    const p = createProject('t', 1280, 720);
    const css = buildCss(p, { mode: 'export' }, measure);
    expect(css).toContain('.hd-root{position:fixed;left:0;top:0;right:0;bottom:0}');
  });
  it('编辑模式根为参考尺寸', () => {
    const p = createProject('t', 1280, 720);
    const css = buildCss(p, { mode: 'editor' }, measure);
    expect(css).toContain('.hd-root{position:relative;width:1280px;height:720px}');
    expect(css).toContain('.hd-canvas{user-select:none');
  });
});

describe('buildHtml', () => {
  it('生成完整单文件，无脚本', () => {
    const p = createProject('Demo', 1280, 720);
    const btn = make('Button', { text: '点击' });
    p.root.children.push(btn);
    const html = buildHtml(p, measure);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('.hd-root{position:fixed');
    expect(html).toContain(`<button type="button" class="hd-${btn.id}" data-hd="${btn.id}">点击</button>`);
    expect(html).toContain('</html>');
    expect(html).not.toContain('<script');
    expect(html).toContain('<title>Demo</title>');
  });

  it('HTML 转义', () => {
    const p = createProject('x');
    const l = make('Label', { text: '<b>&"q"</b>' });
    p.root.children.push(l);
    const html = buildHtml(p, measure);
    expect(html).toContain('&lt;b&gt;&amp;&quot;q&quot;&lt;/b&gt;');
  });
});
