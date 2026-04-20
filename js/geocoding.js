/* =====================================================
   geocoding.js — Google Maps Geocoding API + 地址清理 + 快取
   ===================================================== */

// ==================== Geocode Cache (地址快取) ====================
/** 快取物件: key=地址字串, value={lat, lng} */
let geocodeCache = {};

/** 從 localStorage 載入快取 (永久保存，同一地址不重複呼叫 API) */
function loadGeocodeCache() {
  try {
    const saved = localStorage.getItem('geocode_cache');
    if (saved) geocodeCache = JSON.parse(saved);
  } catch (e) {
    geocodeCache = {};
  }
}

/** 將快取寫入 localStorage */
function saveGeocodeCache() {
  localStorage.setItem('geocode_cache', JSON.stringify(geocodeCache));
}

// ==================== Geocoding (Google Maps API) ====================
/**
 * 地址轉經緯度
 * 查找優先級: 快取 (rawAddress) → 快取 (cleanedAddress) → Google Maps API
 * 成功後同時以 raw 和 cleaned 地址為 key 存入快取，提高未來命中率
 * @param {string} rawAddress - 原始地址 (從 CSV 讀取)
 * @param {string} cleanedAddress - 清理過的地址 (去除郵遞區號等)
 * @returns {{lat: number, lng: number} | null}
 */
async function geocodeAddress(rawAddress, cleanedAddress) {
  // Check cache: try raw address first, then cleaned address as fallback
  if (geocodeCache[rawAddress]) {
    console.log(`[Geocode] 📦 快取命中 (raw): "${rawAddress}"`);
    return geocodeCache[rawAddress];
  }
  if (geocodeCache[cleanedAddress]) {
    console.log(`[Geocode] 📦 快取命中 (cleaned): "${cleanedAddress}"`);
    // Also store under raw key for faster future lookups
    geocodeCache[rawAddress] = geocodeCache[cleanedAddress];
    saveGeocodeCache();
    return geocodeCache[cleanedAddress];
  }

  console.log(`[Geocode] 🔍 快取未命中，呼叫 API: "${cleanedAddress}"`);

  const apiKey = window.App.getApiKey();
  if (!apiKey) {
    console.error('[Geocode] 沒有 API Key');
    return null;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanedAddress)}&key=${apiKey}&language=zh-TW&region=tw`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status === 'OK' && data.results.length > 0) {
      const loc = data.results[0].geometry.location;
      const result = { lat: loc.lat, lng: loc.lng };
      // Save to cache with both keys
      geocodeCache[rawAddress] = result;
      geocodeCache[cleanedAddress] = result;
      saveGeocodeCache();
      console.log(`[Geocode] 💾 已存入快取: "${rawAddress}"`);
      return result;
    }

    if (data.status === 'REQUEST_DENIED') {
      console.error('[Geocode] API Key 無效或未啟用 Geocoding API:', data.error_message);
    }
    return null;
  } catch (e) {
    console.error(`[Geocode] 錯誤: ${cleanedAddress}`, e);
    return null;
  }
}

// ==================== Address Cleaning (地址清理) ====================
/** 基本地址清理: 去除尾部全形/半形空格 */
function cleanAddress(raw) {
  if (!raw) return '';
  // Trim trailing full-width and half-width spaces
  return raw.replace(/[\s　]+$/g, '').trim();
}

/**
 * 深度地址清理 (為 Geocoding 最佳化)
 * 處理台灣地址的常見問題:
 * 1. 全形 ASCII 轉半形 (！～ → !~)
 * 2. 移除前導郵遞區號 (3-5 位數字)
 * 3. 截斷雙空格後的備註文字
 * 4. 以「號」或「樓」為截止點，保留樓層資訊
 * 5. 移除尾部特殊字元
 */
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

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, {
  loadGeocodeCache, saveGeocodeCache, geocodeAddress,
  cleanAddress, cleanAddressForGeo,
});
