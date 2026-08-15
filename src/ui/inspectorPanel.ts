// 右侧检查器面板（字段由 editor/inspector.ts 数据驱动）

import type { FieldDesc } from '../editor/inspector';
import { getFieldGroups } from '../editor/inspector';
import type { HdNode } from '../core/types';
import { isContainerNode } from '../core/types';
import { findNode } from '../core/serialize';
import { computeLayout } from '../core/layout';
import { applyPreset, findPreset, PRESETS } from '../core/presets';
import type { ChangeSource, Store } from '../editor/store';

type FieldKind = FieldDesc['kind'];

export function createInspector(store: Store, el: HTMLElement): { render(): void; handleChange(src: ChangeSource): void } {
  let fields: FieldDesc[] = [];
  let lastSel: string | null = null;

  function ctx(): { node: HdNode; parentIsContainer: boolean } | null {
    const id = store.selection;
    if (!id) return null;
    const hit = findNode(store.project, id);
    if (!hit) return null;
    return { node: hit.node, parentIsContainer: hit.parent ? isContainerNode(hit.parent) : false };
  }

  function render(): void {
    el.innerHTML = '';
    lastSel = store.selection;
    const c = ctx();
    if (!c) {
      const empty = document.createElement('div');
      empty.className = 'insp-empty';
      empty.textContent = '未选中节点';
      el.appendChild(empty);
      fields = [];
      return;
    }

    fields = [];
    const node = c.node;

    // 头部：名称 + 类型
    const header = document.createElement('div');
    header.className = 'insp-header';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'insp-name';
    nameInput.value = node.name;
    nameInput.dataset.key = '__name';
    nameInput.addEventListener('focus', () => {
      nameInput.dataset.sn = '1';
    });
    nameInput.addEventListener('input', () => {
      if (nameInput.dataset.sn) {
        store.pushSnapshot();
        delete nameInput.dataset.sn;
      }
      store.mutateLive((p) => {
        const n = findNode(p, node.id);
        if (n) n.node.name = nameInput.value || node.name;
      }, 'inspector');
    });
    const typeEl = document.createElement('span');
    typeEl.className = 'insp-type';
    typeEl.textContent = node.type;
    header.appendChild(nameInput);
    header.appendChild(typeEl);
    el.appendChild(header);

    // 锚点预设（自由布局的非根节点）
    if (!c.parentIsContainer && node.id !== store.project.root.id) {
      el.appendChild(presetSection(node));
    }

    const groups = getFieldGroups(node, c.parentIsContainer);
    for (const g of groups) {
      const section = document.createElement('div');
      section.className = 'insp-section';
      const title = document.createElement('div');
      title.className = 'insp-section-title';
      title.textContent = g.title;
      section.appendChild(title);
      for (const f of g.fields) {
        section.appendChild(renderField(f, node));
        fields.push(f);
      }
      el.appendChild(section);
    }
  }

  function presetSection(node: HdNode): HTMLElement {
    const section = document.createElement('div');
    section.className = 'insp-section';
    const title = document.createElement('div');
    title.className = 'insp-section-title';
    title.textContent = '锚点预设';
    section.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'preset-grid';

    const layout = computeLayout(store.project, store.measure);
    const hit = findNode(store.project, node.id)!;
    const parentId = hit.parent ? hit.parent.id : null;
    const parentRect = parentId
      ? layout.rects.get(parentId)!
      : { x: 0, y: 0, w: store.project.viewport.x, h: store.project.viewport.y };

    for (const preset of PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = preset.label;
      btn.dataset.preset = preset.key;
      btn.addEventListener('click', () => {
        store.mutate((p) => {
          const n = findNode(p, node.id);
          if (n) applyPreset(n.node, preset, parentRect);
        }, 'structure');
      });
      grid.appendChild(btn);
    }
    section.appendChild(grid);
    return section;
  }

  function renderField(f: FieldDesc, node: HdNode): HTMLElement {
    const row = document.createElement('div');
    row.className = 'insp-row';
    const label = document.createElement('span');
    label.className = 'ilabel';
    label.textContent = f.label;
    row.appendChild(label);

    const wrap = document.createElement('div');
    wrap.className = 'ifield';

    // 滑条 + 数字框并存：滑条拖动与手输数值互相联动
    if (f.kind === 'rangeNumber') {
      const range = document.createElement('input');
      range.type = 'range';
      range.dataset.key = f.key;
      range.dataset.ctl = 'range';
      range.min = String(f.min ?? 0);
      range.max = String(f.max ?? 1);
      range.step = String(f.step ?? 0.01);
      range.value = String(f.get(node));

      const num = document.createElement('input');
      num.type = 'number';
      num.dataset.key = f.key;
      num.dataset.ctl = 'number';
      if (f.step !== undefined) num.step = String(f.step);
      if (f.min !== undefined) num.min = String(f.min);
      if (f.max !== undefined) num.max = String(f.max);
      num.value = String(f.get(node));

      range.addEventListener('input', () => {
        num.value = range.value; // 仅同步 UI，数据由 wire 的监听写入
      });
      num.addEventListener('input', () => {
        if (num.value === '' || Number.isNaN(Number(num.value))) return;
        range.value = num.value;
      });

      wrap.appendChild(range);
      wrap.appendChild(num);
      wire(f, node, range);
      wire(f, node, num);
      row.appendChild(wrap);
      return row;
    }

    const input = createInput(f, node);
    wrap.appendChild(input);
    if (f.kind === 'range') {
      const val = document.createElement('span');
      val.className = 'range-val';
      val.dataset.valFor = f.key;
      val.textContent = String(f.get(node));
      wrap.appendChild(val);
      input.addEventListener('input', () => {
        val.textContent = (input as HTMLInputElement).value;
      });
    }
    row.appendChild(wrap);

    wire(f, node, input);
    return row;
  }

  function createInput(f: FieldDesc, node: HdNode): HTMLInputElement | HTMLSelectElement {
    const v = f.get(node);
    const input = document.createElement(f.kind === 'select' ? 'select' : 'input') as HTMLInputElement & HTMLSelectElement;
    input.dataset.key = f.key;
    switch (f.kind) {
      case 'text':
        (input as HTMLInputElement).type = 'text';
        (input as HTMLInputElement).value = String(v);
        break;
      case 'number':
        (input as HTMLInputElement).type = 'number';
        (input as HTMLInputElement).step = String(f.step ?? 1);
        if (f.min !== undefined) (input as HTMLInputElement).min = String(f.min);
        if (f.max !== undefined) (input as HTMLInputElement).max = String(f.max);
        (input as HTMLInputElement).value = String(v);
        break;
      case 'range':
        (input as HTMLInputElement).type = 'range';
        (input as HTMLInputElement).min = String(f.min ?? 0);
        (input as HTMLInputElement).max = String(f.max ?? 1);
        (input as HTMLInputElement).step = String(f.step ?? 0.01);
        (input as HTMLInputElement).value = String(v);
        break;
      case 'color':
        (input as HTMLInputElement).type = 'color';
        (input as HTMLInputElement).value = String(v || '#000000');
        break;
      case 'select': {
        const sel = input as HTMLSelectElement;
        sel.innerHTML = '';
        for (const opt of f.options ?? []) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          sel.appendChild(o);
        }
        sel.value = String(v);
        break;
      }
      case 'toggle':
        (input as HTMLInputElement).type = 'checkbox';
        break;
    }
    return input as HTMLInputElement;
  }

  function wire(f: FieldDesc, node: HdNode, input: HTMLInputElement | HTMLSelectElement): void {
    const apply = (): void => applyInput(f, node, input);
    if (f.kind === 'toggle') {
      input.addEventListener('change', () => {
        store.pushSnapshot();
        apply();
      });
      return;
    }
    // 一次编辑会话压入一次快照：focus 武装，首次变更时消费
    input.addEventListener('focus', () => {
      (input as HTMLInputElement).dataset.sn = '1';
    });
    const onFirst = (): void => {
      const el = input as HTMLInputElement;
      if (el.dataset.sn === '1') {
        delete el.dataset.sn;
        store.pushSnapshot();
      }
    };
    const evt = f.kind === 'text' || f.kind === 'range' || f.kind === 'rangeNumber' || f.kind === 'color' ? 'input' : 'change';
    input.addEventListener(evt, () => {
      onFirst();
      apply();
    });
  }

  function applyInput(f: FieldDesc, node: HdNode, input: HTMLInputElement | HTMLSelectElement): void {
    const raw = 'value' in input ? input.value : '';
    let val: number | string | boolean;
    if (f.kind === 'number' || f.kind === 'range' || f.kind === 'rangeNumber') {
      val = raw === '' ? 0 : Number(raw);
    } else if (f.kind === 'toggle') {
      val = (input as HTMLInputElement).checked;
    } else {
      val = raw;
    }
    store.mutateLive(() => f.set(node, val), 'inspector');
  }

  function setInputValue(input: HTMLElement, kind: FieldKind, v: number | string | boolean): void {
    const el = input as HTMLInputElement;
    if (kind === 'toggle') {
      el.checked = Boolean(v);
    } else {
      el.value = String(v);
    }
    if (kind === 'color' && !el.value) el.value = '#000000';
    if (kind === 'range' && el.type === 'range') {
      const val = el.closest('.insp-row')?.querySelector('.range-val') as HTMLElement | null;
      if (val) val.textContent = String(v);
    }
  }

  function updateValues(): void {
    const c = ctx();
    if (!c) return;
    el.querySelectorAll<HTMLElement>('.insp-name').forEach((n) => {
      if (n !== document.activeElement && n instanceof HTMLInputElement) n.value = c.node.name;
    });
    el.querySelectorAll<HTMLElement>('.preset-grid button[data-preset]').forEach((b) => {
      const active = findPreset(c.node)?.key === b.dataset.preset;
      b.classList.toggle('active', active);
    });
    for (const f of fields) {
      const v = f.get(c.node);
      el.querySelectorAll<HTMLElement>(`[data-key="${f.key}"]`).forEach((input) => {
        if (input === document.activeElement) return;
        setInputValue(input, f.kind, v);
      });
    }
  }

  function handleChange(src: ChangeSource): void {
    if (src === 'drag' || src === 'zoom') return;
    if (src === 'inspector') {
      updateValues();
      return;
    }
    if (src === 'drag-end') {
      updateValues();
      return;
    }
    if (lastSel === store.selection && src === 'structure') {
      updateValues();
      return;
    }
    render();
  }

  return { render, handleChange };
}
