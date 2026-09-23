import { create } from "zustand";
import {
  SCHEMA_VERSION,
  SEED_ORDERS,
  SEED_RECOVERIES,
  SEED_VERIFICATIONS,
  STORAGE_KEY
} from "./data";
import {
  activeCellOrders,
  applyCorrection,
  buildRecoveryItems,
  checkAssign,
  checkBounds,
  checkDelivery,
  checkDepart,
  checkOrderDraft
} from "./rules";
import type {
  AssignInput,
  BasketOrder,
  PersistShape,
  RecoveryItem,
  SlotId,
  VerificationRecord
} from "./types";

interface ToastState {
  type: "success" | "error";
  messages: string[];
  key: number;
}

interface DeskState {
  orders: BasketOrder[];
  verifications: VerificationRecord[];
  recoveries: RecoveryItem[];
  toast: ToastState | null;
  notify: (type: "success" | "error", messages: string[]) => void;
  addOrder: (draft: OrderDraft) => boolean;
  updateOrder: (id: string, draft: OrderDraft) => boolean;
  deleteOrder: (id: string) => boolean;
  /** 排车或改派：判定失败整次拒绝，不动现有状态 */
  assignOrder: (orderId: string, driverId: string, targetSlot: SlotId) => boolean;
  /** 拖回待分配：已发车锁定不允许 */
  unassignOrder: (orderId: string) => boolean;
  departCell: (driverId: string, slot: SlotId) => boolean;
  registerDelivery: (orderId: string, input: AssignInput) => boolean;
  correctVerification: (verificationId: string, input: AssignInput) => boolean;
  resolveRecovery: (recoveryId: string, reason: string) => boolean;
}

export interface OrderDraft {
  orderNo: string;
  destination: string;
  slot: SlotId;
  cold: number;
  amb: number;
  note: string;
}

function load(): PersistShape {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed.schemaVersion === SCHEMA_VERSION) return parsed;
    } catch {
      // 数据损坏时回退种子，避免白屏
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    orders: SEED_ORDERS,
    verifications: SEED_VERIFICATIONS,
    recoveries: SEED_RECOVERIES
  };
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

const initial = load();

export const useDeskStore = create<DeskState>((set, get) => {
  // 每次状态变更统一落盘：刷新后订单 / 额度 / 回收 / 版本同源一致
  const commit = (
    patch: Partial<Pick<DeskState, "orders" | "verifications" | "recoveries">>
  ) => {
    set(patch);
    const state = get();
    const snapshot: PersistShape = {
      schemaVersion: SCHEMA_VERSION,
      orders: state.orders,
      verifications: state.verifications,
      recoveries: state.recoveries
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  };

  return {
    orders: initial.orders,
    verifications: initial.verifications,
    recoveries: initial.recoveries,
    toast: null,

    notify: (type, messages) => {
      clearTimeout(toastTimer);
      const toast = { type, messages, key: Date.now() };
      set({ toast });
      toastTimer = setTimeout(() => set({ toast: null }), 4200);
    },

    addOrder: (draft) => {
      const check = checkOrderDraft(draft);
      if (!check.ok) {
        get().notify("error", check.reasons);
        return false;
      }
      const order: BasketOrder = {
        id: crypto.randomUUID(),
        orderNo: draft.orderNo.trim(),
        destination: draft.destination.trim(),
        slot: draft.slot,
        cold: draft.cold,
        amb: draft.amb,
        status: "pending",
        note: draft.note.trim(),
        createdAt: new Date().toISOString()
      };
      commit({ orders: [order, ...get().orders] });
      get().notify("success", [`订单 ${order.orderNo} 已加入待分配`]);
      return true;
    },

    updateOrder: (id, draft) => {
      const target = get().orders.find((order) => order.id === id);
      if (!target) return false;
      if (target.status !== "pending") {
        get().notify("error", ["只有待分配订单可以补录；请先拖回待分配再修改"]);
        return false;
      }
      const check = checkOrderDraft(draft);
      if (!check.ok) {
        get().notify("error", check.reasons);
        return false;
      }
      commit({
        orders: get().orders.map((order) =>
          order.id === id
            ? {
                ...order,
                orderNo: draft.orderNo.trim(),
                destination: draft.destination.trim(),
                slot: draft.slot,
                cold: draft.cold,
                amb: draft.amb,
                note: draft.note.trim()
              }
            : order
        )
      });
      get().notify("success", [`订单 ${draft.orderNo} 已更新`]);
      return true;
    },

    deleteOrder: (id) => {
      const target = get().orders.find((order) => order.id === id);
      if (!target) return false;
      if (target.status !== "pending") {
        get().notify("error", ["已排车/发车/送达的订单不能删除"]);
        return false;
      }
      commit({ orders: get().orders.filter((order) => order.id !== id) });
      return true;
    },

    assignOrder: (orderId, driverId, targetSlot) => {
      const { orders, recoveries } = get();
      const order = orders.find((item) => item.id === orderId);
      if (!order) return false;
      const check = checkAssign(orders, recoveries, order, driverId, targetSlot);
      if (!check.ok) {
        // 整次拒绝：不写状态，订单卡片留在来源格，表单/拖拽输入保持不变
        get().notify("error", check.reasons);
        return false;
      }
      commit({
        orders: orders.map((item) =>
          item.id === orderId ? { ...item, status: "assigned", driverId } : item
        )
      });
      return true;
    },

    unassignOrder: (orderId) => {
      const order = get().orders.find((item) => item.id === orderId);
      if (!order) return false;
      if (order.status === "departed") {
        get().notify("error", ["已发车订单已锁定，不能拖回待分配"]);
        return false;
      }
      if (order.status === "delivered") {
        get().notify("error", ["订单已送达核销，不能撤回"]);
        return false;
      }
      commit({
        orders: get().orders.map((item) =>
          item.id === orderId ? { ...item, status: "pending", driverId: undefined } : item
        )
      });
      return true;
    },

    departCell: (driverId, slot) => {
      const cell = activeCellOrders(get().orders, driverId, slot).filter(
        (order) => order.status === "assigned"
      );
      const check = checkDepart(cell);
      if (!check.ok) {
        get().notify("error", check.reasons);
        return false;
      }
      const ids = new Set(cell.map((order) => order.id));
      // 发车前锁定：司机、时段、筐数随状态固定，之后只能送达核销
      commit({
        orders: get().orders.map((order) =>
          ids.has(order.id) ? { ...order, status: "departed" as const } : order
        )
      });
      get().notify("success", [`${cell.length} 单已发车，司机/时段/筐数已锁定`]);
      return true;
    },

    registerDelivery: (orderId, input) => {
      const order = get().orders.find((item) => item.id === orderId);
      if (!order || order.status !== "departed" || !order.driverId) {
        get().notify("error", ["只有已发车且锁定司机的订单才能登记送达"]);
        return false;
      }
      const check = checkDelivery(order, input);
      if (!check.ok) {
        get().notify("error", check.reasons);
        return false;
      }
      const record: VerificationRecord = {
        id: crypto.randomUUID(),
        orderId: order.id,
        orderNo: order.orderNo,
        driverId: order.driverId,
        slot: order.slot,
        issuedCold: order.cold,
        issuedAmb: order.amb,
        versions: [
          {
            version: 1,
            createdAt: new Date().toISOString(),
            returnedCold: input.returnedCold,
            returnedAmb: input.returnedAmb,
            damagedCold: input.damagedCold,
            damagedAmb: input.damagedAmb,
            note: input.note
          }
        ]
      };
      const items = buildRecoveryItems(record, record.versions[0]);
      commit({
        orders: get().orders.map((item) =>
          item.id === orderId ? { ...item, status: "delivered" as const } : item
        ),
        verifications: [record, ...get().verifications],
        recoveries: [...get().recoveries, ...items]
      });
      get().notify(
        "success",
        items.length
          ? [`${order.orderNo} 已送达：${items.length} 类短少/破损转入待回收，占用该司机额度`]
          : [`${order.orderNo} 已送达，周转筐全部核销回筐`]
      );
      return true;
    },

    correctVerification: (verificationId, input) => {
      const record = get().verifications.find((item) => item.id === verificationId);
      if (!record) return false;
      // 冻结原记录，另建版本；旧版本未处理回收项置 superseded，按新版本重算占用
      const issuedCheck = checkBounds(record.issuedCold, record.issuedAmb, input);
      if (!issuedCheck.ok) {
        get().notify("error", issuedCheck.reasons);
        return false;
      }
      const { record: nextRecord, items } = applyCorrection(
        record,
        get().recoveries,
        input
      );
      commit({
        verifications: get().verifications.map((item) =>
          item.id === verificationId ? nextRecord : item
        ),
        recoveries: items
      });
      const openCount = items.filter(
        (item) => item.verificationId === verificationId && item.status === "open"
      ).length;
      get().notify("success", [`已生成 v${nextRecord.versions.length} 更正版本`, `当前待回收 ${openCount} 项`]);
      return true;
    },

    resolveRecovery: (recoveryId, reason) => {
      const item = get().recoveries.find((entry) => entry.id === recoveryId);
      if (!item) return false;
      if (item.status !== "open") {
        get().notify("error", ["该回收项已处理或已被新版本替代"]);
        return false;
      }
      if (!reason.trim()) {
        get().notify("error", ["请先补录短少/破损原因，补录后才释放额度"]);
        return false;
      }
      // 补录原因后释放：open -> released，对应司机时段额度立即恢复
      commit({
        recoveries: get().recoveries.map((entry) =>
          entry.id === recoveryId
            ? {
                ...entry,
                status: "released",
                reason: reason.trim(),
                resolvedAt: new Date().toISOString()
              }
            : entry
        )
      });
      get().notify("success", ["已补录原因并释放占用额度"]);
      return true;
    }
  };
});
