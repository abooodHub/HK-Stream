// ===== STATE =====
var token = sessionStorage.getItem('hk_token') || '';
var refreshInterval = null;
var lastData = null;
var chartHistory = [];
var sendHistory = [];
var settingsInitialized = false;
var ipVisible = false;

// ===== HELPERS =====
function fmt(b) {
    if (!b || b < 0) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b/1048576).toFixed(1) + ' MB';
    return (b/1073741824).toFixed(2) + ' GB';
}
function fmtKbps(kbps) {
    if (!kbps || kbps <= 0) return '0 Kbps';
    return kbps >= 1000 ? (kbps/1000).toFixed(1) + ' Mbps' : kbps + ' Kbps';
}
function fmtDuration(secs) {
    if (!secs || secs <= 0) return '00:00:00';
    var h = Math.floor(secs/3600);
    var m = Math.floor((secs%3600)/60);
    var s = Math.floor(secs%60);
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
function fmtUptime(secs) {
    if (!secs || secs <= 0) return '--';
    var d = Math.floor(secs/86400);
    var h = Math.floor((secs%86400)/3600);
    var m = Math.floor((secs%3600)/60);
    if (d > 0) return d + ' يوم ' + h + ' س';
    if (h > 0) return h + ' س ' + m + ' د';
    return m + ' دقيقة';
}
function fmtHours(secs) {
    if (!secs || secs <= 0) return '0 ساعة';
    var h = Math.floor(secs/3600);
    var m = Math.floor((secs%3600)/60);
    if (h > 0) return h + ' س ' + m + ' د';
    return m + ' دقيقة';
}
function fmtTime(ts) {
    if (!ts) return '';
    return new Date(ts*1000).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function fmtDate(ts) {
    if (!ts) return '--';
    return new Date(ts*1000).toLocaleString('ar-SA');
}
function showToast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type || '');
    setTimeout(function(){ t.className = 'toast'; }, 3000);
}
var deviceIcons   = {phone:'📱',tablet:'📱',desktop:'💻',tv:'📺',unknown:'❓'};
var deviceClasses = {phone:'device-phone',tablet:'device-tablet',desktop:'device-desktop',tv:'device-tv',unknown:'device-unknown'};

var browserFiles = {Chrome:'chrome',Firefox:'firefox',Safari:'safari',Edge:'edge',Opera:'opera',Samsung:'samsung',IE:'ie'};
function browserIcon(name) {
    var f = browserFiles[name];
    if (!f) return '<span style="font-size:14px;vertical-align:middle;margin-left:6px;">🌐</span> ';
    return '<img src="/icons/browsers/' + f + '.svg?v=1" width="15" height="15" ' +
           'style="vertical-align:middle;margin-left:6px;" alt="' + escHtml(name) + '" title="' + escHtml(name) + '" ' +
           'onerror="this.style.display=\'none\'"> ';
}
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function maskIP(ip) {
    if (ipVisible) return ip;
    var parts = ip.split('.');
    if (parts.length === 4) return '●●●.●●●.●●●.' + parts[3];
    return '●●●●●●';
}

function toggleIPVisibility() {
    ipVisible = !ipVisible;
    var btn  = document.getElementById('ip-toggle-btn');
    var iconHidden  = document.getElementById('ip-icon-hidden');
    var iconVisible = document.getElementById('ip-icon-visible');
    if (btn)         btn.classList.toggle('active', ipVisible);
    if (iconHidden)  iconHidden.style.display  = ipVisible ? 'none' : '';
    if (iconVisible) iconVisible.style.display = ipVisible ? ''     : 'none';
    if (lastData) updateUI(lastData);
}

// ===== AUTH =====
async function doLogin() {
    var user  = document.getElementById('login-user').value.trim();
    var pass  = document.getElementById('login-pass').value;
    var errEl = document.getElementById('login-error');
    var btn   = document.getElementById('login-btn');
    if (!user || !pass) { errEl.textContent = 'يرجى إدخال اسم المستخدم وكلمة المرور'; return; }
    errEl.textContent = '';
    btn.textContent = 'جاري الدخول...';
    btn.disabled = true;
    try {
        var r = await fetch('/tracker-api/auth/login', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({username:user, password:pass})
        });
        var d = await r.json();
        if (d.token) {
            token = d.token;
            sessionStorage.setItem('hk_token', token);
            showApp();
        } else {
            errEl.textContent = d.error || 'بيانات الدخول غير صحيحة';
        }
    } catch(e) {
        errEl.textContent = 'خطأ في الاتصال بالخادم';
    }
    btn.textContent = 'دخول';
    btn.disabled = false;
}

function doLogout() {
    token = '';
    sessionStorage.removeItem('hk_token');
    settingsInitialized = false;
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    fetchData();
    if (typeof _initObsFields === 'function') _initObsFields();
    refreshInterval = setInterval(fetchData, 1500);
    updateClock();
    setInterval(updateClock, 1000);
    _highlightActiveNav();
}

// ===== API =====
var authFailCount = 0;

async function apiGet(path) {
    try {
        var r = await fetch('/tracker-api' + path, {headers:{'Authorization':'Bearer '+token}});
        if (r.status === 401) { authFailCount++; if (authFailCount >= 3) doLogout(); return null; }
        authFailCount = 0;
        return await r.json();
    } catch(e) { return null; }
}
async function apiPost(path, body) {
    try {
        var r = await fetch('/tracker-api' + path, {
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
            body: JSON.stringify(body)
        });
        if (r.status === 401) { doLogout(); return null; }
        return await r.json();
    } catch(e) { return null; }
}
async function apiDelete(path) {
    try {
        var r = await fetch('/tracker-api' + path, {
            method:'DELETE',
            headers:{'Authorization':'Bearer '+token}
        });
        if (r.status === 401) { doLogout(); return null; }
        return await r.json();
    } catch(e) { return null; }
}

// ===== FETCH =====
async function fetchData() {
    var data = await apiGet('/dashboard');
    if (!data) return;
    lastData = data;
    updateUI(data);
}

// ===== UPDATE UI =====
function updateUI(d) {
    var s    = d.stream   || {};
    var h    = d.health   || {};
    var v    = d.viewers  || {};
    var kbps = s.kbps     || {};
    var vid  = s.video    || {};
    var aud  = s.audio    || {};

    var isOnline = h.status === 'online';

    var statusBadge = document.getElementById('welcome-status-badge');
    var statusText  = document.getElementById('welcome-status-text');
    var welcomeTitle = document.getElementById('welcome-title');
    var welcomeDesc  = document.getElementById('welcome-desc');
    var navStatusBadge = document.getElementById('nav-status-badge');
    var navStatusText  = document.getElementById('nav-status-text');

    if (isOnline) {
      if (statusBadge) statusBadge.className = 'welcome-status online';
      if (statusText)  statusText.textContent = 'مباشر الآن';
      if (navStatusBadge) navStatusBadge.className = 'nav-status-badge online';
      if (navStatusText)  navStatusText.textContent = 'مباشر الآن';
      if (d.stream_title && d.stream_title.title) {
        if (welcomeTitle) welcomeTitle.textContent = d.stream_title.title;
        if (welcomeDesc)  welcomeDesc.textContent  = d.stream_title.subtitle || 'البث يعمل حالياً بشكل مستقر.';
      } else {
        if (welcomeTitle) welcomeTitle.textContent = 'البث المباشر قيد العمل';
        if (welcomeDesc)  welcomeDesc.textContent  = 'معدل جودة ممتازة واستقرار البث طبيعي.';
      }
    } else {
      if (statusBadge) statusBadge.className = 'welcome-status offline';
      if (statusText)  statusText.textContent = 'غير متصل';
      if (navStatusBadge) navStatusBadge.className = 'nav-status-badge offline';
      if (navStatusText)  navStatusText.textContent = 'غير متصل';
      if (welcomeTitle) welcomeTitle.textContent = 'الخادم متوقف عن البث';
      if (welcomeDesc)  welcomeDesc.textContent  = 'في انتظار بدء تدفق البث من البثث المعتمدة.';
    }

    var detailsCard = document.getElementById('stream-details-card');
    if (detailsCard) detailsCard.style.display = isOnline ? '' : 'none';

    // Home tab stats
    var el;
    el = document.getElementById('home-viewers'); if (el) el.textContent = v.current || 0;
    el = document.getElementById('home-viewers-sub'); if (el) el.textContent = 'الذروة التاريخية: ' + (v.peak || 0);
    el = document.getElementById('home-uptime'); if (el) el.textContent = fmtDuration(d.uptime || 0);
    el = document.getElementById('home-bitrate'); if (el) el.textContent = fmtKbps(kbps.recv_30s || 0);
    el = document.getElementById('home-bitrate-send'); if (el) el.textContent = 'إرسال: ' + fmtKbps(kbps.send_30s || 0);

    el = document.getElementById('stat-bitrate-recv'); if (el) el.textContent = fmtKbps(kbps.recv_30s || 0);
    el = document.getElementById('stat-bitrate-send'); if (el) el.textContent = 'الإرسال: ' + fmtKbps(kbps.send_30s || 0);
    el = document.getElementById('stat-recv'); if (el) el.textContent = fmt(s.recv_bytes || 0);
    el = document.getElementById('stat-recv-sub'); if (el) el.textContent = 'المُرسلة: ' + fmt(s.send_bytes || 0);
    el = document.getElementById('stat-stability'); if (el) el.textContent = (h.stability_score || 100) + '%';
    el = document.getElementById('stat-stability-sub'); if (el) el.textContent = 'فريز: ' + (h.freeze_count || 0);

    var statusVal = document.getElementById('stat-status');
    var statusSub = document.getElementById('stat-status-sub');
    if (statusVal) {
        if (isOnline) {
            statusVal.textContent  = 'مباشر';
            statusVal.style.color  = 'var(--green)';
            if (statusSub) statusSub.textContent  = fmtDuration(d.uptime) + ' مستمر';
        } else {
            statusVal.textContent  = 'غير متصل';
            statusVal.style.color  = 'var(--red)';
            if (statusSub) statusSub.textContent  = '--';
        }
    }

    var res = (vid.width && vid.height)
        ? vid.width + 'x' + vid.height + (vid.framerate ? ' @' + vid.framerate + 'fps' : '')
        : (isOnline ? 'N/A' : '--');
    el = document.getElementById('info-vcodec'); if (el) el.textContent = vid.codec || '--';
    el = document.getElementById('info-resolution'); if (el) el.textContent = res;
    el = document.getElementById('info-vprofile'); if (el) el.textContent = vid.framerate ? vid.framerate + ' fps' : (isOnline ? 'N/A' : '--');
    el = document.getElementById('info-acodec'); if (el) el.textContent = aud.codec || '--';
    el = document.getElementById('info-samplerate'); if (el) el.textContent = aud.samplerate ? aud.samplerate + ' Hz' : (isOnline ? 'N/A' : '--');
    el = document.getElementById('info-channels'); if (el) el.textContent = aud.channel ? aud.channel + ' قناة' : (isOnline ? 'N/A' : '--');
    el = document.getElementById('info-send-speed'); if (el) el.textContent = fmtKbps(kbps.send_30s || 0);
    el = document.getElementById('info-send-total'); if (el) el.textContent = fmt(s.send_bytes || 0);

    if (!isOnline) {
        ['info-vcodec','info-resolution','info-vprofile','info-acodec','info-samplerate','info-channels'].forEach(function(id){
            var e = document.getElementById(id); if (e) e.textContent = '--';
        });
        el = document.getElementById('stat-bitrate-recv'); if (el) el.textContent = fmtKbps(0);
        el = document.getElementById('stat-bitrate-send'); if (el) el.textContent = 'الإرسال: ' + fmtKbps(0);
        el = document.getElementById('home-bitrate'); if (el) el.textContent = fmtKbps(0);
        el = document.getElementById('home-bitrate-send'); if (el) el.textContent = 'إرسال: ' + fmtKbps(0);
        el = document.getElementById('info-send-speed'); if (el) el.textContent = fmtKbps(0);
        var _ck = document.getElementById('chart-cur-kbps'); if (_ck) _ck.textContent = fmtKbps(0);
        var _sk = document.getElementById('chart-cur-send-kbps'); if (_sk) _sk.textContent = fmtKbps(0);
    }

    // Server Health
    var sh = d.server_health || {};
    var cpu  = sh.cpu  || 0;
    var ram  = sh.ram  || {total_mb: 0, used_mb: 0, percent: 0};
    var disk = sh.disk || {total_gb: 0, used_gb: 0, percent: 0};

    var cpuVal = document.getElementById('health-cpu-val');
    var cpuBar = document.getElementById('health-cpu-bar');
    if (cpuVal) {
        cpuVal.textContent = cpu + '%';
        if (cpu >= 80) { cpuVal.style.color = 'var(--red)';   if (cpuBar) cpuBar.style.background = 'linear-gradient(90deg,var(--red),#f87171)'; }
        else if (cpu >= 60) { cpuVal.style.color = 'var(--amber)'; if (cpuBar) cpuBar.style.background = 'linear-gradient(90deg,var(--amber),#fbbf24)'; }
        else { cpuVal.style.color = 'var(--cyan)'; if (cpuBar) cpuBar.style.background = 'linear-gradient(90deg,var(--cyan),#22d3ee)'; }
    }
    if (cpuBar) cpuBar.style.width = cpu + '%';

    var ramVal = document.getElementById('health-ram-val');
    var ramBar = document.getElementById('health-ram-bar');
    if (ramVal) {
        ramVal.textContent = ram.used_mb + ' / ' + ram.total_mb + ' MB (' + ram.percent + '%)';
        if (ram.percent >= 85) { ramVal.style.color = 'var(--red)';   if (ramBar) ramBar.style.background = 'linear-gradient(90deg,var(--red),#f87171)'; }
        else if (ram.percent >= 65) { ramVal.style.color = 'var(--amber)'; if (ramBar) ramBar.style.background = 'linear-gradient(90deg,var(--amber),#fbbf24)'; }
        else { ramVal.style.color = 'var(--green)'; if (ramBar) ramBar.style.background = 'linear-gradient(90deg,var(--green),#34d399)'; }
    }
    if (ramBar) ramBar.style.width = ram.percent + '%';

    var diskVal = document.getElementById('health-disk-val');
    var diskBar = document.getElementById('health-disk-bar');
    if (diskVal) {
        diskVal.textContent = disk.used_gb + ' / ' + disk.total_gb + ' GB (' + disk.percent + '%)';
        if (disk.percent >= 90) { diskVal.style.color = 'var(--red)';   if (diskBar) diskBar.style.background = 'linear-gradient(90deg,var(--red),#f87171)'; }
        else if (disk.percent >= 75) { diskVal.style.color = 'var(--amber)'; if (diskBar) diskBar.style.background = 'linear-gradient(90deg,var(--amber),#fbbf24)'; }
        else { diskVal.style.color = 'var(--green)'; if (diskBar) diskBar.style.background = 'linear-gradient(90deg,var(--green),#34d399)'; }
    }
    if (diskBar) diskBar.style.width = disk.percent + '%';

    var totals = d.totals || {};
    el = document.getElementById('srv-uptime'); if (el) el.textContent = fmtUptime(d.server_uptime || 0);
    el = document.getElementById('total-stream-hours'); if (el) el.textContent = fmtHours(totals.stream_seconds || 0);
    el = document.getElementById('total-sessions-sub'); if (el) el.textContent = (totals.sessions_count || 0) + ' جلسة بث';
    el = document.getElementById('total-data'); if (el) el.textContent = fmt(totals.recv_bytes || 0);
    el = document.getElementById('total-data-sub'); if (el) el.textContent = 'المُرسل للمشاهدين: ' + fmt(totals.sent_bytes || 0);

    // Bitrate chart
    if (d.bitrate_history && d.bitrate_history.length) {
        chartHistory = d.bitrate_history;
        sendHistory.push({ts: Math.floor(Date.now()/1000), kbps: kbps.send_30s || 0});
        if (sendHistory.length > 60) sendHistory.shift();
        if (typeof drawBitrateChart === 'function') drawBitrateChart(chartHistory, sendHistory);
        var cur = chartHistory[chartHistory.length - 1];
        el = document.getElementById('chart-cur-kbps'); if (el) el.textContent = fmtKbps(cur ? cur.kbps : 0);
        var _sk2 = document.getElementById('chart-cur-send-kbps');
        if (_sk2) _sk2.textContent = fmtKbps(kbps.send_30s || 0);
    }

    // Interactions/Poll
    if (d.interactions) {
        var ia = d.interactions;
        var p = ia.poll || {};
        var pL = document.getElementById('poll-likes'); if(pL) pL.textContent = ia.likes || 0;
        var pD = document.getElementById('poll-dislikes'); if(pD) pD.textContent = ia.dislikes || 0;
        var pY = document.getElementById('poll-yes'); if(pY) pY.textContent = p['1'] || 0;
        var pN = document.getElementById('poll-no'); if(pN) pN.textContent = p['2'] || 0;
        var pS = document.getElementById('poll-sometimes'); if(pS) pS.textContent = p['3'] || 0;
    }

    // Viewers tab
    el = document.getElementById('v-count'); if (el) el.textContent = v.current || 0;
    el = document.getElementById('v-peak'); if (el) el.textContent = v.peak || 0;

    if (typeof renderBreakdown === 'function') {
        renderBreakdown('devices-breakdown',   (d.stats || {}).devices,   deviceIcons);
        renderBreakdown('browsers-breakdown',  (d.stats || {}).browsers,  null);
        renderBreakdown('qualities-breakdown', (d.stats || {}).qualities, null);
        renderBreakdown('countries-breakdown', (d.stats || {}).countries, null);
    }
    if (window.updateGeoMap) window.updateGeoMap((d.stats || {}).countries || {}, (d.geo_block || {}).blocked_countries || []);

    // Viewers table
    var viewersList = d.viewer_clients || [];
    el = document.getElementById('viewer-count-badge'); if (el) el.textContent = viewersList.length;
    var vtbody = document.getElementById('viewers-tbody');
    if (vtbody) {
        if (viewersList.length === 0) {
            vtbody.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد مشاهدون حالياً</td></tr>';
        } else {
            var srcVid   = ((d.stream || {}).video || {});
            var srcH     = srcVid.height || 0;
            var srcLabel = srcH >= 2160 ? '4K' : srcH >= 1080 ? '1080p' : srcH >= 720 ? '720p' : srcH >= 480 ? '480p' : srcH >= 360 ? '360p' : srcH > 0 ? srcH + 'p' : null;

            vtbody.innerHTML = viewersList.map(function(vi) {
                var di  = vi.device || 'unknown';
                var cls = deviceClasses[di] || 'device-unknown';
                var pType = vi.player_type || 'main';
                var pLabel = pType === 'multi' ? 'مشغل الجودات (HLS)' : 'المشغل الأساسي (WebRTC)';
                var pBadge = pType === 'multi' ? 'badge-cyan' : 'badge-gold';

                var qual = vi.quality || 'تلقائي';
                var qualLabel = qual;
                if (pType === 'main') {
                    qualLabel = srcLabel ? srcLabel + ' (أصلية)' : 'أصلية';
                }
                var qualBadge = qualLabel.includes('1080') ? 'badge-cyan' :
                                qualLabel.includes('720')  ? 'badge-blue' :
                                qualLabel.includes('480')  ? 'badge-green' :
                                qualLabel.includes('المصدر') ? 'badge-cyan' : 'badge-gray';
                var ip     = escHtml(vi.ip);
                var ipDisp = escHtml(maskIP(vi.ip));

                var flagHtml = '';
                if (vi.country_code && vi.country_code !== 'UN' && vi.country_code !== 'local') {
                    var code = vi.country_code.toLowerCase();
                    flagHtml = '<img src="https://flagcdn.com/16x12/' + code + '.png" style="vertical-align:middle; margin-left:6px; border-radius:2px; box-shadow: 0 1px 2px rgba(0,0,0,0.2);" width="16" height="12" title="' + escHtml(vi.country_code) + '" alt="' + escHtml(vi.country_code) + '"> ';
                } else if (vi.country_code === 'local') {
                    flagHtml = '<span title="شبكة محلية" style="margin-left:6px; vertical-align:middle; font-size:12px;">🏠</span> ';
                } else {
                    flagHtml = '<span title="مجهول" style="margin-left:6px; vertical-align:middle; font-size:12px;">🌐</span> ';
                }

                return '<tr>' +
                    '<td style="font-weight:600;font-variant-numeric:tabular-nums;display:flex;align-items:center;">' + flagHtml + ipDisp + '</td>' +
                    '<td><span class="device-icon ' + cls + '">' + (deviceIcons[di] || '❓') + '</span> <span style="font-size:0.8rem; margin-right:6px; font-weight:600;">' + escHtml(vi.device_name || 'كمبيوتر مكتبي') + '</span></td>' +
                    '<td>' + browserIcon(vi.browser) + '<span class="badge badge-gray">' + escHtml(vi.browser || '—') + '</span></td>' +
                    '<td><span class="badge ' + pBadge + '" style="margin-left:5px;">' + escHtml(pLabel) + '</span><span class="badge ' + qualBadge + '">' + escHtml(qualLabel) + '</span></td>' +
                    '<td>' + escHtml(vi.alive_formatted || '—') + '</td>' +
                    '<td>' +
                        (vi.is_banned
                            ? '<span class="badge badge-red">محظور</span>'
                            : '<button class="btn ban-btn" onclick="banIPDirect(\'' + ip + '\')">حظر</button>') +
                    '</td>' +
                '</tr>';
            }).join('');
        }
    }

    // Banned
    var banned     = d.banned || {};
    var bannedList = banned.list || [];
    el = document.getElementById('banned-count'); if (el) el.textContent = banned.count || 0;
    var btbody = document.getElementById('banned-tbody');
    if (btbody) {
        if (bannedList.length === 0) {
            btbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا توجد IPs محظورة</td></tr>';
        } else {
            btbody.innerHTML = bannedList.map(function(b) {
                var ip     = escHtml(b.ip);
                var ipDisp = escHtml(maskIP(b.ip));
                return '<tr>' +
                    '<td style="font-weight:600">' + ipDisp + '</td>' +
                    '<td><span class="device-icon">' + (deviceIcons[b.device] || '❓') + '</span></td>' +
                    '<td>' + escHtml(b.reason || '--') + '</td>' +
                    '<td style="font-size:.75rem">' + fmtDate(b.banned_at) + '</td>' +
                    '<td><button class="btn unban-btn" onclick="unbanIP(\'' + ip + '\')">إلغاء الحظر</button></td>' +
                '</tr>';
            }).join('');
        }
    }

    if (typeof renderQualityEvents === 'function') renderQualityEvents(h.quality_events);

    var pa     = d.player_auth || {};
    var toggle = document.getElementById('player-auth-toggle');
    if (toggle) { if (pa.enabled) { toggle.classList.add('active'); } else { toggle.classList.remove('active'); } }

    var passEnabled = d.stream_pass_enabled || false;
    var passToggle = document.getElementById('stream-pass-toggle');
    if (passToggle) {
        if (passEnabled) { passToggle.classList.add('active'); } else { passToggle.classList.remove('active'); }
    }
    var passInputRow = document.getElementById('stream-pass-input-row');
    if (passInputRow) {
        passInputRow.style.display = passEnabled ? 'block' : 'none';
    }

    if (!settingsInitialized) {
        var passInput = document.getElementById('stream-pass-input');
        if (passInput) passInput.value = d.stream_pass_value || '';
        settingsInitialized = true;
    }

    var geoInput = document.getElementById('geo-block-countries-input');
    if (geoInput) geoInput.value = (d.geo_block || {}).blocked_countries || [].join(', ');

    var geoToggle = document.getElementById('geo-block-toggle');
    if (geoToggle) {
        var geoEnabled = (d.geo_block || {}).enabled;
        if (geoEnabled) { geoToggle.classList.add('active'); } else { geoToggle.classList.remove('active'); }
    }

    var homeSessions = d.sessions_summary || [];
    var hstbody = document.getElementById('home-sessions-tbody');
    if (hstbody) {
        if (homeSessions.length === 0) {
            hstbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا توجد بثوث مسجلة</td></tr>';
        } else {
            hstbody.innerHTML = homeSessions.slice(0, 3).map(function(s) {
                var endStr = s.ended_at ? fmtDate(s.ended_at) : '<span class="badge badge-green">مباشر الآن</span>';
                return '<tr>' +
                    '<td style="font-weight:600">' + s.id + '</td>' +
                    '<td>' + fmtDate(s.started_at) + '</td>' +
                    '<td>' + endStr + '</td>' +
                    '<td>' + fmtDuration(s.duration_s) + '</td>' +
                    '<td><span class="badge badge-cyan">' + s.peak_viewers + '</span></td>' +
                '</tr>';
            }).join('');
        }
    }

    var sessionsCb = document.querySelector('.session-cb');
    if (!sessionsCb && typeof _renderSessionsTable === 'function') {
        _renderSessionsTable(d.sessions_summary || []);
    }

    if (typeof _checkHealthAlerts === 'function') _checkHealthAlerts(d);
}

// ===== TABS (page-based navigation) =====
function switchTab(tab) {
    window.location.href = tab === 'home' ? '/dashboard.html' : tab === 'viewers' ? '/viewers.html' : '/settings.html';
}

function _highlightActiveNav() {
    var path = window.location.pathname;
    var current = path.includes('viewers') ? 'viewers' : path.includes('settings') ? 'settings' : 'home';
    document.querySelectorAll('.nav-item').forEach(function(btn) {
        var t = btn.getAttribute('data-tab') || '';
        btn.classList.toggle('active', t === current);
    });
    document.querySelectorAll('.mobile-nav-item').forEach(function(btn) {
        var t = btn.getAttribute('data-tab') || '';
        btn.classList.toggle('active', t === current);
    });
}

// ===== CLOCK =====
function updateClock() {
    var el = document.getElementById('header-time');
    if (el) el.textContent = new Date().toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

// ===== ENTER KEY =====
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.getElementById('login-screen') && document.getElementById('login-screen').style.display !== 'none') doLogin();
});

// ===== AUTO LOGIN =====
if (token) {
    fetch('/tracker-api/dashboard', {headers:{'Authorization':'Bearer '+token}})
        .then(function(r) {
            if (r.ok) { showApp(); }
            else { token = ''; sessionStorage.removeItem('hk_token'); }
        })
        .catch(function(){});
}

// Redraw chart on resize
window.addEventListener('resize', function() {
    if (typeof chartHistory !== 'undefined' && chartHistory.length && typeof drawBitrateChart === 'function') {
      drawBitrateChart(chartHistory, sendHistory);
    }
});

// ===== TABLE LABELING IIFE =====
(function() {
    function labelTable(table) {
      var labels = Array.from(table.querySelectorAll('thead th')).map(function(th) {
        return th.textContent.trim();
      });
      table.querySelectorAll('tbody tr').forEach(function(row) {
        row.querySelectorAll('td').forEach(function(td, i) {
          if (labels[i]) td.setAttribute('data-label', labels[i]);
        });
      });
    }
    function initTables() {
      document.querySelectorAll('table').forEach(function(table) {
        labelTable(table);
        var tbody = table.querySelector('tbody');
        if (tbody) new MutationObserver(function() { labelTable(table); })
          .observe(tbody, { childList: true, subtree: true });
      });
    }
    document.addEventListener('DOMContentLoaded', function() { initTables(); _highlightActiveNav(); });
})();
