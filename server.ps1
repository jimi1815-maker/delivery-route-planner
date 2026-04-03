# Simple HTTP Server - uses script's own directory as root
# Enable TLS 1.2 for HTTPS connections (required for Nominatim)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

Write-Host "Server running at http://localhost:8080/" -ForegroundColor Green
Write-Host "Serving from: $root" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow

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
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $reqPath = $ctx.Request.Url.LocalPath
        if ($reqPath -eq "/") { $reqPath = "/index.html" }

        $relativePath = $reqPath.TrimStart("/").Replace("/", "\")
        $filePath = [System.IO.Path]::Combine($root, $relativePath)

        try {
            # Geocode proxy endpoint
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
                    $ctx.Response.StatusCode = 502
                    $errMsg = [System.Text.Encoding]::UTF8.GetBytes("[]")
                    $ctx.Response.ContentLength64 = $errMsg.Length
                    $ctx.Response.OutputStream.Write($errMsg, 0, $errMsg.Length)
                    Write-Host "502 GEOCODE FAIL: $query - $_" -ForegroundColor Red
                }
            }
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
    $listener.Stop()
}
