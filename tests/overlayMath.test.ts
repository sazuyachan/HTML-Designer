// 画布选择覆盖层的纯函数：Scroll 滚轮让路判断 + 选择框裁剪到 Scroll 可见区
import { describe, expect, it } from 'vitest';
import { clipRects, pointInsideClips, scrollCanTake } from '../src/ui/overlayMath';

describe('scrollCanTake（滚轮是否交给 Scroll 原生滚动）', () => {
  const sc = {
    scrollHeight: 1000,
    scrollWidth: 1000,
    clientHeight: 400,
    clientWidth: 400,
    scrollTop: 200,
    scrollLeft: 0,
  };

  it('垂直方向有可滚动内容且不在边界 → 交给原生滚动', () => {
    expect(scrollCanTake(sc, 0, 100)).toBe(true); // 向下
    expect(scrollCanTake(sc, 0, -100)).toBe(true); // 向上
  });

  it('已在边界 → 不再交给原生（避免原生链式滚动带跑编辑器视角）', () => {
    expect(scrollCanTake({ ...sc, scrollTop: 0 }, 0, -100)).toBe(false); // 顶部向上
    expect(scrollCanTake({ ...sc, scrollTop: 600 }, 0, 100)).toBe(false); // 底部向下
    expect(scrollCanTake({ ...sc, scrollTop: 0 }, 0, 100)).toBe(true); // 顶部向下仍可滚
  });

  it('无垂直溢出（无滑条）→ 垂直滚轮不交给原生', () => {
    expect(scrollCanTake({ ...sc, scrollHeight: 400 }, 0, 100)).toBe(false);
    expect(scrollCanTake({ ...sc, scrollHeight: 400 }, 0, -100)).toBe(false);
  });

  it('水平意图（|dx|>|dy|）→ 看水平方向', () => {
    expect(scrollCanTake({ ...sc, scrollLeft: 100 }, 150, 50)).toBe(true); // 向右有余量
    expect(scrollCanTake({ ...sc, scrollLeft: 0 }, -150, 50)).toBe(false); // 最左向左
    expect(scrollCanTake({ ...sc, scrollWidth: 400 }, 150, 50)).toBe(false); // 无水平溢出
  });
});

describe('clipRects（选择框裁剪到 Scroll 可见区）', () => {
  it('框完全在可见区内 → 原样返回', () => {
    expect(clipRects({ x: 10, y: 10, w: 100, h: 100 }, [{ x: 0, y: 0, w: 200, h: 200 }]))
      .toEqual({ x: 10, y: 10, w: 100, h: 100 });
  });

  it('部分滚出可见区 → 裁剪到可见区边界', () => {
    // 右缘超出可见区右缘 60px
    expect(clipRects({ x: 10, y: 10, w: 100, h: 100 }, [{ x: 0, y: 0, w: 50, h: 200 }]))
      .toEqual({ x: 10, y: 10, w: 40, h: 100 });
    // 底部超出可见区底部
    expect(clipRects({ x: 0, y: 30, w: 100, h: 100 }, [{ x: 0, y: 0, w: 200, h: 50 }]))
      .toEqual({ x: 0, y: 30, w: 100, h: 20 });
  });

  it('完全滚出可见区 → null（不画选择层）', () => {
    expect(clipRects({ x: 100, y: 100, w: 100, h: 100 }, [{ x: 0, y: 0, w: 50, h: 50 }])).toBeNull();
  });

  it('多层 Scroll 嵌套 → 依次求交', () => {
    const clips = [
      { x: 0, y: 0, w: 300, h: 300 },
      { x: 100, y: 100, w: 300, h: 300 },
    ];
    expect(clipRects({ x: 0, y: 0, w: 200, h: 200 }, clips)).toEqual({ x: 100, y: 100, w: 100, h: 100 });
  });
});

describe('pointInsideClips（手柄/锚点是否可见）', () => {
  it('在可见区内 → true，在外 → false', () => {
    expect(pointInsideClips(50, 50, [{ x: 0, y: 0, w: 100, h: 100 }])).toBe(true);
    expect(pointInsideClips(150, 50, [{ x: 0, y: 0, w: 100, h: 100 }])).toBe(false);
  });

  it('需落在所有可见区内（嵌套交集）', () => {
    const clips = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 50, y: 50, w: 100, h: 100 },
    ];
    expect(pointInsideClips(75, 75, clips)).toBe(true);
    expect(pointInsideClips(25, 25, clips)).toBe(false);
  });
});
