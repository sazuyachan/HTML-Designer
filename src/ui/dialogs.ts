// 通用模态对话框（保存 / 导出选项 / 使用帮助）

export interface DialogField {
  key: string;
  label: string;
  kind: 'text' | 'checkbox';
  initial?: string;
  checked?: boolean;
}

/**
 * 弹一个带字段的表单对话框，返回字段值；取消/Esc/点击遮罩返回 null。
 * checkbox 的值：'1' 选中 / '0' 未选中。
 */
export function showDialog(opts: {
  title: string;
  fields: DialogField[];
  confirmLabel?: string;
}): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: Record<string, string> | null): void => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(v);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    };
    document.addEventListener('keydown', onKey, true);

    const overlay = document.createElement('div');
    overlay.className = 'dlg-overlay';
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) finish(null);
    });

    const box = document.createElement('div');
    box.className = 'dlg-box';
    const head = document.createElement('div');
    head.className = 'dlg-head';
    head.textContent = opts.title;
    const content = document.createElement('div');
    content.className = 'dlg-body';

    const inputs: Record<string, HTMLInputElement> = {};
    for (const f of opts.fields) {
      const row = document.createElement('label');
      row.className = 'dlg-field' + (f.kind === 'checkbox' ? ' row' : '');
      const lab = document.createElement('span');
      lab.textContent = f.label;
      row.appendChild(lab);
      if (f.kind === 'checkbox') {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = f.checked ?? false;
        inputs[f.key] = cb;
        row.appendChild(cb);
      } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = f.initial ?? '';
        inp.spellcheck = false;
        inputs[f.key] = inp;
        row.appendChild(inp);
      }
      content.appendChild(row);
    }

    const foot = document.createElement('div');
    foot.className = 'dlg-foot';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => finish(null));
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = opts.confirmLabel ?? '确定';
    okBtn.classList.add('primary');
    okBtn.addEventListener('click', () => {
      const values: Record<string, string> = {};
      for (const f of opts.fields) {
        const el = inputs[f.key];
        values[f.key] = f.kind === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
      }
      finish(values);
    });
    okBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') okBtn.click();
    });
    foot.appendChild(cancelBtn);
    foot.appendChild(okBtn);

    box.appendChild(head);
    box.appendChild(content);
    box.appendChild(foot);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const first = content.querySelector<HTMLInputElement>('input[type=text]');
    if (first) {
      first.focus();
      first.select();
      first.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          okBtn.click();
        }
      });
    }
  });
}

/** 使用帮助弹窗（Godot 风格术语） */
export function showHelpDialog(): void {
  const overlay = document.createElement('div');
  overlay.className = 'dlg-overlay';
  const box = document.createElement('div');
  box.className = 'dlg-box wide';
  const head = document.createElement('div');
  head.className = 'dlg-head';
  head.textContent = '使用说明';
  const body = document.createElement('div');
  body.className = 'dlg-body help';
  body.innerHTML = `
    <h3>基本操作</h3>
    <ul>
      <li><b>点选</b>：画布或场景树左键选中；<b>拖拽</b>移动节点（容器子节点由容器自动布局，不可拖）。</li>
      <li><b>缩放</b>：拖动选中框的 <b>8 个手柄</b>调整大小。</li>
      <li><b>右键菜单</b>：添加子节点、锚点预设、上移/下移、复制、重命名、删除。</li>
      <li><b>滚轮</b>：画布缩放；<b>中键拖拽</b>：平移画布。</li>
      <li><b>双击场景树节点</b>：原地重命名。</li>
      <li><b>场景树拖拽排序</b>（Godot 式）：拖到目标行<b>上半</b>插到其前、<b>下半</b>插到其后、<b>中间</b>成为其子节点（目标自动展开）。</li>
    </ul>
    <h3>绘制顺序</h3>
    <ul>
      <li>树中<b>靠下的节点绘制在上层</b>，会盖住靠上的。背景板（如 Panel）应放在<b>最前面</b>（拖到根节点第一个），被它盖住的控件放在后面。</li>
    </ul>
    <h3>锚点（Godot 思维）</h3>
    <ul>
      <li>每个节点 4 个锚点（0..1）+ 4 个偏移（px），锚点相对<b>父节点</b>。锚点预设可一键设置。</li>
      <li><b>锚点 = 拉伸</b>：两边锚点不同则跟随父级缩放；<b>相同则固定尺寸</b>。偏移决定像素间距。</li>
      <li><b>grow</b>：尺寸被 min/max 钳制时哪条边钉住。END＝钉起始边，BEGIN＝钉结束边，BOTH＝居中（导出近似 END）。</li>
    </ul>
    <h3>容器（HBox / VBox）</h3>
    <ul>
      <li>子节点沿主轴排列，间距由「容器→间距」控制。选中子节点可在「尺寸标志」里设 <b>主轴扩展</b>（占满剩余空间）、<b>扩展比例</b>（分配权重）、<b>交叉轴对齐</b>。</li>
      <li>非扩展子节点按<b>内容最小尺寸</b>自适应（与 Godot BoxContainer 一致）。</li>
    </ul>
    <h3>图片节点（Image）与滚动容器（Scroll）</h3>
    <ul>
      <li><b>Image</b>：右键添加后，在检查器「图片」里点<b>选择图片</b>。默认 <b>base64 嵌入</b> HTML；关闭「嵌入 HTML」则该图片导出时放进 <code>assets/images/</code> 文件夹。缩放方式对应 CSS object-fit（拉伸 / 等比 / 等比铺满）。</li>
      <li><b>Scroll</b>：带滚动条的容器，子节点仍用锚点布局（Godot ScrollContainer 式）。「滚动」组可选<b>垂直 / 水平 / 双向</b>；内部超出部分靠容器滚动条查看。</li>
      <li><b>Label 文本</b>：检查器里是多行编辑框，适合写长文本（配合「自动换行」使用）。</li>
    </ul>
    <h3>滚动页面（竖直锚点超过 1）</h3>
    <ul>
      <li>把节点的<b>竖直锚点 top / bottom</b> 设到 <b>1 以上</b>，内容就放到首屏下方（可继续往下滚的网页布局）。滑块范围 0–5，数值框可输入小数。</li>
      <li>编辑器画布会自动<b>向下扩展</b>编辑区（白色区域变高）显示这些内容。</li>
      <li>导出时若存在超出首屏的内容，自动变成<b>可滚动页面</b>：根节点增高、body 纵向滚动；垂直方向按设计像素、水平方向仍随窗口宽度响应。此时「所见即所得」的整体缩放不生效（滚动页天然不适合整体缩放）。</li>
    </ul>
    <h3>快捷键</h3>
    <ul>
      <li>Ctrl+Z/Y 撤销重做 · Ctrl+D 复制 · Delete 删除 · Ctrl+S 保存 · Ctrl+E 导出</li>
      <li>方向键微移（Shift 一次 10px）· Escape 取消选择</li>
    </ul>
    <h3>导出</h3>
    <ul>
      <li>默认导出为<b>零 JS</b> 单 HTML。工具栏的「<b>所见即所得</b>」开关（导出/预览共用）：打开＝固定按参考分辨率整体等比缩放，任何窗口下与编辑器一致；关闭＝<b>响应式</b>，根节点填满窗口，锚点随窗口重排（Godot 运行时行为，锚点相同的控件不会随窗口拉伸）。</li>
      <li>存在<b>未嵌入的图片</b>时自动导出 <b>ZIP</b>：<code>index.html</code> + <code>assets/images/</code> 下的图片（HTML 用相对路径引用）。</li>
      <li>导出对话框可勾选「附带节点变量脚本」，自动生成
        <code>const 父__子 = document.querySelector(...)</code> 供后续写 JS 用。</li>
      <li>按钮/输入框/复选框是原生可交互的 mockup，未接业务逻辑。</li>
    </ul>
  `;
  const foot = document.createElement('div');
  foot.className = 'dlg-foot';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.textContent = '知道了';
  ok.classList.add('primary');
  const close = (): void => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  ok.addEventListener('click', close);
  foot.appendChild(ok);
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) close();
  });
  box.appendChild(head);
  box.appendChild(body);
  box.appendChild(foot);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey, true);
}
