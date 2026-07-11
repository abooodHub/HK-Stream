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

// أيقونات المتصفحات (مستضافة محلياً /icons/browsers) — تختفي بأمان لو لم تتوفر
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

// ===== IP MASKING =====
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

// Sidebar toggle removed (top navigation layout)

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
    _initObsFields();
    refreshInterval = setInterval(fetchData, 1500);
    updateClock();
    setInterval(updateClock, 1000);
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

    // Hero card + nav badge
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

    // Show/hide stream details card
    var detailsCard = document.getElementById('stream-details-card');
    if (detailsCard) detailsCard.style.display = isOnline ? '' : 'none';

    // Home tab stats
    document.getElementById('home-viewers').textContent = v.current || 0;
    document.getElementById('home-viewers-sub').textContent = 'الذروة التاريخية: ' + (v.peak || 0);
    document.getElementById('home-uptime').textContent = fmtDuration(d.uptime || 0);
    document.getElementById('home-bitrate').textContent = fmtKbps(kbps.recv_30s || 0);
    document.getElementById('home-bitrate-send').textContent = 'إرسال: ' + fmtKbps(kbps.send_30s || 0);

    // Stream tab stats
    document.getElementById('stat-bitrate-recv').textContent = fmtKbps(kbps.recv_30s || 0);
    document.getElementById('stat-bitrate-send').textContent = 'الإرسال: ' + fmtKbps(kbps.send_30s || 0);
    document.getElementById('stat-recv').textContent         = fmt(s.recv_bytes || 0);
    document.getElementById('stat-recv-sub').textContent     = 'المُرسلة: ' + fmt(s.send_bytes || 0);
    document.getElementById('stat-stability').textContent    = (h.stability_score || 100) + '%';
    document.getElementById('stat-stability-sub').textContent = 'فريز: ' + (h.freeze_count || 0);

    var statusVal = document.getElementById('stat-status');
    var statusSub = document.getElementById('stat-status-sub');
    if (isOnline) {
        statusVal.textContent  = 'مباشر';
        statusVal.style.color  = 'var(--green)';
        statusSub.textContent  = fmtDuration(d.uptime) + ' مستمر';
    } else {
        statusVal.textContent  = 'غير متصل';
        statusVal.style.color  = 'var(--red)';
        statusSub.textContent  = '--';
    }

    // Stream details
    // MediaMTX لا يوفّر width×height — نعرض N/A (أو "Live") بدل دقة وهمية
    var res = (vid.width && vid.height)
        ? vid.width + 'x' + vid.height + (vid.framerate ? ' @' + vid.framerate + 'fps' : '')
        : (isOnline ? 'N/A' : '--');
    document.getElementById('info-vcodec').textContent    = vid.codec    || '--';
    document.getElementById('info-resolution').textContent = res;
    document.getElementById('info-vprofile').textContent  = vid.framerate ? vid.framerate + ' fps' : (isOnline ? 'N/A' : '--');
    document.getElementById('info-acodec').textContent    = aud.codec    || '--';
    document.getElementById('info-samplerate').textContent = aud.samplerate ? aud.samplerate + ' Hz' : (isOnline ? 'N/A' : '--');
    document.getElementById('info-channels').textContent  = aud.channel  ? aud.channel + ' قناة' : (isOnline ? 'N/A' : '--');
    document.getElementById('info-send-speed').textContent = fmtKbps(kbps.send_30s || 0);
    document.getElementById('info-send-total').textContent = fmt(s.send_bytes || 0);

    // عند توقف البث: تصفير تفاصيل البث والمعدّلات فوراً حتى لا تبقى بيانات قديمة
    if (!isOnline) {
        ['info-vcodec','info-resolution','info-vprofile','info-acodec','info-samplerate','info-channels'].forEach(function(id){
            var e = document.getElementById(id); if (e) e.textContent = '--';
        });
        document.getElementById('stat-bitrate-recv').textContent = fmtKbps(0);
        document.getElementById('stat-bitrate-send').textContent = 'الإرسال: ' + fmtKbps(0);
        document.getElementById('home-bitrate').textContent      = fmtKbps(0);
        document.getElementById('home-bitrate-send').textContent = 'إرسال: ' + fmtKbps(0);
        document.getElementById('info-send-speed').textContent   = fmtKbps(0);
        var _ck = document.getElementById('chart-cur-kbps'); if (_ck) _ck.textContent = fmtKbps(0);
        var _sk = document.getElementById('chart-cur-send-kbps'); if (_sk) _sk.textContent = fmtKbps(0);
    }

    // Server Health — colour-coded warnings
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

    // Server totals (cumulative)
    var totals = d.totals || {};
    var elUp = document.getElementById('srv-uptime');
    if (elUp) elUp.textContent = fmtUptime(d.server_uptime || 0);
    var elSh = document.getElementById('total-stream-hours');
    if (elSh) elSh.textContent = fmtHours(totals.stream_seconds || 0);
    var elSs = document.getElementById('total-sessions-sub');
    if (elSs) elSs.textContent = (totals.sessions_count || 0) + ' جلسة بث';
    var elTd = document.getElementById('total-data');
    if (elTd) elTd.textContent = fmt(totals.recv_bytes || 0);
    var elTds = document.getElementById('total-data-sub');
    if (elTds) elTds.textContent = 'المُرسل للمشاهدين: ' + fmt(totals.sent_bytes || 0);

    // Bitrate chart — track send history client-side
    if (d.bitrate_history && d.bitrate_history.length) {
        chartHistory = d.bitrate_history;
        sendHistory.push({ts: Math.floor(Date.now()/1000), kbps: kbps.send_30s || 0});
        if (sendHistory.length > 60) sendHistory.shift();
        drawBitrateChart(chartHistory, sendHistory);
        var cur = chartHistory[chartHistory.length - 1];
        document.getElementById('chart-cur-kbps').textContent = fmtKbps(cur ? cur.kbps : 0);
        var _sk = document.getElementById('chart-cur-send-kbps');
        if (_sk) _sk.textContent = fmtKbps(kbps.send_30s || 0);
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
    document.getElementById('v-count').textContent = v.current || 0;
    document.getElementById('v-peak').textContent  = v.peak    || 0;

    renderBreakdown('devices-breakdown',   (d.stats || {}).devices,   deviceIcons);
    renderBreakdown('browsers-breakdown',  (d.stats || {}).browsers,  null);
    renderBreakdown('qualities-breakdown', (d.stats || {}).qualities, null);
    renderBreakdown('countries-breakdown', (d.stats || {}).countries, null);
    if (window.updateGeoMap) window.updateGeoMap((d.stats || {}).countries || {}, (d.geo_block || {}).blocked_countries || []);

    // Viewers table
    var viewersList = d.viewer_clients || [];
    document.getElementById('viewer-count-badge').textContent = viewersList.length;
    var vtbody = document.getElementById('viewers-tbody');
    if (viewersList.length === 0) {
        vtbody.innerHTML = '<tr><td colspan="6" class="empty-state">لا يوجد مشاهدون حالياً</td></tr>';
    } else {
        // Resolve source resolution from stream metadata (MediaMTX: often 0 → N/A)
        var srcVid   = ((d.stream || {}).video || {});
        var srcH     = srcVid.height || 0;
        var srcLabel = srcH >= 2160 ? '4K' : srcH >= 1080 ? '1080p' : srcH >= 720 ? '720p' : srcH >= 480 ? '480p' : srcH >= 360 ? '360p' : srcH > 0 ? srcH + 'p' : null;

        vtbody.innerHTML = viewersList.map(function(vi) {
            var di  = vi.device || 'unknown';
            var cls = deviceClasses[di] || 'device-unknown';
            // Dynamic Quality & Player Type rendering
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

    // Banned
    var banned     = d.banned || {};
    var bannedList = banned.list || [];
    document.getElementById('banned-count').textContent = banned.count || 0;
    var btbody = document.getElementById('banned-tbody');
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

    // Quality events
    renderQualityEvents(h.quality_events);

    // Player auth toggle
    var pa     = d.player_auth || {};
    var toggle = document.getElementById('player-auth-toggle');
    if (pa.enabled) { toggle.classList.add('active'); } else { toggle.classList.remove('active'); }

    // Stream password protection toggle & input UI population
    var passEnabled = d.stream_pass_enabled || false;
    var passToggle = document.getElementById('stream-pass-toggle');
    if (passToggle) {
        if (passEnabled) { passToggle.classList.add('active'); } else { passToggle.classList.remove('active'); }
    }
    var passInputRow = document.getElementById('stream-pass-input-row');
    if (passInputRow) {
        passInputRow.style.display = passEnabled ? 'block' : 'none';
    }

    // Populate settings inputs once
    if (!settingsInitialized) {
        var passInput = document.getElementById('stream-pass-input');
        if (passInput) passInput.value = d.stream_pass_value || '';

        settingsInitialized = true;
    }

    // تحديث قائمة الدول المحظورة في كل مرة
    var geo = d.geo_block || {};
    var geoInput = document.getElementById('geo-block-countries-input');
    if (geoInput) geoInput.value = (geo.blocked_countries || []).join(', ');

    // Geo-block toggle
    var geo = d.geo_block || {};
    var geoToggle = document.getElementById('geo-block-toggle');
    if (geoToggle) {
        if (geo.enabled) { geoToggle.classList.add('active'); } else { geoToggle.classList.remove('active'); }
    }

    // Home Sessions table
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

    // Sessions log full history — only render if user hasn't already loaded full list via refreshSessions
    var sessionsCb = document.querySelector('.session-cb');
    if (!sessionsCb) {
        _renderSessionsTable(d.sessions_summary || []);
    }

    _checkHealthAlerts(d);
}

// ===== BITRATE CHART (dual line: recv=cyan, send=amber) =====
function drawBitrateChart(history, sendHist) {
    var canvas = document.getElementById('bitrate-canvas');
    if (!canvas) return;
    var W = canvas.parentElement.clientWidth || 600;
    var H = 180;
    canvas.width  = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    if (!history || history.length < 2) {
        ctx.fillStyle = 'rgba(148,163,184,.2)';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('لا توجد بيانات بعد', W/2, H/2);
        return;
    }

    var recvVals = history.map(function(x){ return x.kbps; });
    var sendVals = (sendHist && sendHist.length >= 2) ? sendHist.map(function(x){ return x.kbps; }) : null;
    var allVals  = recvVals.concat(sendVals || []);
    var maxVal   = Math.max.apply(null, allVals) || 1;
    var pad = {top:16, right:16, bottom:28, left:52};
    var cw  = W - pad.left - pad.right;
    var ch  = H - pad.top  - pad.bottom;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.lineWidth   = 1;
    for (var g = 0; g <= 4; g++) {
        var gy = pad.top + ch - (g / 4) * ch;
        ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(pad.left + cw, gy); ctx.stroke();
        ctx.fillStyle = 'rgba(148,163,184,.5)';
        ctx.font      = '10px sans-serif';
        ctx.textAlign = 'right';
        var label = Math.round(maxVal * g / 4);
        ctx.fillText(label >= 1000 ? (label/1000).toFixed(1)+'M' : label+'K', pad.left - 4, gy + 3);
    }

    var xs = history.map(function(_, i){ return pad.left + (i / (history.length - 1)) * cw; });
    var ys = recvVals.map(function(v){ return pad.top + ch - (v / maxVal) * ch; });

    // Recv fill
    var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, 'rgba(34,211,238,.30)');
    grad.addColorStop(1, 'rgba(34,211,238,.02)');
    ctx.beginPath();
    ctx.moveTo(xs[0], pad.top + ch);
    xs.forEach(function(x, i){ ctx.lineTo(x, ys[i]); });
    ctx.lineTo(xs[xs.length - 1], pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Recv line
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    xs.forEach(function(x, i){ if (i > 0) ctx.lineTo(x, ys[i]); });
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(xs[xs.length-1], ys[ys.length-1], 4, 0, Math.PI*2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();

    // Send line (dashed amber)
    if (sendVals && sendVals.length >= 2) {
        var sxs = sendVals.map(function(_, i){ return pad.left + (i / (sendVals.length - 1)) * cw; });
        var sys = sendVals.map(function(v){ return pad.top + ch - (v / maxVal) * ch; });
        var sGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
        sGrad.addColorStop(0, 'rgba(245,158,11,.20)');
        sGrad.addColorStop(1, 'rgba(245,158,11,.02)');
        ctx.beginPath();
        ctx.moveTo(sxs[0], pad.top + ch);
        sxs.forEach(function(x, i){ ctx.lineTo(x, sys[i]); });
        ctx.lineTo(sxs[sxs.length-1], pad.top + ch);
        ctx.closePath();
        ctx.fillStyle = sGrad;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sxs[0], sys[0]);
        sxs.forEach(function(x, i){ if (i > 0) ctx.lineTo(x, sys[i]); });
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth   = 2;
        ctx.lineJoin    = 'round';
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(sxs[sxs.length-1], sys[sys.length-1], 4, 0, Math.PI*2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
    }

    // Time labels
    ctx.fillStyle = 'rgba(148,163,184,.5)';
    ctx.font      = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.setLineDash([]);
    var steps = Math.min(6, history.length - 1);
    for (var t = 0; t <= steps; t++) {
        var idx = Math.round(t / steps * (history.length - 1));
        var tx  = xs[idx];
        var ts  = history[idx].ts;
        var lbl = ts ? new Date(ts * 1000).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'}) : '';
        ctx.fillText(lbl, tx, H - 4);
    }
}

// ===== BREAKDOWN BARS =====
function renderBreakdown(elId, data, icons) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (!data || Object.keys(data).length === 0) {
        el.innerHTML = '<div class="empty-state">لا بيانات</div>';
        return;
    }
    var total  = Object.values(data).reduce(function(a,b){ return a+b; }, 0);
    var sorted = Object.entries(data).sort(function(a,b){ return b[1]-a[1]; });
    el.innerHTML = sorted.map(function(entry) {
        var key = entry[0], count = entry[1];
        var pct  = total > 0 ? Math.round(count/total*100) : 0;
        var icon = icons ? (icons[key] || '') : '';
        if (!icon && icons && elId === 'devices-breakdown') {
            var k = key.toLowerCase();
            if (k.includes('شاشة') || k.includes('تلفاز') || k.includes('tv') || k.includes('xbox') || k.includes('playstation') || k.includes('سويتش')) icon = '📺';
            else if (k.includes('آيفون') || k.includes('جوال') || k.includes('iphone') || k.includes('phone') || k.includes('موبايل')) icon = '📱';
            else if (k.includes('لوحي') || k.includes('تابلت') || k.includes('ipad') || k.includes('tablet') || k.includes('آيباد')) icon = '📱';
            else if (k.includes('كمبيوتر') || k.includes('ماك') || k.includes('mac') || k.includes('linux') || k.includes('ويندوز')) icon = '💻';
            else icon = '💻';
        }

        var prefix = '';
        if (icon) {
            prefix = icon + ' ';
        } else if (key.length === 2 && key === key.toUpperCase() && key !== 'UN') {
            var code = key.toLowerCase();
            prefix = '<img src="https://flagcdn.com/16x12/' + code + '.png" style="vertical-align:middle; margin-left:6px; border-radius:2px; box-shadow: 0 1px 2px rgba(0,0,0,0.2);" width="16" height="12"> ';
        } else if (key === 'local') {
            prefix = '🏠 ';
        } else if (key === 'UN') {
            prefix = '🌐 ';
        }

        var displayKey = key;
        if (key === 'local') displayKey = 'شبكة محلية';
        if (key === 'UN') displayKey = 'غير معروف';

        return '<div style="margin-bottom:10px">' +
            '<div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:4px">' +
                '<span style="display:flex;align-items:center;">' + prefix + displayKey + '</span>' +
                '<span style="color:var(--text2)">' + count + ' (' + pct + '%)</span>' +
            '</div>' +
            '<div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px">' +
                '<div style="height:100%;width:' + pct + '%;background:var(--indigo);border-radius:3px;transition:width .4s"></div>' +
            '</div>' +
        '</div>';
    }).join('');
}

// ===== QUALITY EVENTS =====
function renderQualityEvents(events) {
    var body = document.getElementById('events-body');
    if (!body) return;
    var list = (events || []).slice().reverse();
    if (list.length === 0) {
        body.innerHTML = '<div class="empty-state">لا توجد أحداث</div>';
    } else {
        body.innerHTML = list.map(function(e) {
            var level = e.level || 'warning';
            var msg   = e.message || e.msg || e.type || '';
            var t     = e.time   || e.ts   || 0;
            return '<div class="event-item">' +
                '<span class="event-dot ' + level + '"></span>' +
                '<span class="event-msg">' + msg + '</span>' +
                '<span class="event-time">' + fmtTime(t) + '</span>' +
            '</div>';
        }).join('');
    }
}

// ===== OBS WEBSOCKET =====
var _obsWs = null;
var _obsReady = false;
var _obsPending = {};

function _obsUrl()  { return localStorage.getItem('obs_ws_url')  || 'wss://your-domain.com/obs-ws/'; }
function _obsPass() { return localStorage.getItem('obs_ws_pass') || ''; }

function saveObsSettings() {
    localStorage.setItem('obs_ws_url',  document.getElementById('obs-ws-url').value.trim()  || 'ws://localhost:4455');
    localStorage.setItem('obs_ws_pass', document.getElementById('obs-ws-pass').value);
    if (_obsWs) { _obsWs.close(); _obsWs = null; _obsReady = false; }
    showToast('تم حفظ إعدادات OBS', 'success');
}

async function _sha256b64(str) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function _obsConnect(onReady) {
    if (_obsWs && _obsWs.readyState === WebSocket.OPEN && _obsReady) { onReady(); return; }
    if (_obsWs) _obsWs.close();
    _obsReady = false;
    _obsWs = new WebSocket(_obsUrl());

    _obsWs.onopen = function() {
        _setObsBadge('جاري الاتصال…', '#888');
    };
    _obsWs.onerror = function() {
        _setObsBadge('فشل الاتصال بـ OBS', 'var(--red)');
        showToast('تعذّر الاتصال بـ OBS WebSocket — تأكد من تشغيل WebSocket Server في OBS', 'error');
    };
    _obsWs.onclose = function() {
        _obsReady = false;
        _setObsBadge('غير متصل بـ OBS', 'var(--text3)');
    };
    _obsWs.onmessage = async function(e) {
        var m = JSON.parse(e.data);
        if (m.op === 0) {
            var auth = null;
            var pass = _obsPass();
            if (pass && m.d.authentication) {
                var secret = await _sha256b64(pass + m.d.authentication.salt);
                auth = await _sha256b64(secret + m.d.authentication.challenge);
            }
            var identify = {op:1, d:{rpcVersion:1, eventSubscriptions:0}};
            if (auth) identify.d.authentication = auth;
            _obsWs.send(JSON.stringify(identify));
        } else if (m.op === 2) {
            _obsReady = true;
            _setObsBadge('متصل بـ OBS ✓', 'var(--green)');
            onReady();
        } else if (m.op === 7) {
            var cb = _obsPending[m.d.requestId];
            if (cb) { cb(m.d); delete _obsPending[m.d.requestId]; }
        }
    };
}

function _obsReq(type, data, cb) {
    var id = Math.random().toString(36).slice(2);
    if (cb) _obsPending[id] = cb;
    _obsWs.send(JSON.stringify({op:6, d:{requestType:type, requestId:id, requestData: data||{}}}));
}

function _setObsBadge(text, color) {
    var b = document.getElementById('obs-conn-badge');
    if (b) { b.textContent = text; b.style.color = color; b.style.background = 'rgba(255,255,255,.06)'; }
}

function obsStreamControl(action) {
    var statusEl = document.getElementById('obs-stream-status');
    if (statusEl) statusEl.textContent = 'جاري الاتصال بـ OBS…';
    _obsConnect(function() {
        var req = action === 'start' ? 'StartStream' : 'StopStream';
        _obsReq(req, {}, function(resp) {
            var ok = resp.requestStatus && resp.requestStatus.result;
            if (ok) {
                showToast(action === 'start' ? '▶ تم بدء البث في OBS' : '⏹ تم إيقاف البث في OBS', 'success');
                if (statusEl) statusEl.textContent = '';
            } else {
                var reason = (resp.requestStatus && resp.requestStatus.comment) || 'خطأ غير معروف';
                showToast('فشل الأمر: ' + reason, 'error');
                if (statusEl) statusEl.textContent = 'فشل: ' + reason;
            }
        });
    });
}

function testObsConnection() {
    var res = document.getElementById('obs-test-result');
    res.textContent = 'جاري الاتصال…';
    res.style.color = 'var(--text3)';
    _obsConnect(function() {
        _obsReq('GetVersion', {}, function(resp) {
            var ver = resp.responseData && resp.responseData.obsVersion || '';
            res.textContent = '✓ OBS ' + ver;
            res.style.color = 'var(--green)';
        });
    });
}

// init OBS settings fields when settings tab opens
function _initObsFields() {
    var u = document.getElementById('obs-ws-url');
    var p = document.getElementById('obs-ws-pass');
    if (u && !u.value) u.value = localStorage.getItem('obs_ws_url') || 'wss://your-domain.com/obs-ws/';
    if (p && !p.value) p.value = localStorage.getItem('obs_ws_pass') || '';
}

// ===== ACTIONS =====
async function banIPDirect(ip) {
    var r = await apiPost('/ban', {ip: ip, reason: 'admin'});
    if (r && r.ok) { showToast('تم حظر ' + ip, 'success'); fetchData(); }
    else            { showToast('فشل الحظر', 'error'); }
}

async function banIP() {
    var ip     = document.getElementById('ban-ip-input').value.trim();
    var reason = document.getElementById('ban-reason-input').value.trim();
    if (!ip) return;
    var r = await apiPost('/ban', {ip: ip, reason: reason || 'admin'});
    if (r && r.ok) {
        showToast('تم حظر ' + ip, 'success');
        document.getElementById('ban-ip-input').value    = '';
        document.getElementById('ban-reason-input').value = '';
        fetchData();
    } else {
        showToast('فشل الحظر', 'error');
    }
}

async function unbanIP(ip) {
    var r = await apiDelete('/ban/' + ip);
    if (r && r.ok) { showToast('تم إلغاء حظر ' + ip, 'success'); fetchData(); }
    else            { showToast('فشل إلغاء الحظر', 'error'); }
}

async function deleteSession(id) {
    if (!confirm('هل أنت متأكد من حذف سجل هذا البث؟')) return;
    var r = await apiDelete('/sessions/' + id);
    if (r && r.ok) {
        showToast('تم حذف البث من السجل بنجاح', 'success');
        fetchData();
    } else {
        showToast('فشل حذف البث', 'error');
    }
}

function fmtBytes(bytes) {
    if (!bytes || bytes <= 0) return '—';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576)    return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
}

function _renderSessionsTable(sessions) {
    var stbody = document.getElementById('sessions-tbody');
    if (!stbody) return;
    var selAll = document.getElementById('select-all-cb');
    if (selAll) { selAll.checked = false; selAll.indeterminate = false; }

    if (!sessions || sessions.length === 0) {
        stbody.innerHTML = '<tr><td colspan="6" class="empty-state">لا توجد جلسات مسجلة</td></tr>';
        return;
    }
    stbody.innerHTML = sessions.map(function(s) {
        var sid = escHtml(s.id);
        var startStr = s.ended_at
            ? fmtDate(s.started_at)
            : fmtDate(s.started_at) + ' <span class="badge badge-green">مباشر</span>';
        var sizeBytes = s.total_recv_bytes || s.total_sent_bytes || 0;
        return '<tr>' +
            '<td><input type="checkbox" class="session-cb" value="' + sid + '" onchange="updateSessionDeleteBtn()"></td>' +
            '<td>' + startStr + '</td>' +
            '<td>' + fmtDuration(s.duration_s) + '</td>' +
            '<td><span class="badge badge-purple">' + fmtBytes(sizeBytes) + '</span></td>' +
            '<td><span class="badge badge-cyan">' + (s.peak_viewers || 0) + '</span></td>' +
            '<td><button class="btn btn-danger" onclick="deleteSession(\'' + sid + '\')">حذف</button></td>' +
        '</tr>';
    }).join('');
}

function toggleSelectAllSessions(cb) {
    document.querySelectorAll('.session-cb').forEach(function(c) { c.checked = cb.checked; });
    var selAll = document.getElementById('select-all-cb');
    if (selAll) {
        var total = document.querySelectorAll('.session-cb').length;
        var checked = document.querySelectorAll('.session-cb:checked').length;
        selAll.checked = total > 0 && checked === total;
        selAll.indeterminate = checked > 0 && checked < total;
    }
}

async function deleteAllSessions() {
    var total = document.querySelectorAll('.session-cb').length;
    if (total === 0) { showToast('لا توجد جلسات للحذف', 'info'); return; }
    if (!confirm('حذف جميع الجلسات (' + total + ')؟\nلا يمكن التراجع عن هذا الإجراء.')) return;
    var r = await apiDelete('/sessions');
    showToast(r && r.ok ? 'تم حذف جميع الجلسات' : 'فشل الحذف', r && r.ok ? 'success' : 'error');
    refreshSessions();
}

async function refreshSessions() {
    var btn = document.getElementById('refresh-sessions-btn');
    var origText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التحديث...'; }

    var data = await apiGet('/sessions');

    if (btn) { btn.disabled = false; btn.textContent = origText; }

    if (!data) { showToast('فشل التحديث', 'error'); return; }

    var sessions = data.sessions || [];
    _renderSessionsTable(sessions);
    showToast('تم التحديث — ' + sessions.length + ' جلسة', 'success');
}

async function toggleGeoBlock() {
    var toggle = document.getElementById('geo-block-toggle');
    var newState = !toggle.classList.contains('active');
    var countriesStr = document.getElementById('geo-block-countries-input').value;
    var countries = countriesStr.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 2);

    var r = await apiPost('/geo-block/config', {enabled: newState, blocked_countries: countries});
    if (r && r.ok) {
        showToast(newState ? 'تم تفعيل حظر الدول' : 'تم إيقاف حظر الدول', 'success');
        fetchData();
    } else {
        showToast('فشل تعديل حظر الدول', 'error');
    }
}

async function saveGeoBlock() {
    var toggle = document.getElementById('geo-block-toggle');
    var state = toggle.classList.contains('active');
    var countriesStr = document.getElementById('geo-block-countries-input').value;
    var countries = countriesStr.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length === 2);

    var r = await apiPost('/geo-block/config', {enabled: state, blocked_countries: countries});
    if (r && r.ok) {
        showToast('تم حفظ الدول المحظورة', 'success');
        fetchData();
    } else {
        showToast('فشل الحفظ', 'error');
    }
}

async function toggleStreamPassword() {
    var toggle = document.getElementById('stream-pass-toggle');
    var newState = !toggle.classList.contains('active');
    var passInputRow = document.getElementById('stream-pass-input-row');

    if (newState) {
        // Show password input first, then enable
        if (passInputRow) passInputRow.style.display = 'block';
        var passVal = document.getElementById('stream-pass-input').value.trim();
        if (!passVal) {
            showToast('اكتب كلمة المرور أولاً ثم اضغط حفظ', 'info');
            return;
        }
    }

    var passVal = document.getElementById('stream-pass-input').value.trim();
    var r = await apiPost('/stream/password-settings', {enabled: newState, password: passVal});
    if (r && r.ok) {
        showToast(newState ? 'تم تفعيل حماية البث بكلمة مرور' : 'تم إلغاء حماية البث', 'success');
        if (!newState && passInputRow) passInputRow.style.display = 'none';
        fetchData();
    } else {
        showToast('فشل تعديل حماية البث', 'error');
    }
}

async function saveStreamPassword() {
    var toggle = document.getElementById('stream-pass-toggle');
    var state = toggle.classList.contains('active');
    var passVal = document.getElementById('stream-pass-input').value.trim();
    
    if (!passVal) {
        showToast('يرجى إدخال كلمة المرور', 'error');
        return;
    }
    
    var r = await apiPost('/stream/password-settings', {enabled: state, password: passVal});
    if (r && r.ok) {
        showToast('تم حفظ كلمة مرور البث بنجاح', 'success');
        fetchData();
    } else {
        showToast('فشل حفظ كلمة المرور', 'error');
    }
}

async function clearStreamData() {
    if (!confirm('تنظيف جميع بيانات البث؟')) return;
    var r = await apiPost('/logs/clear', {});
    if (r && r.ok) { showToast('تم التنظيف', 'success'); fetchData(); }
}

async function clearAllBans() {
    if (!confirm('مسح جميع الحظورات؟')) return;
    var r = await apiPost('/bans/clear', {});
    if (r && r.ok) { showToast('تم مسح الحظورات', 'success'); fetchData(); }
    else            { showToast('فشل المسح', 'error'); }
}

async function clearLogs(target) {
    var r = await apiPost('/logs/clear', {target: target});
    if (r && r.ok) { showToast('تم المسح', 'success'); fetchData(); }
}

async function changePassword() {
    var oldP = document.getElementById('old-pass').value;
    var newP = document.getElementById('new-pass').value;
    if (newP.length < 6) { showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error'); return; }
    var r = await apiPost('/auth/change-password', {old_password: oldP, new_password: newP});
    if (r && r.ok) {
        showToast('تم تغيير كلمة المرور', 'success');
        document.getElementById('old-pass').value = '';
        document.getElementById('new-pass').value = '';
    } else {
        showToast((r && r.error) || 'كلمة المرور الحالية غير صحيحة', 'error');
    }
}

// ===== TABS =====
function switchTab(tab, el) {
    document.querySelectorAll('.nav-item').forEach(function(t){ t.classList.remove('active'); });
    if (el) el.classList.add('active');

    ['home','viewers','settings'].forEach(function(id){
        var elTab = document.getElementById('tab-'+id);
        if (elTab) elTab.style.display = tab === id ? 'block' : 'none';
    });

    if (tab === 'home' && chartHistory.length) {
        setTimeout(function(){ drawBitrateChart(chartHistory, sendHistory); }, 50);
    }
    if (tab === 'settings') {
        _initObsFields();
    }
}

// ===== CLOCK =====
function updateClock() {
    document.getElementById('header-time').textContent =
        new Date().toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

// ===== ENTER KEY =====
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') doLogin();
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
    var ht = document.getElementById('tab-home');
    if (chartHistory.length && ht && ht.style.display !== 'none') {
      drawBitrateChart(chartHistory, sendHistory);
    }
});

// ===== HEALTH ALERTS =====
var _bitrateZeroSince = null;
var _alertDismissedUntil = 0;

function dismissHealthAlert() {
    _alertDismissedUntil = Date.now() + 5 * 60 * 1000;
    var b = document.getElementById('health-alert-banner');
    if (b) b.classList.add('hidden');
}

function _checkHealthAlerts(d) {
    var sh  = d.server_health || {};
    var cpu = sh.cpu || 0;
    var ram = (sh.ram  || {}).percent || 0;
    var kbps     = ((d.stream || {}).kbps || {}).recv_30s || 0;
    var isOnline = (d.health || {}).status === 'online';

    // track zero-bitrate duration while online
    if (isOnline && kbps === 0) {
        if (!_bitrateZeroSince) _bitrateZeroSince = Date.now();
    } else {
        _bitrateZeroSince = null;
    }

    var problems = [];
    if (cpu >= 85) problems.push('المعالج ' + cpu + '% — تحميل بالغ');
    if (ram >= 90) problems.push('الذاكرة ' + ram + '% — قريبة من الامتلاء');
    if (_bitrateZeroSince && (Date.now() - _bitrateZeroSince) > 30000) {
        problems.push('معدل الإرسال صفر منذ ' + Math.round((Date.now() - _bitrateZeroSince) / 1000) + 'ث');
    }

    var banner = document.getElementById('health-alert-banner');
    var msgEl  = document.getElementById('health-alert-msg');
    if (!banner || !msgEl) return;

    if (!problems.length) {
        banner.classList.add('hidden');
        _alertDismissedUntil = 0;
        return;
    }
    if (Date.now() < _alertDismissedUntil) return;
    msgEl.textContent = '⚠ ' + problems.join(' | ');
    banner.classList.remove('hidden');
}

// ===== INTERACTIONS RESET =====
function resetInteractions() {
    if (!confirm('هل أنت متأكد من تصفير نتائج الاستطلاع والإعجابات؟')) return;
    _post('/tracker-api/interaction/reset', {}, function(r) {
        if (r && r.ok) {
            showToast('تم تصفير الاستطلاع بنجاح', 'success');
            fetchData();
        } else {
            showToast('فشل التصفير', 'error');
        }
    });
}
