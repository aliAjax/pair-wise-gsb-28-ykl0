import { useMemo, useState } from "react";
import {
  AssignmentDraft,
  DeliveryInfo,
  Order,
  ORDER_STATUSES,
  buildVerification,
  canVerify,
  settleDelivery,
  totalBaskets,
  validateAssignment,
  validateDelivery
} from "./domain";
import { DRIVERS } from "./data";
import { ConsoleState, loadState, saveState } from "./storage";
import {
  DriverPanel,
  NewOrderForm,
  OrderCard,
  RecoveryPanel,
  VerificationPanel
} from "./components";

export default function App() {
  const [state, setState] = useState<ConsoleState>(loadState);
  const [statusFilter, setStatusFilter] = useState("全部状态");
  const [driverFilter, setDriverFilter] = useState("全部司机");

  const { orders, recoveries, verifications } = state;

  function update(next: ConsoleState) {
    setState(next);
    saveState(next);
  }

  /* ---------- 新增待分配订单（补录时段/筐数，温区按筐数推导） ---------- */
  function handleAdd(draft: {
    orderNo: string;
    destination: string;
    slot: string;
    cold: number;
    ambient: number;
    notes: string;
  }): string | null {
    if (!draft.orderNo) return "请填写订单号";
    if (totalBaskets(draft.cold, draft.ambient) <= 0) return "冷筐与常温筐至少领用 1 个";
    if (draft.cold < 0 || draft.ambient < 0) return "筐数不能为负";
    const order: Order = {
      id: crypto.randomUUID(),
      orderNo: draft.orderNo,
      destination: draft.destination,
      slot: draft.slot,
      coldBaskets: draft.cold,
      ambientBaskets: draft.ambient,
      status: "待分配",
      driver: null,
      notes: draft.notes || "暂无备注",
      lockedAt: null,
      delivery: null,
      createdAt: new Date().toISOString()
    };
    update({ ...state, orders: [order, ...orders] });
    return null;
  }

  /* ---------- 排班 / 改派：判定不通过整次拒绝，输入由表单保留 ---------- */
  function handleAssign(orderId: string, draft: AssignmentDraft): string | null {
    const target = orders.find((item) => item.id === orderId);
    if (!target) return "订单不存在";

    const error = validateAssignment(DRIVERS, orders, recoveries, draft, orderId);
    if (error) return error;

    const nextOrders = orders.map((item) =>
      item.id === orderId
        ? {
            ...item,
            driver: draft.driver,
            slot: draft.slot,
            coldBaskets: draft.cold,
            ambientBaskets: draft.ambient,
            status: item.status === "待分配" ? "已分配" : item.status
          }
        : item
    );
    update({ ...state, orders: nextOrders });
    return null;
  }

  /* ---------- 发车前锁定司机、时段和筐数 ---------- */
  function handleLock(orderId: string) {
    update({
      ...state,
      orders: orders.map((item) =>
        item.id === orderId ? { ...item, status: "已锁定", lockedAt: new Date().toISOString() } : item
      )
    });
  }

  /* ---------- 送达登记：短少/破损生成待回收并占用额度 ---------- */
  function handleDeliver(orderId: string, info: DeliveryInfo): string | null {
    const target = orders.find((item) => item.id === orderId);
    if (!target) return "订单不存在";
    const error = validateDelivery(target, info);
    if (error) return error;

    const { order, recovery } = settleDelivery(target, info);
    const nextOrders = orders.map((item) => (item.id === orderId ? order : item));
    const nextRecoveries = recovery ? [recovery, ...recoveries] : recoveries;
    update({ ...state, orders: nextOrders, recoveries: nextRecoveries });
    return null;
  }

  /* ---------- 补录原因后释放待回收额度 ---------- */
  function handleResolve(recoveryId: string, reason: string) {
    update({
      ...state,
      recoveries: recoveries.map((item) =>
        item.id === recoveryId
          ? { ...item, reason, status: "已释放", releasedAt: new Date().toISOString() }
          : item
      )
    });
  }

  /* ---------- 核销（冻结）与更正（另建版本） ---------- */
  function handleVerify(orderId: string, note: string) {
    const target = orders.find((item) => item.id === orderId);
    if (!target || !canVerify(target, recoveries)) return;
    const record = buildVerification(target, verifications, note);
    update({
      ...state,
      orders: orders.map((item) => (item.id === orderId ? { ...item, status: "已核销" } : item)),
      verifications: [...verifications, record]
    });
  }

  function handleDelete(orderId: string) {
    update({ ...state, orders: orders.filter((item) => item.id !== orderId) });
  }

  /* ---------- 汇总与过滤（额度始终实时推导） ---------- */
  const metrics = useMemo(() => {
    const pendingOrders = orders.filter((item) => item.status === "待分配").length;
    const scheduled = orders
      .filter((item) => item.status === "已分配" || item.status === "已锁定")
      .reduce((sum, item) => sum + totalBaskets(item.coldBaskets, item.ambientBaskets), 0);
    const pendingBaskets = recoveries
      .filter((item) => item.status === "待回收")
      .reduce((sum, item) => sum + item.cold + item.ambient, 0);
    return [pendingOrders, scheduled, pendingBaskets, verifications.length];
  }, [orders, recoveries, verifications]);

  const filteredOrders = useMemo(() => {
    return orders.filter((item) => {
      const statusOk = statusFilter === "全部状态" || item.status === statusFilter;
      const driverOk = driverFilter === "全部司机" || item.driver === driverFilter;
      return statusOk && driverOk;
    });
  }, [orders, statusFilter, driverFilter]);

  return (
    <main className="app">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">物流行业前端最小闭环</p>
            <h1>周转筐领用与回筐核销台</h1>
            <p className="subtitle">
              待分配订单补录配送时段、筐数与温区；排班校验司机时段额度与总容量，发车锁定，
              送达登记实回，短少破损待回收补录原因后释放，核销冻结、更正另建版本。
            </p>
          </div>
          <div className="stack">
            {["React", "Vite", "TypeScript"].map((item) => <span className="tag" key={item}>{item}</span>)}
          </div>
        </header>

        <section className="metrics">
          <article className="metric"><span>待分配订单</span><strong>{metrics[0]}</strong></article>
          <article className="metric"><span>在途占用筐数</span><strong>{metrics[1]}</strong></article>
          <article className="metric"><span>待回收筐数</span><strong>{metrics[2]}</strong></article>
          <article className="metric"><span>核销版本数</span><strong>{metrics[3]}</strong></article>
        </section>

        <section className="workspace">
          <div className="side-col">
            <NewOrderForm onAdd={handleAdd} />
            <DriverPanel drivers={DRIVERS} orders={orders} recoveries={recoveries} />
          </div>

          <section className="list-panel">
            <div className="toolbar">
              <h2>订单列表</h2>
              <div className="filters">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option>全部状态</option>
                  {ORDER_STATUSES.map((item) => <option key={item}>{item}</option>)}
                </select>
                <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
                  <option>全部司机</option>
                  {DRIVERS.map((item) => <option key={item.name}>{item.name}</option>)}
                </select>
              </div>
            </div>
            <div className="record-grid">
              {filteredOrders.length === 0 ? (
                <div className="empty">暂无匹配订单</div>
              ) : (
                filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    drivers={DRIVERS}
                    recoveries={recoveries}
                    verifications={verifications}
                    onAssign={handleAssign}
                    onLock={handleLock}
                    onDeliver={handleDeliver}
                    onVerify={handleVerify}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </div>
          </section>
        </section>

        <section className="bottom-grid">
          <RecoveryPanel recoveries={recoveries} onResolve={handleResolve} />
          <VerificationPanel verifications={verifications} />
        </section>
      </div>
    </main>
  );
}
