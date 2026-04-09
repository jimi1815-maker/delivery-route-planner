/* =====================================================
   app.js — 應用程式進入點 (Entry Point)
   =====================================================
   載入順序: constants → csv → geocoding → map → delivered → settings → ui → app
   本檔案負責:
     1. 初始化共享狀態 (State)
     2. 取得 DOM 參照
     3. DOMContentLoaded 啟動流程
     4. Service Worker 註冊
   ===================================================== */

// ==================== State (應用狀態) ====================
window.App = window.App || {};
Object.assign(window.App, {
  csvSources: [],       // 多 CSV 來源陣列 (每個元素含 rawRows, type, color, selectedDistricts 等)
  filteredItems: [],    // 經配區篩選後的所有送貨項目 (合併多 CSV 來源)
  map: null,            // Leaflet 地圖實例
  markers: [],          // 目前地圖上的所有 Leaflet marker
  deliveredSet: new Set(), // 已送達的明細單號 (detailNo) 集合
});

// ==================== DOM References (元素參照) ====================
/** 簡寫 querySelector */
const $ = (sel) => document.querySelector(sel);

Object.assign(window.App, {
  $,
  mainScreen: $('#main-screen'),
  csvSourceList: $('#csv-source-list'),
  csvAddInput: $('#csv-add-input'),
  itemCount: $('#item-count'),
  itemList: $('#item-list'),
  loadingOverlay: $('#loading-overlay'),
  loadingText: $('#loading-text'),
  progressFill: $('#progress-fill'),
  geocodeToast: $('#geocode-toast'),
  settingsBtn: $('#settings-btn'),
  settingsModal: $('#settings-modal'),
  apiKeyInput: $('#api-key-input'),
  saveKeyBtn: $('#save-key-btn'),
  closeModalBtn: $('#close-modal-btn'),
  apiKeyStatus: $('#api-key-status'),
});

// ==================== Initialization (初始化) ====================
/**
 * DOMContentLoaded 時執行:
 * 1. 載入昨天的送達狀態 (如果是同一天)
 * 2. 載入 Geocode 快取
 * 3. 綁定所有事件監聽器
 * 4. 初始化 Leaflet 地圖
 * 5. 檢查是否已設定 API Key
 * 6. 渲染空的 CSV 來源列表
 */
document.addEventListener('DOMContentLoaded', () => {
  window.App.loadDeliveredState();
  window.App.loadGeocodeCache();
  window.App.initEventListeners();
  window.App.initMap();
  window.App.checkApiKey();
  window.App.renderCsvSourceList();
});

// ==================== Service Worker 註冊 ====================
/** 註冊 Service Worker 以啟用離線快取 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
