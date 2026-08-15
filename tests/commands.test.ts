// 场景树结构命令：reparent 拖拽排序
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/core/schema';
import { addChild, deleteNode, duplicateNode, reparent } from '../src/editor/commands';
import { findNode } from '../src/core/serialize';
import { stubMeasure } from '../src/export/measure';
import type { HdNode } from '../src/core/types';

function build(): { p: ReturnType<typeof createProject>; a: string; b: string; c: string; box: string } {
  const p = createProject('t');
  const a = addChild(p, p.root.id, 'Panel', stubMeasure()).id;
  const b = addChild(p, p.root.id, 'Button', stubMeasure()).id;
  const c = addChild(p, p.root.id, 'Label', stubMeasure()).id;
  const box = addChild(p, b, 'HBox', stubMeasure()).id;
  return { p, a, b, c, box };
}

const ids = (n: HdNode): string[] => n.children.map((c) => c.id);

describe('reparent 拖拽排序', () => {
  it('同父移动：把 A 移到 C 之后（after）', () => {
    const { p, a, b, c } = build();
    expect(ids(p.root)).toEqual([a, b, c]);
    expect(reparent(p, a, p.root.id, 3)).toBe(true);
    expect(ids(p.root)).toEqual([b, c, a]);
  });

  it('同父移动：把 A 移到 C 之前（before）', () => {
    const { p, a, b, c } = build();
    expect(reparent(p, a, p.root.id, 2)).toBe(true); // 目标 index 为 C 的位置
    expect(ids(p.root)).toEqual([b, a, c]);
  });

  it('跨父：成为容器子节点（追加末尾）', () => {
    const { p, a, b, box, c } = build();
    expect(reparent(p, a, box, 0)).toBe(true);
    expect(ids(p.root)).toEqual([b, c]);
    const boxNode = findNode(p, box)!.node;
    expect(ids(boxNode)).toEqual([a]);
    // A 现在是 HBox 的容器子节点，应自动带 sizeFlags
    expect(boxNode.children[0].sizeFlags).toBeDefined();
  });

  it('根节点不可移动', () => {
    const { p, a } = build();
    expect(reparent(p, p.root.id, a, 0)).toBe(false);
    expect(ids(p.root)).toHaveLength(3);
  });

  it('不能移进自己的子孙（循环）', () => {
    const { p, a } = build();
    expect(reparent(p, p.root.id, a, 0)).toBe(false);
    // a 是 Panel，先给它加个 VBox 子，再把 a 移进这个 VBox
    const vb = addChild(p, a, 'VBox', stubMeasure()).id;
    expect(reparent(p, a, vb, 0)).toBe(false);
    expect(ids(p.root)).toContain(a);
  });

  it('目标不存在时返回 false', () => {
    const { p, a } = build();
    expect(reparent(p, a, 'nope', 0)).toBe(false);
  });
});

describe('既有结构命令回归', () => {
  it('deleteNode 删除后兄弟顺序保持', () => {
    const { p, a, b, c } = build();
    deleteNode(p, b);
    expect(ids(p.root)).toEqual([a, c]);
  });

  it('duplicateNode 插到原节点之后并换新 id', () => {
    const { p, a, b, c } = build();
    const dup = duplicateNode(p, b); // b 带一个 HBox 子节点，整个子树一起复制
    expect(dup).not.toBe(b);
    expect(ids(p.root)).toEqual([a, b, dup, c]);
    expect(findNode(p, b)!.node.name).not.toBe(findNode(p, dup)!.node.name);
  });
});
