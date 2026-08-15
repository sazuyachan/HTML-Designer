// calc() 字符串格式化（核心正确性：CSS calc 不支持乘法、+/- 两侧必须有空格）

/** 数字格式化：最多 digits 位小数，去掉尾随 0。 */
export function trimNum(n: number, digits = 4): string {
  if (!isFinite(n)) return '0';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r);
}

/** 百分比值格式化（percent 已是 0..100 的值，如 30.5）。 */
export function pct(percent: number): string {
  return trimNum(percent);
}

/** 格式化像素，四舍五入到整数。 */
export function px(n: number): string {
  return String(Math.round(n));
}

/**
 * 生成 CSS calc() 表达式：`percent% + px px`。
 * @param percent 百分比数值（0..100，不是锚点小数）
 * @param px 像素偏移
 * 规则：
 *  - 两者都为 0 → "0px"
 *  - 只有 px → "12px"
 *  - 只有 percent → "30%"
 *  - 否则 → "calc(30% + 12px)" 或 "calc(30% - 12px)"（+/- 两侧带空格）
 */
export function fmtCalc(percent: number, pxVal: number): string {
  const pZero = Math.abs(percent) < 1e-9;
  const pxRounded = Math.round(pxVal);
  if (pZero && pxRounded === 0) return '0px';
  if (pZero) return `${pxRounded}px`;
  if (pxRounded === 0) return `${pct(percent)}%`;
  const sign = pxRounded > 0 ? '+' : '-';
  return `calc(${pct(percent)}% ${sign} ${Math.abs(pxRounded)}px)`;
}
