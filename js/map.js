/* =====================================================
   map.js — Leaflet 地圖初始化 + 標記管理
   ===================================================== */

// ==================== Map (地圖模組) ====================
/** 初始化 Leaflet 地圖，預設中心點為新竹地區，縮放控制器放右下角 */
function initMap() {
  const map = L.map('map', {
    center: [24.8, 120.97], // Hsinchu area
    zoom: 13,
    zoomControl: false,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  window.App.map = map;
}

/** 清除地圖上的所有標記 (切換配區時呼叫) */
function clearMarkers() {
  const { map, markers } = window.App;
  markers.forEach(m => map.removeLayer(m));
  window.App.markers = [];
}

/**
 * 產生地圖標記的彈出視窗 HTML
 * 包含: 收貨人、單號、地址、電話(可撥打)、備註、托運人、送達 checkbox、Google Maps 導航按鈕
 */
function buildPopupHtml(item) {
  const { deliveredSet, escHtml } = window.App;
  const isDelivered = deliveredSet.has(item.detailNo);
  const phone = item.phone.replace(/\s+/g, '');
  const encodedAddr = encodeURIComponent(item.addressRaw);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddr}`;

  return `
    <div class="popup-content">
      <h3>${escHtml(item.receiverName)}</h3>
      <div class="popup-row"><span class="popup-label">單號</span><span class="popup-value">${escHtml(item.detailNo)}</span></div>
      <div class="popup-row"><span class="popup-label">地址</span><span class="popup-value">${escHtml(item.addressRaw)}</span></div>
      <div class="popup-row"><span class="popup-label">電話</span><span class="popup-value"><a href="tel:${phone}">${escHtml(item.phone)}</a></span></div>
      <div class="popup-row"><span class="popup-label">備註</span><span class="popup-value">${escHtml(item.remark || '無')}</span></div>
      <div class="popup-row"><span class="popup-label">托運</span><span class="popup-value">${escHtml(item.shipperName)}</span></div>
      <label class="popup-delivered-check" onclick="event.stopPropagation()">
        <input type="checkbox" ${isDelivered ? 'checked' : ''}
               onchange="toggleDelivered('${escHtml(item.detailNo)}', this.checked)" />
        <span class="check-label">✅ 已送達</span>
      </label>
      <a class="navigate-btn" href="${navUrl}" target="_blank" rel="noopener">🧭 Google Maps 導航</a>
    </div>`;
}

/**
 * 在地圖上新增一個 marker
 * - 已送達的點使用灰色圖示 + 降低透明度
 * - 每次打開 popup 會重新繪製 HTML，確保 checkbox 狀態最新
 */
function addMarker(item) {
  if (!item.lat || !item.lng) return;

  const { map, markers, deliveredSet, defaultIcon, deliveredIcon } = window.App;
  const isDelivered = deliveredSet.has(item.detailNo);
  const marker = L.marker([item.lat, item.lng], {
    icon: isDelivered ? deliveredIcon : defaultIcon,
    opacity: isDelivered ? 0.5 : 1,
  }).addTo(map);

  // Store reference for later updates
  marker._itemDetailNo = item.detailNo;
  marker._itemData = item;

  // Bind popup with initial content
  marker.bindPopup(buildPopupHtml(item), { maxWidth: 300, className: '' });

  // Refresh popup content every time it opens (so checkbox is always current)
  marker.on('popupopen', () => {
    marker.setPopupContent(buildPopupHtml(item));
  });

  markers.push(marker);
  return marker;
}

/** 自動調整地圖縮放範圍，讓所有 marker 都在可見區域內 */
function fitMapToMarkers() {
  const { markers, map } = window.App;
  if (markers.length === 0) return;
  const group = L.featureGroup(markers);
  map.fitBounds(group.getBounds().pad(0.1));
}

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, {
  initMap, clearMarkers, buildPopupHtml, addMarker, fitMapToMarkers,
});
