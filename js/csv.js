/* =====================================================
   csv.js — CSV 檔案處理與解析
   ===================================================== */

// ==================== CSV Parsing (CSV 解析) ====================
/**
 * 簡易 CSV 解析: 跳過 header (line 0)，以逗號分割
 * 注意: 不處理引號內的逗號，適用於特定的簡單 CSV 格式
 * 欄位數 < 20 的行視為無效資料跳過
 */
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

/**
 * 處理上傳的 CSV 檔案
 * 1. 偵測編碼 (UTF-8 / Big5)
 * 2. 解析 CSV 行
 * 3. 提取不重複的配區列表填入下拉選單
 * 4. 切換到主畫面
 */
async function handleFile(file) {
  const { csvData, districtSelect, uploadScreen, mainScreen, map, COL } = window.App;

  try {
    const text = await readFileWithEncoding(file);
    const parsed = parseCSV(text);
    window.App.csvData = parsed;

    if (parsed.length === 0) {
      alert('CSV 檔案沒有有效資料');
      return;
    }

    // Extract unique districts
    const districts = [...new Set(
      parsed.map(row => cleanVal(row[COL.SYS_DISTRICT])).filter(d => d.trim().length > 0)
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

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, { parseCSV, cleanVal, readFileWithEncoding, handleFile });
