// 节点创建与默认值 / 数据规范化

import type { Anchors, HdNode, NodeType, Project, ScrollDir, Size2D, Theme } from './types';

let counter = 0;

export function genId(): string {
  counter += 1;
  return `n${counter}${Math.random().toString(36).slice(2, 7)}`;
}

const TYPE_NAMES: Record<NodeType, string> = {
  Control: 'Control',
  Panel: 'Panel',
  Label: 'Label',
  Button: 'Button',
  LineEdit: 'LineEdit',
  CheckBox: 'CheckBox',
  Image: 'Image',
  Scroll: 'Scroll',
  HBox: 'HBox',
  VBox: 'VBox',
  Spacer: 'Spacer',
};

/** 锚点取值范围：水平固定 [0,1]；竖直允许超出 1（滚动页面内容延伸到视口下方） */
export const ANCHOR_H_MIN = 0;
export const ANCHOR_H_MAX = 1;
export const ANCHOR_V_MIN = 0;
export const ANCHOR_V_MAX = 5;

export function defaultName(type: NodeType): string {
  return TYPE_NAMES[type];
}

/** 各类型的默认视觉主题 */
const DEFAULT_THEME: Record<NodeType, Theme> = {
  Control: {},
  Panel: { bg: '#e8eaed', border: { width: 1, color: '#9aa0a6', style: 'solid' } },
  Label: { color: '#202124', fontSize: 14 },
  Button: {
    bg: '#e3e6e9',
    color: '#1a1a1a',
    fontSize: 14,
    radius: 4,
    padding: 6,
    border: { width: 1, color: '#a5abb1', style: 'solid' },
  },
  LineEdit: {
    bg: '#ffffff',
    color: '#1a1a1a',
    fontSize: 14,
    radius: 3,
    padding: 4,
    border: { width: 1, color: '#a5abb1', style: 'solid' },
  },
  CheckBox: { color: '#202124', fontSize: 14 },
  Image: {},
  Scroll: {},
  HBox: {},
  VBox: {},
  Spacer: {},
};

export function createNode(type: NodeType, name?: string): HdNode {
  const node: HdNode = {
    id: genId(),
    type,
    name: name ?? defaultName(type),
    anchors: { left: 0, top: 0, right: 0, bottom: 0 },
    offsets: { left: 0, top: 0, right: 0, bottom: 0 },
    minSize: { x: 0, y: 0 },
    maxSize: { x: 0, y: 0 },
    growH: 'END',
    growV: 'END',
    theme: {},
    children: [],
  };

  node.theme = { ...DEFAULT_THEME[type] };

  switch (type) {
    case 'Label':
      node.text = 'Label';
      break;
    case 'Button':
      node.text = 'Button';
      break;
    case 'LineEdit':
      node.text = '';
      node.placeholder = 'Text';
      break;
    case 'CheckBox':
      node.text = 'Check Box';
      break;
    case 'Image':
      node.image = { src: '', embed: true, filename: '', fit: 'fill' };
      break;
    case 'Scroll':
      node.scroll = { dir: 'v' };
      // Scroll 是 flex 容器（Godot ScrollContainer）：间距/交叉轴对齐同 VBox 默认
      node.container = { separation: 4, alignCross: 'fill' };
      break;
    case 'HBox':
    case 'VBox':
      node.container = { separation: 4, alignCross: 'fill' };
      break;
    case 'Spacer':
      node.sizeFlags = { expandMain: true, ratio: 1, alignCross: 'fill' };
      break;
    default:
      break;
  }
  return node;
}

/** 各类型新建节点时的默认参考矩形（锚点 0，偏移像素） */
const DEFAULT_RECT: Record<NodeType, Size2D> = {
  Control: { x: 200, y: 140 },
  Panel: { x: 200, y: 140 },
  Label: { x: 120, y: 30 },
  Button: { x: 120, y: 36 },
  LineEdit: { x: 160, y: 34 },
  CheckBox: { x: 140, y: 26 },
  Image: { x: 160, y: 120 },
  Scroll: { x: 220, y: 160 },
  HBox: { x: 200, y: 40 },
  VBox: { x: 200, y: 120 },
  Spacer: { x: 60, y: 20 },
};

/**
 * 给新节点一个默认尺寸（用于加入自由布局父级）。
 * 锚点/偏移全部为 0（新节点落在父级左上角），尺寸由「组件默认最小尺寸」承担，
 * 这样节点不会因偏移 0 而塌缩成 0×0。若父级是容器则忽略（容器会自行布局）。
 */
export function applyDefaultRect(node: HdNode): void {
  const size = DEFAULT_RECT[node.type];
  node.anchors = { left: 0, top: 0, right: 0, bottom: 0 };
  node.offsets = { left: 0, top: 0, right: 0, bottom: 0 };
  node.minSize = { ...size };
}

/**
 * 在同级 children 中给 base 一个不重复的名字（Godot 风格：冲突时自动加 _2/_3…）。
 * 名字按「同级唯一」约束，保证导出变量脚本（父__子）不撞名。
 * base 若已带数字后缀（_2/_3…，含用户手动输入的），识别为同前缀家族的一员、继续往后编号：
 * 复制 Button_2 → Button_3（而非 Button_2_2）。
 * excludeId 用于重命名场景：排除自身当前的名字（自己不算占名）。
 */
export function uniqueNameAmongSiblings(children: HdNode[], base: string, excludeId?: string): string {
  const used = new Set(children.filter((c) => c.id !== excludeId).map((c) => c.name));
  // 识别已有数字后缀：Button_2 → 前缀 Button、编号 2（后缀只认 ≥2，_1 视作普通名字）
  const m = /^(.*)_([2-9]|[1-9][0-9]+)$/.exec(base);
  const prefix = m ? m[1] : base;
  // 候选编号：1 = 无后缀原名，k≥2 = 前缀_k。有后缀时从原编号继续，否则从 1 开始
  let i = m ? parseInt(m[2], 10) : 1;
  const name = (k: number) => (k === 1 ? prefix : `${prefix}_${k}`);
  while (used.has(name(i))) i += 1;
  return name(i);
}

export function createProject(name = 'Untitled', viewportW = 1280, viewportH = 720): Project {
  const root = createNode('Control', 'Root');
  // 根节点占满视口
  root.anchors = { left: 0, top: 0, right: 1, bottom: 1 };
  root.growH = 'BOTH';
  root.growV = 'BOTH';
  return { name, viewport: { x: viewportW, y: viewportH }, root };
}

/** 修正倒置锚点：确保 right>=left、bottom>=top（交换时保持像素矩形）。 */
export function normalizeAnchors(node: HdNode): void {
  const { anchors: a, offsets: o } = node;
  if (a.right < a.left) {
    const t = a.left; a.left = a.right; a.right = t;
    const ot = o.left; o.left = o.right; o.right = ot;
  }
  if (a.bottom < a.top) {
    const t = a.top; a.top = a.bottom; a.bottom = t;
    const ot = o.top; o.top = o.bottom; o.bottom = ot;
  }
  clampAnchors(a);
}

/**
 * 锚点钳制到允许范围：水平 [0,1]，竖直 [0, ANCHOR_V_MAX]（>1 允许，用于滚动页面内容延伸到视口下方）。
 */
function clampAnchors(a: Anchors): void {
  a.left = Math.min(ANCHOR_H_MAX, Math.max(ANCHOR_H_MIN, a.left));
  a.top = Math.min(ANCHOR_V_MAX, Math.max(ANCHOR_V_MIN, a.top));
  a.right = Math.min(ANCHOR_H_MAX, Math.max(ANCHOR_H_MIN, a.right));
  a.bottom = Math.min(ANCHOR_V_MAX, Math.max(ANCHOR_V_MIN, a.bottom));
}

/**
 * 递归规范化一个节点树（加载外部 JSON 后调用）：
 * 补齐缺失字段、修正倒置锚点、确保 id 唯一。
 */
export function normalizeNode(node: Partial<HdNode>, seen: Set<string>): HdNode {
  const base = createNode('Control', 'Control');
  const out: HdNode = {
    ...base,
    ...node,
    id: node.id && !seen.has(node.id) ? node.id : genId(),
    name: typeof node.name === 'string' && node.name ? node.name : defaultName(node.type ?? 'Control'),
    type: node.type ?? 'Control',
    anchors: { ...base.anchors, ...(node.anchors ?? {}) },
    offsets: { ...base.offsets, ...(node.offsets ?? {}) },
    minSize: { ...base.minSize, ...(node.minSize ?? {}) },
    maxSize: { ...base.maxSize, ...(node.maxSize ?? {}) },
    growH: (node.growH as HdNode['growH']) ?? 'END',
    growV: (node.growV as HdNode['growV']) ?? 'END',
    theme: { ...base.theme, ...(node.theme ?? {}) },
    children: [],
  };
  // 主题默认值按类型补
  out.theme = { ...DEFAULT_THEME[out.type], ...out.theme };
  if (node.sizeFlags) out.sizeFlags = { ...out.sizeFlags, ...node.sizeFlags };
  if (node.container) out.container = { ...out.container, ...node.container };
  if (node.image) {
    out.image = {
      src: node.image.src ?? '',
      embed: node.image.embed ?? true,
      filename: node.image.filename ?? '',
      fit: node.image.fit === 'contain' || node.image.fit === 'cover' ? node.image.fit : 'fill',
    };
  }
  if (node.scroll) {
    out.scroll = { dir: (node.scroll.dir as ScrollDir) ?? 'v' };
  }
  if (node.text !== undefined) out.text = node.text;
  if (node.placeholder !== undefined) out.placeholder = node.placeholder;

  seen.add(out.id);
  if (Array.isArray(node.children)) {
    out.children = node.children.map((c) => normalizeNode(c as Partial<HdNode>, seen));
  }
  normalizeAnchors(out);
  return out;
}
