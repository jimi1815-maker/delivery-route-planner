/* =====================================================
   delivered.js — 送達狀態管理 (當日有效，隔日自動清空)
   ===================================================== */

// ==================== Delivered State (送達狀態管理) ====================
/** 取得今天日期字串 (YYYY-MM-DD)，用於判斷是否隔日清空 */
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 載入送達狀態:
 * - 如果儲存日期與今天不同，自動清空 (每日重新開始)
 * - 如果是同一天，從 localStorage 恢復上次的狀態
 */
function loadDeliveredState() {
  try {
    const saved = localStorage.getItem('delivered_items');
    const savedDate = localStorage.getItem('delivered_items_date');
    const today = getTodayStr();

    if (savedDate !== today) {
      // 隔日自動清空
      window.App.deliveredSet = new Set();
      localStorage.removeItem('delivered_items');
      localStorage.setItem('delivered_items_date', today);
      console.log(`[Delivered] 🗑️ 隔日清空 (上次: ${savedDate || '無'}, 今天: ${today})`);
    } else if (saved) {
      window.App.deliveredSet = new Set(JSON.parse(saved));
    }
  } catch (e) {
    window.App.deliveredSet = new Set();
  }
}

/** 儲存送達狀態到 localStorage */
function saveDeliveredState() {
  localStorage.setItem('delivered_items', JSON.stringify([...window.App.deliveredSet]));
  localStorage.setItem('delivered_items_date', getTodayStr());
}

/**
 * 切換送達狀態 (由 checkbox onchange 觸發)
 * 同步更新:
 * 1. deliveredSet 集合
 * 2. localStorage 持久化
 * 3. 地圖 marker 圖示 (DivIcon) & 透明度
 * 4. 清單卡片樣式 (opacity + 刪除線)
 * 5. 同一 detailNo 的所有 checkbox (地圖 popup + 清單卡片)
 */
function toggleDelivered(detailNo, isChecked) {
  const { deliveredSet, markers, createMarkerIcon } = window.App;

  if (isChecked) {
    deliveredSet.add(detailNo);
  } else {
    deliveredSet.delete(detailNo);
  }
  saveDeliveredState();

  // Update marker icon (DivIcon with source color)
  markers.forEach(m => {
    if (m._itemDetailNo === detailNo) {
      m.setIcon(createMarkerIcon(m._sourceColor, isChecked));
    }
  });

  // Update card style
  const card = document.querySelector(`.item-card[data-detail-no="${detailNo}"]`);
  if (card) {
    card.classList.toggle('delivered', isChecked);
  }

  // Sync all checkboxes with the same detailNo (popup + card)
  document.querySelectorAll(`input[onchange*="'${detailNo}'"]`).forEach(cb => {
    cb.checked = isChecked;
  });
}

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, {
  loadDeliveredState, saveDeliveredState, toggleDelivered,
});

// toggleDelivered 需要從 HTML inline handler 呼叫，所以也掛到 window
window.toggleDelivered = toggleDelivered;
