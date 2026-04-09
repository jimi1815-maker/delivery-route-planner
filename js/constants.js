/* =====================================================
   constants.js — 常數定義 (欄位索引 + 地圖圖示 + 色盤)
   ===================================================== */

/**
 * CSV 欄位索引對照 — 一般（點貨異常表）(0-based)
 * 重要: 這些索引是根據特定 CSV 格式 hardcode 的，
 * 如果來源系統的欄位順序變更，需同步修改此處
 */
const COL = {
  DETAIL_NO: 6,      // 明細單號
  SYS_DISTRICT: 9,   // 系統配區
  RECEIVER_NAME: 13,  // 收貨人名稱
  RECEIVER_PHONE: 14, // 收貨人電話
  RECEIVER_ADDR: 16,  // 收貨人地址
  REMARK: 20,         // 備註
  SHIPPER_NAME: 26,   // 托運人名稱
};

/**
 * CSV 欄位索引對照 — 留庫明細 (0-based)
 * Header: 發送日,貨號,發站,到站,托運人,收貨人,件數,溫層,支付方式,運什費,更正日,最新貨況,人員,單位,指配日,代收貨款,處理情形,註區,地址
 */
const COL_PREV = {
  DETAIL_NO: 1,       // 貨號
  SHIPPER_NAME: 4,    // 托運人
  RECEIVER_NAME: 5,   // 收貨人
  TEMP_ZONE: 7,       // 溫層 (冷凍/冷藏)
  LATEST_STATUS: 11,  // 最新貨況
  DISTRICT: 17,       // 註區 (配區)
  RECEIVER_ADDR: 18,  // 地址
};

/** 預設顏色色盤 — 依序分配給每個 CSV 來源 */
const COLOR_PALETTE = [
  '#3b82f6', // 藍
  '#ef4444', // 紅
  '#10b981', // 綠
  '#f59e0b', // 橙
  '#8b5cf6', // 紫
  '#ec4899', // 粉紅
  '#06b6d4', // 青
  '#f97316', // 深橙
];

/**
 * 產生 DivIcon 水滴形 Marker
 * @param {string} color - 十六進位色碼 (如 '#3b82f6')
 * @param {boolean} isDelivered - 是否已送達 (降低透明度 + 灰色遮罩)
 * @returns {L.DivIcon}
 */
function createMarkerIcon(color, isDelivered) {
  const opacity = isDelivered ? 0.4 : 1;
  const filter = isDelivered ? 'saturate(0.3)' : 'none';

  return L.divIcon({
    className: 'marker-pin-wrapper',
    html: `<div class="marker-pin" style="
      background-color: ${color};
      opacity: ${opacity};
      filter: ${filter};
    "><div class="marker-dot"></div></div>`,
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -42],
  });
}

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, { COL, COL_PREV, COLOR_PALETTE, createMarkerIcon });
