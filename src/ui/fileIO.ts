// 保存 / 加载 / 导出 / 预览（浏览器 Blob）

import JSZip from 'jszip';
import type { Measure, Project } from '../core/types';
import { deserializeProject, serializeProject } from '../core/serialize';
import { buildHtml, type BuildHtmlOptions } from '../export/html';
import { collectExternalImages } from '../export/images';

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(filename: string, content: string, mime: string): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

export function saveProjectTo(filename: string, p: Project): void {
  downloadText(filename, serializeProject(p), 'application/json');
}

export function exportHtmlTo(filename: string, p: Project, measure: Measure, opts?: BuildHtmlOptions): void {
  downloadText(filename, buildHtml(p, measure, opts), 'text/html;charset=utf-8');
}

/**
 * 导出 ZIP：index.html + assets/images/ 下的未嵌入图片。
 * 图片从 data URL 还原为原文件；HTML 里通过 assets/images/<文件名> 引用。
 */
export async function exportProjectToZip(filename: string, p: Project, measure: Measure, opts?: BuildHtmlOptions): Promise<void> {
  const zip = new JSZip();
  zip.file('index.html', buildHtml(p, measure, opts));
  const folder = zip.folder('assets/images');
  if (folder) {
    for (const img of collectExternalImages(p)) {
      const base64 = img.dataUrl.includes(',') ? img.dataUrl.split(',')[1] : img.dataUrl;
      folder.file(img.filename, base64, { base64: true });
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(filename, blob);
}

export function previewHtml(p: Project, measure: Measure, opts?: BuildHtmlOptions): void {
  const url = URL.createObjectURL(new Blob([buildHtml(p, measure, opts)], { type: 'text/html;charset=utf-8' }));
  window.open(url, '_blank');
}

export function loadProjectFile(): Promise<Project> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.hdproj,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(deserializeProject(String(reader.result)));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
