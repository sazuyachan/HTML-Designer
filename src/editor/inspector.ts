// 检查器字段描述（数据驱动，渲染由 inspectorPanel 负责）

import type { CrossAlign, HdNode, GrowDir, ImageFit, ScrollDir, Theme } from '../core/types';
import { isContainerNode } from '../core/types';
import { ANCHOR_H_MAX, ANCHOR_H_MIN, ANCHOR_V_MAX, ANCHOR_V_MIN } from '../core/schema';
import { FONT_CHOICES } from '../export/consts';

export type FieldKind = 'text' | 'textarea' | 'number' | 'range' | 'rangeNumber' | 'color' | 'colorAlpha' | 'select' | 'toggle' | 'file';

export interface Option {
  label: string;
  value: string;
}

export interface FieldDesc {
  key: string;
  label: string;
  kind: FieldKind;
  min?: number;
  max?: number;
  step?: number;
  options?: Option[];
  get: (node: HdNode) => number | string | boolean;
  set: (node: HdNode, v: number | string | boolean) => void;
  /** kind==='file' 时点击触发的动作（如打开图片选择，可异步） */
  onPick?: (node: HdNode) => void | Promise<void>;
}

export interface FieldGroup {
  title: string;
  fields: FieldDesc[];
}

const GROW_OPTIONS: Option[] = [
  { label: 'BEGIN', value: 'BEGIN' },
  { label: 'END', value: 'END' },
  { label: 'BOTH', value: 'BOTH' },
];

const ALIGN_OPTIONS: Option[] = [
  { label: '填满 Fill', value: 'fill' },
  { label: '起始 Begin', value: 'begin' },
  { label: '居中 Center', value: 'center' },
  { label: '末尾 End', value: 'end' },
];

const TEXT_ALIGN_OPTIONS: Option[] = [
  { label: '左', value: 'left' },
  { label: '中', value: 'center' },
  { label: '右', value: 'right' },
];

const V_ALIGN_OPTIONS: Option[] = [
  { label: '顶部', value: 'top' },
  { label: '居中', value: 'center' },
  { label: '底部', value: 'bottom' },
];

const BORDER_STYLE_OPTIONS: Option[] = [
  { label: '实线', value: 'solid' },
  { label: '虚线', value: 'dashed' },
  { label: '点线', value: 'dotted' },
  { label: '无', value: 'none' },
];

const GRADIENT_OPTIONS: Option[] = [
  { label: '无', value: 'none' },
  { label: '线性渐变', value: 'linear' },
  { label: '径向渐变', value: 'radial' },
];

const FONT_OPTIONS: Option[] = FONT_CHOICES.map((f) => ({ label: f.label, value: f.family }));

const SCROLL_DIR_OPTIONS: Option[] = [
  { label: '垂直（V）', value: 'v' },
  { label: '水平（H）', value: 'h' },
  { label: '双向', value: 'both' },
];

const IMAGE_FIT_OPTIONS: Option[] = [
  { label: '拉伸 Fill', value: 'fill' },
  { label: '等比 Contain', value: 'contain' },
  { label: '等比铺满 Cover', value: 'cover' },
];

/** Image 节点主题里不适用的字段（字体/文本相关） */
const IMAGE_THEME_IGNORE = [
  'theme_bg',
  'gradient_kind',
  'gradient_c1',
  'gradient_c2',
  'gradient_angle',
  'theme_color',
  'theme_fontSize',
  'theme_bold',
  'theme_fontFamily',
  'theme_textAlign',
  'theme_padding',
];

function imageOf(n: HdNode): NonNullable<HdNode['image']> {
  return n.image ?? { src: '', embed: true, filename: '', fit: 'fill' };
}

/** 打开文件选择器读图片为 data URL。node 是 store 里的活引用，直接写回（调用方负责快照/通知）。 */
function pickImageForNode(node: HdNode): Promise<void> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve();
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const probe = new Image();
        probe.onload = () => {
          node.image = { ...imageOf(node), src: dataUrl, filename: file.name };
          // 固定尺寸节点：一键贴齐图片自然尺寸（左上角不动）
          if (node.anchors.left === node.anchors.right && node.anchors.top === node.anchors.bottom) {
            node.offsets.right = node.offsets.left + probe.naturalWidth;
            node.offsets.bottom = node.offsets.top + probe.naturalHeight;
          }
          resolve();
        };
        probe.onerror = () => resolve();
        probe.src = dataUrl;
      };
      reader.onerror = () => resolve();
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

function tGet(node: HdNode, key: keyof Theme, fallback: number | string | boolean): number | string | boolean {
  const v = node.theme[key] as number | string | boolean | undefined;
  return v === undefined ? fallback : v;
}

function tSet(node: HdNode, key: keyof Theme, v: number | string | boolean): void {
  const value = v as never;
  if (value === null || value === undefined || value === '') {
    delete node.theme[key];
  } else {
    (node.theme as never)[key] = value;
  }
}

/** 当前渐变对象（未设置时给默认，get 侧用） */
function gradientOf(n: HdNode): NonNullable<Theme['gradient']> {
  return n.theme.gradient ?? { kind: 'none', colors: ['#000000', '#ffffff'], angle: 0 };
}

function setGradient(n: HdNode, patch: Partial<NonNullable<Theme['gradient']>>): void {
  n.theme.gradient = { ...gradientOf(n), ...patch };
}

/** 改某个色标；渐变未开启时自动切到线性，让用户改了颜色立即生效 */
function setGradientColor(n: HdNode, i: number, color: string): void {
  const cur = gradientOf(n);
  const colors = [...cur.colors];
  colors[i] = color;
  n.theme.gradient = { ...cur, kind: cur.kind === 'none' ? 'linear' : cur.kind, colors };
}

function anchorField(key: 'left' | 'top' | 'right' | 'bottom'): FieldDesc {
  // 竖直锚点允许超出 1（滚动页面内容延伸到视口下方），水平保持 [0,1]
  const vertical = key === 'top' || key === 'bottom';
  const lo = vertical ? ANCHOR_V_MIN : ANCHOR_H_MIN;
  const hi = vertical ? ANCHOR_V_MAX : ANCHOR_H_MAX;
  return {
    key: `anchor_${key}`,
    label: `锚点 ${key}`,
    kind: 'rangeNumber',
    min: lo,
    max: hi,
    step: 0.01,
    get: (n) => Math.round(n.anchors[key] * 1000) / 1000,
    set: (n, v) => {
      const val = Math.min(hi, Math.max(lo, Number(v)));
      if (key === 'left') n.anchors.left = Math.min(val, n.anchors.right);
      else if (key === 'right') n.anchors.right = Math.max(val, n.anchors.left);
      else if (key === 'top') n.anchors.top = Math.min(val, n.anchors.bottom);
      else n.anchors.bottom = Math.max(val, n.anchors.top);
    },
  };
}

function offsetField(key: 'left' | 'top' | 'right' | 'bottom'): FieldDesc {
  return {
    key: `offset_${key}`,
    label: `偏移 ${key}`,
    kind: 'number',
    step: 1,
    get: (n) => Math.round(n.offsets[key] * 10) / 10,
    set: (n, v) => {
      n.offsets[key] = Number(v) || 0;
    },
  };
}

function growField(axis: 'growH' | 'growV'): FieldDesc {
  return {
    key: axis,
    label: axis === 'growH' ? '水平扩展' : '垂直扩展',
    kind: 'select',
    options: GROW_OPTIONS,
    get: (n) => n[axis],
    set: (n, v) => {
      n[axis] = v as GrowDir;
    },
  };
}

function sizeField(key: 'minSize' | 'maxSize', axis: 'x' | 'y'): FieldDesc {
  return {
    key: `${key}_${axis}`,
    label: `${key === 'minSize' ? '最小' : '最大'}尺寸${axis === 'x' ? '宽' : '高'}`,
    kind: 'number',
    min: 0,
    step: 1,
    get: (n) => Math.round(n[key][axis]),
    set: (n, v) => {
      n[key][axis] = Math.max(0, Number(v) || 0);
    },
  };
}

function themeField(key: keyof Theme, label: string, kind: FieldKind, fallback: number | string | boolean, opts?: {
  min?: number;
  max?: number;
  step?: number;
  options?: Option[];
}): FieldDesc {
  return {
    key: `theme_${key as string}`,
    label,
    kind,
    min: opts?.min,
    max: opts?.max,
    step: opts?.step,
    options: opts?.options,
    get: (n) => tGet(n, key, fallback),
    set: (n, v) => tSet(n, key, v),
  };
}

const hasText = (t: string): boolean =>
  t === 'Label' || t === 'Button' || t === 'LineEdit' || t === 'CheckBox';

export function getFieldGroups(node: HdNode, parentIsContainer: boolean): FieldGroup[] {
  const groups: FieldGroup[] = [];

  if (parentIsContainer) {
    // 容器子节点：锚点/偏移被容器接管，只暴露尺寸标志
    groups.push({
      title: '尺寸标志（容器内）',
      fields: [
        {
          key: 'expandMain',
          label: '主轴扩展',
          kind: 'toggle',
          get: (n) => n.sizeFlags?.expandMain ?? false,
          set: (n, v) => {
            n.sizeFlags = { expandMain: Boolean(v), ratio: n.sizeFlags?.ratio ?? 1, alignCross: n.sizeFlags?.alignCross ?? 'fill' };
          },
        },
        {
          key: 'ratio',
          label: '扩展比例',
          kind: 'number',
          min: 0,
          step: 0.1,
          get: (n) => n.sizeFlags?.ratio ?? 1,
          set: (n, v) => {
            n.sizeFlags = { expandMain: n.sizeFlags?.expandMain ?? false, ratio: Math.max(0, Number(v) || 1), alignCross: n.sizeFlags?.alignCross ?? 'fill' };
          },
        },
        {
          key: 'alignCross',
          label: '交叉轴对齐',
          kind: 'select',
          options: ALIGN_OPTIONS,
          get: (n) => n.sizeFlags?.alignCross ?? 'fill',
          set: (n, v) => {
            n.sizeFlags = { expandMain: n.sizeFlags?.expandMain ?? false, ratio: n.sizeFlags?.ratio ?? 1, alignCross: v as CrossAlign };
          },
        },
        sizeField('minSize', 'x'),
        sizeField('minSize', 'y'),
        sizeField('maxSize', 'x'),
        sizeField('maxSize', 'y'),
      ],
    });
  } else {
    groups.push({
      title: '变换',
      fields: [
        anchorField('left'),
        anchorField('top'),
        anchorField('right'),
        anchorField('bottom'),
        offsetField('left'),
        offsetField('top'),
        offsetField('right'),
        offsetField('bottom'),
        sizeField('minSize', 'x'),
        sizeField('minSize', 'y'),
        sizeField('maxSize', 'x'),
        sizeField('maxSize', 'y'),
        growField('growH'),
        growField('growV'),
      ],
    });
  }

  if (isContainerNode(node)) {
    groups.push({
      title: '容器',
      fields: [
        {
          key: 'separation',
          label: '间距',
          kind: 'number',
          min: 0,
          step: 1,
          get: (n) => n.container?.separation ?? 0,
          set: (n, v) => {
            n.container = { separation: Math.max(0, Number(v) || 0), alignCross: n.container?.alignCross ?? 'fill' };
          },
        },
        {
          key: 'alignCross',
          label: '交叉轴对齐',
          kind: 'select',
          options: ALIGN_OPTIONS,
          get: (n) => n.container?.alignCross ?? 'fill',
          set: (n, v) => {
            n.container = { separation: n.container?.separation ?? 0, alignCross: v as CrossAlign };
          },
        },
      ],
    });
  }

  if (node.type === 'Scroll') {
    groups.push({
      title: '滚动',
      fields: [
        {
          key: 'scroll_dir',
          label: '方向',
          kind: 'select',
          options: SCROLL_DIR_OPTIONS,
          get: (n) => n.scroll?.dir ?? 'v',
          set: (n, v) => {
            n.scroll = { dir: v as ScrollDir };
          },
        },
      ],
    });
  }

  if (node.type === 'Image') {
    groups.push({
      title: '图片',
      fields: [
        {
          key: 'image_pick',
          label: '选择图片',
          kind: 'file',
          get: () => '',
          set: () => {},
          onPick: (n) => pickImageForNode(n),
        },
        {
          key: 'image_embed',
          label: '嵌入 HTML（base64）',
          kind: 'toggle',
          get: (n) => n.image?.embed ?? true,
          set: (n, v) => {
            n.image = { ...imageOf(n), embed: Boolean(v) };
          },
        },
        {
          key: 'image_fit',
          label: '缩放方式',
          kind: 'select',
          options: IMAGE_FIT_OPTIONS,
          get: (n) => n.image?.fit ?? 'fill',
          set: (n, v) => {
            n.image = { ...imageOf(n), fit: v as ImageFit };
          },
        },
        {
          key: 'image_filename',
          label: '文件名',
          kind: 'text',
          get: (n) => n.image?.filename ?? '',
          set: (n, v) => {
            n.image = { ...imageOf(n), filename: String(v) };
          },
        },
      ],
    });
  }

  if (hasText(node.type)) {
    const fields: FieldDesc[] = [
      {
        key: 'text',
        label: '文本',
        kind: node.type === 'Label' ? 'textarea' : 'text', // Label 常写长文本，用多行
        get: (n) => n.text ?? '',
        set: (n, v) => {
          n.text = String(v);
        },
      },
    ];
    if (node.type === 'LineEdit') {
      fields.push({
        key: 'placeholder',
        label: '占位符',
        kind: 'text',
        get: (n) => n.placeholder ?? '',
        set: (n, v) => {
          n.placeholder = String(v);
        },
      });
    }
    groups.push({ title: '文本', fields });
  }

  const border = (n: HdNode) => n.theme.border;
  const setBorder = (n: HdNode, patch: Partial<NonNullable<Theme['border']>>): void => {
    // 首次设置时 theme.border 不存在：用默认值起底，否则直接 return 会丢掉写入
    const cur = border(n) ?? { width: 0, color: '#000000', style: 'none' };
    n.theme.border = { ...cur, ...patch };
  };
  const themeFields: FieldDesc[] = [
    themeField('bg', '背景色', 'colorAlpha', ''),
    {
      key: 'gradient_kind',
      label: '背景渐变',
      kind: 'select',
      options: GRADIENT_OPTIONS,
      get: (n) => n.theme.gradient?.kind ?? 'none',
      set: (n, v) => {
        if (v === 'none') setGradient(n, { kind: 'none' });
        else setGradient(n, { kind: v as 'linear' | 'radial' });
      },
    },
    {
      key: 'gradient_c1',
      label: '渐起始色',
      kind: 'colorAlpha',
      get: (n) => gradientOf(n).colors[0] ?? '#000000',
      set: (n, v) => setGradientColor(n, 0, String(v)),
    },
    {
      key: 'gradient_c2',
      label: '渐结束色',
      kind: 'colorAlpha',
      get: (n) => gradientOf(n).colors[1] ?? '#ffffff',
      set: (n, v) => setGradientColor(n, 1, String(v)),
    },
    {
      key: 'gradient_angle',
      label: '渐变角度°',
      kind: 'number',
      min: 0,
      max: 360,
      step: 1,
      get: (n) => n.theme.gradient?.angle ?? 0,
      set: (n, v) => setGradient(n, { angle: Number(v) || 0 }),
    },
    themeField('color', '文字色', 'colorAlpha', ''),
    themeField('bold', '加粗', 'toggle', false),
    themeField('fontFamily', '字体', 'select', '', { options: FONT_OPTIONS }),
    themeField('textAlign', '文本对齐', 'select', 'left', { options: TEXT_ALIGN_OPTIONS }),
    themeField('radius', '圆角', 'number', 0, { min: 0, step: 1 }),
    themeField('padding', '内边距', 'number', 0, { min: 0, step: 1 }),
    themeField('opacity', '不透明度', 'range', 1, { min: 0, max: 1, step: 0.01 }),
    {
      key: 'borderWidth',
      label: '边框宽度',
      kind: 'number',
      min: 0,
      step: 1,
      get: (n) => border(n)?.width ?? 0,
      set: (n, v) => setBorder(n, { width: Math.max(0, Number(v) || 0) }),
    },
    {
      key: 'borderColor',
      label: '边框颜色',
      kind: 'colorAlpha',
      get: (n) => border(n)?.color ?? '#000000',
      set: (n, v) => setBorder(n, { color: String(v) }),
    },
    {
      key: 'borderStyle',
      label: '边框样式',
      kind: 'select',
      options: BORDER_STYLE_OPTIONS,
      get: (n) => border(n)?.style ?? 'none',
      set: (n, v) => setBorder(n, { style: v as never }),
    },
  ];
  if (node.type === 'Label') {
    themeFields.push(themeField('vAlign', '垂直对齐', 'select', 'top', { options: V_ALIGN_OPTIONS }));
    themeFields.push(themeField('autowrap', '自动换行', 'toggle', false));
  }
  // Image 不适用的字段隐藏（字体/文本相关）
  const visible = node.type === 'Image'
    ? themeFields.filter((f) => !IMAGE_THEME_IGNORE.includes(f.key))
    : themeFields;
  groups.push({ title: '主题', fields: visible });

  return groups;
}
