// 文本测量实现：编辑器用 canvas 2D，测试用 stub（依赖注入，保证 Node 下可无头运行）

import type { FontSpec, Measure } from '../core/types';
import { FONT_STACK } from './consts';

/** 浏览器内的 canvas 测量（编辑器用）。懒创建共享 canvas，不挂到 DOM。 */
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

export function canvasMeasure(): Measure {
  return {
    text(text: string, font: FontSpec) {
      if (!sharedCanvas) {
        sharedCanvas = document.createElement('canvas');
        sharedCtx = sharedCanvas.getContext('2d');
      }
      const family = font.fontFamily || FONT_STACK;
      if (sharedCtx) {
        sharedCtx.font = `${font.bold ? 'bold ' : ''}${font.fontSize}px ${family}`;
        const w = sharedCtx.measureText(text).width;
        return { x: w, y: Math.ceil(font.fontSize * 1.4) };
      }
      return estimate(text, font);
    },
  };
}

/** 无 canvas 环境（测试）的粗略估算：每字符约 0.6em。 */
export function stubMeasure(): Measure {
  return {
    text(text: string, font: FontSpec) {
      return estimate(text, font);
    },
  };
}

function estimate(text: string, font: FontSpec): { x: number; y: number } {
  const perChar = font.fontSize * 0.6;
  return { x: text.length * perChar, y: Math.ceil(font.fontSize * 1.4) };
}
