// 核心数据模型：Godot 式 Control 节点树

export type NodeType =
  | 'Control'
  | 'Panel'
  | 'Label'
  | 'Button'
  | 'LineEdit'
  | 'CheckBox'
  | 'Image'
  | 'Scroll'
  | 'HBox'
  | 'VBox'
  | 'Spacer';

export type ScrollDir = 'v' | 'h' | 'both';

/** 图片缩放方式（对应 object-fit） */
export type ImageFit = 'fill' | 'contain' | 'cover';

export type GrowDir = 'BEGIN' | 'END' | 'BOTH';
export type CrossAlign = 'fill' | 'begin' | 'center' | 'end';
export type TextAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'center' | 'bottom';

export interface Anchors {
  left: number;   // 0..1，相对父控件
  top: number;
  right: number;
  bottom: number;
}

export interface Offsets {
  left: number;   // px
  top: number;
  right: number;
  bottom: number;
}

export interface Size2D {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BorderTheme {
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted' | 'none';
}

/** 背景渐变（colors 为 CSS 颜色，可用 8 位 hex 含透明度） */
export interface Gradient {
  kind: 'none' | 'linear' | 'radial';
  colors: string[];
  angle?: number;             // linear 角度（deg，0=向上）
}

export interface Theme {
  bg?: string;
  color?: string;
  fontSize?: number;
  bold?: boolean;
  fontFamily?: string;
  opacity?: number;           // 0..1
  textAlign?: TextAlign;
  radius?: number;            // px
  padding?: number;           // px（四边统一）
  border?: BorderTheme;
  gradient?: Gradient;        // 背景渐变（覆盖 bg）
  autowrap?: boolean;         // 仅 Label
  vAlign?: VAlign;            // 仅 Label：垂直对齐
}

export interface SizeFlags {
  expandMain: boolean;        // 主轴上扩展（stretch）
  ratio: number;              // 扩展比例
  alignCross: CrossAlign;     // 交叉轴对齐
}

export interface ContainerProps {
  separation: number;         // px
  alignCross: CrossAlign;
}

export interface ImageProps {
  src: string;                // data URL（编辑器预览 + 嵌入导出；外链导出时的数据来源）
  embed: boolean;             // true=base64 嵌入 HTML；false=导出为 assets/images 下的文件
  filename: string;           // 外链模式的文件名（嵌入模式忽略）
  fit: ImageFit;              // object-fit
}

export interface ScrollProps {
  dir: ScrollDir;             // 滚动方向
}

export interface HdNode {
  id: string;
  type: NodeType;
  name: string;
  anchors: Anchors;
  offsets: Offsets;
  minSize: Size2D;
  maxSize: Size2D;
  growH: GrowDir;
  growV: GrowDir;
  theme: Theme;
  sizeFlags?: SizeFlags;
  container?: ContainerProps;
  image?: ImageProps;
  scroll?: ScrollProps;
  text?: string;
  placeholder?: string;
  hidden?: boolean;           // 仅编辑器：隐藏（display:none），导出不受影响
  children: HdNode[];
}

export interface Project {
  name: string;
  viewport: Size2D;
  root: HdNode;
}

export interface FontSpec {
  fontSize: number;
  bold: boolean;
  fontFamily?: string;
}

/** 文本测量接口（编辑器用 canvas，测试用 stub，注入保证可无头运行） */
export interface Measure {
  text(text: string, font: FontSpec): Size2D;
}

export function isContainerType(type: NodeType): boolean {
  return type === 'HBox' || type === 'VBox' || type === 'Scroll';
}

export function isContainerNode(node: HdNode): boolean {
  return isContainerType(node.type);
}

/** Scroll 也是 flex 容器（Godot ScrollContainer）：子节点由容器自动布局，内容超出时容器滚动。 */
export function isScrollNode(node: HdNode): boolean {
  return node.type === 'Scroll';
}

/** 容器主轴是否水平（HBox 恒水平；Scroll 由方向决定，v/both → 垂直）。 */
export function containerIsHorizontal(node: HdNode): boolean {
  return node.type === 'HBox' || (node.type === 'Scroll' && node.scroll?.dir === 'h');
}
