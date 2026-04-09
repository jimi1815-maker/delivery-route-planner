/* =====================================================
   csv.js — CSV 檔案處理與解析 (支援一般 + 留庫格式)
   ===================================================== */

// ==================== CSV Parsing (CSV 解析) ====================
/**
 * 簡易 CSV 解析: 跳過 header (line 0)，以逗號分割
 * 注意: 不處理引號內的逗號，適用於特定的簡單 CSV 格式
 * @param {string} text - CSV 文字內容
 * @param {number} minCols - 最小欄位數，少於此數的行視為無效跳過
 */
function parseCSV(text, minCols) {
  const lines = text.split(/\r?\n/);
  const rows = [];

  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < minCols) continue; // Skip invalid rows
    rows.push(cols);
  }

  return rows;
}

/** 清理 CSV 儲存格值: 去除前後空白 + 移除 Excel 的 ="..." 包裝 */
function cleanVal(val) {
  if (!val) return '';
  val = val.trim();
  // Remove ="..." wrapper
  if (val.startsWith('="') && val.endsWith('"')) {
    val = val.substring(2, val.length - 1);
  }
  return val.trim();
}

/**
 * 檔案編碼偵測:
 * 先嘗試 UTF-8，如果出現替換字元 (\uFFFD) 或找不到關鍵 header，
 * 則改用 Big5 解碼 (台灣常見的舊系統匯出格式)
 */
async function readFileWithEncoding(file) {
  const buffer = await file.arrayBuffer();

  // Try UTF-8 first
  let text = new TextDecoder('utf-8').decode(buffer);

  // If it has replacement characters or missing key headers, try Big5
  if (text.includes('\uFFFD') || (!text.includes('日期') && !text.includes('地址') && !text.includes('配區') && !text.includes('貨號'))) {
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

// ==================== CSV Type Detection (類型自動偵測) ====================
/**
 * 根據 CSV header 行自動偵測類型
 * @param {string} headerLine - CSV 第一行 (header)
 * @returns {'general'|'retention'|'error'}
 */
function detectCsvType(headerLine) {
  if (headerLine.includes('系統配區') && headerLine.includes('明細單號')) {
    return 'general';
  }
  if (headerLine.includes('貨號') && headerLine.includes('托運人')) {
    return 'retention';
  }
  return 'error';
}

// ==================== Row Parsers (行資料解析) ====================
/**
 * 解析一般 CSV 的一行資料為標準 item 物件
 */
function parseGeneralRow(row, idx, sourceId) {
  const { COL, cleanAddress } = window.App;
  return {
    id: `${sourceId}-${idx}`,
    sourceId,
    detailNo: cleanVal(row[COL.DETAIL_NO]),
    receiverName: cleanVal(row[COL.RECEIVER_NAME]),
    phone: cleanVal(row[COL.RECEIVER_PHONE]),
    addressRaw: cleanAddress(cleanVal(row[COL.RECEIVER_ADDR])),
    remark: cleanVal(row[COL.REMARK]),
    shipperName: cleanVal(row[COL.SHIPPER_NAME]),
    tempZone: '',
    latestStatus: '',
    type: 'general',
    lat: null,
    lng: null,
    geocodeStatus: 'pending',
  };
}

/**
 * 解析留庫 CSV 的一行資料為標準 item 物件
 * 電話欄位: 留庫 CSV 無電話欄，固定 N/A
 */
function parseRetentionRow(row, idx, sourceId) {
  const { COL_PREV, cleanAddress } = window.App;
  return {
    id: `${sourceId}-${idx}`,
    sourceId,
    detailNo: cleanVal(row[COL_PREV.DETAIL_NO]),
    receiverName: cleanVal(row[COL_PREV.RECEIVER_NAME]),
    phone: 'N/A',
    addressRaw: cleanAddress(cleanVal(row[COL_PREV.RECEIVER_ADDR])),
    remark: '',
    shipperName: cleanVal(row[COL_PREV.SHIPPER_NAME]),
    tempZone: cleanVal(row[COL_PREV.TEMP_ZONE]),
    latestStatus: cleanVal(row[COL_PREV.LATEST_STATUS]),
    type: 'retention',
    lat: null,
    lng: null,
    geocodeStatus: 'pending',
  };
}

// ==================== File Upload Handler ====================
/**
 * 處理上傳的 CSV 檔案 — 多來源版
 * 1. 偵測編碼 (UTF-8 / Big5)
 * 2. 偵測 CSV 類型 (一般 / 留庫)
 * 3. 解析 CSV 行
 * 4. 提取配區列表
 * 5. 建立 csvSource 物件 push 到 csvSources
 * 6. 更新 UI
 */
async function handleFileUpload(file) {
  const { csvSources, COLOR_PALETTE, COL, COL_PREV } = window.App;

  try {
    const text = await readFileWithEncoding(file);
    const lines = text.split(/\r?\n/);

    if (lines.length < 2) {
      _addErrorSource(file.name, 'CSV 無內容');
      return;
    }

    const headerLine = lines[0];
    const csvType = detectCsvType(headerLine);

    // Pick next color from palette
    const colorIdx = csvSources.length % COLOR_PALETTE.length;
    const color = COLOR_PALETTE[colorIdx];

    const sourceId = crypto.randomUUID ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (csvType === 'error') {
      _addErrorSource(file.name, '無法辨識 CSV 格式');
      return;
    }

    // Parse rows with appropriate min columns
    const minCols = csvType === 'general' ? 20 : 15;
    const rows = parseCSV(text, minCols);

    if (rows.length === 0) {
      _addErrorSource(file.name, 'CSV 沒有有效資料');
      return;
    }

    // Extract districts
    const districtCol = csvType === 'general' ? COL.SYS_DISTRICT : COL_PREV.DISTRICT;
    const allDistricts = [...new Set(
      rows.map(row => cleanVal(row[districtCol])).filter(d => d.trim().length > 0)
    )].sort();

    const source = {
      id: sourceId,
      fileName: file.name,
      type: csvType,
      color,
      selectedDistricts: [],
      allDistricts,
      rawRows: rows,
    };

    csvSources.push(source);
    window.App.renderCsvSourceList();

  } catch (err) {
    console.error(err);
    _addErrorSource(file.name, err.message);
  }
}

/** 建立解析失敗的 error source 物件 */
function _addErrorSource(fileName, errorMsg) {
  const { csvSources, COLOR_PALETTE } = window.App;
  const colorIdx = csvSources.length % COLOR_PALETTE.length;

  csvSources.push({
    id: `err-${Date.now()}`,
    fileName,
    type: 'error',
    color: COLOR_PALETTE[colorIdx],
    selectedDistricts: [],
    allDistricts: [],
    rawRows: [],
    errorMsg,
  });

  window.App.renderCsvSourceList();
  window.App.showToast(`❌ ${fileName}: ${errorMsg}`);
}

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, {
  parseCSV, cleanVal, readFileWithEncoding, detectCsvType,
  parseGeneralRow, parseRetentionRow, handleFileUpload,
});
