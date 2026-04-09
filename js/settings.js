/* =====================================================
   settings.js — Google Maps API Key 管理
   ===================================================== */

// ==================== API Key Management (API Key 管理) ====================
/** 從 localStorage 讀取 API Key */
function getApiKey() {
  return localStorage.getItem('gmaps_api_key') || '';
}

/** 檢查是否已設定 API Key，未設定則在上傳頁面顯示警告提示 */
function checkApiKey() {
  const $ = window.App.$;
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

/** 開啟設定彈窗，載入現有 API Key */
function openSettings() {
  const { apiKeyInput, settingsModal } = window.App;
  apiKeyInput.value = getApiKey();
  settingsModal.classList.remove('hidden');
  updateKeyStatus();
}

/** 儲存 API Key 到 localStorage，成功後自動關閉彈窗 */
function saveApiKey() {
  const { apiKeyInput, apiKeyStatus, settingsModal } = window.App;
  const $ = window.App.$;
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

/** 更新彈窗中的 API Key 狀態顯示 (已設定 / 尚未設定) */
function updateKeyStatus() {
  const { apiKeyStatus } = window.App;
  const key = getApiKey();
  if (key) {
    apiKeyStatus.innerHTML = `<span style="color:var(--success)">✅ 已設定 (${key.substring(0, 8)}...)</span>`;
  } else {
    apiKeyStatus.innerHTML = '<span style="color:var(--warning)">⚠️ 尚未設定</span>';
  }
}

// ==================== 匯出到全域命名空間 ====================
window.App = window.App || {};
Object.assign(window.App, {
  getApiKey, checkApiKey, openSettings, saveApiKey, updateKeyStatus,
});
