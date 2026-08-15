// 工程序列化 / 反序列化 / 深拷贝

import type { HdNode, Project } from './types';
import { normalizeNode } from './schema';

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function deserializeProject(json: string): Project {
  const raw = JSON.parse(json) as Partial<Project>;
  if (!raw || typeof raw !== 'object' || !raw.root) {
    throw new Error('不是有效的工程文件：缺少 root');
  }
  const vp = raw.viewport ?? { x: 1280, y: 720 };
  const seen = new Set<string>();
  return {
    name: typeof raw.name === 'string' ? raw.name : 'Untitled',
    viewport: { x: vp.x ?? 1280, y: vp.y ?? 720 },
    root: normalizeNode(raw.root as never, seen),
  };
}

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 查找节点（按 id），返回节点与其父（父为 null 表示根）。 */
export function findNode(project: Project, id: string): { node: HdNode; parent: HdNode | null } | null {
  if (project.root.id === id) return { node: project.root, parent: null };
  return findInChildren(project.root, id);
}

function findInChildren(parent: HdNode, id: string): { node: HdNode; parent: HdNode } | null {
  for (const c of parent.children) {
    if (c.id === id) return { node: c, parent };
    const hit = findInChildren(c, id);
    if (hit) return hit;
  }
  return null;
}
