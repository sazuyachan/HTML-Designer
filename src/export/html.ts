// 完整导出：单 HTML 文件（默认零 JS，可选附带节点变量脚本）

import type { HdNode, Measure, Project } from '../core/types';
import { buildCss } from './css';
import { buildMarkup, esc } from './markup';

export interface BuildHtmlOptions {
  /** 是否在 body 末尾附带节点变量脚本（const 父__子 = document.querySelector(...)，不含根） */
  includeVars?: boolean;
  /**
   * 所见即所得：固定按参考分辨率渲染，整体等比缩放适配任意窗口。
   * false（默认）= 响应式：根节点填满窗口，锚点随窗口重排（Godot 运行时行为）。
   */
  fixedScale?: boolean;
}

/** 把名字转成合法 JS 标识符：非字母数字替换为 _，数字开头加 _，纯符号名退回类型名 */
function sanitizeVar(name: string, type: string): string {
  const s = name.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[0-9]/, '_$&');
  return /[A-Za-z0-9]/.test(s) ? s : type.toLowerCase();
}

/**
 * 生成节点变量脚本：每个节点一行 `let 父__子 = document.querySelector('.hd-<id>')`。
 * 名字按「父节点名__子节点名」拼接，根节点不参与前缀。
 */
export function buildVarScript(project: Project): string {
  const used = new Set<string>();
  const lines: string[] = [];
  const walk = (node: HdNode, prefix: string): void => {
    const seg = sanitizeVar(node.name, node.type);
    const base = prefix ? `${prefix}__${seg}` : seg;
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    used.add(name);
    lines.push(`const ${name} = document.querySelector('.hd-${node.id}');`);
    for (const c of node.children) walk(c, name);
  };
  for (const c of project.root.children) walk(c, '');
  if (lines.length === 0) return '';
  return `<script>\n// 节点变量：可直接用于后续 JS（名字 = 父__子，不含根）\n${lines.join('\n')}\n</script>`;
}

export function buildHtml(project: Project, measure: Measure, opts: BuildHtmlOptions = {}): string {
  const fixedScale = opts.fixedScale === true;
  const css = buildCss(project, { mode: 'export', fixedScale }, measure);
  const inner = buildMarkup(project);
  const title = esc(project.name || 'Untitled');
  const vars = opts.includeVars ? buildVarScript(project) : '';
  const root = `<div class="hd-root hd-${project.root.id}" data-hd="${project.root.id}">\n${inner}\n</div>`;
  const body = fixedScale
    ? `<div class="hd-fit">\n<div class="hd-scaler">\n${root}\n</div>\n</div>`
    : root;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
${css}
</style>
</head>
<body>
${body}
${vars}
</body>
</html>
`;
}
