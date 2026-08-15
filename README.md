# HTML Designer — Godot 锚点式 UI 编辑器

把 Godot 的 Control 节点锚点思维搬到浏览器里：**不写一行 CSS**，像搭场景树一样搭界面，导出**单个自包含、零 JavaScript 的 HTML 文件**。

```
画布所见 = 导出所成（WYSIWYG）
锚点 → CSS calc()，容器 → flexbox，窗口缩放时布局按锚点自动响应
```

## 快速开始

```bash
npm install
npm run dev        # 打开编辑器（http://localhost:5173）
```

```bash
npm run build      # 产物在 dist/
npm test           # 单元测试（布局数学 + CSS golden + 交互 + 示例工程）
```

示例工程在 [examples/demo.hdproj](examples/demo.hdproj)，编辑器里点「打开」加载它，再点「导出 HTML」看效果。

## 概念映射

| Godot | 本工具 | 导出到的 CSS |
|---|---|---|
| Control 锚点 `(left,top,right,bottom)` | 每个节点 4 个锚点（0..1）+ 4 个像素偏移 | `left/top/right/bottom: calc(锚点% ± 偏移px)` + `width/height` |
| `grow_horizontal / grow_vertical` | `growH / growV`（BEGIN/END/BOTH） | END→`left+width`；BEGIN→`right+width`（BOTH 近似 END，见限制） |
| `custom_minimum_size` | `minSize` / `maxSize` | `min-width/height`、`max-width/height` |
| HBoxContainer / VBoxContainer | HBox / VBox | `display:flex` + `flex-direction` + `gap` + `align-items` |
| `size_flags`（expand/ratio/stretch） | 容器子节点的 `sizeFlags` | `flex:ratio 0 0` + `min-main-size` + `align-self` |
| Control / Panel | Control / Panel | 绝对定位的 `div` |
| Label / Button / LineEdit / CheckBox | 同名组件 | 原生 `div/button/input[type=text]/label+input[type=checkbox]` |
| ColorRect / 无 | Spacer | `flex:ratio 0 0` 空盒 |

## 组件

- **Control**：自由布局父容器，可放任意子节点。
- **Panel**：带背景/边框的 Control。
- **Label / Button / LineEdit / CheckBox**：文本类组件，可在检查器里改文字、字号、颜色、粗体、对齐、自动换行等。
- **HBox / VBox**：容器，子节点按主轴排列；子节点可设 `expandMain`（占满剩余空间）、`ratio`（分配权重）、`alignCross`（交叉轴对齐）。
- **Spacer**：可伸缩空盒，用于把按钮推向一侧。

## 锚点预设（9 个）

左上 / 右上 / 左下 / 右下 / 顶部拉伸 / 底部拉伸 / 左侧拉伸 / 右侧拉伸 / 全屏。
应用预设时**保持当前像素矩形不变**，只改锚点并自动设置 grow 方向。

## 交互

- **左键点选**（画布或场景树），拖拽移动，拖 8 个手柄缩放。
- **右键菜单**：添加子节点、锚点预设、上移/下移、复制、重命名、删除。
- **检查器**：锚点数值、偏移、min/max、grow 方向、容器间距、主题颜色/字体、Size Flags。
- **方向键**微移选中节点（Shift 一次 10px）。
- 容器子节点由容器自动布局，不能手动拖拽（与 Godot 一致）。

### 快捷键

| 按键 | 功能 |
|---|---|
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | 撤销 / 重做 |
| Ctrl+D | 复制选中节点 |
| Delete / Backspace | 删除选中节点 |
| Ctrl+S / Ctrl+E | 保存工程 / 导出 HTML |
| Ctrl+N / Ctrl+O | 新建 / 打开 |
| ↑↓←→（+Shift） | 微移节点 |
| Escape | 取消选择 |

## 工程文件

`.hdproj` 是 JSON。字段与 `HdNode` 一一对应：

- `anchors`：`{left,top,right,bottom}` 0..1
- `offsets`：`{left,top,right,bottom}` 像素
- `growH/growV`：`'BEGIN' | 'END' | 'BOTH'`
- `minSize/maxSize`：`{x,y}` 像素，`0` 表示无限制
- `sizeFlags`（容器子节点）：`{expandMain, ratio, alignCross}`
- `container`（HBox/VBox）：`{separation, alignCross}`
- `theme`：`{bg, color, fontSize, bold, fontFamily, textAlign, autowrap, opacity, radius, padding, border}`

## 已知保真度限制

1. **`grow=BOTH` 无法在纯 CSS 中居中 clamp** —— 导出时近似为 END（画布上实际 clamp 行为可能与导出有一两像素出入）。
2. **被 clamp 的拉伸控件**，其远端不再贴合锚点（方向正确、像素由浏览器计算）。
3. **容器子节点按内容自适应尺寸**（与 Godot BoxContainer 的「最小尺寸」语义一致），不是画布上看到的固定矩形。若需要固定尺寸，请用 minSize 或改用自由布局。
4. **文本测量 ±1-2px**：编辑画布用 canvas `measureText` 估算文本宽度，真实渲染由浏览器字体决定；不同机器可能有一两像素差异。
5. **容器分配与 Godot 最多差 1px**（flexbox vs Godot box layout 的取整差异）。
6. **导出的是交互 mockup**：按钮可点、输入框可输入、复选框可勾选（零 JS 免费加成），但未接业务逻辑。
7. 容器不换行（Godot 同）；Label 仅在「自动换行」时换行。

## 架构

```
src/
  core/     纯 TS 布局引擎（无 DOM，可无头测试）
    layout.ts     锚点数学、minSizeFor、容器分配（Godot 算法）
    presets.ts    9 个锚点预设
    fmt.ts        calc() 字符串格式化（不支持乘法、空格规则）
  export/   唯一一份 锚点→CSS 映射器（编辑画布与导出共用 → WYSIWYG）
  editor/   状态（store）、拖拽/缩放数学、结构命令、检查器 schema
  ui/       画布、场景树、检查器、工具栏、文件读写
tests/      46+ 个单测（含 demo 冒烟测试）
```

关键技术点：CSS `calc()` **不支持乘法**，因此百分比预先算好；每轴**绝不同时发两条边**（CSS 过约束时 width 赢）；全局 `box-sizing:border-box` 保证偏移计算正确；嵌套容器作为 flex item 时给显式主尺寸，内部绝对定位孙节点才能解析 `calc(%)`。
