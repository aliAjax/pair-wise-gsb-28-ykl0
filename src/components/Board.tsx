import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { DRIVERS, SLOTS } from "../data";
import { cellUsage } from "../rules";
import { useDeskStore } from "../store";
import type { BasketOrder, SlotId } from "../types";
import { OrderCard } from "./OrderCard";

interface Props {
  onDeliver: (order: BasketOrder) => void;
  onEdit: (order: BasketOrder) => void;
}

function Cell({
  driverId,
  slot,
  orders,
  onDeliver
}: {
  driverId: string;
  slot: SlotId;
  orders: BasketOrder[];
  onDeliver: (order: BasketOrder) => void;
}) {
  const { orders: allOrders, recoveries, departCell } = useDeskStore();
  const driver = DRIVERS.find((item) => item.id === driverId)!;
  const used = cellUsage(allOrders, recoveries, driverId, slot);
  const cellOrders = orders.filter((order) => order.driverId === driverId && order.slot === slot);
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${driverId}:${slot}` });

  const coldOver = used.cold > driver.coldCap;
  const ambOver = used.amb > driver.ambCap;
  const totalOver = used.total > driver.totalCap;
  const departable = cellOrders.some((order) => order.status === "assigned");

  return (
    <div ref={setNodeRef} className={`driver-cell ${isOver ? "is-over" : ""}`}>
      <div className="cell-quota">
        <span className={coldOver ? "quota over" : "quota"} title="冷筐占用/额度（含待回收）">
          冷 {used.cold}/{driver.coldCap}
        </span>
        <span className={ambOver ? "quota over" : "quota"} title="常温筐占用/额度（含待回收）">
          常 {used.amb}/{driver.ambCap}
        </span>
        <span className={totalOver ? "quota over" : "quota"} title="冷筐+常温筐合计/总容量">
          总 {used.total}/{driver.totalCap}
        </span>
        <button
          type="button"
          className="mini"
          disabled={!departable}
          onClick={() => departCell(driverId, slot)}
          title="整格发车：锁定司机、时段与筐数"
        >
          发车
        </button>
      </div>
      {(used.recoveryCold > 0 || used.recoveryAmb > 0) && (
          <p className="recovery-tie">
            待回收占额：{used.recoveryCold > 0 && `冷 ${used.recoveryCold}`}
            {used.recoveryCold > 0 && used.recoveryAmb > 0 ? "、" : ""}
            {used.recoveryAmb > 0 && `常 ${used.recoveryAmb}`}
          </p>
        )}
      <div className="cell-cards">
        {cellOrders.length === 0 && <p className="cell-empty">拖入本时段订单</p>}
        {cellOrders.map((order) => (
          <OrderCard key={order.id} order={order} onDeliver={onDeliver} />
        ))}
      </div>
    </div>
  );
}

function PendingColumn({ orders, onEdit, onDelete }: {
  orders: BasketOrder[];
  onEdit: (order: BasketOrder) => void;
  onDelete: (order: BasketOrder) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool:pending" });
  return (
    <section ref={setNodeRef} className={`pending-column ${isOver ? "is-over" : ""}`}>
      <div className="column-head">
        <h2>待分配池</h2>
        <span className="count">{orders.length}</span>
      </div>
      <p className="column-hint">补录时段与筐数后，按对应时段拖入司机格；已排车可拖回改派。</p>
      <div className="pool-list">
        {orders.length === 0 && <p className="cell-empty">暂无待分配订单</p>}
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

export function Board({ onDeliver, onEdit }: Props) {
  const orders = useDeskStore((state) => state.orders);
  const assignOrder = useDeskStore((state) => state.assignOrder);
  const unassignOrder = useDeskStore((state) => state.unassignOrder);
  const deleteOrder = useDeskStore((state) => state.deleteOrder);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // 允许卡片内按钮点击，移动超过 5px 才判定为拖拽
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const pending = useMemo(() => orders.filter((order) => order.status === "pending"), [orders]);
  const activeOrder = activeId ? orders.find((order) => order.id === activeId) ?? null : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return; // 未落到有效区域：什么都不做，卡片留在原处
    const orderId = String(active.id);
    const target = String(over.id);
    if (target === "pool:pending") {
      unassignOrder(orderId);
      return;
    }
    if (target.startsWith("cell:")) {
      const [, driverId, slot] = target.split(":");
      // 改派先释放原额度（规则中排除自身再算目标格），冲突整次拒绝、输入与位置不变
      assignOrder(orderId, driverId, slot as SlotId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="board-scroll">
        <div className="board">
          <PendingColumn
            orders={pending}
            onEdit={onEdit}
            onDelete={(order) => {
              if (window.confirm(`确认删除待分配订单 ${order.orderNo}？`)) deleteOrder(order.id);
            }}
          />
          <div className="driver-grid">
            <div className="driver-grid-head" />
            {SLOTS.map((slot) => (
              <div className="slot-head" key={slot.id}>
                <strong>{slot.label}</strong>
                <span>{slot.window}</span>
              </div>
            ))}
            {DRIVERS.map((driver) => (
              <div className="driver-row" key={driver.id}>
                <div className="driver-name">
                  <strong>{driver.name}</strong>
                  <span>
                    冷{driver.coldCap} · 常{driver.ambCap} · 总{driver.totalCap}
                  </span>
                </div>
                {SLOTS.map((slot) => (
                  <Cell
                    key={slot.id}
                    driverId={driver.id}
                    slot={slot.id}
                    orders={orders.filter((order) => order.status === "assigned" || order.status === "departed")}
                    onDeliver={onDeliver}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <DragOverlay>{activeOrder ? <div className="drag-clone">{activeOrder.orderNo}</div> : null}</DragOverlay>
    </DndContext>
  );
}
