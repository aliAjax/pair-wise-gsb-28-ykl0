/**
 * 资料层：司机车辆额度、配送时段与演示种子数据。
 * 这里只放静态资料，不做任何业务判定。
 */
import type { DriverSpec, Order, Recovery, Verification } from "./domain";

export const DRIVERS: DriverSpec[] = [
  { name: "刘师傅", slotQuota: 40, totalCapacity: 90 },
  { name: "赵师傅", slotQuota: 30, totalCapacity: 70 },
  { name: "孙师傅", slotQuota: 24, totalCapacity: 56 }
];

export const SLOTS = ["上午 08:00-11:00", "下午 13:00-16:00", "晚间 18:00-21:00"];

export const now = Date.now();
const iso = (offsetDays: number) => new Date(now - offsetDays * 86400000).toISOString();

/** 种子数据保持额度自洽：刘师傅上午 22+14=36 ≤ 40；赵师傅晚间 20、待回收 2 */
export const SEED_ORDERS: Order[] = [
  {
    id: "seed-1",
    orderNo: "ORD-9012",
    destination: "浦东",
    slot: SLOTS[0],
    coldBaskets: 12,
    ambientBaskets: 10,
    status: "已分配",
    driver: "刘师傅",
    notes: "上午配送，生鲜与干货混装",
    lockedAt: null,
    delivery: null,
    createdAt: iso(1)
  },
  {
    id: "seed-2",
    orderNo: "ORD-9031",
    destination: "嘉定",
    slot: SLOTS[1],
    coldBaskets: 8,
    ambientBaskets: 6,
    status: "待分配",
    driver: null,
    notes: "待排班",
    lockedAt: null,
    delivery: null,
    createdAt: iso(1)
  },
  {
    id: "seed-3",
    orderNo: "ORD-9045",
    destination: "青浦",
    slot: SLOTS[0],
    coldBaskets: 0,
    ambientBaskets: 14,
    status: "已锁定",
    driver: "刘师傅",
    notes: "发车前已锁定",
    lockedAt: iso(0),
    delivery: null,
    createdAt: iso(0)
  },
  {
    id: "seed-4",
    orderNo: "ORD-9058",
    destination: "松江",
    slot: SLOTS[2],
    coldBaskets: 20,
    ambientBaskets: 0,
    status: "已锁定",
    driver: "赵师傅",
    notes: "冷链专线",
    lockedAt: iso(0),
    delivery: null,
    createdAt: iso(0)
  },
  {
    id: "seed-5",
    orderNo: "ORD-9066",
    destination: "奉贤",
    slot: SLOTS[1],
    coldBaskets: 10,
    ambientBaskets: 5,
    status: "已送达",
    driver: "赵师傅",
    notes: "送达时少回 2 个冷筐",
    lockedAt: iso(0),
    delivery: {
      returnedCold: 8,
      returnedAmbient: 5,
      damagedCold: 0,
      damagedAmbient: 0,
      at: iso(0)
    },
    createdAt: iso(0)
  },
  {
    id: "seed-6",
    orderNo: "ORD-9072",
    destination: "宝山",
    slot: SLOTS[0],
    coldBaskets: 6,
    ambientBaskets: 6,
    status: "已核销",
    driver: "孙师傅",
    notes: "筐数两清",
    lockedAt: iso(2),
    delivery: {
      returnedCold: 6,
      returnedAmbient: 6,
      damagedCold: 0,
      damagedAmbient: 0,
      at: iso(2)
    },
    createdAt: iso(2)
  }
];

export const SEED_RECOVERIES: Recovery[] = [
  {
    id: "seed-rec-1",
    orderId: "seed-5",
    orderNo: "ORD-9066",
    driver: "赵师傅",
    slot: SLOTS[1],
    cold: 2,
    ambient: 0,
    kind: "短少",
    reason: null,
    status: "待回收",
    createdAt: iso(0),
    releasedAt: null
  }
];

export const SEED_VERIFICATIONS: Verification[] = [
  {
    id: "seed-ver-1",
    orderId: "seed-6",
    orderNo: "ORD-9072",
    version: 1,
    driver: "孙师傅",
    slot: SLOTS[0],
    coldBaskets: 6,
    ambientBaskets: 6,
    returnedCold: 6,
    returnedAmbient: 6,
    damagedCold: 0,
    damagedAmbient: 0,
    note: "首次核销",
    frozen: true,
    createdAt: iso(2)
  }
];
