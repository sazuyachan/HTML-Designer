// 应用状态：工程、选择、缩放、撤销/重做（JSON 快照）、变更通知

import type { Measure, Project } from '../core/types';
import { createProject } from '../core/schema';
import { deserializeProject, findNode, serializeProject } from '../core/serialize';
import { stubMeasure } from '../export/measure';

export type ChangeSource =
  | 'structure' // add/delete/duplicate/preset/load/undo/redo/viewport
  | 'inspector' // 检查器编辑（检查器自身做原地更新，不整树重建）
  | 'drag' // 画布拖拽（连续事件，跳过检查器重渲染）
  | 'drag-end' // 拖拽结束（检查器刷新数值）
  | 'selection' // 选择变化
  | 'zoom'; // 缩放变化

export class Store {
  project: Project;
  selection: string | null = null;
  zoom = 1;
  /** 所见即所得（固定参考分辨率缩放）开关：导出/预览共用，不入撤销快照 */
  fixedScale = false;
  measure: Measure;

  private subs: Array<(source: ChangeSource) => void> = [];
  private past: string[] = [];
  private future: string[] = [];
  private readonly historyCap = 60;

  constructor(project?: Project, measure?: Measure) {
    this.project = project ?? createProject();
    this.measure = measure ?? stubMeasure();
    try {
      this.fixedScale = localStorage.getItem('hd-fixed-scale') === '1';
    } catch {
      this.fixedScale = false; // 无 localStorage 环境（如测试）
    }
  }

  subscribe(fn: (source: ChangeSource) => void): () => void {
    this.subs.push(fn);
    return () => {
      const i = this.subs.indexOf(fn);
      if (i >= 0) this.subs.splice(i, 1);
    };
  }

  private notify(source: ChangeSource): void {
    for (const fn of this.subs) fn(source);
  }

  /** 压入撤销快照（画布拖拽开始时调用一次，保证一次拖拽 = 一步撤销） */
  pushSnapshot(): void {
    this.past.push(serializeProject(this.project));
    if (this.past.length > this.historyCap) this.past.shift();
    this.future = [];
  }

  /** 带历史记录的变更。返回 fn 的返回值（如新增节点的 id）。 */
  mutate<T>(fn: (p: Project) => T, source: ChangeSource): T {
    this.pushSnapshot();
    const result = fn(this.project);
    this.notify(source);
    return result;
  }

  /** 不带历史记录的连续变更（拖拽中间帧） */
  mutateLive(fn: (p: Project) => void, source: ChangeSource): void {
    fn(this.project);
    this.notify(source);
  }

  /** 整体替换工程（新建 / 打开文件），清空历史与选择。 */
  load(p: Project): void {
    this.project = p;
    this.past = [];
    this.future = [];
    this.selection = null;
    this.zoom = 1;
    this.notify('structure');
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(serializeProject(this.project));
    this.project = deserializeProject(prev);
    this.ensureSelectionValid();
    this.notify('structure');
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(serializeProject(this.project));
    this.project = deserializeProject(next);
    this.ensureSelectionValid();
    this.notify('structure');
  }

  private ensureSelectionValid(): void {
    if (this.selection && !findNode(this.project, this.selection)) this.selection = null;
  }

  select(id: string | null): void {
    if (this.selection === id) return;
    this.selection = id;
    this.notify('selection');
  }

  setZoom(z: number): void {
    const nz = Math.min(4, Math.max(0.1, z));
    if (nz === this.zoom) return;
    this.zoom = nz;
    this.notify('zoom');
  }

  setFixedScale(v: boolean): void {
    if (this.fixedScale === v) return;
    this.fixedScale = v;
    localStorage.setItem('hd-fixed-scale', v ? '1' : '0');
    this.notify('zoom'); // 复用 zoom 通知即可刷新工具栏开关状态
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
