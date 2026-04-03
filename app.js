/* =====================================================
   路線規劃 APP - Main Application Logic
   ===================================================== */

// ==================== State ====================
let csvData = [];       // All parsed rows
let filteredItems = []; // Items filtered by district
let map = null;         // Leaflet map instance
let markers = [];       // Leaflet markers

// Column indices (0-based)
const COL = {
  DETAIL_NO: 6,      // 明細單號
  SYS_DISTRICT: 9,   // 系統配區
  RECEIVER_NAME: 13,  // 收貨人名稱
  RECEIVER_PHONE: 14, // 收貨人電話
  RECEIVER_ADDR: 16,  // 收貨人地址
  REMARK: 20,         // 備註
  SHIPPER_NAME: 26,   // 托運人名稱
};

// ==================== DOM References ====================
const $ = (sel) => document.querySelector(sel);
const uploadScreen = $('#upload-screen');
const mainScreen = $('#main-screen');
const csvInput = $('#csv-input');
const dropZone = $('#drop-zone');
const districtSelect = $('#district-select');
const itemCount = $('#item-count');
const itemList = $('#item-list');
const loadingOverlay = $('#loading-overlay');
const loadingText = $('#loading-text');
const progressFill = $('#progress-fill');
const reUploadBtn = $('#re-upload-btn');
const geocodeToast = $('#geocode-toast');
const settingsBtn = $('#settings-btn');
const settingsModal = $('#settings-modal');
const apiKeyInput = $('#api-key-input');
const saveKeyBtn = $('#save-key-btn');
const closeModalBtn = $('#close-modal-btn');
const apiKeyStatus = $('#api-key-status');

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initMap();
  checkApiKey();
});

function initEventListeners() {
  // File upload
  csvInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
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
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
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
    csvData = [];
    filteredItems = [];
    clearMarkers();
    itemList.innerHTML = '';
    districtSelect.innerHTML = '<option value="">選擇配區</option>';
    itemCount.textContent = '';
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings modal
  settingsBtn.addEventListener('click', openSettings);
  closeModalBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  $('.modal-backdrop').addEventListener('click', () => settingsModal.classList.add('hidden'));
  saveKeyBtn.addEventListener('click', saveApiKey);
  $('#upload-settings-btn').addEventListener('click', openSettings);
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');

  const mapView = $('#map-view');
  const listView = $('#list-view');

  if (tab === 'map') {
    mapView.classList.remove('hidden');
    listView.classList.add('hidden');
    if (map) map.invalidateSize();
  } else {
    mapView.classList.add('hidden');
    listView.classList.remove('hidden');
  }
}

// ==================== Map ====================
function initMap() {
  map = L.map('map', {
    center: [24.8, 120.97], // Hsinchu area
    zoom: 13,
    zoomControl: false,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);
}

function clearMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
}

function addMarker(item) {
  if (!item.lat || !item.lng) return;

  const marker = L.marker([item.lat, item.lng]).addTo(map);

  const phone = item.phone.replace(/\s+/g, '');
  const encodedAddr = encodeURIComponent(item.addressRaw);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddr}`;

  const popupHtml = `
    <div class="popup-content">
      <h3>${escHtml(item.receiverName)}</h3>
      <div class="popup-row"><span class="popup-label">單號</span><span class="popup-value">${escHtml(item.detailNo)}</span></div>
      <div class="popup-row"><span class="popup-label">地址</span><span class="popup-value">${escHtml(item.addressRaw)}</span></div>
      <div class="popup-row"><span class="popup-label">電話</span><span class="popup-value"><a href="tel:${phone}">${escHtml(item.phone)}</a></span></div>
      <div class="popup-row"><span class="popup-label">備註</span><span class="popup-value">${escHtml(item.remark || '無')}</span></div>
      <div class="popup-row"><span class="popup-label">托運</span><span class="popup-value">${escHtml(item.shipperName)}</span></div>
      <a class="navigate-btn" href="${navUrl}" target="_blank" rel="noopener">🧭 Google Maps 導航</a>
    </div>`;

  marker.bindPopup(popupHtml, { maxWidth: 300, className: '' });
  markers.push(marker);
  return marker;
}

function fitMapToMarkers() {
  if (markers.length === 0) return;
  const group = L.featureGroup(markers);
  map.fitBounds(group.getBounds().pad(0.1));
}

// ==================== File Handling ====================
async function handleFile(file) {
  try {
    const text = await readFileWithEncoding(file);
    csvData = parseCSV(text);

    if (csvData.length === 0) {
      alert('CSV 檔案沒有有效資料');
      return;
    }

    // Extract unique districts
    const districts = [...new Set(
      csvData.map(row => cleanVal(row[COL.SYS_DISTRICT])).filter(d => d.trim().length > 0)
    )].sort();

    districtSelect.innerHTML = '<option value="">選擇配區</option>';
    districts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      districtSelect.appendChild(opt);
    });

    // Switch to main screen
    uploadScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
    if (map) setTimeout(() => map.invalidateSize(), 100);

  } catch (err) {
    console.error(err);
    alert('讀取 CSV 檔案失敗: ' + err.message);
  }
}

async function readFileWithEncoding(file) {
  const buffer = await file.arrayBuffer();

  // Try UTF-8 first
  let text = new TextDecoder('utf-8').decode(buffer);

  // If it has replacement characters or missing key headers, try Big5
  if (text.includes('\uFFFD') || (!text.includes('日期') && !text.includes('地址') && !text.includes('配區'))) {
    try {
      text = new TextDecoder('big5').decode(buffer);
    } catch (e) {
      // big5 decoder not available, stick with utf-8
    }
  }

  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);

  return text;
}

// ==================== CSV Parsing ====================
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];

  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 20) continue; // Skip invalid rows
    rows.push(cols);
  }

  return rows;
}

function cleanVal(val) {
  if (!val) return '';
  val = val.trim();
  // Remove ="..." wrapper
  if (val.startsWith('="') && val.endsWith('"')) {
    val = val.substring(2, val.length - 1);
  }
  return val.trim();
}

// ==================== District Filter ====================
async function filterByDistrict(district) {
  clearMarkers();
  itemList.innerHTML = '';

  // Filter rows
  const rows = csvData.filter(row => cleanVal(row[COL.SYS_DISTRICT]) === district);

  // Parse items
  filteredItems = rows.map((row, idx) => ({
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

  // Filter out "站止" addresses
  const geocodeItems = filteredItems.filter(item =>
    item.addressRaw && !item.addressRaw.includes('站止')
  );

  itemCount.textContent = `${filteredItems.length} 筆`;

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

  // Geocode in batches of 5 to avoid Nominatim rate limiting
  let completed = 0;
  const total = geocodeItems.length;
  const BATCH_SIZE = 5;

  for (let i = 0; i < geocodeItems.length; i += BATCH_SIZE) {
    const batch = geocodeItems.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (item) => {
      try {
        const addrForSearch = cleanAddressForGeo(item.addressRaw);
        console.log(`[Geocode] 搜尋: "${addrForSearch}"`);
        const result = await geocodeAddress(addrForSearch);
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

  const located = filteredItems.filter(i => i.geocodeStatus === 'located').length;
  showToast(`✅ 定位完成: ${located}/${geocodeItems.length} 個地址`);
}

// ==================== API Key Management ====================
function getApiKey() {
  return localStorage.getItem('gmaps_api_key') || '';
}

function checkApiKey() {
  if (!getApiKey()) {
    // Show hint on upload screen
    const hint = document.createElement('p');
    hint.className = 'subtitle';
    hint.style.color = 'var(--warning)';
    hint.style.fontSize = '0.8rem';
    hint.style.marginTop = '1rem';
    hint.id = 'api-hint';
    hint.textContent = '⚠️ 請先在設定中輸入 Google Maps API Key';
    if (!$('#api-hint')) {
      $('.upload-container').appendChild(hint);
    }
  }
}

function openSettings() {
  apiKeyInput.value = getApiKey();
  settingsModal.classList.remove('hidden');
  updateKeyStatus();
}

function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem('gmaps_api_key', key);
    apiKeyStatus.innerHTML = '<span style="color:var(--success)">✅ API Key 已儲存</span>';
    const hint = $('#api-hint');
    if (hint) hint.remove();
    setTimeout(() => settingsModal.classList.add('hidden'), 800);
  } else {
    apiKeyStatus.innerHTML = '<span style="color:var(--warning)">請輸入 API Key</span>';
  }
}

function updateKeyStatus() {
  const key = getApiKey();
  if (key) {
    apiKeyStatus.innerHTML = `<span style="color:var(--success)">✅ 已設定 (${key.substring(0, 8)}...)</span>`;
  } else {
    apiKeyStatus.innerHTML = '<span style="color:var(--warning)">⚠️ 尚未設定</span>';
  }
}

// ==================== Geocoding (Google Maps) ====================
async function geocodeAddress(address) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('[Geocode] 沒有 API Key');
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}&language=zh-TW&region=tw`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status === 'OK' && data.results.length > 0) {
      const loc = data.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }

    if (data.status === 'REQUEST_DENIED') {
      console.error('[Geocode] API Key 無效或未啟用 Geocoding API:', data.error_message);
    }
    return null;
  } catch (e) {
    console.error(`[Geocode] 錯誤: ${address}`, e);
    return null;
  }
}

function cleanAddress(raw) {
  if (!raw) return '';
  // Trim trailing full-width and half-width spaces
  return raw.replace(/[\s　]+$/g, '').trim();
}

function cleanAddressForGeo(address) {
  let addr = address;

  // Full-width ASCII → half-width
  addr = addr.replace(/[！-～]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
  );
  // Full-width space → half-width
  addr = addr.replace(/　/g, ' ');

  // Remove leading postal code (3-5 digits)
  addr = addr.replace(/^\d{3,5}\s*/, '');

  // Take part before double+ spaces (remove trailing notes)
  addr = addr.split(/\s{2,}/)[0].trim();

  // Try to cut after 號 or 樓 (keep floor info)
  const haoIdx = addr.lastIndexOf('號');
  const louIdx = addr.lastIndexOf('樓');
  let cutIdx = Math.max(haoIdx, louIdx);
  if (cutIdx > 0) {
    // Keep a few chars after for floor number like "號4樓"
    let after = addr.substring(cutIdx + 1, cutIdx + 4);
    const floorMatch = after.match(/^(\d+[樓F])/i);
    const extra = floorMatch ? floorMatch[1].length : 0;
    addr = addr.substring(0, cutIdx + 1 + extra);
  }

  // Remove trailing special chars
  addr = addr.replace(/[.．、。/\s]+$/, '');

  return addr.trim();
}

// ==================== UI Rendering ====================
function renderList() {
  itemList.innerHTML = '';

  filteredItems.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.id = `card-${item.id}`;
    card.style.animationDelay = `${index * 0.03}s`;

    const phone = item.phone.replace(/\s+/g, '');
    const encodedAddr = encodeURIComponent(item.addressRaw);
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedAddr}`;

    card.innerHTML = `
      <div class="card-header">
        <span class="receiver-name">${escHtml(item.receiverName)}</span>
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

function updateCardStatus(item) {
  const dot = document.getElementById(`dot-${item.id}`);
  if (dot) {
    dot.className = `geocode-dot ${item.geocodeStatus}`;
  }
}

// ==================== UI Helpers ====================
function showLoading(text) {
  loadingText.textContent = text;
  progressFill.style.width = '0%';
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

function updateProgress(completed, total) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  loadingText.textContent = `正在定位地址 ${completed}/${total}...`;
}

function showToast(msg) {
  geocodeToast.textContent = msg;
  geocodeToast.classList.remove('hidden');
  setTimeout(() => geocodeToast.classList.add('hidden'), 4000);
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== Service Worker ====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
