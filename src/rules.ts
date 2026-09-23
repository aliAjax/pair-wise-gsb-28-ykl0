import { DRIVERS, SLOTS, ZONE_LABEL } from "./data";
import type {
  AssignInput,
  BasketOrder,
  CheckResult,
  Driver,
  RecoveryItem,
  SlotId,
  VerificationRecord,
  VerificationVersion,
  Zone
} from "./types";

// —— 派生展示 ——

/** 温区由筐数派生：纯冷筐 / 纯常温 / 混温 */
export function zoneText(cold: number, amb: number): string {
  if (cold > 0 && amb > 0) return "混温";
  if (cold > 0) return "冷链";
  if (amb > 0) return "常温";
  return "未配筐";
}

export function getDriver(driverId: string): Driver | undefined {
  return DRIVERS.find((driver) => driver.id === driverId);
}

export function slotLabel(slot: SlotId): string {
  return SLOTS.find((item) => item.id === slot)?.label ?? slot;
}

// —— 额度占用：同一司机同一时段 ——
// 在途订单（已排车 + 已发车，发车后锁定仍占额）+ 待回收（短少/破损未补录原因）

export interface Usage {
  cold: number;
  amb: number;
  total: number;
  orderCold: number;
  orderAmb: number;
  recoveryCold: number;
  recoveryAmb: number;
}

export const ZERO_USAGE: Usage = {
  cold: 0,
  amb: 0,
  total: 0,
  orderCold: 0,
  orderAmb: 0,
  recoveryCold: 0,
  recoveryAmb: 0
};

export function activeCellOrders(
  orders: BasketOrder[],
  driverId: string,
  slot: SlotId
): BasketOrder[] {
  return orders.filter(
    (order) =>
      (order.status === "assigned" || order.status === "departed") &&
      order.driverId === driverId &&
      order.slot === slot
  );
}

export function openRecoveries(
  recoveries: RecoveryItem[],
  driverId: string,
  slot: SlotId
): RecoveryItem[] {
  return recoveries.filter(
    (item) => item.status === "open" && item.driverId === driverId && item.slot === slot
  );
}

export function cellUsage(
  orders: BasketOrder[],
  recoveries: RecoveryItem[],
  driverId: string,
  slot: SlotId
): Usage {
  const cell = activeCellOrders(orders, driverId, slot);
  const open = openRecoveries(recoveries, driverId, slot);
  const orderCold = sum(cell, "cold");
  const orderAmb = sum(cell, "amb");
  const recoveryCold = sumRecovery(open, "cold");
  const recoveryAmb = sumRecovery(open, "ambient");
  const cold = orderCold + recoveryCold;
  const amb = orderAmb + recoveryAmb;
  return {
    cold,
    amb,
    total: cold + amb,
    orderCold,
    orderAmb,
    recoveryCold,
    recoveryAmb
  };
}

function sum(orders: BasketOrder[], key: "cold" | "amb"): number {
  return orders.reduce((acc, order) => acc + order[key], 0);
}

function sumRecovery(items: RecoveryItem[], zone: Zone): number {
  return items
    .filter((item) => item.zone === zone)
    .reduce((acc, item) => acc + item.missingQty + item.damagedQty, 0);
}

// —— 排车 / 改派判定 ——
// 改派语义：先把该订单自身占用的额度释放（占用计算时排除自身），再按目标格子重算。
// 任一项超限整次拒绝：不写入、订单留在原处，调用方保留界面输入。

export function checkAssign(
  orders: BasketOrder[],
  recoveries: RecoveryItem[],
  order: BasketOrder,
  driverId: string,
  targetSlot: SlotId
): CheckResult {
  if (order.status === "departed") {
    return { ok: false, reasons: ["订单已发车，司机、时段和筐数已锁定，不能改派；请先在该格送达核销"] };
  }
  if (order.status === "delivered") {
    return { ok: false, reasons: ["订单已送达核销，不能再排班"] };
  }
  if (order.slot !== targetSlot) {
    return {
      ok: false,
      reasons: [`订单 ${order.orderNo} 的配送时段为${slotLabel(order.slot)}，请拖入${slotLabel(order.slot)}列，不能跨时段排车`]
    };
  }
  if (order.cold + order.amb <= 0) {
    return { ok: false, reasons: ["领用筐数为 0，无法排车"] };
  }
  const driver = getDriver(driverId);
  if (!driver) return { ok: false, reasons: ["未找到司机资料"] };

  // 排除自身 = 先释放原额度（含从其它格改派的情况）
  const others = orders.filter((item) => item.id !== order.id);
  const used = cellUsage(others, recoveries, driverId, order.slot);
  const nextCold = used.cold + order.cold;
  const nextAmb = used.amb + order.amb;
  const reasons: string[] = [];

  if (nextCold > driver.coldCap) {
    reasons.push(
      `冷筐 ${nextCold} 超过${driver.name}${slotLabel(order.slot)}冷筐额度 ${driver.coldCap}（当前已占 ${used.cold}）`
    );
  }
  if (nextAmb > driver.ambCap) {
    reasons.push(
      `常温筐 ${nextAmb} 超过${driver.name}${slotLabel(order.slot)}常温筐额度 ${driver.ambCap}（当前已占 ${used.amb}）`
    );
  }
  if (nextCold + nextAmb > driver.totalCap) {
    reasons.push(
      `冷筐+常温筐合计 ${nextCold + nextAmb} 超过车辆总容量 ${driver.totalCap}（当前已占 ${used.total}）`
    );
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/** 发车：格内全部已排车订单整格锁定；已发车的单不再重复处理 */
export function checkDepart(orders: BasketOrder[]): CheckResult {
  if (orders.length === 0) {
    return { ok: false, reasons: ["该时段没有待发车的订单"] };
  }
  return { ok: true };
}

// —— 送达核销判定 ——

export function checkDelivery(order: BasketOrder | undefined, input: AssignInput): CheckResult {
  const reasons: string[] = [];
  if (!order) return { ok: false, reasons: ["未找到订单"] };
  if (order.status !== "departed") {
    reasons.push("只有已发车的订单才能登记送达");
  }
  const bounds = checkBounds(order.cold, order.amb, input);
  if (!bounds.ok) reasons.push(...bounds.reasons);
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/** 仅校验实回/破损数量边界：送达登记与更正版本共用 */
export function checkBounds(
  issuedCold: number,
  issuedAmb: number,
  input: AssignInput
): CheckResult {
  const reasons: string[] = [];
  const rows: ["returnedCold" | "returnedAmb" | "damagedCold" | "damagedAmb", number, string, string?][] = [
    ["returnedCold", issuedCold, "实回冷筐"],
    ["returnedAmb", issuedAmb, "实回常温筐"],
    ["damagedCold", input.returnedCold, "破损冷筐", "不能大于实回冷筐"],
    ["damagedAmb", input.returnedAmb, "破损常温筐", "不能大于实回常温筐"]
  ];
  for (const [key, bound, label, exceedHint] of rows) {
    const value = input[key];
    if (!Number.isInteger(value) || value < 0) {
      reasons.push(`${label}必须是非负整数`);
    } else if (value > bound) {
      reasons.push(exceedHint ?? `${label} ${value} 不能超过领用量 ${bound}`);
    }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

// —— 待回收：短少（领用-实回）与破损（实回中的破损）—
// 更正核销时按新版本重建待回收项；旧版本未处理项 superseded，已释放的历史保持冻结。

export function buildRecoveryItems(
  record: VerificationRecord,
  version: VerificationVersion
): RecoveryItem[] {
  const now = new Date().toISOString();
  const make = (
    zone: Zone,
    issued: number,
    returned: number,
    damaged: number
  ): RecoveryItem | null => {
    const missing = issued - returned;
    if (missing <= 0 && damaged <= 0) return null;
    return {
      id: crypto.randomUUID(),
      orderId: record.orderId,
      orderNo: record.orderNo,
      verificationId: record.id,
      version: version.version,
      driverId: record.driverId,
      slot: record.slot,
      zone,
      missingQty: missing,
      damagedQty: damaged,
      status: "open",
      createdAt: now
    };
  };
  return [
    make("cold", record.issuedCold, version.returnedCold, version.damagedCold),
    make("ambient", record.issuedAmb, version.returnedAmb, version.damagedAmb)
  ].filter((item): item is RecoveryItem => item !== null);
}

/**
 * 更正核销：冻结旧版本，追加新版本。
 * - 旧最新版本仍 open 的回收项 -> superseded（立即停止占额，由新版本重算）
 * - 已 released 的历史项不动（已核销记录冻结）
 * - 按新版本生成新的 open 回收项
 */
export function applyCorrection(
  record: VerificationRecord,
  recoveries: RecoveryItem[],
  input: AssignInput
): { record: VerificationRecord; items: RecoveryItem[] } {
  const supersededVersion = record.versions[record.versions.length - 1].version;
  const nextRecoveries = recoveries.map((item) =>
    item.verificationId === record.id &&
    item.version === supersededVersion &&
    item.status === "open"
      ? { ...item, status: "superseded" as const }
      : item
  );
  const version: VerificationVersion = {
    version: supersededVersion + 1,
    createdAt: new Date().toISOString(),
    returnedCold: input.returnedCold,
    returnedAmb: input.returnedAmb,
    damagedCold: input.damagedCold,
    damagedAmb: input.damagedAmb,
    note: input.note
  };
  const nextRecord: VerificationRecord = {
    ...record,
    versions: [...record.versions, version]
  };
  const items = buildRecoveryItems(nextRecord, version);
  return { record: nextRecord, items: [...nextRecoveries, ...items] };
}

// —— 新建/编辑订单表单校验 ——

export function checkOrderDraft(draft: {
  orderNo: string;
  destination: string;
  slot: SlotId;
  cold: number;
  amb: number;
}): CheckResult {
  const reasons: string[] = [];
  if (!draft.orderNo.trim()) reasons.push("请填写订单号");
  if (!draft.destination.trim()) reasons.push("请填写目的地");
  if (!Number.isInteger(draft.cold) || draft.cold < 0) reasons.push("冷筐数必须是非负整数");
  if (!Number.isInteger(draft.amb) || draft.amb < 0) reasons.push("常温筐数必须是非负整数");
  if (draft.cold + draft.amb <= 0) reasons.push("冷筐与常温筐至少填写一项（大于 0）");
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

export { ZONE_LABEL };
