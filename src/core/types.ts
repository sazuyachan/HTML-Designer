// 核心数据模型：Godot 式 Control 节点树

export type NodeType =
  | 'Control'
  | 'Panel'
  | 'Label'
  | 'Button'
  | 'LineEdit'
  | 'CheckBox'
  | 'HBox'
  | 'VBox'
  | 'Spacer';

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
  return type === 'HBox' || type === 'VBox';
}

export function isContainerNode(node: HdNode): boolean {
  return isContainerType(node.type);
}
