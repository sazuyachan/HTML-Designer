// 新功能测试：滚动页面（竖直锚点 >1）、Image 节点（嵌入/外链）、Scroll 容器
import { describe, expect, it } from 'vitest';
import type { HdNode } from '../src/core/types';
import { createNode, createProject } from '../src/core/schema';
import { buildCss } from '../src/export/css';
import { buildHtml } from '../src/export/html';
import { buildMarkup } from '../src/export/markup';
import { stubMeasure } from '../src/export/measure';
import { contentExtent } from '../src/core/layout';
import { collectExternalImages, hasExternalImages } from '../src/export/images';
import { moveNode } from '../src/editor/interact';

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

describe('contentExtent（滚动页检测）', () => {
  it('无超出内容 → 0', () => {
    const p = createProject('t', 800, 600);
    p.root.children.push(make('Control', { anchors: { left: 0, top: 0, right: 1, bottom: 1 } }));
    expect(contentExtent(p, measure)).toBe(0);
  });

  it('竖直锚点超过 1 的内容 → 返回超出高度', () => {
    const p = createProject('t', 800, 600);
    // top:1 bottom:1.5 → y=600 h=300 → 底部 900，超出 300
    p.root.children.push(make('Control', { anchors: { left: 0, top: 1, right: 1, bottom: 1.5 } }));
    expect(contentExtent(p, measure)).toBe(300);
  });

  it('大偏移把节点推到首屏下方 → 计入', () => {
    const p = createProject('t', 800, 600);
    p.root.children.push(make('Control', {
      anchors: { left: 0, top: 1, right: 1, bottom: 1 },
      offsets: { left: 0, top: 100, right: 0, bottom: 400 }, // y=700 h=300 → 底部 1000
    }));
    expect(contentExtent(p, measure)).toBe(400);
  });

  it('Scroll 容器子树内部溢出 → 忽略（靠容器自身滚动条）', () => {
    const p = createProject('t', 800, 600);
    const scroll = make('Scroll', {
      anchors: { left: 0, top: 0, right: 1, bottom: 1 },
      scroll: { dir: 'v' },
      // Scroll 是 flex 容器：子节点无锚点概念，靠容器滚动条查看溢出 → 不计入页面高度
      children: [make('Control', { minSize: { x: 0, y: 3000 } })],
    });
    p.root.children.push(scroll);
    expect(contentExtent(p, measure)).toBe(0);
  });

  it('Scroll 容器自身延伸到视口下方 → 计入', () => {
    const p = createProject('t', 800, 600);
    p.root.children.push(make('Scroll', { anchors: { left: 0, top: 1, right: 1, bottom: 1.5 } }));
    expect(contentExtent(p, measure)).toBe(300);
  });
});

describe('滚动页导出 CSS（竖直锚点 >1）', () => {
  it('导出：根节点增高可滚，垂直方向用像素', () => {
    const p = createProject('t', 800, 600);
    const n = make('Control', { anchors: { left: 0, top: 1, right: 1, bottom: 1.5 } });
    p.root.children.push(n);
    const css = buildCss(p, { mode: 'export' }, measure);
    expect(css).toContain('.hd-root{position:relative;width:100%;height:900px}');
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${n.id}`))!;
    expect(rule).toContain('top:600px');
    expect(rule).toContain('height:300px');
    // 水平方向仍随窗口宽度响应（百分比）
    expect(rule).toContain('left:0px');
    expect(rule).toContain('width:100%');
  });

  it('编辑器：根节点同样增高成一张连续的纸，垂直用像素（与导出一致 → WYSIWYG）', () => {
    const p = createProject('t', 800, 600);
    const n = make('Control', { anchors: { left: 0, top: 1, right: 1, bottom: 1.5 } });
    p.root.children.push(n);
    const css = buildCss(p, { mode: 'editor' }, measure);
    expect(css).toContain('.hd-root{position:relative;width:800px;height:900px}');
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${n.id}`))!;
    expect(rule).toContain('top:600px');
    expect(rule).toContain('height:300px');
  });

  it('滚动页 + fixedScale：按参考宽缩放包装（hd-fit/hd-scaler），仍纵向可滚', () => {
    const p = createProject('t', 800, 600);
    p.root.children.push(make('Control', { anchors: { left: 0, top: 1, right: 1, bottom: 1.5 } }));
    const html = buildHtml(p, measure, { fixedScale: true });
    expect(html).toContain('class="hd-fit"');
    expect(html).toContain('class="hd-scaler"');
    // 根用固定参考宽（供按 100vw/W 缩放），高度 = H+ext
    expect(html).toContain('.hd-root{position:relative;width:800px;height:900px}');
    // 按宽缩放 + 纵向滚动
    expect(html).toContain('.hd-fit{position:fixed;inset:0;overflow-y:auto;overflow-x:hidden}');
    expect(html).toContain('.hd-scaler{width:100vw;height:calc(100vw / 800px * 900px);transform:scale(calc(100vw / 800px));transform-origin:top left}');
  });

  it('滚动页 + fixedScale：buildCss 根用固定参考宽', () => {
    const p = createProject('t', 800, 600);
    p.root.children.push(make('Control', { anchors: { left: 0, top: 1, right: 1, bottom: 1.5 } }));
    const css = buildCss(p, { mode: 'export', fixedScale: true }, measure);
    expect(css).toContain('.hd-root{position:relative;width:800px;height:900px}');
    expect(css).toContain('.hd-scaler{width:100vw');
    expect(css).toContain('transform-origin:top left');
  });

  it('滚动页 + 无 fixedScale：仍响应式 width:100%，不走缩放包装', () => {
    const p = createProject('t', 800, 600);
    p.root.children.push(make('Control', { anchors: { left: 0, top: 1, right: 1, bottom: 1.5 } }));
    const css = buildCss(p, { mode: 'export' }, measure);
    expect(css).toContain('.hd-root{position:relative;width:100%;height:900px}');
    expect(css).not.toContain('.hd-fit');
  });

  it('growV=BEGIN 在滚动页下用 bottom 像素定位', () => {
    const p = createProject('t', 800, 600);
    const n = make('Control', {
      anchors: { left: 0, top: 1, right: 1, bottom: 1.5 },
      offsets: { left: 0, top: 0, right: 0, bottom: 0 },
      growV: 'BEGIN',
    });
    p.root.children.push(n);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${n.id}`))!;
    // p - (bottom*p + o.bottom) = 600 - 900 = -300
    expect(rule).toContain('bottom:-300px');
    expect(rule).toContain('height:300px');
  });
});

describe('Image 节点', () => {
  const DATA = 'data:image/png;base64,AAAA';

  function projectWithImage(embed: boolean): ReturnType<typeof createProject> {
    const p = createProject('img', 400, 300);
    p.root.children.push(make('Image', {
      anchors: { left: 0, top: 0, right: 1, bottom: 1 },
      image: { src: DATA, embed, filename: 'photo.png', fit: 'contain' },
    }));
    return p;
  }

  it('编辑器始终用 data URL 预览（无论是否嵌入）', () => {
    const p = projectWithImage(false);
    expect(buildMarkup(p)).toContain(`src="${DATA}"`);
    const p2 = projectWithImage(true);
    expect(buildMarkup(p2)).toContain(`src="${DATA}"`);
  });

  it('导出：嵌入图片用 data URL，未嵌入用 assets/images/ 相对路径', () => {
    expect(buildMarkup(projectWithImage(true), { export: true })).toContain(`src="${DATA}"`);
    expect(buildMarkup(projectWithImage(false), { export: true })).toContain('src="assets/images/photo.png"');
  });

  it('空图片用透明占位，避免裂图', () => {
    const p = createProject('img', 400, 300);
    p.root.children.push(make('Image', { image: { src: '', embed: true, filename: '', fit: 'fill' } }));
    const html = buildMarkup(p);
    expect(html).toContain('<img ');
    expect(html).toMatch(/src="data:image\/gif;base64,/);
  });

  it('CSS：object-fit 跟随 fit 设置', () => {
    const p = createProject('img', 400, 300);
    p.root.children.push(make('Image', { image: { src: DATA, embed: true, filename: 'p.png', fit: 'cover' } }));
    const css = buildCss(p, { mode: 'export' }, measure);
    const id = p.root.children[0].id;
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${id}`))!;
    expect(rule).toContain('object-fit:cover');
    expect(rule).toContain('display:block');
  });
});

describe('未嵌入图片收集（ZIP 导出）', () => {
  it('只收集 embed=false 且有数据的图片', () => {
    const p = createProject('img', 400, 300);
    p.root.children.push(
      make('Image', { image: { src: 'data:a', embed: false, filename: 'a.png', fit: 'fill' } }),
      make('Image', { image: { src: 'data:b', embed: true, filename: 'b.png', fit: 'fill' } }),
      make('Image', { image: { src: '', embed: false, filename: 'c.png', fit: 'fill' } }),
      make('Image', { image: { src: 'data:d', embed: false, filename: '', fit: 'fill' } }),
    );
    const ext = collectExternalImages(p);
    expect(ext).toHaveLength(1);
    expect(ext[0].filename).toBe('a.png');
    expect(hasExternalImages(p)).toBe(true);
  });

  it('重名文件自动加 _2 后缀，HTML 引用与打包路径一致', () => {
    const p = createProject('img', 400, 300);
    const a = make('Image', { image: { src: 'data:a', embed: false, filename: 'photo.png', fit: 'fill' } });
    const b = make('Image', { image: { src: 'data:b', embed: false, filename: 'photo.png', fit: 'fill' } });
    p.root.children.push(a, b);
    const ext = collectExternalImages(p);
    expect(ext.map((i) => i.filename)).toEqual(['photo.png', 'photo_2.png']);
    const html = buildMarkup(p, { export: true });
    expect(html).toContain('src="assets/images/photo.png"');
    expect(html).toContain('src="assets/images/photo_2.png"');
  });

  it('非法字符/路径被清洗成安全文件名', () => {
    const p = createProject('img', 400, 300);
    p.root.children.push(make('Image', { image: { src: 'data:a', embed: false, filename: '../x y!.png', fit: 'fill' } }));
    const ext = collectExternalImages(p);
    expect(ext[0].filename).toBe('x_y_.png');
  });
});

describe('Scroll 容器', () => {
  it('方向 v：垂直滚动、水平隐藏', () => {
    const p = createProject('t', 400, 300);
    const s = make('Scroll', { scroll: { dir: 'v' } });
    p.root.children.push(s);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${s.id}`))!;
    expect(rule).toContain('overflow-y:auto');
    expect(rule).toContain('overflow-x:hidden');
    expect(css).toContain(`.hd-${s.id}::-webkit-scrollbar{`);
  });

  it('方向 both：overflow:auto', () => {
    const p = createProject('t', 400, 300);
    const s = make('Scroll', { scroll: { dir: 'both' } });
    p.root.children.push(s);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${s.id}`))!;
    expect(rule).toContain('overflow:auto');
  });

  it('方向 h：水平滚动、垂直隐藏', () => {
    const p = createProject('t', 400, 300);
    const s = make('Scroll', { scroll: { dir: 'h' } });
    p.root.children.push(s);
    const css = buildCss(p, { mode: 'export' }, measure);
    const rule = css.split('\n').find((l) => l.startsWith(`.hd-${s.id}`))!;
    expect(rule).toContain('overflow-x:auto');
    expect(rule).toContain('overflow-y:hidden');
  });
});

describe('竖直锚点移动钳制（允许超出 1）', () => {
  const parent = { x: 0, y: 0, w: 800, h: 600 };

  it('向下拖可把拉伸控件推到锚点 5 以内（视口下方）', () => {
    const n = make('Control', { anchors: { left: 0.5, top: 0.5, right: 1, bottom: 1 } });
    moveNode(n, parent, 0, 2400); // +4 → top=4.5 bottom=5
    expect(n.anchors.top).toBeCloseTo(4.5, 6);
    expect(n.anchors.bottom).toBeCloseTo(5, 6);
  });

  it('超过 5 时整体平移夹住，span 不变（bottom 钉在 5）', () => {
    const n = make('Control', { anchors: { left: 0.5, top: 4.5, right: 1, bottom: 5 } });
    moveNode(n, parent, 0, 5000);
    expect(n.anchors.bottom).toBeCloseTo(5, 6);
    expect(n.anchors.top).toBeCloseTo(4.5, 6); // span 0.5 保持不变
  });

  it('水平方向仍夹在 [0,1]', () => {
    const n = make('Control', { anchors: { left: 0.5, top: 0, right: 1, bottom: 1 } });
    moveNode(n, parent, 1000, 0);
    expect(n.anchors.right).toBeCloseTo(1, 6);
    expect(n.anchors.left).toBeCloseTo(0.5, 6);
  });
});

describe('主题渐变与透明度颜色', () => {
  function themeRule(p: ReturnType<typeof createProject>, n: HdNode): string {
    const css = buildCss(p, { mode: 'export' }, measure);
    return css.split('\n').find((l) => l.startsWith(`.hd-${n.id}`))!;
  }

  it('线性渐变 → linear-gradient 带色标百分比', () => {
    const p = createProject('t', 800, 600);
    const n = make('Panel', {
      theme: { gradient: { kind: 'linear', colors: ['#ff0000', '#0000ff80'], angle: 45 } },
    });
    p.root.children.push(n);
    expect(themeRule(p, n)).toContain('background:linear-gradient(45deg, #ff0000 0%, #0000ff80 100%)');
  });

  it('径向渐变 → radial-gradient(circle, …)', () => {
    const p = createProject('t', 800, 600);
    const n = make('Panel', {
      theme: { gradient: { kind: 'radial', colors: ['#fff', '#000'] } },
    });
    p.root.children.push(n);
    expect(themeRule(p, n)).toContain('background:radial-gradient(circle, #fff 0%, #000 100%)');
  });

  it('kind=none 或未设置 → 不用渐变背景', () => {
    const p = createProject('t', 800, 600);
    const n = make('Panel', { theme: { bg: '#e8eaed', gradient: { kind: 'none', colors: ['#f00', '#00f'] } } });
    p.root.children.push(n);
    expect(themeRule(p, n)).toContain('background:#e8eaed');
    expect(themeRule(p, n)).not.toContain('gradient');
  });

  it('透明度颜色（8 位 hex）直接透传到 CSS', () => {
    const p = createProject('t', 800, 600);
    const n = make('Panel', { theme: { bg: '#ff000080', color: '#00000000' } });
    p.root.children.push(n);
    expect(themeRule(p, n)).toContain('background:#ff000080');
  });
});
