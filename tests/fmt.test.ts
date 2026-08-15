import { describe, expect, it } from 'vitest';
import { fmtCalc, px, trimNum } from '../src/core/fmt';

describe('fmtCalc', () => {
  it('折叠零值', () => {
    expect(fmtCalc(0, 0)).toBe('0px');
    expect(fmtCalc(0, 12)).toBe('12px');
    expect(fmtCalc(30, 0)).toBe('30%');
  });

  it('百分号 + 像素，+/- 两侧必须带空格', () => {
    expect(fmtCalc(30, 12)).toBe('calc(30% + 12px)');
    expect(fmtCalc(30, -12)).toBe('calc(30% - 12px)');
    expect(fmtCalc(12.5, 4)).toBe('calc(12.5% + 4px)');
  });

  it('像素四舍五入', () => {
    expect(fmtCalc(30, 12.4)).toBe('calc(30% + 12px)');
  });
});

describe('px / trimNum', () => {
  it('trimNum 去尾随零', () => {
    expect(trimNum(30)).toBe('30');
    expect(trimNum(30.5)).toBe('30.5');
    expect(trimNum(0.3333)).toBe('0.3333');
  });
  it('px 取整', () => {
    expect(px(12.6)).toBe('13');
  });
});
