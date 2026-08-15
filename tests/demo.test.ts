// 示例工程冒烟测试：能反序列化、能导出、导出的 HTML 含全部节点 id
import demoRaw from '../examples/demo.hdproj?raw';
import { describe, expect, it } from 'vitest';
import { deserializeProject } from '../src/core/serialize';
import { buildHtml, buildVarScript } from '../src/export/html';
import { stubMeasure } from '../src/export/measure';
import { computeLayout } from '../src/core/layout';
import { isContainerNode } from '../src/core/types';
import { buildCss } from '../src/export/css';
import { createProject } from '../src/core/schema';
import { addChild } from '../src/editor/commands';

interface TreeNode {
  id: string;
  type: string;
  children: TreeNode[];
  sizeFlags?: unknown;
}

describe('示例工程 demo.hdproj', () => {
  it('可反序列化，节点 id 全部唯一', () => {
    const p = deserializeProject(demoRaw);
    const ids = new Set<string>();
    const seen: string[] = [];
    const walk = (n: TreeNode): void => {
      ids.add(n.id);
      seen.push(n.id);
      for (const c of n.children) walk(c);
    };
    walk(p.root as never);
    expect(seen.length).toBe(ids.size);
    expect(p.viewport.x).toBe(1280);
  });

  it('每个节点都能计算布局矩形', () => {
    const p = deserializeProject(demoRaw);
    const layout = computeLayout(p, stubMeasure());
    const ids: string[] = [];
    const walk = (n: TreeNode): void => {
      ids.push(n.id);
      for (const c of n.children) walk(c);
    };
    walk(p.root as never);
    for (const id of ids) {
      const r = layout.rects.get(id);
      expect(r, `节点 ${id} 应有矩形`).toBeDefined();
      expect(r!.w).toBeGreaterThan(0);
      expect(r!.h).toBeGreaterThan(0);
    }
  });

  it('导出 HTML 包含所有节点 id 且零脚本', () => {
    const p = deserializeProject(demoRaw);
    const html = buildHtml(p, stubMeasure());
    expect(html).not.toMatch(/<script/i);
    const ids: string[] = [];
    const walk = (n: TreeNode): void => {
      ids.push(n.id);
      for (const c of n.children) walk(c);
    };
    walk(p.root as never);
    for (const id of ids) expect(html).toContain(`hd-${id}`);
    expect(html).toContain('欢迎使用 HTML Designer');
  });

  it('附带变量脚本按 父__子 命名且不含根', () => {
    const p = deserializeProject(demoRaw);
    const script = buildVarScript(p);
    expect(script).toContain('<script>');
    expect(script).not.toContain(`__root`);
    // 每个非根节点一行：const 父__子 = document.querySelector('.hd-<id>')
    const lines = script.split('\n').filter((l) => l.startsWith('const '));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      // 根的直接子节点无前缀；深层节点用 父__子
      expect(l).toMatch(/^const [A-Za-z0-9_$]+(__[A-Za-z0-9_$]+)* = document\.querySelector\('\.hd-[A-Za-z0-9_-]+'\);$/);
    }
    // 变量名去重（同名节点加 _2 后缀）
    const names = lines.map((l) => l.match(/^const ([A-Za-z0-9_$]+) =/)?.[1]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('导出带变量脚本时 body 末尾含变量脚本', () => {
    const p = deserializeProject(demoRaw);
    const html = buildHtml(p, stubMeasure(), { includeVars: true });
    expect(html).toContain('<script>');
    // 脚本在根容器之后、</body> 之前（body 末尾）
    const scriptPos = html.indexOf('<script>');
    expect(scriptPos).toBeGreaterThan(html.lastIndexOf('</div>'));
    expect(scriptPos).toBeLessThan(html.indexOf('</body>'));
  });

  it('默认导出响应式（根节点填满窗口），fixedScale 为所见即所得', () => {
    const p = deserializeProject(demoRaw);
    // 默认：响应式，根节点铺满窗口
    const resp = buildHtml(p, stubMeasure());
    expect(resp).toMatch(/\.hd-root\{position:fixed;left:0;top:0;right:0;bottom:0\}/);
    expect(resp).not.toContain('hd-fit');
    // 所见即所得：固定参考分辨率 + 等比缩放 + 包装容器
    const fixed = buildHtml(p, stubMeasure(), { fixedScale: true });
    expect(fixed).toContain('class="hd-fit"');
    expect(fixed).toContain('class="hd-scaler"');
    expect(fixed).toMatch(/scale\(min\(100vw \/ 1280px, 100vh \/ 720px\)\)/);
    expect(fixed).toContain(`.hd-root{position:relative;width:${p.viewport.x}px;height:${p.viewport.y}px}`);
    expect(fixed).toMatch(/<div class="hd-fit">\s*<div class="hd-scaler">\s*<div class="hd-root/);
  });

  it('hidden 节点仅编辑器隐藏，导出不受影响', () => {
    const p = createProject('t');
    const n = addChild(p, p.root.id, 'Button', stubMeasure());
    n.hidden = true;
    const editorCss = buildCss(p, { mode: 'editor' }, stubMeasure());
    const exportCss = buildCss(p, { mode: 'export' }, stubMeasure());
    expect(editorCss).toContain(`.hd-${n.id}{display:none !important}`);
    expect(exportCss).not.toContain('display:none');
  });

  it('容器子节点都带 sizeFlags', () => {
    const p = deserializeProject(demoRaw);
    const check = (n: TreeNode): void => {
      if (isContainerNode(n as never)) {
        for (const c of n.children) {
          expect(c.sizeFlags, `容器子节点 ${c.id} 应有 sizeFlags`).toBeDefined();
        }
      }
      for (const c of n.children) check(c);
    };
    check(p.root as never);
  });
});
