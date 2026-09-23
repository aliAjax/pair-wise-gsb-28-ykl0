import { useDraggable } from "@dnd-kit/core";
import { SLOT_LABEL } from "../data";
import { zoneText } from "../rules";
import type { BasketOrder } from "../types";

interface Props {
  order: BasketOrder;
  onEdit?: (order: BasketOrder) => void;
  onDeliver?: (order: BasketOrder) => void;
  onDelete?: (order: BasketOrder) => void;
}

const STATUS_TEXT: Record<BasketOrder["status"], string> = {
  pending: "待分配",
  assigned: "已排车",
  departed: "已发车",
  delivered: "已送达"
};

export function OrderCard({ order, onEdit, onDeliver, onDelete }: Props) {
  // 已发车：司机/时段/筐数锁定，不可再拖；待分配与已排车可拖拽（改派/拖回）
  const draggable = order.status === "pending" || order.status === "assigned";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
    disabled: !draggable
  });

  const mixed = order.cold > 0 && order.amb > 0;

  return (
    <article
      ref={setNodeRef}
      className={`order-card status-${order.status} ${isDragging ? "dragging" : ""} ${draggable ? "draggable" : ""}`}
      {...listeners}
      {...attributes}
      title={draggable ? "拖拽到右侧司机时段完成排班/改派" : "已锁定，不可拖拽"}
    >
      <div className="order-card-head">
        <p className="order-no">{order.orderNo}</p>
        <span className={`status-pill status-${order.status}`}>{STATUS_TEXT[order.status]}</span>
      </div>
      <p className="order-dest">{order.destination}</p>
      <div className="order-tags">
        <span className="chip">{SLOT_LABEL[order.slot]}</span>
        <span className="chip chip-cold">冷 {order.cold}</span>
        <span className="chip chip-amb">常 {order.amb}</span>
        <span className={`chip zone-badge zone-${mixed || order.cold === 0 ? "amb" : "cold"}`}>
          {zoneText(order.cold, order.amb)}
        </span>
      </div>
      {order.note && <p className="order-note">{order.note}</p>}
      {(onEdit || onDeliver || onDelete) && (
        <div className="order-actions" onClick={(e) => e.stopPropagation()}>
          {onEdit && order.status === "pending" && (
            <button type="button" className="mini secondary" onClick={() => onEdit(order)}>
              补录
            </button>
          )}
          {onDeliver && order.status === "departed" && (
            <button type="button" className="mini" onClick={() => onDeliver(order)}>
              送达登记
            </button>
          )}
          {onDelete && order.status === "pending" && (
            <button type="button" className="mini danger" onClick={() => onDelete(order)}>
              删除
            </button>
          )}
        </div>
      )}
    </article>
  );
}
