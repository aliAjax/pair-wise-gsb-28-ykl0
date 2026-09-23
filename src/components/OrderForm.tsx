import { useEffect, useState } from "react";
import { SLOTS } from "../data";
import { useDeskStore, type OrderDraft } from "../store";
import type { BasketOrder, SlotId } from "../types";
import { zoneText } from "../rules";

const EMPTY: OrderDraft = {
  orderNo: "",
  destination: "",
  slot: "morning",
  cold: 0,
  amb: 0,
  note: ""
};

interface Props {
  editing: BasketOrder | null;
  onDone: () => void;
}

export function OrderForm({ editing, onDone }: Props) {
  const addOrder = useDeskStore((state) => state.addOrder);
  const updateOrder = useDeskStore((state) => state.updateOrder);
  // 提交失败（校验或额度冲突）时不清空：输入保留，等待修正后重试
  const [draft, setDraft] = useState<OrderDraft>(EMPTY);

  useEffect(() => {
    if (editing) {
      setDraft({
        orderNo: editing.orderNo,
        destination: editing.destination,
        slot: editing.slot,
        cold: editing.cold,
        amb: editing.amb,
        note: editing.note
      });
    }
  }, [editing]);

  function patch<K extends keyof OrderDraft>(key: K, value: OrderDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = editing ? updateOrder(editing.id, draft) : addOrder(draft);
    if (ok) {
      setDraft(EMPTY);
      onDone();
    }
  }

  function cancel() {
    setDraft(EMPTY);
    onDone();
  }

  return (
    <form className="panel order-form" onSubmit={submit}>
      <h2>{editing ? "补录/修改待分配订单" : "新增待分配订单"}</h2>
      <p className="form-hint">补录配送时段与周转筐数（冷筐 / 常温筐），温区按筐数自动判定。</p>
      <div className="form-grid">
        <label>
          订单号
          <input value={draft.orderNo} onChange={(e) => patch("orderNo", e.target.value)} placeholder="如 ORD-9100" />
        </label>
        <label>
          目的地
          <input value={draft.destination} onChange={(e) => patch("destination", e.target.value)} placeholder="配送点位" />
        </label>
        <label>
          配送时段
          <select value={draft.slot} onChange={(e) => patch("slot", e.target.value as SlotId)}>
            {SLOTS.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label}（{slot.window}）
              </option>
            ))}
          </select>
        </label>
        <div className="num-row">
          <label>
            冷筐数
            <input
              type="number"
              min={0}
              step={1}
              value={draft.cold}
              onChange={(e) => patch("cold", Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
            />
          </label>
          <label>
            常温筐数
            <input
              type="number"
              min={0}
              step={1}
              value={draft.amb}
              onChange={(e) => patch("amb", Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
            />
          </label>
        </div>
        <div className="zone-preview">
          合计 <strong>{draft.cold + draft.amb}</strong> 筐 · 温区：
          <span className={`zone-badge zone-${draft.cold > 0 ? "cold" : "amb"}`}>
            {zoneText(draft.cold, draft.amb)}
          </span>
        </div>
        <label>
          备注
          <textarea value={draft.note} onChange={(e) => patch("note", e.target.value)} placeholder="现场要求或补充说明" />
        </label>
        <div className="form-actions">
          <button type="submit">{editing ? "保存修改" : "加入待分配"}</button>
          {editing && (
            <button type="button" className="secondary" onClick={cancel}>
              取消
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
