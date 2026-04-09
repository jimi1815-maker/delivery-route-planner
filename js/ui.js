/* =====================================================
   ui.js — UI 渲染、Loading、Toast、Tab 切換、事件綁定
   ===================================================== */

// ==================== UI Helpers (介面工具) ====================
/** HTML 跳脫: 防止 XSS，將特殊字元轉為 HTML entities */
function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** 顯示全螢幕 Loading 遮罩 */
function showLoading(text) {
  const { loadingText, progressFill, loadingOverlay } = window.App;
  loadingText.textContent = text;
  progressFill.style.width = '0%';
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  window.App.loadingOverlay.classList.add('hidden');
}

/** 更新 Loading 進度條和文字 */
function updateProgress(completed, total) {
  const { progressFill, loadingText } = window.App;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  loadingText.textContent = `正在定位地址 ${completed}/${total}...`;
}

/** 顯示底部浮動通知 (自動 4 秒後消失) */
function showToast(msg) {
  const { geocodeToast } = window.App;
  geocodeToast.textContent = msg;
  geocodeToast.classList.remove('hidden');
  setTimeout(() => geocodeToast.classList.add('hidden'), 4000);
}

/** 切換地圖/清單 Tab，切到地圖時要 invalidateSize 確保圖磚正確載入 */
function switchTab(tab) {
  const $ = window.App.$;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');

  const mapView = $('#map-view');
  const listView = $('#list-view');

  if (tab === 'map') {
    mapView.classList.remove('hidden');
    listView.classList.add('hidden');
    if (window.App.map) window.App.map.invalidateSize();
  } else {
    mapView.classList.add('hidden');
    listView.classList.remove('hidden');
  }
}

// ==================== UI Rendering (介面渲染) ====================
/**
 * 渲染送貨清單卡片
 * - 每張卡片顯示: 收貨人、地址、電話、托運人、Geocode 狀態燈
 * - 點擊卡片: 切換到地圖並開啟對應的 marker popup
 * - 若地址未定位成功: 直接開啟 Google Maps
 */
function renderList() {
  const { filteredItems, deliveredSet, markers, map, itemList } = window.App;
  itemList.innerHTML = '';

  filteredItems.forEach((item, index) => {
    const card = document.createElement('div');
    const isDelivered = deliveredSet.has(item.detailNo);
    card.className = `item-card${isDelivered ? ' delivered' : ''}`;
    card.id = `card-${item.id}`;
    card.dataset.detailNo = item.detailNo;
    card.style.animationDelay = `${index * 0.03}s`;

    const phone = item.phone.replace(/\s+/g, '');
    const encodedAddr = encodeURIComponent(item.addressRaw);

    card.innerHTML = `
      <div class="card-header">
        <label class="card-check" onclick="event.stopPropagation()">
          <input type="checkbox" ${isDelivered ? 'checked' : ''}
                 onchange="toggleDelivered('${escHtml(item.detailNo)}', this.checked)" />
          <span class="receiver-name">${escHtml(item.receiverName)}</span>
        </label>
        <span class="geocode-dot ${item.geocodeStatus}" id="dot-${item.id}"></span>
      </div>
      <div class="card-address">${escHtml(item.addressRaw)}</div>
      <div class="card-footer">
        <a href="tel:${phone}" onclick="event.stopPropagation()">📞 ${escHtml(item.phone)}</a>
        <span>${escHtml(item.shipperName)}</span>
      </div>
    `;

    // Click card → switch to map and open popup
    card.addEventListener('click', () => {
      if (item.lat && item.lng) {
        switchTab('map');
        map.setView([item.lat, item.lng], 17);
        const marker = markers.find(m => {
          const pos = m.getLatLng();
          return Math.abs(pos.lat - item.lat) < 0.0001 && Math.abs(pos.lng - item.lng) < 0.0001;
        });
        if (marker) marker.openPopup();
      } else {
        // No geocode, open Google Maps directly
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddr}`, '_blank');
      }
    });

    itemList.appendChild(card);
  });
}

/** 更新單張卡片的 Geocode 狀態指示燈 (pending/located/failed) */
function updateCardStatus(item) {
  const dot = document.getElementById(`dot-${item.id}`);
  if (dot) {
    dot.className = `geocode-dot ${item.geocodeStatus}`;
  }
}

// ==================== District Filter (配區篩選) ====================
/**
 * 依選擇的配區過濾送貨資料，並執行地址 Geocoding
 * 流程:
 * 1. 清除舊 marker
 * 2. 過濾該配區的行資料
 * 3. 排除「站止」地址 (不需要送貨的訂單)
 * 4. 檢查 API Key
 * 5. 批次 Geocode (5 個一批，避免 rate limit)
 * 6. 完成後自動縮放地圖到所有標記範圍
 */
async function filterByDistrict(district) {
  const {
    csvData, COL, cleanVal, cleanAddress, cleanAddressForGeo,
    clearMarkers, addMarker, fitMapToMarkers,
    getApiKey, openSettings, geocodeAddress,
    itemList, itemCount,
  } = window.App;

  clearMarkers();
  itemList.innerHTML = '';

  // Filter rows
  const rows = csvData.filter(row => cleanVal(row[COL.SYS_DISTRICT]) === district);

  // Parse items
  const items = rows.map((row, idx) => ({
    id: idx,
    detailNo: cleanVal(row[COL.DETAIL_NO]),
    receiverName: cleanVal(row[COL.RECEIVER_NAME]),
    phone: cleanVal(row[COL.RECEIVER_PHONE]),
    addressRaw: cleanAddress(cleanVal(row[COL.RECEIVER_ADDR])),
    remark: cleanVal(row[COL.REMARK]),
    shipperName: cleanVal(row[COL.SHIPPER_NAME]),
    lat: null,
    lng: null,
    geocodeStatus: 'pending', // pending | located | failed
  }));
  window.App.filteredItems = items;

  // Filter out "站止" addresses
  const geocodeItems = items.filter(item =>
    item.addressRaw && !item.addressRaw.includes('站止')
  );

  itemCount.textContent = `${items.length} 筆`;

  // Check API key before geocoding
  if (!getApiKey()) {
    renderList();
    openSettings();
    showToast('⚠️ 請先設定 Google Maps API Key');
    return;
  }

  // Render list first (with pending status)
  renderList();

  // Show loading
  showLoading(`正在定位 ${geocodeItems.length} 個地址...`);

  // Geocode in batches of 5 to avoid rate limiting
  let completed = 0;
  const total = geocodeItems.length;
  const BATCH_SIZE = 5;

  for (let i = 0; i < geocodeItems.length; i += BATCH_SIZE) {
    const batch = geocodeItems.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (item) => {
      try {
        const addrForSearch = cleanAddressForGeo(item.addressRaw);
        console.log(`[Geocode] 搜尋: "${addrForSearch}"`);
        const result = await geocodeAddress(item.addressRaw, addrForSearch);
        if (result) {
          item.lat = result.lat;
          item.lng = result.lng;
          item.geocodeStatus = 'located';
          addMarker(item);
          console.log(`[Geocode] ✅ ${item.receiverName}: ${result.lat}, ${result.lng}`);
        } else {
          item.geocodeStatus = 'failed';
          console.warn(`[Geocode] ❌ 找不到: "${addrForSearch}"`);
        }
      } catch (e) {
        item.geocodeStatus = 'failed';
        console.error(`[Geocode] 錯誤: "${item.addressRaw}"`, e);
      }
      completed++;
      updateProgress(completed, total);
      updateCardStatus(item);
    });

    await Promise.allSettled(promises);

    // Wait between batches to respect rate limits
    if (i + BATCH_SIZE < geocodeItems.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  hideLoading();
  fitMapToMarkers();
  switchTab('map');

  const located = items.filter(i => i.geocodeStatus === 'located').length;
  showToast(`✅ 定位完成: ${located}/${geocodeItems.length} 個地址`);
}

// ==================== Event Listeners (事件綁定) ====================
/** 綁定所有 UI 互動事件: 檔案上傳、拖曳、配區篩選、Tab 切換、設定彈窗 */
function initEventListeners() {
  const {
    csvInput, dropZone, districtSelect, reUploadBtn,
    mainScreen, uploadScreen, settingsBtn, closeModalBtn,
    settingsModal, saveKeyBtn, itemList, $,
  } = window.App;

  // File upload
  csvInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) window.App.handleFile(e.target.files[0]);
  });

  // Drag & drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) window.App.handleFile(e.dataTransfer.files[0]);
  });

  // District filter
  districtSelect.addEventListener('change', () => {
    const district = districtSelect.value;
    if (district) {
      filterByDistrict(district);
    }
  });

  // Re-upload
  reUploadBtn.addEventListener('click', () => {
    mainScreen.classList.add('hidden');
    uploadScreen.classList.remove('hidden');
    csvInput.value = '';
    window.App.csvData = [];
    window.App.filteredItems = [];
    window.App.clearMarkers();
    itemList.innerHTML = '';
    districtSelect.innerHTML = '<option value="">選擇配區</option>';
    window.App.itemCount.textContent = '';
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings modal
  settingsBtn.addEventListener('click', () => window.App.openSettings());
  closeModalBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  $('.modal-backdrop').addEventListener('click', () => settingsModal.classList.add('hidden'));
  saveKeyBtn.addEventListener('click', () => window.App.saveApiKey());
  $('#upload-settings-btn').addEventListener('click', () => window.App.openSettings());
}

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, {
  escHtml, showLoading, hideLoading, updateProgress, showToast,
  switchTab, renderList, updateCardStatus,
  filterByDistrict, initEventListeners,
});
