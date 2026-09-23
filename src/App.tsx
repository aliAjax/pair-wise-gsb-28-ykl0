import { useMemo, useState } from "react";
import { Board } from "./components/Board";
import { DeliveryModal } from "./components/DeliveryModal";
import { OrderForm } from "./components/OrderForm";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { VerificationPanel } from "./components/VerificationPanel";
import { DRIVERS } from "./data";
import { useDeskStore } from "./store";
import type { BasketOrder, VerificationRecord } from "./types";

const STACK = ["React", "Vite", "TypeScript", "dnd-kit", "zustand", "localStorage"];

function Toast() {
  const toast = useDeskStore((state) => state.toast);
  if (!toast) return null;
  return (
    <div key={toast.key} className={`toast toast-${toast.type}`} role="alert">
      {toast.messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}

function Metrics() {
  const orders = useDeskStore((state) => state.orders);
  const recoveries = useDeskStore((state) => state.recoveries);
  const verifications = useDeskStore((state) => state.verifications);

  const metrics = useMemo(() => {
    const pending = orders.filter((order) => order.status === "pending").length;
    const locked = orders.filter(
      (order) => order.status === "assigned" || order.status === "departed"
    ).length;
    const openBaskets = recoveries
      .filter((item) => item.status === "open")
      .reduce((acc, item) => acc + item.missingQty + item.damagedQty, 0);
    return [
      { label: "待分配订单", value: pending },
      { label: "在途/占额任务", value: locked },
      { label: "待回收筐数", value: openBaskets },
      { label: "核销单数（含更正版本）", value: verifications.length }
    ];
  }, [orders, recoveries, verifications]);

  return (
    <section className="metrics">
      {metrics.map((metric) => (
        <article className="metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </article>
      ))}
    </section>
  );
}

/** 各司机额度总览：跨时段汇总占用，红色表示任一额度超限 */
function CapacityOverview() {
  const orders = useDeskStore((state) => state.orders);
  const recoveries = useDeskStore((state) => state.recoveries);

  return (
    <section className="panel capacity-panel">
      <div className="toolbar">
        <h2>司机车载额度总览</h2>
      </div>
      <div className="capacity-grid">
        {DRIVERS.map((driver) => {
          const cold = orders
            .filter((o) => (o.status === "assigned" || o.status === "departed") && o.driverId === driver.id)
            .reduce((acc, o) => acc + o.cold, 0)
            + recoveries
              .filter((r) => r.status === "open" && r.driverId === driver.id)
              .reduce((acc, r) => acc + (r.zone === "cold" ? r.missingQty + r.damagedQty : 0), 0);
          const amb = orders
            .filter((o) => (o.status === "assigned" || o.status === "departed") && o.driverId === driver.id)
            .reduce((acc, o) => acc + o.amb, 0)
            + recoveries
              .filter((r) => r.status === "open" && r.driverId === driver.id)
              .reduce((acc, r) => acc + (r.zone === "ambient" ? r.missingQty + r.damagedQty : 0), 0);
          return (
            <div className="capacity-card" key={driver.id}>
              <strong>{driver.name}</strong>
              {[
                { label: "冷筐", used: cold, cap: driver.coldCap },
                { label: "常温筐", used: amb, cap: driver.ambCap },
                { label: "合计", used: cold + amb, cap: driver.totalCap }
              ].map((row) => (
                <div className="cap-row" key={row.label}>
                  <span>{row.label}</span>
                  <div className="cap-track">
                    <div
                      className={`cap-fill ${row.used > row.cap ? "over" : ""}`}
                      style={{ width: `${Math.min(100, (row.used / row.cap) * 100)}%` }}
                    />
                  </div>
                  <em className={row.used > row.cap ? "over" : ""}>
                    {row.used}/{row.cap}
                  </em>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="column-hint">排车与改派按下表"同一司机 + 同一时段"判定；冷筐、常温筐分别不超专项额度，合计不超总容量，任一冲突整次拒绝。</p>
    </section>
  );
}

type ModalState =
  | { kind: "deliver"; order: BasketOrder }
  | { kind: "correct"; verification: VerificationRecord }
  | null;

export default function App() {
  const [editing, setEditing] = useState<BasketOrder | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const deleteOrder = useDeskStore((state) => state.deleteOrder);

  function handleDelete(order: BasketOrder) {
    if (window.confirm(`确认删除待分配订单 ${order.orderNo}？`)) deleteOrder(order.id);
  }

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">物流 · 周转筐闭环管理</p>
            <h1>周转筐领用与回筐核销台</h1>
            <p className="subtitle">
              待分配订单补录配送时段、冷筐/常温筐数与温区；拖拽排车按司机时段校验车载额度，发车锁定，
              送达登记实回筐数，短少破损待回收占额，补录原因释放，核销冻结、更正另建版本。
            </p>
          </div>
          <div className="stack">
            {STACK.map((item) => (
              <span className="tag" key={item}>{item}</span>
            ))}
          </div>
        </header>

        <Metrics />

        <section className="workspace workspace-wide">
          <OrderForm editing={editing} onDone={() => setEditing(null)} />
          <CapacityOverview />
        </section>

        <section className="panel board-panel">
          <div className="toolbar">
            <h2>拖拽排班板</h2>
            <span className="column-hint inline-hint">已发车卡片锁定；已排车可拖回或改派；冲突时订单留在原处、输入不丢</span>
          </div>
          <Board
            onDeliver={(order) => setModal({ kind: "deliver", order })}
            onEdit={(order) => setEditing(order)}
          />
        </section>

        <section className="workspace workspace-wide side-grid">
          <RecoveryPanel />
          <VerificationPanel onCorrect={(verification) => setModal({ kind: "correct", verification })} />
        </section>
      </div>

      {modal?.kind === "deliver" && (
        <DeliveryModal mode="deliver" orderId={modal.order.id} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "correct" && (
        <DeliveryModal mode="correct" verification={modal.verification} onClose={() => setModal(null)} />
      )}
      <Toast />
    </main>
  );
}
