// ===== BITRATE CHART =====
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

// ===== SESSIONS =====
function _csvEsc(v){ var t = String(v==null?'':v); return /[",\n\r]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; }

function exportSessionsCSV(){
    fetch('/tracker-api/sessions', { headers:{'Authorization':'Bearer '+token} })
      .then(function(r){ return r.json(); })
      .then(function(d){
        var s = (d.sessions || []);
        if (!s.length) { showToast('لا توجد جلسات للتصدير'); return; }
        var fmt = function(ts){ return ts ? new Date(ts*1000).toISOString().replace('T',' ').slice(0,19) : ''; };
        var hdr = ['المعرف','وقت البدء','وقت الانتهاء','المدة (ث)','أقصى مشاهدين','متوسط مشاهدين','بايت مستلم','بايت مرسل'];
        var lines = [ hdr.map(_csvEsc).join(',') ];
        s.forEach(function(x){
          lines.push([ x.id, fmt(x.started_at), fmt(x.ended_at), x.duration_s||0, x.peak_viewers||0,
                       x.avg_viewers||0, x.total_recv_bytes||0, x.total_sent_bytes||0 ].map(_csvEsc).join(','));
        });
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type:'text/csv;charset=utf-8' });
        var url  = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'hk-sessions-' + new Date().toISOString().slice(0,10) + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
        showToast('تم تصدير ' + s.length + ' جلسة');
      })
      .catch(function(){ showToast('فشل التصدير'); });
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

// ===== INTERACTIONS RESET =====
function resetInteractions() {
    if (!confirm('هل أنت متأكد من تصفير نتائج الاستطلاع والإعجابات؟')) return;
    fetch('/tracker-api/interaction/reset', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}
    })
    .then(function(r){ return r.json(); })
    .then(function(r) {
        if (r && r.ok) {
            showToast('تم تصفير الاستطلاع بنجاح', 'success');
            fetchData();
        } else {
            showToast('فشل التصفير', 'error');
        }
    })
    .catch(function(){ showToast('خطأ في الاتصال'); });
}
