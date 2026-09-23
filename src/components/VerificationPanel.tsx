import { useState } from "react";
import { SLOT_LABEL, ZONE_LABEL } from "../data";
import { getDriver } from "../rules";
import { useDeskStore } from "../store";
import type { VerificationRecord } from "../types";

interface Props {
  onCorrect: (record: VerificationRecord) => void;
}

export function VerificationPanel({ onCorrect }: Props) {
  const verifications = useDeskStore((state) => state.verifications);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <section className="panel side-panel">
      <div className="toolbar">
        <h2>回筐核销台账</h2>
        <span className="count">{verifications.length} 单</span>
      </div>
      <p className="column-hint">核销记录一经提交即冻结；实回数据如有误走"更正"，原记录保留并另建版本。</p>
      <div className="verification-list">
        {verifications.length === 0 && <p className="cell-empty">暂无核销记录</p>}
        {verifications.map((record) => {
          const latest = record.versions[record.versions.length - 1];
          const isOpen = expanded[record.id];
          return (
            <article className="verification-row" key={record.id}>
              <div className="verification-head">
                <div>
                  <strong>{record.orderNo}</strong>
                  <span className="chip">{getDriver(record.driverId)?.name}</span>
                  <span className="chip">{SLOT_LABEL[record.slot]}</span>
                  {record.versions.length > 1 && (
                    <span className="chip chip-version">v{latest.version}（已更正 {record.versions.length - 1} 次）</span>
                  )}
                </div>
                <div className="verification-ops">
                  <button type="button" className="mini secondary" onClick={() => onCorrect(record)}>
                    更正
                  </button>
                  <button
                    type="button"
                    className="mini secondary"
                    onClick={() => setExpanded((v) => ({ ...v, [record.id]: !v[record.id] }))}
                  >
                    {isOpen ? "收起版本" : `版本 ${record.versions.length}`}
                  </button>
                </div>
              </div>
              <div className="verification-summary">
                {(["cold", "ambient"] as const).map((zone) => {
                  const issued = zone === "cold" ? record.issuedCold : record.issuedAmb;
                  const returned = zone === "cold" ? latest.returnedCold : latest.returnedAmb;
                  const damaged = zone === "cold" ? latest.damagedCold : latest.damagedAmb;
                  const missing = issued - returned;
                  return (
                    <span key={zone} className={missing > 0 || damaged > 0 ? "warn-text" : ""}>
                      {ZONE_LABEL[zone]}：领{issued} / 回{returned} / 缺{missing} / 损{damaged}
                    </span>
                  );
                })}
              </div>
              {isOpen && (
                <ol className="version-list">
                  {[...record.versions].reverse().map((version) => (
                    <li key={version.version} className={version.version === latest.version ? "version-current" : ""}>
                      <header>
                        <strong>v{version.version}</strong>
                        <span>{new Date(version.createdAt).toLocaleString("zh-CN")}</span>
                        {version.version === latest.version && <span className="rec-badge">当前版本</span>}
                      </header>
                      <p>
                        冷 {version.returnedCold}/{record.issuedCold}（损 {version.damagedCold}）·
                        常 {version.returnedAmb}/{record.issuedAmb}（损 {version.damagedAmb}）
                      </p>
                      {version.note && <p className="version-note">{version.note}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
