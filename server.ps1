# =====================================================
# 本機 HTTP 伺服器 (PowerShell)
# =====================================================
# 用途: 開發階段的本地 HTTP 伺服器
# - 提供靜態檔案服務 (HTML/CSS/JS/圖片)
# - 內建 Geocode Proxy 端點 (/api/geocode)
#   → 轉發請求到 Nominatim API，解決瀏覽器 CORS 限制
# 注意: 目前前端已改用 Google Maps Geocoding API (client-side)，
#       此 proxy 端點保留供未來可能的切換使用
# =====================================================

# 啟用 TLS 1.2 — Nominatim API (HTTPS) 連線所需
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# 建立 HTTP Listener，監聽 localhost:8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()

# 取得腳本所在目錄作為靜態檔案根目錄
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

Write-Host "Server running at http://localhost:8080/" -ForegroundColor Green
Write-Host "Serving from: $root" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow

# MIME 類型對照表 — 用於設定 Response Content-Type
$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".svg"  = "image/svg+xml"
    ".csv"  = "text/csv"
    ".webmanifest" = "application/manifest+json"
}

try {
    # 主迴圈: 持續接受 HTTP 請求
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $reqPath = $ctx.Request.Url.LocalPath
        # 根路徑預設導向 index.html
        if ($reqPath -eq "/") { $reqPath = "/index.html" }

        # 將 URL 路徑轉換為本機檔案路徑
        $relativePath = $reqPath.TrimStart("/").Replace("/", "\")
        $filePath = [System.IO.Path]::Combine($root, $relativePath)

        try {
            # ---- Geocode Proxy 端點 (/api/geocode) ----
            # 接收前端的 ?q=地址 查詢，轉發到 Nominatim OSM Geocoding API
            if ($reqPath -eq "/api/geocode") {
                $query = $ctx.Request.QueryString["q"]
                $nominatimUrl = "https://nominatim.openstreetmap.org/search?format=json&countrycodes=tw&limit=1&q=$query"
                try {
                    $wc = New-Object System.Net.WebClient
                    $wc.Headers.Add("User-Agent", "RouteplannerApp/1.0")
                    $wc.Encoding = [System.Text.Encoding]::UTF8
                    $result = $wc.DownloadString($nominatimUrl)
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($result)
                    $ctx.Response.ContentType = "application/json; charset=utf-8"
                    $ctx.Response.StatusCode = 200
                    $ctx.Response.ContentLength64 = $bytes.Length
                    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                    Write-Host "200 GEOCODE: $query" -ForegroundColor Cyan
                } catch {
                    # Nominatim API 呼叫失敗時回傳 502 + 空陣列
                    $ctx.Response.StatusCode = 502
                    $errMsg = [System.Text.Encoding]::UTF8.GetBytes("[]")
                    $ctx.Response.ContentLength64 = $errMsg.Length
                    $ctx.Response.OutputStream.Write($errMsg, 0, $errMsg.Length)
                    Write-Host "502 GEOCODE FAIL: $query - $_" -ForegroundColor Red
                }
            }
            # ---- 靜態檔案服務 ----
            elseif ([System.IO.File]::Exists($filePath)) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
                $ctx.Response.ContentType = $contentType
                $ctx.Response.StatusCode = 200
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $ctx.Response.ContentLength64 = $bytes.Length
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "200 $reqPath" -ForegroundColor Green
            } else {
                # 檔案不存在 → 404
                $ctx.Response.StatusCode = 404
                $ctx.Response.ContentType = "text/plain; charset=utf-8"
                $msg = [System.Text.Encoding]::UTF8.GetBytes("Not Found: $filePath")
                $ctx.Response.ContentLength64 = $msg.Length
                $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
                Write-Host "404 $reqPath -> $filePath" -ForegroundColor Red
            }
        } catch {
            Write-Host "ERR $reqPath : $_" -ForegroundColor Red
        } finally {
            $ctx.Response.Close()
        }
    }
} finally {
    # 確保 Listener 正確釋放
    $listener.Stop()
}
