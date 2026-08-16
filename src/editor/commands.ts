// 场景树结构操作（在 store.mutate 内调用）

import type { HdNode, Measure, NodeType, Project } from '../core/types';
import { isContainerNode } from '../core/types';
import { applyDefaultRect, createNode, genId, uniqueNameAmongSiblings } from '../core/schema';
import { findNode } from '../core/serialize';

/** 添加子节点。返回新节点。 */
export function addChild(project: Project, parentId: string, type: NodeType, _measure: Measure, index?: number): HdNode {
  const hit = findNode(project, parentId);
  if (!hit) throw new Error(`父节点不存在: ${parentId}`);
  const parent = hit.node;
  const node = createNode(type);
  // 同级不允许重名：Godot 风格自动加 _2/_3
  node.name = uniqueNameAmongSiblings(parent.children, node.name);

  if (isContainerNode(parent)) {
    node.sizeFlags = { expandMain: false, ratio: 1, alignCross: 'fill' };
  } else {
    // 新节点落在父级左上角：锚点/偏移全 0，尺寸来自组件默认最小尺寸
    applyDefaultRect(node);
  }

  if (index === undefined || index >= parent.children.length) parent.children.push(node);
  else parent.children.splice(index, 0, node);
  return node;
}

/** 删除节点（根不可删除）。 */
export function deleteNode(project: Project, id: string): void {
  if (project.root.id === id) return;
  const hit = findNode(project, id);
  if (!hit || !hit.parent) return;
  const arr = hit.parent.children;
  const i = arr.findIndex((c) => c.id === id);
  if (i >= 0) arr.splice(i, 1);
}

function reId(node: HdNode): void {
  node.id = genId();
  for (const c of node.children) reId(c);
}

/** 复制子树，插入到原节点之后。返回新节点 id。 */
export function duplicateNode(project: Project, id: string): string {
  const hit = findNode(project, id);
  if (!hit || !hit.parent) return id;
  const clone = JSON.parse(JSON.stringify(hit.node)) as HdNode;
  reId(clone);
  // 同级重名自动加编号（Godot 风格）：Label → Label_2
  clone.name = uniqueNameAmongSiblings(hit.parent.children, clone.name);
  const arr = hit.parent.children;
  const i = arr.findIndex((c) => c.id === id);
  arr.splice(i + 1, 0, clone);
  return clone.id;
}

/** 在父级内移动子节点位置（-1 向上，+1 向下）。 */
export function moveChild(project: Project, parentId: string, from: number, delta: number): void {
  const hit = findNode(project, parentId);
  if (!hit) return;
  const arr = hit.node.children;
  const to = from + delta;
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return;
  const [c] = arr.splice(from, 1);
  arr.splice(to, 0, c);
}

function isDescendant(node: HdNode, id: string): boolean {
  return node.children.some((c) => c.id === id || isDescendant(c, id));
}

/**
 * 把节点移动到 newParentId 的 children[index] 处（成为其子节点）。
 * 返回是否成功（根不可动；目标不能是自身或其子孙）。
 */
export function reparent(project: Project, nodeId: string, newParentId: string, index: number): boolean {
  if (nodeId === newParentId) return false;
  const hit = findNode(project, nodeId);
  if (!hit || !hit.parent) return false; // 根节点不可移动
  const target = findNode(project, newParentId);
  if (!target) return false;
  if (target.node.type === 'Image') return false; // Image 是叶子容器，不能有子节点
  if (isDescendant(hit.node, newParentId)) return false; // 不能移进自己的子树

  const oldArr = hit.parent.children;
  const from = oldArr.findIndex((c) => c.id === nodeId);
  if (from < 0) return false;
  const [node] = oldArr.splice(from, 1);

  const arr = target.node.children;
  let idx = index;
  // 同父移动时，移除后下标左移一位
  if (target.node.id === hit.parent.id && from < idx) idx -= 1;
  idx = Math.max(0, Math.min(arr.length, idx));
  arr.splice(idx, 0, node);
  // 拖入容器：补齐 sizeFlags（与 addChild 一致），否则检查器无法调扩展/比例
  if (isContainerNode(target.node) && !node.sizeFlags) {
    node.sizeFlags = { expandMain: false, ratio: 1, alignCross: 'fill' };
  }
  return true;
}
