import { useMemo, useState } from "react";
import { SLOT_LABEL, ZONE_LABEL } from "../data";
import { getDriver } from "../rules";
import { useDeskStore } from "../store";
import type { RecoveryItem } from "../types";

function RecoveryRow({ item }: { item: RecoveryItem }) {
  const resolveRecovery = useDeskStore((state) => state.resolveRecovery);
  // 补录原因前输入草稿保留在本组件内；未填原因提交时拒绝、不清空
  const [reason, setReason] = useState("");

  return (
    <article className={`recovery-row rec-${item.status}`}>
      <div className="recovery-main">
        <div className="recovery-title">
          <strong>{item.orderNo}</strong>
          <span className="chip">{getDriver(item.driverId)?.name}</span>
          <span className="chip">{SLOT_LABEL[item.slot]}</span>
          <span className="chip chip-cold">{ZONE_LABEL[item.zone]}</span>
          <span className={`rec-badge rec-${item.status}`}>
            {item.status === "open" ? "待回收" : item.status === "released" ? "已释放" : "已被更正替代"}
          </span>
        </div>
        <p className="recovery-qty">
          短少 <strong>{item.missingQty}</strong> 筐 · 破损 <strong>{item.damagedQty}</strong> 筐 ·
          核销版本 v{item.version}
        </p>
        {item.status === "open" ? (
          <div className="recovery-resolve">
            <input
              value={reason}
              placeholder="补录短少/破损原因（如客户暂借、筐体损坏报废），提交后释放司机额度"
              onChange={(e) => setReason(e.target.value)}
            />
            <button type="button" onClick={() => resolveRecovery(item.id, reason)}>
              补录原因并释放
            </button>
          </div>
        ) : (
          <p className="recovery-reason">
            {item.status === "released" ? `原因：${item.reason}` : "更正核销后该版本未决项自动失效，额度已停止占用"}
            {item.resolvedAt && ` · ${new Date(item.resolvedAt).toLocaleString("zh-CN")}`}
          </p>
        )}
      </div>
    </article>
  );
}

export function RecoveryPanel() {
  const recoveries = useDeskStore((state) => state.recoveries);
  const [showClosed, setShowClosed] = useState(false);

  const open = useMemo(
    () => recoveries.filter((item) => item.status === "open"),
    [recoveries]
  );
  const closed = useMemo(
    () => recoveries.filter((item) => item.status !== "open"),
    [recoveries]
  );

  const openBaskets = open.reduce((acc, item) => acc + item.missingQty + item.damagedQty, 0);

  return (
    <section className="panel side-panel">
      <div className="toolbar">
        <h2>待回收核销</h2>
        <span className="count count-warn">{open.length} 项 / {openBaskets} 筐占额</span>
      </div>
      <p className="column-hint">短少与破损筐转入待回收，持续占用该司机同时段额度；补录原因后才释放。</p>
      <div className="recovery-list">
        {open.length === 0 && <p className="cell-empty">没有待回收筐，额度全部可用</p>}
        {open.map((item) => (
          <RecoveryRow key={item.id} item={item} />
        ))}
      </div>
      {closed.length > 0 && (
        <div className="closed-block">
          <button type="button" className="link-btn" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? "收起" : "查看"}历史处理（{closed.length}）
          </button>
          {showClosed && (
            <div className="recovery-list">
              {closed.map((item) => (
                <RecoveryRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
