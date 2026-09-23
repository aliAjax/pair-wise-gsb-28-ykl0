/**
 * 判定层：周转筐领用与回筐核销的领域模型与纯业务规则。
 * 不依赖 React、DOM、localStorage，可独立单测。
 */

export type OrderStatus = "待分配" | "已分配" | "已锁定" | "已送达" | "已核销";

export const ORDER_STATUSES: OrderStatus[] = ["待分配", "已分配", "已锁定", "已送达", "已核销"];

/** 温区：按冷筐/常温筐数自动推导，不需要手工维护 */
export type TemperatureZone = "常温" | "冷藏" | "混合";

export interface DeliveryInfo {
  /** 实回冷筐数 */
  returnedCold: number;
  /** 实回常温筐数 */
  returnedAmbient: number;
  /** 回筐中破损冷筐数 */
  damagedCold: number;
  /** 回筐中破损常温筐数 */
  damagedAmbient: number;
  at: string;
}

export interface Order {
  id: string;
  orderNo: string;
  destination: string;
  /** 配送时段 */
  slot: string;
  /** 领用冷筐数 */
  coldBaskets: number;
  /** 领用常温筐数 */
  ambientBaskets: number;
  status: OrderStatus;
  driver: string | null;
  notes: string;
  /** 发车锁定时间，锁定后司机/时段/筐数即快照值 */
  lockedAt: string | null;
  delivery: DeliveryInfo | null;
  createdAt: string;
}

export type RecoveryKind = "短少" | "破损" | "短少+破损";

export interface Recovery {
  id: string;
  orderId: string;
  orderNo: string;
  driver: string;
  slot: string;
  cold: number;
  ambient: number;
  kind: RecoveryKind;
  /** 补录的原因，未补录前为 null，筐持续占用司机额度 */
  reason: string | null;
  status: "待回收" | "已释放";
  createdAt: string;
  releasedAt: string | null;
}

export interface Verification {
  id: string;
  orderId: string;
  orderNo: string;
  /** 同一订单的核销记录按版本递增，历史版本冻结保留 */
  version: number;
  driver: string;
  slot: string;
  coldBaskets: number;
  ambientBaskets: number;
  returnedCold: number;
  returnedAmbient: number;
  damagedCold: number;
  damagedAmbient: number;
  note: string;
  /** 核销记录一经生成即冻结，更正只能另建版本 */
  frozen: true;
  createdAt: string;
}

/** 车辆额度资料：每时段车载额度 + 全车总容量 */
export interface DriverSpec {
  name: string;
  slotQuota: number;
  totalCapacity: number;
}

export interface AssignmentDraft {
  driver: string;
  slot: string;
  cold: number;
  ambient: number;
}

export interface DriverUsage {
  /** 每时段已排筐数 */
  bySlot: Record<string, number>;
  /** 已排班（未送达）占用筐数 */
  scheduled: number;
  /** 待回收短少/破损占用筐数 */
  pendingRecovery: number;
  /** 总占用 = 已排班 + 待回收 */
  total: number;
}

export function totalBaskets(cold: number, ambient: number) {
  return cold + ambient;
}

export function zoneOf(cold: number, ambient: number): TemperatureZone {
  if (cold > 0 && ambient > 0) return "混合";
  if (cold > 0) return "冷藏";
  return "常温";
}

export function isActiveScheduled(status: OrderStatus) {
  return status === "已分配" || status === "已锁定";
}

/** 汇总某司机当前额度占用；司机额度全部由订单+回收记录推导，不另存状态 */
export function driverUsage(
  driver: string,
  orders: Order[],
  recoveries: Recovery[]
): DriverUsage {
  const bySlot: Record<string, number> = {};
  let scheduled = 0;
  for (const order of orders) {
    if (order.driver !== driver || !isActiveScheduled(order.status)) continue;
    const n = totalBaskets(order.coldBaskets, order.ambientBaskets);
    bySlot[order.slot] = (bySlot[order.slot] ?? 0) + n;
    scheduled += n;
  }
  const pendingRecovery = recoveries
    .filter((item) => item.driver === driver && item.status === "待回收")
    .reduce((sum, item) => sum + item.cold + item.ambient, 0);
  return { bySlot, scheduled, pendingRecovery, total: scheduled + pendingRecovery };
}

/**
 * 排班/改派判定：
 * 1. 同一时段筐数（冷+常温）不得超过车载额度；
 * 2. 冷筐与常温筐之和（叠加待回收占用）不得超过总容量。
 * 改派时先把被改派订单从占用中剔除（excludeOrderId），即“先释放原额度再重算”。
 * 任一条不满足都返回错误信息，由页面整次拒绝。
 */
export function validateAssignment(
  drivers: DriverSpec[],
  orders: Order[],
  recoveries: Recovery[],
  draft: AssignmentDraft,
  excludeOrderId?: string
): string | null {
  const spec = drivers.find((item) => item.name === draft.driver);
  if (!spec) return "请选择司机";
  if (draft.cold < 0 || draft.ambient < 0) return "筐数不能为负";
  if (totalBaskets(draft.cold, draft.ambient) <= 0) return "至少领用 1 个周转筐";

  const adding = totalBaskets(draft.cold, draft.ambient);

  // 改派先释放原额度：计算占用时剔除被改派订单，再按新司机/时段重算
  let slotExcluding = 0;
  let scheduledExcluding = 0;
  for (const order of orders) {
    if (order.id === excludeOrderId) continue;
    if (order.driver !== draft.driver || !isActiveScheduled(order.status)) continue;
    const n = totalBaskets(order.coldBaskets, order.ambientBaskets);
    scheduledExcluding += n;
    if (order.slot === draft.slot) slotExcluding += n;
  }
  const pendingRecovery = driverUsage(draft.driver, orders, recoveries).pendingRecovery;

  if (slotExcluding + adding > spec.slotQuota) {
    return `${draft.driver}「${draft.slot}」车载额度 ${spec.slotQuota} 筐，已排 ${slotExcluding} 筐，再排 ${adding} 筐将超限，排班被拒绝`;
  }
  const totalUsed = scheduledExcluding + pendingRecovery;
  if (totalUsed + adding > spec.totalCapacity) {
    return `${draft.driver}总容量 ${spec.totalCapacity} 筐，已占用 ${totalUsed} 筐（含待回收 ${pendingRecovery} 筐），再排 ${adding} 筐将超限，排班被拒绝`;
  }
  return null;
}

/** 送达登记合法性校验：实回不得超过领用，破损不得超过实回 */
export function validateDelivery(order: Order, info: DeliveryInfo): string | null {
  if (info.returnedCold < 0 || info.returnedAmbient < 0) return "实回筐数不能为负";
  if (info.damagedCold < 0 || info.damagedAmbient < 0) return "破损筐数不能为负";
  if (info.returnedCold > order.coldBaskets) return `实回冷筐 ${info.returnedCold} 多于领用 ${order.coldBaskets}`;
  if (info.returnedAmbient > order.ambientBaskets)
    return `实回常温筐 ${info.returnedAmbient} 多于领用 ${order.ambientBaskets}`;
  if (info.damagedCold > info.returnedCold) return "破损冷筐不能多于实回冷筐";
  if (info.damagedAmbient > info.returnedAmbient) return "破损常温筐不能多于实回常温筐";
  return null;
}

export interface DeliverySettlement {
  order: Order;
  recovery: Recovery | null;
}

/**
 * 结算送达：短少 = 领用 - 实回；短少或破损都生成待回收记录并继续占用司机额度。
 * 送达订单本身退出车辆排班占用。
 */
export function settleDelivery(order: Order, info: DeliveryInfo): DeliverySettlement {
  const shortageCold = order.coldBaskets - info.returnedCold;
  const shortageAmbient = order.ambientBaskets - info.returnedAmbient;
  const recCold = shortageCold + info.damagedCold;
  const recAmbient = shortageAmbient + info.damagedAmbient;
  const hasShortage = shortageCold > 0 || shortageAmbient > 0;
  const hasDamage = info.damagedCold > 0 || info.damagedAmbient > 0;

  let recovery: Recovery | null = null;
  if (recCold > 0 || recAmbient > 0) {
    const kind: RecoveryKind = hasShortage && hasDamage ? "短少+破损" : hasDamage ? "破损" : "短少";
    recovery = {
      id: crypto.randomUUID(),
      orderId: order.id,
      orderNo: order.orderNo,
      driver: order.driver as string,
      slot: order.slot,
      cold: recCold,
      ambient: recAmbient,
      kind,
      reason: null,
      status: "待回收",
      createdAt: new Date().toISOString(),
      releasedAt: null
    };
  }

  return {
    order: { ...order, status: "已送达", delivery: info },
    recovery
  };
}

export function canVerify(order: Order, recoveries: Recovery[]): boolean {
  if (order.status !== "已送达") return false;
  return !recoveries.some((item) => item.orderId === order.id && item.status === "待回收");
}

/** 生成核销记录（首条版本为 1；冻结历史，更正时版本 +1 另建） */
export function buildVerification(order: Order, verifications: Verification[], note: string): Verification {
  const version = verifications.filter((item) => item.orderId === order.id).length + 1;
  const info = order.delivery;
  return {
    id: crypto.randomUUID(),
    orderId: order.id,
    orderNo: order.orderNo,
    version,
    driver: order.driver as string,
    slot: order.slot,
    coldBaskets: order.coldBaskets,
    ambientBaskets: order.ambientBaskets,
    returnedCold: info?.returnedCold ?? 0,
    returnedAmbient: info?.returnedAmbient ?? 0,
    damagedCold: info?.damagedCold ?? 0,
    damagedAmbient: info?.damagedAmbient ?? 0,
    note: note || (version === 1 ? "首次核销" : "更正核销"),
    frozen: true as const,
    createdAt: new Date().toISOString()
  };
}
