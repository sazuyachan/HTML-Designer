// 场景树结构命令：reparent 拖拽排序
import { describe, expect, it } from 'vitest';
import { createNode, createProject, uniqueNameAmongSiblings } from '../src/core/schema';
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

  it('duplicateNode 复制后自动改同级唯一名（Godot 风格 _2）', () => {
    const p = createProject('t');
    const a = addChild(p, p.root.id, 'Button', stubMeasure()).id;
    const b = addChild(p, p.root.id, 'Button', stubMeasure()).id;
    const dup = duplicateNode(p, a);
    expect(findNode(p, a)!.node.name).toBe('Button');
    expect(findNode(p, b)!.node.name).toBe('Button_2');
    expect(findNode(p, dup)!.node.name).toBe('Button_3');
  });

  it('duplicateNode 识别已有后缀：复制 Button_2 → Button_3，不产生 Button_2_2', () => {
    const p = createProject('t');
    const a = addChild(p, p.root.id, 'Button', stubMeasure()).id; // Button
    const b = addChild(p, p.root.id, 'Button', stubMeasure()).id; // Button_2
    const c = duplicateNode(p, a); // Button → Button_3
    const d = duplicateNode(p, b); // Button_2 → 识别 _2，继续编号 → Button_4
    expect(findNode(p, b)!.node.name).toBe('Button_2');
    expect(findNode(p, c)!.node.name).toBe('Button_3');
    expect(findNode(p, d)!.node.name).toBe('Button_4');
  });

  it('duplicateNode 用户手动输入的 _2 后缀同样被识别', () => {
    const p = createProject('t');
    const a = addChild(p, p.root.id, 'Button', stubMeasure()).id;
    findNode(p, a)!.node.name = 'Button_2'; // 手动命名，不是自动编号产生的
    const dup = duplicateNode(p, a);
    expect(findNode(p, dup)!.node.name).toBe('Button_3');
  });
});

describe('新建节点默认值与同级重名', () => {
  it('addChild 到自由布局父：偏移全 0，minSize=组件默认尺寸', () => {
    const p = createProject('t');
    const id = addChild(p, p.root.id, 'Button', stubMeasure()).id;
    const n = findNode(p, id)!.node;
    expect(n.anchors).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(n.offsets).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(n.minSize).toEqual({ x: 120, y: 36 });
  });

  it('addChild 到容器父：走 sizeFlags，不套用默认矩形', () => {
    const p = createProject('t');
    const box = addChild(p, p.root.id, 'HBox', stubMeasure()).id;
    const kid = addChild(p, box, 'Button', stubMeasure()).id;
    const n = findNode(p, kid)!.node;
    expect(n.sizeFlags).toBeDefined();
    expect(n.offsets).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(n.minSize).toEqual({ x: 0, y: 0 }); // 由内容自适应，不套默认尺寸
  });

  it('同级重名自动加编号（Label → Label_2 → Label_3）', () => {
    const p = createProject('t');
    const a = addChild(p, p.root.id, 'Label', stubMeasure()).id;
    const b = addChild(p, p.root.id, 'Label', stubMeasure()).id;
    const c = addChild(p, p.root.id, 'Label', stubMeasure()).id;
    expect(findNode(p, a)!.node.name).toBe('Label');
    expect(findNode(p, b)!.node.name).toBe('Label_2');
    expect(findNode(p, c)!.node.name).toBe('Label_3');
  });

  it('uniqueNameAmongSiblings：重命名时排除自身当前名', () => {
    const a = createNode('Label'); // 当前名 'Label'
    const b = createNode('Button'); // 当前名 'Button'
    const siblings = [a, b];
    // 把 a 重命名为 'Label'（等于当前名）：排除 a → 无人占用，保持原名
    expect(uniqueNameAmongSiblings(siblings, 'Label', a.id)).toBe('Label');
    // 没有 excludeId：'Label' 被 a 占着 → _2
    expect(uniqueNameAmongSiblings(siblings, 'Label')).toBe('Label_2');
    // 目标名被别的兄弟占用：仍要 _2
    expect(uniqueNameAmongSiblings(siblings, 'Button', a.id)).toBe('Button_2');
  });
});
