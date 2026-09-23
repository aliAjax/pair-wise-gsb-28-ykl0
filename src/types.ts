// 领域模型：订单、核销版本、回收记录
// 资料（司机/时段）见 data.ts，判定规则见 rules.ts，存取见 store.ts

export type SlotId = "morning" | "noon" | "evening";

export type Zone = "cold" | "ambient";

/** 待分配 -> 已排车 -> 已发车 -> 已送达(核销) */
export type OrderStatus = "pending" | "assigned" | "departed" | "delivered";

export interface Driver {
  id: string;
  name: string;
  /** 冷筐车载额度 */
  coldCap: number;
  /** 常温筐车载额度 */
  ambCap: number;
  /** 总容量：冷筐 + 常温筐合计上限 */
  totalCap: number;
}

export interface BasketOrder {
  id: string;
  orderNo: string;
  destination: string;
  /** 补录的配送时段 */
  slot: SlotId;
  /** 领用冷筐数 */
  cold: number;
  /** 领用常温筐数 */
  amb: number;
  status: OrderStatus;
  /** 排车后锁定的司机（pending 时为空） */
  driverId?: string;
  note: string;
  createdAt: string;
}

/** 一次送达登记形成一个核销版本；记录冻结，更正只能追加新版本 */
export interface VerificationVersion {
  version: number;
  createdAt: string;
  /** 实回冷筐 / 实回常温筐（含破损） */
  returnedCold: number;
  returnedAmb: number;
  /** 其中破损筐数（必须 <= 实回） */
  damagedCold: number;
  damagedAmb: number;
  note: string;
}

export interface VerificationRecord {
  id: string;
  orderId: string;
  orderNo: string;
  driverId: string;
  slot: SlotId;
  /** 发车时锁定的领用筐数 */
  issuedCold: number;
  issuedAmb: number;
  versions: VerificationVersion[];
}

/** 短少 = 领用 - 实回；破损 = 实回中的破损部分。二者均转入待回收并占用额度 */
export interface RecoveryItem {
  id: string;
  orderId: string;
  orderNo: string;
  verificationId: string;
  /** 对应核销版本；更正后旧版本未处理项变为 superseded */
  version: number;
  driverId: string;
  slot: SlotId;
  zone: Zone;
  missingQty: number;
  damagedQty: number;
  status: "open" | "released" | "superseded";
  reason?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface PersistShape {
  schemaVersion: number;
  orders: BasketOrder[];
  verifications: VerificationRecord[];
  recoveries: RecoveryItem[];
}

export interface AssignInput {
  returnedCold: number;
  returnedAmb: number;
  damagedCold: number;
  damagedAmb: number;
  note: string;
}

export type CheckResult = { ok: true } | { ok: false; reasons: string[] };
