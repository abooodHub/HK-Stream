// ===== STREAM PASSWORD =====
async function toggleStreamPassword() {
    var toggle = document.getElementById('stream-pass-toggle');
    var newState = !toggle.classList.contains('active');
    var passInputRow = document.getElementById('stream-pass-input-row');

    if (newState) {
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

// ===== CHANGE PASSWORD =====
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

// ===== FOOTBALL API =====
function saveFootballApiKey() {
    var key = document.getElementById('football-api-key-input').value.trim();
    var st  = document.getElementById('football-api-key-status');
    if (!key) { st.textContent = 'أدخل المفتاح أولاً'; st.style.color='var(--red)'; return; }
    st.textContent = 'جارٍ الحفظ…'; st.style.color='var(--text3)';
    fetch('/tracker-api/football-api-key', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
        body: JSON.stringify({key: key})
    })
    .then(function(r){ return r.json(); })
    .then(function(r) {
        if (r.ok) {
            document.getElementById('football-api-key-input').value = '';
            st.textContent = '✓ تم الحفظ بنجاح — سيُستخدم المفتاح الجديد فوراً';
            st.style.color = 'var(--green)';
        } else {
            st.textContent = 'فشل الحفظ';
            st.style.color = 'var(--red)';
        }
    })
    .catch(function(){ st.textContent = 'خطأ في الاتصال'; st.style.color='var(--red)'; });
}

function loadFootballApiKeyStatus() {
    fetch('/tracker-api/football-api-key', { headers: {'Authorization':'Bearer '+token} })
      .then(function(r){ return r.json(); })
      .then(function(d) {
        var st = document.getElementById('football-api-key-status');
        if (!st) return;
        if (d.set) {
          st.textContent = 'المفتاح الحالي: ' + d.masked;
          st.style.color = 'var(--green)';
        } else {
          st.textContent = 'لا يوجد مفتاح محفوظ — يُقرأ من متغير البيئة إن وُجد';
          st.style.color = 'var(--text3)';
        }
      }).catch(function(){});
}

// ===== DATA RESET =====
async function clearStreamData() {
    if (!confirm('تنظيف جميع بيانات البث؟')) return;
    var r = await apiPost('/logs/clear', {});
    if (r && r.ok) { showToast('تم التنظيف', 'success'); fetchData(); }
}

// ===== AUDIT LOG =====
var AUDIT_LABELS = { login:'دخول', ban:'حظر', unban:'رفع حظر', kick:'طرد', unkick:'رفع طرد',
    kicks_clear:'مسح الطرد', logs_clear:'مسح السجلات', bans_clear:'مسح الحظر', stream_gate:'إظهار/إخفاء البث',
    stream_key:'مفتاح البث', player_auth:'حماية المشاهدة', geo_block:'حظر الدول',
    change_password:'كلمة المرور', audit_clear:'مسح التدقيق' };

function _escA(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

function loadAuditLog(){
    var tb = document.getElementById('audit-tbody'); if (!tb) return;
    fetch('/tracker-api/audit', { headers:{'Authorization':'Bearer '+token} })
      .then(function(r){ return r.json(); })
      .then(function(d){
        var rows = (d.entries || []);
        if (!rows.length) { tb.innerHTML = '<tr><td colspan="4" class="empty-state">لا توجد أحداث مسجلة</td></tr>'; return; }
        tb.innerHTML = rows.map(function(e){
          var lbl = AUDIT_LABELS[e.action] || e.action || '';
          return '<tr><td style="white-space:nowrap;font-variant-numeric:tabular-nums">' + _escA(e.ts_formatted) + '</td>' +
            '<td><span class="badge badge-gray">' + _escA(lbl) + '</span></td>' +
            '<td>' + _escA(e.detail) + '</td>' +
            '<td style="font-variant-numeric:tabular-nums">' + _escA(e.ip) + '</td></tr>';
        }).join('');
      })
      .catch(function(){ showToast('تعذّر تحميل السجل'); });
}

function clearAuditLog(){
    if (!confirm('مسح كامل سجل التدقيق؟')) return;
    fetch('/tracker-api/audit', { method:'DELETE', headers:{'Authorization':'Bearer '+token} })
      .then(function(r){ return r.json(); })
      .then(function(r){ if (r && r.ok) { showToast('تم مسح السجل'); loadAuditLog(); } });
}

// ===== SETTINGS PAGE INIT =====
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(loadFootballApiKeyStatus, 800);
    loadAuditLog();
});
