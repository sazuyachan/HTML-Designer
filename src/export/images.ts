// 未嵌入图片的收集与文件名去重（HTML 引用与 ZIP 打包共用同一份结果，保证路径一致）

import type { HdNode, Project } from '../core/types';

export interface ExternalImage {
  nodeId: string;
  filename: string;   // assets/images/ 下的唯一文件名（重名自动加 _2 后缀）
  dataUrl: string;    // 数据来源（zip 里还原成文件）
}

function baseName(f: string): string {
  // 去掉路径与非法字符，取小写扩展名合法化
  const raw = f.replace(/\\/g, '/').split('/').pop() ?? '';
  const name = raw.replace(/[^A-Za-z0-9._-]/g, '_').trim();
  return name || 'image.png';
}

/** photo.png 第二次出现 → photo_2.png；无扩展名 → 直接 _2 */
function uniqueName(base: string, used: Map<string, number>): string {
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  if (n === 0) return base;
  const m = base.match(/^(.*?)(\.[A-Za-z0-9]+)?$/);
  const stem = m?.[1] || base;
  const ext = m?.[2] || '';
  return `${stem}_${n + 1}${ext}`;
}

/**
 * 遍历场景，收集 embed=false 且已有图片数据的节点。
 * 返回的文件名在 <html 引用> 与 <zip 内 assets/images/> 中一一对应（重名自动加后缀）。
 */
export function collectExternalImages(project: Project): ExternalImage[] {
  const out: ExternalImage[] = [];
  const used = new Map<string, number>(); // 基名 → 出现次数（去重）

  const walk = (node: HdNode): void => {
    const img = node.image;
    if (img && !img.embed && img.src && img.filename) {
      out.push({
        nodeId: node.id,
        filename: uniqueName(baseName(img.filename), used),
        dataUrl: img.src,
      });
    }
    for (const c of node.children) walk(c);
  };
  walk(project.root);
  return out;
}

/** 场景中是否存在需要外链的图片（决定导出是单 HTML 还是 ZIP） */
export function hasExternalImages(project: Project): boolean {
  return collectExternalImages(project).length > 0;
}
