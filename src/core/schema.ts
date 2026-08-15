// 节点创建与默认值 / 数据规范化

import type { Anchors, HdNode, NodeType, Project, Size2D, Theme } from './types';

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
  HBox: 'HBox',
  VBox: 'VBox',
  Spacer: 'Spacer',
};

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
  HBox: { x: 200, y: 40 },
  VBox: { x: 200, y: 120 },
  Spacer: { x: 60, y: 20 },
};

/**
 * 给新节点一个可见的默认矩形（用于加入自由布局父级）。
 * 若父级是容器则忽略（容器会自行布局）。
 */
export function applyDefaultRect(node: HdNode, parentSize: Size2D, siblingCount: number): void {
  const size = DEFAULT_RECT[node.type];
  const step = 20;
  const base = 24 + ((siblingCount % 5) * step);
  const x = Math.min(base, Math.max(0, parentSize.x - size.x));
  const y = Math.min(base, Math.max(0, parentSize.y - size.y));
  node.anchors = { left: 0, top: 0, right: 0, bottom: 0 };
  node.offsets = {
    left: x,
    top: y,
    right: x + size.x,
    bottom: y + size.y,
  };
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
  clampTo01(a);
}

function clampTo01(a: Anchors): void {
  a.left = Math.min(1, Math.max(0, a.left));
  a.top = Math.min(1, Math.max(0, a.top));
  a.right = Math.min(1, Math.max(0, a.right));
  a.bottom = Math.min(1, Math.max(0, a.bottom));
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
  if (node.text !== undefined) out.text = node.text;
  if (node.placeholder !== undefined) out.placeholder = node.placeholder;

  seen.add(out.id);
  if (Array.isArray(node.children)) {
    out.children = node.children.map((c) => normalizeNode(c as Partial<HdNode>, seen));
  }
  normalizeAnchors(out);
  return out;
}
