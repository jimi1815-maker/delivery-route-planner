/* =====================================================
   ui.js — UI 渲染、Loading、Toast、Tab 切換、事件綁定
   支援多 CSV 來源管理、多選配區、顏色選擇
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

// ==================== CSV Source List (CSV 來源管理) ====================
/**
 * 渲染 CSV 來源管理列表
 * 每行: [檔名] [類型 badge] [顏色下拉] [配區多選下拉] [❌ 移除]
 * 末尾: [➕ 新增 CSV]
 */
function renderCsvSourceList() {
  const { csvSources, csvSourceList, COLOR_PALETTE } = window.App;
  csvSourceList.innerHTML = '';

  csvSources.forEach((source, idx) => {
    const row = document.createElement('div');
    row.className = 'csv-source-row';
    row.dataset.sourceId = source.id;

    // File name
    const nameEl = document.createElement('span');
    nameEl.className = `csv-source-name ${source.type === 'error' ? 'csv-error' : ''}`;
    nameEl.textContent = source.fileName;
    nameEl.title = source.type === 'error' ? (source.errorMsg || '格式錯誤') : source.fileName;

    // Type badge
    const typeBadge = document.createElement('span');
    typeBadge.className = `csv-type-badge csv-type-${source.type}`;
    typeBadge.textContent = source.type === 'general' ? '一般' :
                            source.type === 'retention' ? '留庫' : '錯誤';

    // Color dropdown
    const colorSelect = _createColorDropdown(source, COLOR_PALETTE);

    // District multi-select (only for valid sources)
    let districtWidget = null;
    if (source.type !== 'error' && source.allDistricts.length > 0) {
      districtWidget = _createDistrictMultiSelect(source);
    }

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'csv-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = '移除';
    removeBtn.addEventListener('click', () => {
      const sIdx = csvSources.findIndex(s => s.id === source.id);
      if (sIdx > -1) csvSources.splice(sIdx, 1);
      renderCsvSourceList();
      refreshMapAndList();
    });

    row.appendChild(nameEl);
    row.appendChild(typeBadge);
    if (source.type !== 'error') row.appendChild(colorSelect);
    if (districtWidget) row.appendChild(districtWidget);
    row.appendChild(removeBtn);
    csvSourceList.appendChild(row);
  });

  // ➕ Add CSV button
  const addBtn = document.createElement('button');
  addBtn.className = 'csv-add-btn';
  addBtn.innerHTML = '➕ 新增 CSV';
  addBtn.addEventListener('click', () => {
    window.App.csvAddInput.click();
  });
  csvSourceList.appendChild(addBtn);
}

/** 建立顏色選擇下拉元件 (Custom Dropdown) */
function _createColorDropdown(source, palette) {
  const wrapper = document.createElement('div');
  wrapper.className = 'color-select-wrapper';

  // Preview circle (shows current color)
  const preview = document.createElement('span');
  preview.className = 'color-preview';
  preview.style.backgroundColor = source.color;

  // Dropdown panel (hidden by default)
  const dropdown = document.createElement('div');
  dropdown.className = 'color-dropdown hidden';

  palette.forEach(color => {
    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    if (color === source.color) swatch.classList.add('selected');

    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      source.color = color;
      preview.style.backgroundColor = color;
      // Update selected state
      dropdown.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      dropdown.classList.add('hidden');
      // If districts are selected, refresh map immediately
      if (source.selectedDistricts.length > 0) {
        refreshMapAndList();
      }
    });

    dropdown.appendChild(swatch);
  });

  // Toggle dropdown on preview click
  preview.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close all district dropdowns
    document.querySelectorAll('.multi-select-dropdown').forEach(d => d.classList.add('hidden'));
    // Close other color dropdowns
    document.querySelectorAll('.color-dropdown').forEach(d => {
      if (d !== dropdown) d.classList.add('hidden');
    });
    dropdown.classList.toggle('hidden');
  });

  wrapper.appendChild(preview);
  wrapper.appendChild(dropdown);
  return wrapper;
}

/** 建立多選配區下拉元件 (Checkbox Dropdown) */
function _createDistrictMultiSelect(source) {
  const container = document.createElement('div');
  container.className = 'multi-select';

  // Trigger button
  const trigger = document.createElement('button');
  trigger.className = 'multi-select-trigger';
  _updateTriggerText(trigger, source);

  // Dropdown panel
  const dropdown = document.createElement('div');
  dropdown.className = 'multi-select-dropdown hidden';

  // Select All / Clear All
  const controls = document.createElement('div');
  controls.className = 'multi-select-controls';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.textContent = '全選';
  selectAllBtn.className = 'ms-ctrl-btn';
  selectAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    source.selectedDistricts = [...source.allDistricts];
    _syncCheckboxes(dropdown, source);
    _updateTriggerText(trigger, source);
    refreshMapAndList();
  });

  const clearAllBtn = document.createElement('button');
  clearAllBtn.textContent = '清除';
  clearAllBtn.className = 'ms-ctrl-btn';
  clearAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    source.selectedDistricts = [];
    _syncCheckboxes(dropdown, source);
    _updateTriggerText(trigger, source);
    refreshMapAndList();
  });

  controls.appendChild(selectAllBtn);
  controls.appendChild(clearAllBtn);
  dropdown.appendChild(controls);

  // Checkbox items
  source.allDistricts.forEach(district => {
    const label = document.createElement('label');
    label.className = 'ms-option';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = district;
    cb.checked = source.selectedDistricts.includes(district);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!source.selectedDistricts.includes(district)) {
          source.selectedDistricts.push(district);
        }
      } else {
        source.selectedDistricts = source.selectedDistricts.filter(d => d !== district);
      }
      _updateTriggerText(trigger, source);
      refreshMapAndList();
    });

    const text = document.createElement('span');
    text.textContent = district;

    label.appendChild(cb);
    label.appendChild(text);
    dropdown.appendChild(label);
  });

  // Toggle dropdown
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    // Close all color dropdowns
    document.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
    // Close all other district dropdowns
    document.querySelectorAll('.multi-select-dropdown').forEach(d => {
      if (d !== dropdown) d.classList.add('hidden');
    });
    dropdown.classList.toggle('hidden');
  });

  container.appendChild(trigger);
  container.appendChild(dropdown);
  return container;
}

/** 更新多選按鈕的顯示文字 */
function _updateTriggerText(trigger, source) {
  const count = source.selectedDistricts.length;
  if (count === 0) {
    trigger.textContent = '選擇配區 ▾';
  } else if (count <= 3) {
    trigger.textContent = source.selectedDistricts.join(', ') + ' ▾';
  } else {
    trigger.textContent = `${count} 個配區 ▾`;
  }
}

/** 同步 dropdown 中的 checkbox 狀態 */
function _syncCheckboxes(dropdown, source) {
  dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = source.selectedDistricts.includes(cb.value);
  });
}

// ==================== Map & List Refresh (地圖與清單刷新) ====================
/**
 * 根據所有 csvSources 當前的 selectedDistricts 重新渲染地圖與清單
 * 1. 清除所有 markers
 * 2. 收集每個 source 的已選配區 items
 * 3. 批次 Geocode
 * 4. addMarker 帶上 source 的 color
 * 5. renderList
 * 6. fitMapToMarkers
 */
async function refreshMapAndList() {
  const {
    csvSources, cleanVal, cleanAddress, cleanAddressForGeo,
    clearMarkers, addMarker, fitMapToMarkers,
    getApiKey, openSettings, geocodeAddress,
    parseGeneralRow, parseRetentionRow,
    itemList, itemCount, COL, COL_PREV,
  } = window.App;

  clearMarkers();
  itemList.innerHTML = '';

  // Collect all items from all sources with selected districts
  const allItems = [];
  csvSources.forEach(source => {
    if (source.type === 'error' || source.selectedDistricts.length === 0) return;

    const districtCol = source.type === 'general' ? COL.SYS_DISTRICT : COL_PREV.DISTRICT;
    const parser = source.type === 'general' ? parseGeneralRow : parseRetentionRow;

    source.rawRows.forEach((row, idx) => {
      const district = cleanVal(row[districtCol]);
      if (source.selectedDistricts.includes(district)) {
        const item = parser(row, idx, source.id);
        item._sourceColor = source.color;
        allItems.push(item);
      }
    });
  });

  window.App.filteredItems = allItems;
  itemCount.textContent = allItems.length > 0 ? `${allItems.length} 筆` : '';

  if (allItems.length === 0) {
    renderList();
    return;
  }

  // Check API key before geocoding
  if (!getApiKey()) {
    renderList();
    openSettings();
    showToast('⚠️ 請先設定 Google Maps API Key');
    return;
  }

  // Render list first (with pending status)
  renderList();

  // Filter out "站止" addresses
  const geocodeItems = allItems.filter(item =>
    item.addressRaw && !item.addressRaw.includes('站止') && !item.addressRaw.includes('止')
  );

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
          addMarker(item, item._sourceColor);
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

  const located = allItems.filter(i => i.geocodeStatus === 'located').length;
  showToast(`✅ 定位完成: ${located}/${geocodeItems.length} 個地址`);
}

// ==================== UI Rendering (介面渲染) ====================
/**
 * 渲染送貨清單卡片
 * - 每張卡片顯示: 來源色塊、收貨人、地址、電話、托運人、Geocode 狀態燈
 * - 留庫卡片額外顯示溫層與貨況
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

    // Phone display
    const phoneHtml = item.phone === 'N/A'
      ? `<span>📞 N/A</span>`
      : `<a href="tel:${phone}" onclick="event.stopPropagation()">📞 ${escHtml(item.phone)}</a>`;

    // Retention extra info
    let extraInfo = '';
    if (item.type === 'retention') {
      extraInfo = `<div class="card-extra">${escHtml(item.tempZone)} · ${escHtml(item.latestStatus)}</div>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <label class="card-check" onclick="event.stopPropagation()">
          <span class="source-color-dot" style="background-color: ${item._sourceColor}"></span>
          <input type="checkbox" ${isDelivered ? 'checked' : ''}
                 onchange="toggleDelivered('${escHtml(item.detailNo)}', this.checked)" />
          <span class="receiver-name">${escHtml(item.receiverName)}</span>
        </label>
        <span class="geocode-dot ${item.geocodeStatus}" id="dot-${item.id}"></span>
      </div>
      <div class="card-address">${escHtml(item.addressRaw)}</div>
      ${extraInfo}
      <div class="card-footer">
        ${phoneHtml}
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

// ==================== Event Listeners (事件綁定) ====================
/** 綁定所有 UI 互動事件: CSV 新增、Tab 切換、設定彈窗 */
function initEventListeners() {
  const {
    csvAddInput,
    settingsBtn, closeModalBtn,
    settingsModal, saveKeyBtn, $,
  } = window.App;

  // CSV file upload (hidden input)
  csvAddInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      window.App.handleFileUpload(e.target.files[0]);
      csvAddInput.value = ''; // Reset so same file can be re-uploaded
    }
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

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.multi-select')) {
      document.querySelectorAll('.multi-select-dropdown').forEach(d => {
        d.classList.add('hidden');
      });
    }
    if (!e.target.closest('.color-select-wrapper')) {
      document.querySelectorAll('.color-dropdown').forEach(d => {
        d.classList.add('hidden');
      });
    }
  });
}

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, {
  escHtml, showLoading, hideLoading, updateProgress, showToast,
  switchTab, renderCsvSourceList, refreshMapAndList,
  renderList, updateCardStatus, initEventListeners,
});
