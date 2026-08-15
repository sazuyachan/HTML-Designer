// 保存 / 加载 / 导出 / 预览（浏览器 Blob）

import type { Measure, Project } from '../core/types';
import { deserializeProject, serializeProject } from '../core/serialize';
import { buildHtml, type BuildHtmlOptions } from '../export/html';

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function saveProjectTo(filename: string, p: Project): void {
  downloadText(filename, serializeProject(p), 'application/json');
}

export function exportHtmlTo(filename: string, p: Project, measure: Measure, opts?: BuildHtmlOptions): void {
  downloadText(filename, buildHtml(p, measure, opts), 'text/html;charset=utf-8');
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
