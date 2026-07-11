var host = window.location.host;
var proto = window.location.protocol;
var RETRY_MS = 2000;
var STALL_MS  = 8000;

var retryTimer;
var _stallWatchdog  = null;
var _lastTimeUpdate = 0;
var isMuted = false;
var _autoplayBlocked = false;
var _tapCheckTimer = null;
var _videoEventsBound = false;

/* ── WebRTC ── */
var whepPc = null;
var whepWs = null;
var whepStream = null;

function _destroyWhep() {
  if (whepPc) { try { whepPc.close(); } catch(e) {} whepPc = null; }
  if (whepWs) { try { whepWs.close(); } catch(e) {} whepWs = null; }
  if (whepStream) { whepStream = null; }
}

function startWhep() {
  _destroyWhep();
  vid = _ensureVideoEl();
  if (!vid) { scheduleRetry(); return; }
  var vol = volSlider ? parseFloat(volSlider.value)/100 : 1;
  vid.volume = isNaN(vol) ? 1 : vol;
  vid.muted = isMuted;
  if (!_videoEventsBound) { initVideoEvents(vid); _videoEventsBound = true; }
  var connEl = document.getElementById('stat-conn');
  if (connEl) connEl.textContent = 'WebRTC';

  var wsProto = (proto === 'https:') ? 'wss:' : 'ws:';
  var wsUrl = wsProto + '//' + host + '/ws/live/stream';
  whepWs = new WebSocket(wsUrl);

  whepWs.onopen = function() {
    setOnline(true);
  };

  whepWs.onmessage = function(evt) {
    try {
      var msg = JSON.parse(evt.data);
    } catch(e) { return; }

    if (msg.command === 'offer') {
      var sdp = msg.sdp;
      whepPc = new RTCPeerConnection({ iceServers: [] });

      whepPc.ontrack = function(event) {
        if (event.streams && event.streams[0]) {
          whepStream = event.streams[0];
          vid.srcObject = whepStream;
          setOnline(true);
          _startStallWatchdog();
          vid.play().catch(function() { _showTapToPlay(); });
        }
      };

      whepPc.onicecandidate = function(event) {
        if (event.candidate && whepWs && whepWs.readyState === WebSocket.OPEN) {
          whepWs.send(JSON.stringify({
            command: 'candidate',
            id: msg.id,
            peer_id: msg.peer_id,
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          }));
        }
      };

      whepPc.oniceconnectionstatechange = function() {
        if (!whepPc) return;
        var st = whepPc.iceConnectionState;
        if (st === 'failed' || st === 'disconnected') {
          _stopStallWatchdog();
          _destroyWhep();
          scheduleRetry();
        }
      };

      whepPc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: sdp }))
        .then(function() { return whepPc.createAnswer(); })
        .then(function(answer) { return whepPc.setLocalDescription(answer); })
        .then(function() {
          if (whepWs && whepWs.readyState === WebSocket.OPEN) {
            whepWs.send(JSON.stringify({
              command: 'answer',
              id: msg.id,
              peer_id: msg.peer_id,
              sd: whepPc.localDescription.sdp
            }));
          }
        })
        .catch(function(err) {
          _destroyWhep();
          scheduleRetry();
        });
    }
  };

  whepWs.onerror = function() { _destroyWhep(); scheduleRetry(); };
  whepWs.onclose = function() {
    _stopStallWatchdog();
    if (whepPc) { _destroyWhep(); scheduleRetry(); }
  };
}

function _showTapToPlay() {
  _autoplayBlocked = true;
  var el = document.getElementById('tapToPlay');
  if (el) el.style.display = 'flex';
  offline.classList.add('hidden');
}
function _hideTapToPlay() {
  _autoplayBlocked = false;
  var el = document.getElementById('tapToPlay');
  if (el) el.style.display = 'none';
}
window.handleTapToPlay = function(e) {
  if (e) e.stopPropagation();
  _hideTapToPlay();
  if (vid) vid.play().catch(function(){});
};
var isDragging = false;

var vid = null;
var wrap = document.getElementById('ytWrap');
var offline = document.getElementById('ytOffline');

var bufferEl = document.getElementById('ytBuffer');

var progEl = document.getElementById('ytProg');
var fillEl = document.getElementById('hkProgressFilled');
var bufEl = document.getElementById('ytBuf');
var thumbEl = document.getElementById('hkProgressThumb');
var tipEl = document.getElementById('ytTip');

var volSlider = document.getElementById('ytVolSlider');
var timeEl = document.getElementById('ytTime');
var qWrap = document.getElementById('ytQWrap');
var qMenu = document.getElementById('ytQMenu');
var qLabel = document.getElementById('ytQLabel');

window.addEventListener('DOMContentLoaded', function() {
  initUIEvents();
  startPublicStatsPoller();
  initPlayer();
  loadStreamTitle();
  setInterval(loadStreamTitle, 30000);
  initCountdown();
  setInterval(updateTechStats, 1000);

  if (document.pictureInPictureEnabled) {
    var pipBtn = document.getElementById('ytPipBtn');
    if (pipBtn) pipBtn.style.display = 'flex';
    var contextPip = document.getElementById('context-pip-item');
    if (contextPip) contextPip.style.display = 'flex';
  }
});

function _startStallWatchdog() {
  clearInterval(_stallWatchdog);
  _lastTimeUpdate = Date.now();
  _stallWatchdog = setInterval(function() {
    if (!vid || vid.paused || _autoplayBlocked) { _lastTimeUpdate = Date.now(); return; }
    if (Date.now() - _lastTimeUpdate > STALL_MS) {
      _stopStallWatchdog();
      _destroyWhep();
      initPlayer();
    }
  }, 2000);
}

function _stopStallWatchdog() {
  clearInterval(_stallWatchdog);
  _stallWatchdog = null;
}

function _ensureVideoEl() {
  var el = document.getElementById('ytVideo');
  if (!el) return null;
  if (el.tagName !== 'VIDEO') {
    var v = document.createElement('video');
    v.id = 'ytVideo';
    v.setAttribute('playsinline', 'playsinline');
    v.setAttribute('webkit-playsinline', 'webkit-playsinline');
    v.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback noplaybackrate');
    v.disablePictureInPicture = true;
    v.style.cssText = 'width:100%;height:100%;position:absolute;inset:0;background:#000;object-fit:contain;';
    el.parentNode.replaceChild(v, el);
    el = v;
  }
  el.disablePictureInPicture = true;
  el.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback noplaybackrate');
  el.setAttribute('playsinline', 'playsinline');
  el.setAttribute('webkit-playsinline', 'webkit-playsinline');
  return el;
}

function proceedInitPlayer() {
  _stopStallWatchdog();
  _destroyWhep();
  vid = _ensureVideoEl();
  if (!vid) { scheduleRetry(); return; }
  var vol = volSlider ? parseFloat(volSlider.value) / 100 : 1;
  vid.volume = isNaN(vol) ? 1 : vol;
  vid.muted = isMuted;
  if (!_videoEventsBound) { initVideoEvents(vid); _videoEventsBound = true; }
  startWhep();
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(function() { initPlayer(); }, RETRY_MS);
}

var offlineDelayTimer = null;
function setOnline(on) {
  var pill = document.getElementById('live-pill');
  var txt = document.getElementById('live-text');
  if (on) {
    clearTimeout(offlineDelayTimer);
    offlineDelayTimer = null;
    clearTimeout(retryTimer);
    stream_meta.online = true;
    pill.className = 'live-pill on';
    txt.textContent = 'بث مباشر';
    offline.classList.add('hidden');
    var lb = document.getElementById('likes-bar'); if(lb) lb.style.display = 'block';
    var pBtn = document.getElementById('hdr-poll-btn');
    if(pBtn) pBtn.style.display = (localStorage.getItem('hk_poll_vote')) ? 'none' : '';
    stopCountdown();
    var textEl = document.getElementById('ytOfflineText');
    if (textEl) textEl.style.display = 'none';
  } else {
    if (!offlineDelayTimer) {
      offlineDelayTimer = setTimeout(function() {
        offlineDelayTimer = null;
        stream_meta.online = false;
        pill.className = 'live-pill off';
        txt.textContent = 'غير متصل';
        if (_cdTs) startCountdown(_cdTs);
        offline.classList.remove('hidden');
        bufferEl.classList.remove('show');
        var lb = document.getElementById('likes-bar'); if(lb) lb.style.display = 'none';
        var pBtn = document.getElementById('hdr-poll-btn'); if(pBtn) pBtn.style.display = 'none';
        var pModal = document.getElementById('poll-modal'); if(pModal) pModal.classList.remove('show');
      }, 5000);
    }
  }
}

var bufferTimeout = null;

function initVideoEvents(targetVid) {
  targetVid.addEventListener('playing', function() {
    clearTimeout(bufferTimeout);
    clearTimeout(_tapCheckTimer);
    _hideTapToPlay();
    bufferEl.classList.remove('show');
    setOnline(true);
    updatePlayIcons();
    _startStallWatchdog();
  });
  targetVid.addEventListener('pause', function() { _stopStallWatchdog(); updatePlayIcons(); });
  targetVid.addEventListener('ended', updatePlayIcons);
  targetVid.addEventListener('timeupdate', function() {
    _lastTimeUpdate = Date.now();
    updateProgress();
    if (!targetVid.paused) {
      clearTimeout(bufferTimeout);
      bufferEl.classList.remove('show');
    }
  });
  targetVid.addEventListener('waiting', function() {
    clearTimeout(bufferTimeout);
    bufferTimeout = setTimeout(function() {
      if (!targetVid.paused) bufferEl.classList.add('show');
    }, 1500);
  });
  targetVid.addEventListener('canplay', function() {
    clearTimeout(bufferTimeout);
    bufferEl.classList.remove('show');
  });
  targetVid.addEventListener('volumechange', updateVolIcons);
  targetVid.addEventListener('webkitbeginfullscreen', function() { updateFsIcons(true); });
  targetVid.addEventListener('webkitendfullscreen',   function() { updateFsIcons(false); });
}

function initUIEvents() {
  initTouchGestures();

  wrap.addEventListener('click', function(e) {
    if (e.target.closest('.yt-ctrl') ||
        e.target.closest('.yt-offline') ||
        e.target.closest('#tapToPlay')) return;
    if (vid) { showRipple(vid.paused); togglePlay(); }
  });
  wrap.addEventListener('dblclick', function(e) {
    if (e.target.closest('.yt-ctrl')) return;
    toggleFullscreen();
  });

  wrap.addEventListener('mousemove', function() {
    wrap.classList.add('show-ctrl');
    clearTimeout(wrap._mt);
    wrap._mt = setTimeout(function() { if (vid && !vid.paused) wrap.classList.remove('show-ctrl'); }, 2000);
  });

  wrap.addEventListener('touchstart', function() {
    wrap.classList.add('show-ctrl');
    clearTimeout(wrap._ct);
    wrap._ct = setTimeout(function() { wrap.classList.remove('show-ctrl'); }, 3500);
  }, { passive: true });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.yt-q-wrap')) qMenu.classList.remove('open');
  });

  document.addEventListener('fullscreenchange', function() {
    var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    updateFsIcons(on);
    if (!on) _unlockOrientation();
  });
  document.addEventListener('webkitfullscreenchange', function() {
    var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    updateFsIcons(on);
    if (!on) _unlockOrientation();
  });
}

function togglePlay() {
  if (!vid) return;
  if (vid.paused) vid.play().catch(function(){}); else vid.pause();
}
function updatePlayIcons() {
  if (!vid) return;
  document.getElementById('ytIcoPlay').style.display = vid.paused ? 'block' : 'none';
  document.getElementById('ytIcoPause').style.display = vid.paused ? 'none' : 'block';
}
function showRipple(type) {}

function goLive() {
  if (!vid) return;
  if (vid.paused) vid.play().catch(function(){});
  showToast('العودة للبث المباشر');
}

function updateProgress() {
  if (!progEl) return;
  if (vid) {
    progEl.style.display = 'none';
    timeEl.textContent = 'مباشر';
  }
}

function toggleMute() {
  isMuted = !isMuted;
  if (vid) vid.muted = isMuted;
  volSlider.value = isMuted ? 0 : (vid ? vid.volume * 100 : 100);
  updateVolIcons();
}
function setVolume(v) {
  if (vid) { vid.volume = v; vid.muted = (v === 0); }
  isMuted = (v === 0);
  updateVolIcons();
}
function updateVolIcons() {
  var v = (!vid || vid.muted || isMuted) ? 0 : vid.volume;
  document.getElementById('ytVolHigh').style.display = v > 0.5 ? 'block' : 'none';
  document.getElementById('ytVolLow').style.display  = (v > 0 && v <= 0.5) ? 'block' : 'none';
  document.getElementById('ytVolMute').style.display = v === 0 ? 'block' : 'none';
}

function toggleQMenu(e) {
  if (e) e.stopPropagation();
  qMenu.classList.toggle('open');
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function updateFsIcons(on) {
  var fsOn  = document.getElementById('ytFsOn');
  var fsOff = document.getElementById('ytFsOff');
  if (fsOn)  fsOn.style.display  = on ? 'none'  : 'block';
  if (fsOff) fsOff.style.display = on ? 'block' : 'none';
}
function toggleFakeFullscreen() {
  var on = !wrap.classList.contains('fake-fs');
  wrap.classList.toggle('fake-fs', on);
  document.body.classList.toggle('has-fake-fs', on);
  updateFsIcons(on);
  if (on) _lockLandscape(); else _unlockOrientation();
}
function _lockLandscape() {
  if (_isTouchDevice() && screen.orientation && screen.orientation.lock) {
    try { screen.orientation.lock('landscape').catch(function(){}); } catch(e) {}
  }
}
function _unlockOrientation() {
  if (screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch(e) {}
  }
}
function toggleFullscreen() {
  if (isIOS()) {
    if (vid && vid.webkitEnterFullscreen) {
      vid.webkitEnterFullscreen();
    } else {
      toggleFakeFullscreen();
    }
    return;
  }
  var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (!fsEl) {
    var req = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
    if (req) {
      var p = req.call(wrap);
      if (p && p.then) p.then(_lockLandscape).catch(function() { toggleFakeFullscreen(); });
      else _lockLandscape();
    }
    else { toggleFakeFullscreen(); }
  } else {
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document); else toggleFakeFullscreen();
  }
}

function toggleAspectRatio() {
  var videoEl = vid || document.getElementById('ytVideo');
  if (!videoEl) return;
  var isCover = videoEl.classList.contains('fit-cover');
  var isFill = videoEl.classList.contains('fit-fill');
  var label = '';
  if (!isCover && !isFill) {
    videoEl.classList.add('fit-cover');
    label = 'تكبير ملاءمة الشاشة (Zoom)';
  } else if (isCover) {
    videoEl.classList.remove('fit-cover');
    videoEl.classList.add('fit-fill');
    label = 'تمطيط ملء الشاشة (Stretch)';
  } else {
    videoEl.classList.remove('fit-fill');
    label = 'الأبعاد الأصلية 16:9';
  }
  showToast('نسبة الأبعاد: ' + label);
}

function updateTechStats() {
  if (!vid) return;
  var resEl = document.getElementById('stat-res');
  var bufEl2 = document.getElementById('stat-buf');
  if (resEl) {
    if (vid.videoWidth && vid.videoHeight) {
      resEl.textContent = vid.videoWidth + '×' + vid.videoHeight;
    } else {
      resEl.textContent = 'Live';
    }
  }
}

function toggleWideMode() {
  if (_isInFullscreen()) return;
  document.body.classList.toggle('player-compact');
  var wideBtn = document.getElementById('ytWideBtn');
  var isCompact = document.body.classList.contains('player-compact');
  if (wideBtn) wideBtn.classList.toggle('active', !isCompact);
  if (!isCompact) {
    var w = document.getElementById('ytWrap');
    if (w) w.classList.add('show-ctrl');
  }
  showToast(isCompact ? 'تصغير المشغل' : 'توسيط المشغل');
  window.dispatchEvent(new Event('resize'));
  if (vid) {
    vid.style.transform = 'scale(0.999)';
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        vid.style.transform = '';
        window.dispatchEvent(new Event('resize'));
      });
    });
  }
}

async function togglePiP() {
  try {
    if (vid !== document.pictureInPictureElement) {
      await vid.requestPictureInPicture();
    } else {
      await document.exitPictureInPicture();
    }
  } catch(e) {
    showToast('صورة داخل صورة غير مدعومة في هذا المتصفح');
  }
}

var _rotatedIntoFs = false;

function _isTouchDevice() {
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

function _isInFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement)
      || wrap.classList.contains('fake-fs');
}

function _handleOrientationChange() {
  if (!_isTouchDevice()) return;
  setTimeout(function() {
    var landscape = window.innerWidth > window.innerHeight;
    var isFakeFs  = wrap.classList.contains('fake-fs');
    var isRealFs  = !!(document.fullscreenElement || document.webkitFullscreenElement);

    if (landscape && !isFakeFs && !isRealFs) {
      _rotatedIntoFs = true;
      if (!wrap.classList.contains('fake-fs')) toggleFakeFullscreen();
    } else if (!landscape && _rotatedIntoFs) {
      _rotatedIntoFs = false;
      if (isFakeFs) toggleFakeFullscreen();
      else if (isRealFs) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
      }
    }
  }, 120);
}

window.addEventListener('orientationchange', _handleOrientationChange);
if (screen.orientation) screen.orientation.addEventListener('change', _handleOrientationChange);


document.addEventListener('keydown', function(e) {
  var tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  switch(e.key) {
    case ' ': case 'k': e.preventDefault(); if (vid) showRipple(vid.paused); togglePlay(); break;
    case 'f': case 'F': e.preventDefault(); toggleFullscreen(); break;
    case 'm': case 'M': e.preventDefault(); toggleMute(); break;
    case 'l': case 'L': e.preventDefault(); goLive(); break;
    case 'p': case 'P': e.preventDefault(); togglePiP(); break;
    case 'ArrowUp':   e.preventDefault(); if(vid){setVolume(Math.min(1,vid.volume+.1));volSlider.value=vid.volume*100;showToast('الصوت: '+Math.round(vid.volume*100)+'%');} break;
    case 'ArrowDown': e.preventDefault(); if(vid){setVolume(Math.max(0,vid.volume-.1));volSlider.value=vid.volume*100;showToast('الصوت: '+Math.round(vid.volume*100)+'%');} break;
  }
});



var statsEvtSource = null;
function startPublicStatsPoller() {
  pollStreamOnline();
  setInterval(pollStreamOnline, 3000);
  if (typeof EventSource !== 'undefined') {
    connectSSE();
  } else {
    pollStatsFallback();
    setInterval(pollStatsFallback, 2000);
  }
  sendHeartbeat();
  setInterval(sendHeartbeat, 2000);
}

function connectSSE() {
  if (statsEvtSource) statsEvtSource.close();
  statsEvtSource = new EventSource('/tracker-api/public/stats/live');
  statsEvtSource.onmessage = function(e) {
    try {
      var d = JSON.parse(e.data);
      if (d.action === 'kicked') { window.location.href = '/kicked.html'; return; }
      if (d.action === 'banned') { window.location.href = '/kicked.html'; return; }
      if (d.action === 'auth_changed') {
        if (d.enabled) { initAuth(); }
        else { hideGate(); initPlayer(); }
        return;
      }
      updateStatsUI(d.viewers, d.online);
    } catch(err) {}
  };
  statsEvtSource.onerror = function() {
    statsEvtSource.close();
    fetch('/tracker-api/player-auth/check', { cache: 'no-store' })
      .then(function(r) {
        if (r.status === 403) {
          return r.json().then(function(d) {
            if (d.error === 'kicked') { window.location.href = '/kicked.html'; }
            else if (d.error === 'banned') { window.location.href = '/kicked.html'; }
            else { setTimeout(connectSSE, 5000); }
          });
        } else {
          setTimeout(connectSSE, 5000);
        }
      })
      .catch(function() { setTimeout(connectSSE, 5000); });
  };
}

function pollStreamOnline() {
  fetch('/tracker-api/player-auth/check', { cache: 'no-store', method: 'GET' })
    .then(function(r) {
      if (r.status === 403) {
        if (typeof showGate === 'function') showGate();
      } else if (r.ok) {
        if (!whepWs || whepWs.readyState !== WebSocket.OPEN) initPlayer();
      }
    })
    .catch(function() {});
}

function showGate() {}
function hideGate() {}
function initAuth() {}

function pollStatsFallback() {
  fetch('/tracker-api/public/stats', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(d) { updateStatsUI(d.viewers, d.online); })
    .catch(function(){});
}

function loadStreamTitle() {
  fetch('/tracker-api/stream/title', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.title) {
        document.title = d.title + ' — بث مباشر';
      }
    })
    .catch(function(){});
}

function updateStatsUI(viewers, online) {
  var v = viewers || 0;
  var hv = document.getElementById('headViewersNum');
  if (hv && hv.textContent !== String(v)) animateNumberChange(hv, v);
  if (online !== undefined && !online) {
    if (!vid || vid.paused) setOnline(false);
  }
}

function animateNumberChange(el, targetVal) {
  el.style.transform = 'scale(0.8)'; el.style.opacity = '0';
  setTimeout(function() {
    el.textContent = targetVal; el.style.transform = 'scale(1)'; el.style.opacity = '1';
  }, 150);
}

function detectBrowser() {
  var ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Other';
}
function currentQualityLabel() {
  return 'WebRTC';
}
function sendHeartbeat() {
  fetch('/tracker-api/heartbeat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
    body: JSON.stringify({ quality: 'WebRTC', browser: detectBrowser(), player_type: 'main' })
  })
  .then(function(r) {
    if (r.status === 403) {
      return r.json().then(function(d) {
        if (d.error === 'banned') { window.location.href = '/kicked.html'; }
        else if (d.error === 'kicked') { window.location.href = '/kicked.html'; }
      });
    }
  })
  .catch(function(){});
}


/* ── COUNTDOWN ── */
var _cdInterval = null;
var _cdTs = null;

function initCountdown() {
  fetch('/tracker-api/next-match', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.ts) startCountdown(d.ts);
    })
    .catch(function() {});
  setInterval(function() {
    fetch('/tracker-api/next-match', { cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.ts !== _cdTs) {
          _cdTs = d.ts;
          if (d.ts) startCountdown(d.ts); else stopCountdown();
        }
      }).catch(function() {});
  }, 60000);
}

function startCountdown(ts) {
  _cdTs = ts;
  if (_cdInterval) clearInterval(_cdInterval);
  function tick() {
    var now = Math.floor(Date.now() / 1000);
    var diff = ts - now;
    var bar = document.getElementById('countdown-bar');
    var isOnline = stream_meta && stream_meta.online;
    if (!bar || diff <= 0 || isOnline) { stopCountdown(); return; }
    bar.classList.remove('hidden');
    var d = Math.floor(diff / 86400);
    var h = Math.floor((diff % 86400) / 3600);
    var m = Math.floor((diff % 3600) / 60);
    var s = diff % 60;
    function z(n) { return n < 10 ? '0' + n : '' + n; }
    document.getElementById('cd-d').textContent = z(d);
    document.getElementById('cd-h').textContent = z(h);
    document.getElementById('cd-m').textContent = z(m);
    document.getElementById('cd-s').textContent = z(s);
  }
  tick();
  _cdInterval = setInterval(tick, 1000);
}

function stopCountdown() {
  if (_cdInterval) { clearInterval(_cdInterval); _cdInterval = null; }
  var bar = document.getElementById('countdown-bar');
  if (bar) bar.classList.add('hidden');
}

var stream_meta = { online: false };

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function() { t.classList.remove('show'); }, 2200);
}

function initTouchGestures() {
  var brightnessOverlay = document.getElementById('brightness-overlay');
  var touchStartX = 0, touchStartY = 0;
  var isSwiping = false, swipeDirection = null, activeSide = null, initialVal = 0, lastTapTime = 0;

  wrap.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    var touch = e.touches[0];
    touchStartX = touch.clientX; touchStartY = touch.clientY;
    isSwiping = false; swipeDirection = null;
    var rect = wrap.getBoundingClientRect();
    var touchXRel = touchStartX - rect.left;
    if (touchXRel < rect.width / 2) {
      activeSide = 'left';
      var op = parseFloat(brightnessOverlay.style.opacity) || 0;
      initialVal = 1 - op;
    } else {
      activeSide = 'right';
      initialVal = vid ? vid.volume : 1;
    }
    var now = Date.now();
    var tapDelay = now - lastTapTime;
    if (tapDelay < 300 && tapDelay > 0) { e.preventDefault(); goLive(); lastTapTime = 0; return; }
    lastTapTime = now;
  }, { passive: false });

  wrap.addEventListener('touchmove', function(e) {
    if (e.touches.length !== 1) return;
    var touch = e.touches[0];
    var diffX = touch.clientX - touchStartX;
    var diffY = touch.clientY - touchStartY;
    if (!isSwiping) {
      if (Math.abs(diffY) > 10 && Math.abs(diffY) > Math.abs(diffX)) { isSwiping = true; swipeDirection = 'vertical'; }
      else if (Math.abs(diffX) > 10) { isSwiping = true; swipeDirection = 'horizontal'; }
    }
    if (isSwiping && swipeDirection === 'vertical') {
      e.preventDefault();
      var rect = wrap.getBoundingClientRect();
      var delta = -diffY / (rect.height || 200);
      var newVal = Math.max(0, Math.min(1, initialVal + delta));
      if (activeSide === 'left') {
        brightnessOverlay.style.opacity = (1 - newVal).toFixed(2);
        showToast('السطوع: ' + Math.round(newVal * 100) + '%');
      } else {
        setVolume(newVal); volSlider.value = newVal * 100;
        showToast('الصوت: ' + Math.round(newVal * 100) + '%');
      }
    }
  }, { passive: false });

  wrap.addEventListener('touchend', function(e) {
    if (isSwiping) e.preventDefault();
  }, { passive: false });
}


// ── STREAM PASSWORD PROTECTION WRAPPER ──
var passwordVerified = false;
var passwordCheckDone = false;

function initPlayer() {
  if (!passwordCheckDone) {
    fetch('/tracker-api/stream/password-check', { cache: 'no-store' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        passwordCheckDone = true;
        if (data.protected) {
          var savedPass = localStorage.getItem('stream_password') || '';
          if (savedPass) {
            verifyPassword(savedPass, true);
          } else {
            showPasswordOverlay();
          }
        } else {
          passwordVerified = true;
          proceedInitPlayer();
        }
      }).catch(function() {
        passwordCheckDone = true;
        passwordVerified = true;
        proceedInitPlayer();
      });
    return;
  }
  if (!passwordVerified) {
    showPasswordOverlay();
    return;
  }
  proceedInitPlayer();
}

function verifyPassword(pass, silent) {
  fetch('/tracker-api/stream/password-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.valid) {
      localStorage.setItem('stream_password', pass);
      passwordVerified = true;
      hidePasswordOverlay();
      proceedInitPlayer();
    } else {
      localStorage.removeItem('stream_password');
      if (!silent) {
        var err = document.getElementById('password-error');
        if (err) err.style.display = 'block';
        var inp = document.getElementById('stream-password-input');
        if (inp) {
          inp.style.borderColor = '#ff5555';
          inp.value = '';
        }
      } else {
        showPasswordOverlay();
      }
    }
  }).catch(function() {
    proceedInitPlayer();
  });
}

function showPasswordOverlay() {
  var ov = document.getElementById('password-overlay');
  if (ov) ov.style.display = 'flex';
}

function hidePasswordOverlay() {
  var ov = document.getElementById('password-overlay');
  if (ov) ov.style.display = 'none';
}

// ── INSTANT VIEWER LEAVE TRACKING ──
function sendLeaveBeacon() {
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/tracker-api/leave');
  } else {
    fetch('/tracker-api/leave', { method: 'POST', keepalive: true }).catch(function(){});
  }
}
window.addEventListener('beforeunload', sendLeaveBeacon);
window.addEventListener('pagehide', sendLeaveBeacon);
