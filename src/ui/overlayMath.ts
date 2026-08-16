// 画布选择覆盖层与 Scroll 可见区域的数学（纯函数，供 canvas.ts 与单测复用）

/** Scroll 容器的滚动几何（HTMLElement 的结构子集，便于无 DOM 测试） */
export interface SimpleScroll {
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  scrollTop: number;
  scrollLeft: number;
}

export interface OverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Scroll 容器在该滚轮方向是否真的还能滚动（有溢出且不在边界）。
 * 只有真能滚动时才把滚轮交给原生滚动；否则留作画布缩放——
 * 避免「Scroll 无滑条 / 已在边界」时滚轮经原生链式滚动误滚编辑器视角。
 */
export function scrollCanTake(sc: SimpleScroll, deltaX: number, deltaY: number): boolean {
  if (Math.abs(deltaY) >= Math.abs(deltaX)) {
    if (sc.scrollHeight <= sc.clientHeight + 1) return false;
    return deltaY < 0 ? sc.scrollTop > 0 : sc.scrollTop < sc.scrollHeight - sc.clientHeight;
  }
  if (sc.scrollWidth <= sc.clientWidth + 1) return false;
  return deltaX < 0 ? sc.scrollLeft > 0 : sc.scrollLeft < sc.scrollWidth - sc.clientWidth;
}

/** 把矩形依次裁剪到各可见区域（求交集）；任一相交为空返回 null。 */
export function clipRects(r: OverlayRect, clips: OverlayRect[]): OverlayRect | null {
  let out = r;
  for (const c of clips) {
    const x = Math.max(out.x, c.x);
    const y = Math.max(out.y, c.y);
    const x2 = Math.min(out.x + out.w, c.x + c.w);
    const y2 = Math.min(out.y + out.h, c.y + c.h);
    if (x2 <= x || y2 <= y) return null;
    out = { x, y, w: x2 - x, h: y2 - y };
  }
  return out;
}

/** 点是否落在所有可见区域内（= 交集区域内）。 */
export function pointInsideClips(x: number, y: number, clips: OverlayRect[]): boolean {
  return clips.every((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
}
