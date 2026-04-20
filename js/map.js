/* =====================================================
   map.js — Leaflet 地圖初始化 + Marker 群組管理
   =====================================================
   核心概念: markerGroups (Map<coordKey, GroupObj>)
   同座標的 items 合併為一個 marker，留庫優先顯示
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

// ==================== Coordinate Key (座標鍵值) ====================
/**
 * 產生座標鍵值 (6 位小數，約 0.1 公尺精度)
 * 用於判定「同一個點」的 items 並合併 marker
 */
function coordKey(lat, lng) {
  return `${lat.toFixed(6)}_${lng.toFixed(6)}`;
}

// ==================== Marker Group Management ====================

/**
 * 從 group 的 items 中決定 primary item (marker 外觀依據)
 * 優先順序: 留庫 (retention) > 一般 (general)
 */
function _getPrimaryItem(items) {
  // 找第一個留庫 item，沒有的話用第一個
  return items.find(i => i.type === 'retention') || items[0];
}

/**
 * 從 group 的 items 中決定 marker 顏色
 * 使用 primary item 的 source color
 */
function _getGroupColor(items) {
  const primary = _getPrimaryItem(items);
  return primary._sourceColor || '#3b82f6';
}

/**
 * 產生 group (多筆 items) 的 Popup HTML
 * 留庫排前面，每筆 item 獨立的送達 checkbox，共用導航按鈕
 */
function buildGroupPopupHtml(items) {
  const { deliveredSet, escHtml } = window.App;

  // 依 detailNo 分組 → 同單號合併成一筆
  const byDetailNo = new Map();
  items.forEach(item => {
    if (!byDetailNo.has(item.detailNo)) {
      byDetailNo.set(item.detailNo, []);
    }
    byDetailNo.get(item.detailNo).push(item);
  });

  // 合併同 detailNo 的 items 為單一顯示物件
  const mergedEntries = [];
  byDetailNo.forEach((group, detailNo) => {
    const retention = group.find(i => i.type === 'retention');
    const general = group.find(i => i.type === 'general');
    const types = [];
    if (retention) types.push('retention');
    if (general) types.push('general');

    // 智能合併: 取各自最佳欄位
    mergedEntries.push({
      detailNo,
      types,
      receiverName: (retention || general).receiverName,
      addressRaw: (retention || general).addressRaw,
      phone: (general && general.phone !== 'N/A') ? general.phone : (retention ? retention.phone : 'N/A'),
      remark: (general && general.remark) ? general.remark : (retention ? retention.remark : ''),
      shipperName: (retention || general).shipperName,
      tempZone: retention ? retention.tempZone : '',
      latestStatus: retention ? retention.latestStatus : '',
    });
  });

  // 留庫優先排序
  mergedEntries.sort((a, b) => {
    const aHasRetention = a.types.includes('retention');
    const bHasRetention = b.types.includes('retention');
    if (aHasRetention && !bHasRetention) return -1;
    if (!aHasRetention && bHasRetention) return 1;
    return 0;
  });

  // 共用導航 (地址相同)
  const firstEntry = mergedEntries[0];
  const { lat, lng } = items[0];
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  let html = '<div class="popup-content">';

  mergedEntries.forEach((entry, idx) => {
    const isDelivered = deliveredSet.has(entry.detailNo);
    const phone = entry.phone.replace(/\s+/g, '');

    // Type badges — 同時存在就都顯示
    let badges = '';
    if (entry.types.includes('retention')) {
      badges += '<span class="popup-type-badge popup-type-retention">留庫</span>';
    }
    if (entry.types.includes('general')) {
      badges += '<span class="popup-type-badge popup-type-general">一般</span>';
    }

    // Separator between entries
    if (idx > 0) html += '<hr class="popup-divider">';

    html += `
      <div class="popup-item">
        <div class="popup-item-header">
          <h3>${escHtml(entry.receiverName)}</h3>
          ${badges}
        </div>
        <div class="popup-row"><span class="popup-label">單號</span><span class="popup-value">${escHtml(entry.detailNo)}</span></div>
        <div class="popup-row"><span class="popup-label">地址</span><span class="popup-value">${escHtml(entry.addressRaw)}</span></div>
        <div class="popup-row"><span class="popup-label">電話</span>${
          entry.phone === 'N/A'
            ? '<span class="popup-value">N/A</span>'
            : `<span class="popup-value"><a href="tel:${phone}">${escHtml(entry.phone)}</a></span>`
        }</div>
        ${entry.remark ? `<div class="popup-row"><span class="popup-label">備註</span><span class="popup-value">${escHtml(entry.remark)}</span></div>` : ''}
        <div class="popup-row"><span class="popup-label">托運</span><span class="popup-value">${escHtml(entry.shipperName)}</span></div>
        ${entry.tempZone ? `<div class="popup-row"><span class="popup-label">溫層</span><span class="popup-value">${escHtml(entry.tempZone)}</span></div>` : ''}
        ${entry.latestStatus ? `<div class="popup-row"><span class="popup-label">貨況</span><span class="popup-value">${escHtml(entry.latestStatus)}</span></div>` : ''}
        <label class="popup-delivered-check" onclick="event.stopPropagation()">
          <input type="checkbox" ${isDelivered ? 'checked' : ''}
                 onchange="toggleDelivered('${escHtml(entry.detailNo)}', this.checked)" />
          <span class="check-label">✅ 已送達</span>
        </label>
      </div>`;
  });

  html += `<a class="navigate-btn" href="${navUrl}" target="_blank" rel="noopener">🧭 Google Maps 導航</a>`;
  html += '</div>';

  return html;
}

/**
 * 在地圖上新增一個 item 的 marker (群組版)
 * - 計算 coordKey，若已存在 group 則 merge
 * - marker 外觀由 primary item 決定 (留庫 > 一般)
 */
function addMarker(item, color) {
  if (!item.lat || !item.lng) return;

  const { map, markerGroups, deliveredSet, createMarkerIcon } = window.App;
  const key = coordKey(item.lat, item.lng);

  // 確保 item 帶有 source color
  item._sourceColor = color;

  if (markerGroups.has(key)) {
    // 合併到現有 group
    const group = markerGroups.get(key);

    // 避免重複加入相同 item
    if (group.items.some(i => i.id === item.id)) return;

    group.items.push(item);

    // 重算 marker 外觀
    const primary = _getPrimaryItem(group.items);
    const groupColor = _getGroupColor(group.items);
    const isDelivered = group.items.every(i => deliveredSet.has(i.detailNo));
    group.marker.setIcon(createMarkerIcon(groupColor, isDelivered, primary.tempZone));

    // 重建 popup
    group.marker.setPopupContent(buildGroupPopupHtml(group.items));
  } else {
    // 新建 group
    const isDelivered = deliveredSet.has(item.detailNo);
    const marker = L.marker([item.lat, item.lng], {
      icon: createMarkerIcon(color, isDelivered, item.tempZone),
    }).addTo(map);

    marker.bindPopup(buildGroupPopupHtml([item]), { maxWidth: 320, className: '' });
    marker.on('popupopen', () => {
      const group = markerGroups.get(key);
      if (group) marker.setPopupContent(buildGroupPopupHtml(group.items));
    });

    markerGroups.set(key, { marker, items: [item] });
  }
}

/** 清除地圖上的所有標記 (切換配區時呼叫) */
function clearMarkers() {
  const { map, markerGroups } = window.App;
  markerGroups.forEach(group => map.removeLayer(group.marker));
  markerGroups.clear();
  // 保持向後相容
  window.App.markers = [];
}

/** 自動調整地圖縮放範圍，讓所有 marker 都在可見區域內 */
function fitMapToMarkers() {
  const { markerGroups, map } = window.App;
  if (markerGroups.size === 0) return;
  const allMarkers = [...markerGroups.values()].map(g => g.marker);
  const group = L.featureGroup(allMarkers);
  map.fitBounds(group.getBounds().pad(0.1));
}

/**
 * 移除符合條件的 items (增量操作用)
 * @param {function} filterFn - item 匹配此函數回傳 true 會被移除
 */
function removeMarkersFor(filterFn) {
  const { map, markerGroups, deliveredSet, createMarkerIcon } = window.App;

  markerGroups.forEach((group, key) => {
    const before = group.items.length;
    group.items = group.items.filter(item => !filterFn({ _itemData: item }));

    if (group.items.length === 0) {
      // Group 清空 → 移除 marker
      map.removeLayer(group.marker);
      markerGroups.delete(key);
    } else if (group.items.length !== before) {
      // Group 有變動 → 更新外觀
      const primary = _getPrimaryItem(group.items);
      const groupColor = _getGroupColor(group.items);
      const isDelivered = group.items.every(i => deliveredSet.has(i.detailNo));
      group.marker.setIcon(createMarkerIcon(groupColor, isDelivered, primary.tempZone));
      group.marker.setPopupContent(buildGroupPopupHtml(group.items));
    }
  });
}

/**
 * 更新指定 source 的所有 marker 顏色 (不重建)
 * @param {string} sourceId - CSV 來源 ID
 * @param {string} newColor - 新顏色 hex
 */
function updateMarkersColor(sourceId, newColor) {
  const { markerGroups, createMarkerIcon, deliveredSet } = window.App;
  markerGroups.forEach(group => {
    let changed = false;
    group.items.forEach(item => {
      if (item.sourceId === sourceId) {
        item._sourceColor = newColor;
        changed = true;
      }
    });
    if (changed) {
      const primary = _getPrimaryItem(group.items);
      const groupColor = _getGroupColor(group.items);
      const isDelivered = group.items.every(i => deliveredSet.has(i.detailNo));
      group.marker.setIcon(createMarkerIcon(groupColor, isDelivered, primary.tempZone));
    }
  });
}

/**
 * 依溫層篩選高亮: 放大/縮回 markers
 * @param {Set<string>} highlightedZones - 要高亮的溫層 Set (如 Set(['凍', '藏']))
 */
function highlightTempZones(highlightedZones) {
  const { markerGroups, createMarkerIcon, deliveredSet } = window.App;
  markerGroups.forEach(group => {
    const primary = _getPrimaryItem(group.items);
    const groupColor = _getGroupColor(group.items);
    const isDelivered = group.items.every(i => deliveredSet.has(i.detailNo));

    // 判斷此 group 是否應被高亮
    const shouldEnlarge = highlightedZones.size > 0 && group.items.some(item => {
      if (!item.tempZone) return false;
      return [...highlightedZones].some(zone => item.tempZone.includes(zone));
    });

    group.marker.setIcon(createMarkerIcon(groupColor, isDelivered, primary.tempZone, shouldEnlarge));
  });
}

/**
 * 從 markerGroups 中找到包含指定 item 的 marker
 * @param {Object} item - 要搜尋的 item
 * @returns {L.Marker|null}
 */
function findMarkerForItem(item) {
  if (!item.lat || !item.lng) return null;
  const key = coordKey(item.lat, item.lng);
  const group = window.App.markerGroups.get(key);
  return group ? group.marker : null;
}

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, {
  initMap, clearMarkers, addMarker, fitMapToMarkers,
  removeMarkersFor, updateMarkersColor, highlightTempZones,
  findMarkerForItem, buildGroupPopupHtml,
});
