// ===== GEO MAP =====
var _geoMap = null, _geoVals = {}, _blockedList = [], _activeCounts = {};

function ensureGeoMap(){
    if (_geoMap) return _geoMap;
    var el = document.getElementById('geo-map');
    if (!el || !el.offsetParent) return null;
    if (typeof jsVectorMap === 'undefined') return null;
    try {
      _geoMap = new jsVectorMap({
        selector: '#geo-map', map: 'world',
        zoomButtons: true, zoomOnScroll: false, backgroundColor: '#0d0d1a',
        regionStyle: {
          initial: { fill: '#141424', stroke: 'rgba(255, 255, 255, 0.05)', 'stroke-width': 0.5 },
          hover: { fill: 'rgba(201, 162, 39, 0.4)' },
          selected: { fill: 'rgba(201, 162, 39, 0.55)', stroke: 'rgba(201, 162, 39, 0.8)', 'stroke-width': 1.5 }
        },
        series: {
          regions: [{
            attribute: 'fill',
            scale: {
              'blocked': 'rgba(239, 68, 68, 0.8)',
              'active': 'rgba(201, 162, 39, 0.8)',
              'default': '#141424'
            },
            values: {}
          }]
        },
        onRegionTooltipShow: function(event, tooltip, code){
          var isBlocked = _blockedList.indexOf(code.toUpperCase()) > -1;
          var activeCount = _activeCounts[code.toUpperCase()] || 0;
          var txt = tooltip.text();
          if (isBlocked) {
            tooltip.text(txt + ' (محظورة 🚫)', true);
          } else if (activeCount > 0) {
            tooltip.text(txt + ' — ' + activeCount + ' مشاهد 👤', true);
          } else {
            tooltip.text(txt + ' (اضغط لحظر هذه الدولة 🔒)', true);
          }
        },
        onRegionClick: function(event, code) {
          toggleCountryBlockDirectly(code.toUpperCase());
        }
      });
    } catch(e){ _geoMap = null; }
    return _geoMap;
}

window.updateGeoMap = function(activeCountries, blockedList){
    var m = ensureGeoMap();

    var resetVals = {};
    Object.keys(_geoVals).forEach(function(cc) {
      resetVals[cc] = 'default';
    });
    if (m) {
      try { m.series.regions[0].setValues(resetVals); } catch(e){}
    }

    _blockedList = (blockedList || []).map(function(c) { return c.toUpperCase(); });
    _activeCounts = {};

    var vals = {};

    _blockedList.forEach(function(cc) {
      vals[cc] = 'blocked';
    });

    var activeCountNum = 0;
    Object.keys(activeCountries || {}).forEach(function(cc){
      if (!cc || cc === 'UN' || cc === 'local') return;
      var upperCc = cc.toUpperCase();
      _activeCounts[upperCc] = activeCountries[cc];
      if (_blockedList.indexOf(upperCc) === -1) {
        vals[upperCc] = 'active';
      }
      activeCountNum++;
    });

    _geoVals = vals;

    var badge = document.getElementById('geo-map-count');
    if (badge) badge.textContent = activeCountNum + ' دولة نشطة';

    if (m) {
      try {
        m.series.regions[0].setValues(_geoVals);
      } catch(e){}
    }
};

async function toggleCountryBlockDirectly(code) {
    var isBlocked = _blockedList.indexOf(code) > -1;
    var newBlocked = [];
    if (isBlocked) {
      newBlocked = _blockedList.filter(function(c) { return c !== code; });
    } else {
      newBlocked = _blockedList.concat([code]);
    }

    var r = await apiPost('/geo-block/config', { enabled: true, blocked_countries: newBlocked });
    if (r && r.ok) {
      _blockedList = newBlocked;
      var vals = {};
      newBlocked.forEach(function(cc) { vals[cc] = 'blocked'; });
      Object.keys(_activeCounts).forEach(function(cc) {
        if (newBlocked.indexOf(cc) === -1) vals[cc] = 'active';
      });
      _geoVals = vals;
      if (_geoMap) {
        try { _geoMap.series.regions[0].setValues(vals); } catch(e){}
      }
      var geoInput = document.getElementById('geo-block-countries-input');
      if (geoInput) geoInput.value = newBlocked.join(', ');
      var toggle = document.getElementById('geo-block-toggle');
      if (toggle) toggle.classList.add('active');
      showToast(isBlocked ? 'تم إلغاء حظر ' + code : 'تم حظر ' + code + ' بنجاح 🚫', 'success');
    } else {
      showToast('فشل تعديل حظر الدولة', 'error');
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

// ===== BAN =====
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

async function clearAllBans() {
    if (!confirm('مسح جميع الحظورات؟')) return;
    var r = await apiPost('/bans/clear', {});
    if (r && r.ok) { showToast('تم مسح الحظورات', 'success'); fetchData(); }
    else            { showToast('فشل المسح', 'error'); }
}

// ===== GEO BLOCK =====
async function toggleGeoBlock() {
    var toggle = document.getElementById('geo-block-toggle');
    var newState = !toggle.classList.contains('active');
    var countriesStr = document.getElementById('geo-block-countries-input').value;
    var countries = countriesStr.split(',').map(function(s){ return s.trim().toUpperCase(); }).filter(function(s){ return s.length === 2; });

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
    var countries = countriesStr.split(',').map(function(s){ return s.trim().toUpperCase(); }).filter(function(s){ return s.length === 2; });

    var r = await apiPost('/geo-block/config', {enabled: state, blocked_countries: countries});
    if (r && r.ok) {
        showToast('تم حفظ الدول المحظورة', 'success');
        fetchData();
    } else {
        showToast('فشل الحفظ', 'error');
    }
}

// ===== VIEWERS PAGE INIT =====
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function(){ var m = ensureGeoMap(); if (m) { try { m.updateSize(); } catch(e){} } }, 200);
});
