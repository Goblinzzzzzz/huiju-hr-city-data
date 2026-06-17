#!/bin/bash
# 奥丁抓取 spike：验证 osascript 能驱动已登录 Chrome 抓表。
# 前提：① Chrome 已登录奥丁；② Chrome 菜单「查看 → 开发者 → 允许 Apple 事件中的 JavaScript」已勾选。
# 用法：bash scripts/odin_spike.sh [奥丁URL]
set -e
URL="${1:-https://odin.ke.com/portal/2974/39522/46908/89428}"
echo "目标: $URL"

osascript <<APPLESCRIPT
set targetURL to "$URL"
tell application "Google Chrome"
  if (count of windows) = 0 then error "Chrome 未打开窗口"
  set found to missing value
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "odin.ke.com" then set found to t
    end repeat
  end repeat
  if found is missing value then
    tell front window to make new tab with properties {URL:targetURL}
    delay 6
    set found to active tab of front window
  end if
  -- 返回每张表的维度与首行样例，便于人眼确认
  set js to "JSON.stringify(Array.from(document.querySelectorAll('table')).map(function(t){var r0=t.rows[0];return {rows:t.rows.length, cols:r0?r0.cells.length:0, head: r0?Array.from(r0.cells).map(function(c){return (c.innerText||'').trim()}).slice(0,6):[]}}))"
  return execute found javascript js
end tell
APPLESCRIPT
