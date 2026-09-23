import { useEffect, useState } from "react";
import { useDeskStore } from "../store";
import { SLOT_LABEL, ZONE_LABEL } from "../data";
import { getDriver } from "../rules";
import type { AssignInput, VerificationRecord } from "../types";

interface Props {
  /** 送达登记时传订单；更正时传核销记录 */
  mode: "deliver" | "correct";
  orderId?: string;
  verification?: VerificationRecord;
  onClose: () => void;
}

export function DeliveryModal({ mode, orderId, verification, onClose }: Props) {
  const orders = useDeskStore((state) => state.orders);
  const registerDelivery = useDeskStore((state) => state.registerDelivery);
  const correctVerification = useDeskStore((state) => state.correctVerification);

  const order = orders.find((item) => item.id === orderId);
  const issuedCold = mode === "deliver" ? order?.cold ?? 0 : verification?.issuedCold ?? 0;
  const issuedAmb = mode === "deliver" ? order?.amb ?? 0 : verification?.issuedAmb ?? 0;
  const latest = verification?.versions[verification.versions.length - 1];

  const [form, setForm] = useState<AssignInput>({
    returnedCold: latest?.returnedCold ?? issuedCold,
    returnedAmb: latest?.returnedAmb ?? issuedAmb,
    damagedCold: latest?.damagedCold ?? 0,
    damagedAmb: latest?.damagedAmb ?? 0,
    note: latest?.note ?? ""
  });
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shortCold = Math.max(0, issuedCold - form.returnedCold);
  const shortAmb = Math.max(0, issuedAmb - form.returnedAmb);

  function patch<K extends keyof AssignInput>(key: K, value: AssignInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    setAttempted(true);
    const ok =
      mode === "deliver" && order
        ? registerDelivery(order.id, form)
        : verification
          ? correctVerification(verification.id, form)
          : false;
    // 校验失败（短少/破损越界）：弹窗与已填数字全部保留，仅提示修正
    if (ok) onClose();
  }

  const invalid =
    form.returnedCold > issuedCold ||
    form.returnedAmb > issuedAmb ||
    form.damagedCold > form.returnedCold ||
    form.damagedAmb > form.returnedAmb;

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2>{mode === "deliver" ? "送达登记 · 实回筐数" : `更正核销 · ${verification?.orderNo}（将生成 v${(latest?.version ?? 1) + 1}）`}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <div className="modal-body">
          {mode === "deliver" && order && (
            <p className="modal-meta">
              {order.orderNo} · {getDriver(order.driverId ?? "")?.name} · {SLOT_LABEL[order.slot]} ·
              领用 冷 {order.cold} / 常 {order.amb}
            </p>
          )}
          {mode === "correct" && verification && (
            <p className="modal-meta frozen-note">
              已核销记录已冻结，本操作只追加新版本；原版本待回收未处理项将停止占额并按本次数据重算。
            </p>
          )}

          <div className="delivery-grid">
            {(["cold", "ambient"] as const).map((zone) => {
              const issued = zone === "cold" ? issuedCold : issuedAmb;
              const returned = zone === "cold" ? form.returnedCold : form.returnedAmb;
              const damaged = zone === "cold" ? form.damagedCold : form.damagedAmb;
              const short = zone === "cold" ? shortCold : shortAmb;
              return (
                <fieldset className="zone-box" key={zone}>
                  <legend>{ZONE_LABEL[zone]}（领用 {issued}）</legend>
                  <label>
                    实回筐数
                    <input
                      type="number"
                      min={0}
                      max={issued}
                      value={returned}
                      onChange={(e) =>
                        patch(zone === "cold" ? "returnedCold" : "returnedAmb", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    其中破损
                    <input
                      type="number"
                      min={0}
                      max={returned}
                      value={damaged}
                      onChange={(e) =>
                        patch(zone === "cold" ? "damagedCold" : "damagedAmb", Number(e.target.value))
                      }
                    />
                  </label>
                  <p className={short > 0 || damaged > 0 ? "calc warn" : "calc"}>
                    短少 {short} · 破损 {damaged}
                    {(short > 0 || damaged > 0) && " → 转入待回收并占用额度"}
                  </p>
                </fieldset>
              );
            })}
          </div>

          <label className="full-label">
            登记说明
            <textarea
              value={form.note}
              onChange={(e) => patch("note", e.target.value)}
              placeholder="送达情况说明；短少/破损的最终原因在待回收面板补录后释放额度"
            />
          </label>
          {attempted && invalid && <p className="inline-error">实回不能大于领用，破损不能大于实回，请修正后再提交。</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="secondary" onClick={onClose}>取消</button>
          <button type="button" onClick={submit}>{mode === "deliver" ? "确认送达并核销" : "追加更正版本"}</button>
        </footer>
      </div>
    </div>
  );
}
