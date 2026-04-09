/* =====================================================
   constants.js — 常數定義 (欄位索引 + 地圖圖示)
   ===================================================== */

/**
 * CSV 欄位索引對照 (0-based)
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

const COL_PREV = {

}

/** 預設藍色標記 — 尚未送達的送貨點 */
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/** 灰色標記 — 已送達的送貨點 (透明度也會降低) */
const deliveredIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png',
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, { COL, defaultIcon, deliveredIcon });
