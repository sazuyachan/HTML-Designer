// 导出 / 预览共享常量

export const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Microsoft YaHei", "Noto Sans SC", sans-serif';

export const ACCENT = '#4a9de0';

export const CHECKBOX_SIZE = 16;

/** 全局 CSS 重置（导出模式：作用于整个文档）。内容不超高时无滚动条，超高时纵向可滚 */
export const GLOBAL_RESET_EXPORT = `*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%;height:100%;overflow-x:hidden;overflow-y:auto}
body{font-family:${FONT_STACK};line-height:1.4}
`;

/** 全局 CSS 重置（编辑模式：作用域限定到 .hd-canvas，不污染编辑器自身） */
export const GLOBAL_RESET_EDITOR = `.hd-canvas,.hd-canvas *,.hd-canvas *::before,.hd-canvas *::after{box-sizing:border-box}
.hd-canvas{font-family:${FONT_STACK};line-height:1.4}
.hd-canvas{user-select:none;touch-action:none;cursor:default}
.hd-canvas button{user-select:none}
`;

export interface FontChoice {
  label: string;
  family: string;
}

/** 提供字体下拉的可选字体（web-safe） */
export const FONT_CHOICES: FontChoice[] = [
  { label: '系统默认', family: '' },
  { label: 'Sans（Segoe UI）', family: '"Segoe UI", Roboto, Arial, sans-serif' },
  { label: '微软雅黑', family: '"Microsoft YaHei", sans-serif' },
  { label: '宋体 / SimSun', family: '"SimSun", serif' },
  { label: 'Georgia（衬线）', family: 'Georgia, "Times New Roman", serif' },
  { label: 'Consolas（等宽）', family: '"Cascadia Mono", Consolas, monospace' },
  { label: 'Courier New（等宽）', family: '"Courier New", monospace' },
];
