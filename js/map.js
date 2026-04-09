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
 * 一般項目: 收貨人、單號、地址、電話(可撥打)、備註、托運人
 * 留庫項目: 額外顯示溫層、最新貨況；電話顯示 N/A
 */
function buildPopupHtml(item) {
  const { deliveredSet, escHtml } = window.App;
  const isDelivered = deliveredSet.has(item.detailNo);
  const phone = item.phone.replace(/\s+/g, '');
  const encodedAddr = encodeURIComponent(item.addressRaw);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddr}`;

  // Phone display: link if valid, plain text if N/A
  const phoneHtml = item.phone === 'N/A'
    ? `<span class="popup-value">N/A</span>`
    : `<span class="popup-value"><a href="tel:${phone}">${escHtml(item.phone)}</a></span>`;

  // Retention-specific rows
  let extraRows = '';
  if (item.type === 'retention') {
    extraRows = `
      <div class="popup-row"><span class="popup-label">溫層</span><span class="popup-value">${escHtml(item.tempZone)}</span></div>
      <div class="popup-row"><span class="popup-label">貨況</span><span class="popup-value">${escHtml(item.latestStatus)}</span></div>
    `;
  }

  return `
    <div class="popup-content">
      <h3>${escHtml(item.receiverName)}</h3>
      <div class="popup-row"><span class="popup-label">單號</span><span class="popup-value">${escHtml(item.detailNo)}</span></div>
      <div class="popup-row"><span class="popup-label">地址</span><span class="popup-value">${escHtml(item.addressRaw)}</span></div>
      <div class="popup-row"><span class="popup-label">電話</span>${phoneHtml}</div>
      ${item.remark ? `<div class="popup-row"><span class="popup-label">備註</span><span class="popup-value">${escHtml(item.remark)}</span></div>` : ''}
      <div class="popup-row"><span class="popup-label">托運</span><span class="popup-value">${escHtml(item.shipperName)}</span></div>
      ${extraRows}
      <label class="popup-delivered-check" onclick="event.stopPropagation()">
        <input type="checkbox" ${isDelivered ? 'checked' : ''}
               onchange="toggleDelivered('${escHtml(item.detailNo)}', this.checked)" />
        <span class="check-label">✅ 已送達</span>
      </label>
      <a class="navigate-btn" href="${navUrl}" target="_blank" rel="noopener">🧭 Google Maps 導航</a>
    </div>`;
}

/**
 * 在地圖上新增一個 marker (多來源版)
 * @param {Object} item - 標準 item 物件
 * @param {string} color - 來源顏色 (hex)
 */
function addMarker(item, color) {
  if (!item.lat || !item.lng) return;

  const { map, markers, deliveredSet, createMarkerIcon } = window.App;
  const isDelivered = deliveredSet.has(item.detailNo);
  const marker = L.marker([item.lat, item.lng], {
    icon: createMarkerIcon(color, isDelivered),
  }).addTo(map);

  // Store reference for later updates
  marker._itemDetailNo = item.detailNo;
  marker._itemData = item;
  marker._sourceColor = color;

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

/**
 * 移除符合條件的 markers (增量操作用)
 * @param {function} filterFn - 回傳 true 的 marker 會被移除
 */
function removeMarkersFor(filterFn) {
  const { map, markers } = window.App;
  const toRemove = markers.filter(filterFn);
  toRemove.forEach(m => map.removeLayer(m));
  window.App.markers = markers.filter(m => !toRemove.includes(m));
}

/**
 * 更新指定 source 的所有 marker 顏色 (不重建)
 * @param {string} sourceId - CSV 來源 ID
 * @param {string} newColor - 新顏色 hex
 */
function updateMarkersColor(sourceId, newColor) {
  const { markers, createMarkerIcon, deliveredSet } = window.App;
  markers.forEach(m => {
    if (m._itemData.sourceId === sourceId) {
      const isDelivered = deliveredSet.has(m._itemDetailNo);
      m.setIcon(createMarkerIcon(newColor, isDelivered));
      m._sourceColor = newColor;
    }
  });
}

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, {
  initMap, clearMarkers, buildPopupHtml, addMarker, fitMapToMarkers,
  removeMarkersFor, updateMarkersColor,
});
