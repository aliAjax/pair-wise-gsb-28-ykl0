/**
 * 页面层（组件）：纯展示与交互，业务判定一律回调给 App / domain。
 */
import { FormEvent, useState } from "react";
import {
  AssignmentDraft,
  DeliveryInfo,
  DriverSpec,
  Order,
  Recovery,
  Verification,
  canVerify,
  driverUsage,
  totalBaskets,
  zoneOf
} from "./domain";
import { SLOTS } from "./data";

/* ---------- 新增待分配订单（补录时段/筐数/温区） ---------- */

export function NewOrderForm({ onAdd }: { onAdd: (draft: {
  orderNo: string;
  destination: string;
  slot: string;
  cold: number;
  ambient: number;
  notes: string;
}) => string | null }) {
  const [orderNo, setOrderNo] = useState("");
  const [destination, setDestination] = useState("");
  const [slot, setSlot] = useState(SLOTS[0]);
  const [cold, setCold] = useState("0");
  const [ambient, setAmbient] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = onAdd({
      orderNo: orderNo.trim(),
      destination: destination.trim(),
      slot,
      cold: Number(cold),
      ambient: Number(ambient),
      notes: notes.trim()
    });
    if (message) {
      setError(message);
      return; // 保留输入
    }
    setError("");
    setOrderNo("");
    setDestination("");
    setSlot(SLOTS[0]);
    setCold("0");
    setAmbient("0");
    setNotes("");
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>新增待分配订单</h2>
      <div className="form-grid">
        <label>
          订单号
          <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} required placeholder="ORD-0000" />
        </label>
        <label>
          目的地
          <input value={destination} onChange={(e) => setDestination(e.target.value)} required />
        </label>
        <label>
          配送时段
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            {SLOTS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className="field-pair">
          <label>
            冷筐数
            <input type="number" min={0} value={cold} onChange={(e) => setCold(e.target.value)} required />
          </label>
          <label>
            常温筐数
            <input type="number" min={0} value={ambient} onChange={(e) => setAmbient(e.target.value)} required />
          </label>
        </div>
        <p className="hint">温区按筐数自动判定：{zoneOf(Number(cold) || 0, Number(ambient) || 0)}</p>
        <label>
          备注
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="填写处理说明或现场备注" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">加入待分配</button>
      </div>
    </form>
  );
}

/* ---------- 排班 / 改派表单：冲突整次拒绝并保留输入 ---------- */

export function AssignForm({
  order,
  drivers,
  onAssign
}: {
  order: Order;
  drivers: DriverSpec[];
  onAssign: (orderId: string, draft: AssignmentDraft) => string | null;
}) {
  const [driver, setDriver] = useState(order.driver ?? "");
  const [slot, setSlot] = useState(order.slot);
  const [cold, setCold] = useState(String(order.coldBaskets));
  const [ambient, setAmbient] = useState(String(order.ambientBaskets));
  const [error, setError] = useState("");

  const isReassign = order.status !== "待分配";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = onAssign(order.id, {
      driver,
      slot,
      cold: Number(cold),
      ambient: Number(ambient)
    });
    // 冲突时整次拒绝：不清空任何输入，调度员可直接调整重试
    setError(message ?? "");
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <div className="inline-grid">
        <label>
          司机
          <select value={driver} onChange={(e) => setDriver(e.target.value)} required>
            <option value="">请选择</option>
            {drivers.map((item) => <option key={item.name}>{item.name}</option>)}
          </select>
        </label>
        <label>
          时段
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            {SLOTS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          冷筐
          <input type="number" min={0} value={cold} onChange={(e) => setCold(e.target.value)} required />
        </label>
        <label>
          常温筐
          <input type="number" min={0} value={ambient} onChange={(e) => setAmbient(e.target.value)} required />
        </label>
      </div>
      {isReassign && <p className="hint">改派将先释放原司机/时段额度，再按新方案重算。</p>}
      {error && <p className="error">{error}</p>}
      <button type="submit">{isReassign ? "改派（释放后重算）" : "排班"}</button>
    </form>
  );
}

/* ---------- 送达登记：实回与破损 ---------- */

export function DeliveryForm({
  order,
  onDeliver
}: {
  order: Order;
  onDeliver: (orderId: string, info: DeliveryInfo) => string | null;
}) {
  const [returnedCold, setReturnedCold] = useState(String(order.coldBaskets));
  const [returnedAmbient, setReturnedAmbient] = useState(String(order.ambientBaskets));
  const [damagedCold, setDamagedCold] = useState("0");
  const [damagedAmbient, setDamagedAmbient] = useState("0");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = onDeliver(order.id, {
      returnedCold: Number(returnedCold),
      returnedAmbient: Number(returnedAmbient),
      damagedCold: Number(damagedCold),
      damagedAmbient: Number(damagedAmbient),
      at: new Date().toISOString()
    });
    setError(message ?? "");
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <p className="hint">送达登记实回筐数；短少或破损将转入待回收并继续占用司机额度。</p>
      <div className="inline-grid">
        <label>
          实回冷筐
          <input type="number" min={0} value={returnedCold} onChange={(e) => setReturnedCold(e.target.value)} required />
        </label>
        <label>
          实回常温筐
          <input type="number" min={0} value={returnedAmbient} onChange={(e) => setReturnedAmbient(e.target.value)} required />
        </label>
        <label>
          破损冷筐
          <input type="number" min={0} value={damagedCold} onChange={(e) => setDamagedCold(e.target.value)} required />
        </label>
        <label>
          破损常温筐
          <input type="number" min={0} value={damagedAmbient} onChange={(e) => setDamagedAmbient(e.target.value)} required />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit">登记送达</button>
    </form>
  );
}

/* ---------- 订单卡片 ---------- */

export function OrderCard({
  order,
  drivers,
  recoveries,
  verifications,
  onAssign,
  onLock,
  onDeliver,
  onVerify,
  onDelete
}: {
  order: Order;
  drivers: DriverSpec[];
  recoveries: Recovery[];
  verifications: Verification[];
  onAssign: (orderId: string, draft: AssignmentDraft) => string | null;
  onLock: (orderId: string) => void;
  onDeliver: (orderId: string, info: DeliveryInfo) => string | null;
  onVerify: (orderId: string, note: string) => void;
  onDelete: (orderId: string) => void;
}) {
  const [verifyNote, setVerifyNote] = useState("");
  const pending = recoveries.filter((item) => item.orderId === order.id && item.status === "待回收");
  const versions = verifications.filter((item) => item.orderId === order.id);
  const latest = versions[versions.length - 1];
  const total = totalBaskets(order.coldBaskets, order.ambientBaskets);

  return (
    <article className="record">
      <div className="record-head">
        <p className="record-title">{order.orderNo} / {order.destination}</p>
        <span className={`status status-${order.status}`}>{order.status}</span>
      </div>
      <div className="details">
        <span>配送时段: {order.slot}</span>
        <span>温区: {zoneOf(order.coldBaskets, order.ambientBaskets)}</span>
        <span>冷筐: {order.coldBaskets}</span>
        <span>常温筐: {order.ambientBaskets}</span>
        <span>合计: {total} 筐</span>
        <span>司机: {order.driver ?? "未排班"}</span>
        {order.lockedAt && <span>锁定: {new Date(order.lockedAt).toLocaleString()}</span>}
        {order.delivery && (
          <span>
            实回: 冷 {order.delivery.returnedCold} / 常温 {order.delivery.returnedAmbient}
            {(order.delivery.damagedCold > 0 || order.delivery.damagedAmbient > 0) &&
              `（破损 冷${order.delivery.damagedCold} 常温${order.delivery.damagedAmbient}）`}
          </span>
        )}
      </div>
      <p className="note">{order.notes || "暂无备注"}</p>

      {order.status === "待分配" && (
        <AssignForm order={order} drivers={drivers} onAssign={onAssign} />
      )}

      {order.status === "已分配" && (
        <>
          <div className="actions">
            <button type="button" onClick={() => onLock(order.id)}>发车前锁定</button>
          </div>
          <AssignForm order={order} drivers={drivers} onAssign={onAssign} />
        </>
      )}

      {order.status === "已锁定" && (
        <>
          <AssignForm order={order} drivers={drivers} onAssign={onAssign} />
          <DeliveryForm order={order} onDeliver={onDeliver} />
        </>
      )}

      {order.status === "已送达" && (
        <div className="inline-form">
          {pending.length > 0 ? (
            <p className="hint">
              尚有 {pending.reduce((sum, item) => sum + item.cold + item.ambient, 0)} 筐待回收，补录原因释放额度后才能核销。
            </p>
          ) : canVerify(order, recoveries) ? (
            <>
              <label>
                核销说明
                <input value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} placeholder="首次核销说明" />
              </label>
              <button type="button" onClick={() => { onVerify(order.id, verifyNote); setVerifyNote(""); }}>
                核销并冻结记录
              </button>
            </>
          ) : null}
        </div>
      )}

      {order.status === "已核销" && (
        <div className="inline-form">
          <p className="hint">
            已核销记录冻结（当前 v{latest?.version ?? 1}），更正将另建新版本，历史版本保留。
          </p>
          <label>
            更正说明
            <input value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} placeholder="填写更正原因" />
          </label>
          <button
            type="button"
            disabled={!verifyNote.trim()}
            onClick={() => { onVerify(order.id, verifyNote); setVerifyNote(""); }}
          >
            更正并另建版本
          </button>
        </div>
      )}

      {order.status === "待分配" && (
        <div className="actions">
          <button className="danger" type="button" onClick={() => onDelete(order.id)}>删除</button>
        </div>
      )}
    </article>
  );
}

/* ---------- 司机额度面板 ---------- */

export function DriverPanel({
  drivers,
  orders,
  recoveries
}: {
  drivers: DriverSpec[];
  orders: Order[];
  recoveries: Recovery[];
}) {
  return (
    <section className="panel">
      <h2>司机额度</h2>
      <div className="driver-list">
        {drivers.map((driver) => {
          const usage = driverUsage(driver.name, orders, recoveries);
          return (
            <div className="driver" key={driver.name}>
              <div className="driver-head">
                <strong>{driver.name}</strong>
                <span>
                  总占用 {usage.total}/{driver.totalCapacity} 筐
                  {usage.pendingRecovery > 0 && `（含待回收 ${usage.pendingRecovery}）`}
                </span>
              </div>
              <div className="bar-track">
                <div
                  className={`bar-fill ${usage.total > driver.totalCapacity ? "over" : ""}`}
                  style={{ width: `${Math.min(100, (usage.total / driver.totalCapacity) * 100)}%` }}
                />
              </div>
              <div className="slot-usage">
                {SLOTS.map((slot) => (
                  <span key={slot} className={(usage.bySlot[slot] ?? 0) > driver.slotQuota ? "over" : ""}>
                    {slot.slice(0, 2)} {usage.bySlot[slot] ?? 0}/{driver.slotQuota}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- 待回收面板 ---------- */

export function RecoveryPanel({
  recoveries,
  onResolve
}: {
  recoveries: Recovery[];
  onResolve: (recoveryId: string, reason: string) => void;
}) {
  const pending = recoveries.filter((item) => item.status === "待回收");
  const released = recoveries.filter((item) => item.status === "已释放");

  return (
    <section className="panel">
      <h2>待回收（{pending.length}）</h2>
      {pending.length === 0 && <p className="hint">暂无短少或破损占用。</p>}
      <div className="record-grid">
        {pending.map((item) => (
          <RecoveryItem key={item.id} item={item} onResolve={onResolve} />
        ))}
      </div>
      {released.length > 0 && (
        <>
          <h3 className="subhead">已释放</h3>
          <div className="record-grid">
            {released.map((item) => (
              <div className="record slim" key={item.id}>
                <p className="record-title">{item.orderNo} · {item.kind} 冷{item.cold}/常温{item.ambient}</p>
                <p className="hint">原因：{item.reason} · 释放于 {item.releasedAt ? new Date(item.releasedAt).toLocaleString() : "-"}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function RecoveryItem({ item, onResolve }: { item: Recovery; onResolve: (id: string, reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="record slim">
      <div className="record-head">
        <p className="record-title">{item.orderNo} · {item.kind}</p>
        <span className="status status-warn">占用中</span>
      </div>
      <div className="details">
        <span>司机: {item.driver}</span>
        <span>时段: {item.slot}</span>
        <span>冷筐: {item.cold}</span>
        <span>常温筐: {item.ambient}</span>
      </div>
      <div className="inline-form">
        <label>
          补录原因
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如：客户处留存，次日带回" />
        </label>
        <button type="button" disabled={!reason.trim()} onClick={() => onResolve(item.id, reason.trim())}>
          补录并释放额度
        </button>
      </div>
    </div>
  );
}

/* ---------- 核销版本面板 ---------- */

export function VerificationPanel({ verifications }: { verifications: Verification[] }) {
  const sorted = [...verifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="panel">
      <h2>核销记录（{verifications.length} 个版本）</h2>
      {sorted.length === 0 && <p className="hint">暂无核销记录。</p>}
      <div className="record-grid">
        {sorted.map((item) => (
          <div className="record slim" key={item.id}>
            <div className="record-head">
              <p className="record-title">{item.orderNo} · v{item.version}</p>
              <span className="status status-frozen">已冻结</span>
            </div>
            <div className="details">
              <span>司机: {item.driver}</span>
              <span>时段: {item.slot}</span>
              <span>领用: 冷{item.coldBaskets}/常温{item.ambientBaskets}</span>
              <span>实回: 冷{item.returnedCold}/常温{item.returnedAmbient}</span>
              {(item.damagedCold > 0 || item.damagedAmbient > 0) && (
                <span>破损: 冷{item.damagedCold}/常温{item.damagedAmbient}</span>
              )}
              <span>{new Date(item.createdAt).toLocaleString()}</span>
            </div>
            <p className="note">{item.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
