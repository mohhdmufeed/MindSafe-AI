/* ═══════════════════════════════════════════════
   MindSafe AI — Main Chat Logic
   Author: Mohammed Mufeed
   ═══════════════════════════════════════════════ */

/* ─── Init ─── */
let time = new Date();
$('.set-time').text(formatTime(time));

// Theme persistence
const savedTheme = localStorage.getItem('mindsafe-theme') || 'dark';
setTheme(savedTheme);

// Voice recognition instance
let recognition = null;
let isRecording  = false;

// History stored in localStorage
let analysisHistory = JSON.parse(localStorage.getItem('mindsafe-history') || '[]');
renderHistoryPanel();

/* ─── Utilities ─── */
function formatTime(d) {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function scrollToBottom() {
  const chat = document.getElementById('chatArea');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function getRiskClass(level) {
  const map = { Safe:'safe', Moderate:'moderate', High:'high', Critical:'critical' };
  return map[level] || 'safe';
}

function getRiskIcon(level) {
  const map = {
    Safe:     'fa-shield-check',
    Moderate: 'fa-triangle-exclamation',
    High:     'fa-circle-exclamation',
    Critical: 'fa-skull-crossbones',
  };
  return map[level] || 'fa-question';
}

/* ─── Theme Toggle ─── */
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mindsafe-theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}

/* ─── Voice Input ─── */
function toggleVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Voice input is not supported in your browser. Try Chrome or Edge.');
    return;
  }

  if (isRecording) {
    recognition.stop();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    isRecording = true;
    $('#micBtn').addClass('recording');
    $('#micIcon').attr('class', 'fas fa-stop');
    $('#user-input').attr('placeholder', '🎙️ Listening...');
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    $('#user-input').val(transcript);
  };

  recognition.onend = () => {
    isRecording = false;
    $('#micBtn').removeClass('recording');
    $('#micIcon').attr('class', 'fas fa-microphone');
    $('#user-input').attr('placeholder', 'Type or speak a message to analyze...');
    const val = $('#user-input').val().trim();
    if (val) submitHandler();
  };

  recognition.onerror = (e) => {
    isRecording = false;
    $('#micBtn').removeClass('recording');
    $('#micIcon').attr('class', 'fas fa-microphone');
    $('#user-input').attr('placeholder', 'Type or speak a message to analyze...');
  };

  recognition.start();
}

/* ─── History Panel ─── */
function toggleHistory() {
  $('#historyPanel, #historyOverlay').toggleClass('open');
}

function renderHistoryPanel() {
  const body = $('#historyBody');
  if (!analysisHistory.length) {
    body.html('<p class="empty-history">No analyses yet. Send a message to begin.</p>');
    return;
  }
  const items = [...analysisHistory].reverse().map(h => {
    const rc = getRiskClass(h.risk_level);
    return `
      <div class="history-item">
        <div class="history-item-top">
          <span class="history-item-risk risk-badge risk-${rc}">
            <i class="fas ${getRiskIcon(h.risk_level)}"></i> ${h.risk_level}
          </span>
          <span class="history-item-time">${h.timestamp}</span>
        </div>
        <div class="history-item-text">${escapeHtml(h.text)}</div>
        <div class="history-item-score">Score: ${h.severity_score}/100 &nbsp;|&nbsp; RF: ${h.ml_confidence}% &nbsp;|&nbsp; LSTM: ${h.dl_confidence}%</div>
      </div>`;
  }).join('');
  body.html(items);
}

function clearHistory() {
  analysisHistory = [];
  localStorage.setItem('mindsafe-history', '[]');
  renderHistoryPanel();
}

function saveToHistory(result, text) {
  const entry = {
    text:           text.substring(0, 120),
    risk_level:     result.risk_level,
    severity_score: result.severity_score,
    ml_confidence:  result.ml_confidence,
    dl_confidence:  result.dl_confidence,
    emotions:       result.emotions || [],
    timestamp:      formatTime(new Date()),
  };
  analysisHistory.push(entry);
  if (analysisHistory.length > 100) analysisHistory.shift();
  localStorage.setItem('mindsafe-history', JSON.stringify(analysisHistory));
  renderHistoryPanel();
}

/* ─── Crisis Modal ─── */
function showCrisisModal() {
  $('#crisisOverlay').addClass('open');
}
function closeCrisisModal() {
  $('#crisisOverlay').removeClass('open');
}

/* ─── Build Result Card HTML ─── */
function buildResultCard(res) {
  const rc    = getRiskClass(res.risk_level);
  const icon  = getRiskIcon(res.risk_level);
  const score = res.severity_score;

  // Confidence bars
  const mlPct = res.ml_confidence;
  const dlPct = res.dl_confidence;

  // Model verdicts
  const mlVerdict = res.ml_pred === 1
    ? `<div class="verdict-pill verdict-suicidal"><strong>Random Forest</strong>⚠️ Suicidal</div>`
    : `<div class="verdict-pill verdict-safe-pill"><strong>Random Forest</strong>✅ Safe</div>`;
  const dlVerdict = res.dl_pred === 1
    ? `<div class="verdict-pill verdict-suicidal"><strong>BiLSTM</strong>⚠️ Suicidal</div>`
    : `<div class="verdict-pill verdict-safe-pill"><strong>BiLSTM</strong>✅ Safe</div>`;

  // Risk words
  const wordChips = (res.top_risk_words || []).length
    ? `<div class="risk-words-section">
         <div class="section-label">🔑 Key Risk Words</div>
         <div class="risk-words-chips">${(res.top_risk_words).map(w => `<span class="risk-chip">${escapeHtml(w)}</span>`).join('')}</div>
       </div><div class="result-divider"></div>`
    : '';

  // Emotions
  const emotions = (res.emotions || []);
  const emotionTags = emotions.length
    ? `<div class="emotions-section">
         <div class="section-label">🧠 Detected Emotions</div>
         <div class="emotion-tags">${emotions.map(e => `<span class="emotion-tag emotion-${e}">${e}</span>`).join('')}</div>
       </div><div class="result-divider"></div>`
    : '';

  return `
    <div class="prediction-block risk-${rc}">
      <div class="risk-header risk-${rc}">
        <span class="risk-badge risk-${rc}">
          <i class="fas ${icon}"></i> ${res.risk_level} Risk
        </span>
        <span class="risk-score-label risk-${rc}">${score}<small style="font-size:0.65em;opacity:0.7">/100</small></span>
      </div>

      <div class="severity-bar-wrap">
        <div class="severity-bar-track">
          <div class="severity-bar-fill risk-${rc}" style="width:0%" data-width="${score}%"></div>
        </div>
      </div>

      <div class="result-body">
        <div class="model-verdicts">${mlVerdict}${dlVerdict}</div>
        <div class="result-divider"></div>

        <div class="confidence-section">
          <div class="section-label">📊 Model Confidence</div>
          <div class="confidence-row">
            <span class="conf-model-name">RF</span>
            <div class="conf-track"><div class="conf-fill" style="width:0%" data-width="${mlPct}%"></div></div>
            <span class="conf-pct">${mlPct}%</span>
          </div>
          <div class="confidence-row">
            <span class="conf-model-name">LSTM</span>
            <div class="conf-track"><div class="conf-fill" style="width:0%" data-width="${dlPct}%"></div></div>
            <span class="conf-pct">${dlPct}%</span>
          </div>
        </div>

        <div class="result-divider"></div>
        ${wordChips}
        ${emotionTags}
      </div>
    </div>`;
}

/* ─── Animate bars after insert ─── */
function animateBars() {
  setTimeout(() => {
    document.querySelectorAll('[data-width]').forEach(el => {
      el.style.width = el.getAttribute('data-width');
      el.removeAttribute('data-width');
    });
  }, 80);
}

/* ─── Loading Bubble ─── */
function addLoadingBubble() {
  const id = 'loading-' + Date.now();
  $('#chatArea').append(`
    <div class="msg left-msg" id="${id}">
      <div class="msg-avatar msg-avatar-bot"><i class="fas fa-robot"></i></div>
      <div class="msg-bubble">
        <div class="msg-info">
          <div class="msg-info-name">MindSafe Bot</div>
          <div class="msg-info-time">${formatTime(new Date())}</div>
        </div>
        <div class="msg-text">
          <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    </div>`);
  scrollToBottom();
  return id;
}

/* ─── Core Prediction Request ─── */
function getPredictions(text) {
  // Append user message
  $('#chatArea').append(`
    <div class="msg right-msg">
      <div class="msg-avatar msg-avatar-user"><i class="fas fa-user"></i></div>
      <div class="msg-bubble">
        <div class="msg-info">
          <div class="msg-info-name">You</div>
          <div class="msg-info-time">${formatTime(new Date())}</div>
        </div>
        <div class="msg-text">${escapeHtml(text)}</div>
      </div>
    </div>`);
  scrollToBottom();

  // Disable send during request
  $('#sendBtn').prop('disabled', true);
  const loadingId = addLoadingBubble();

  $.ajax({
    url:    '/predict',
    method: 'POST',
    data:   { text },
    success: function(res) {
      $(`#${loadingId}`).remove();
      $('#sendBtn').prop('disabled', false);

      if (res.status !== 200) {
        appendErrorMsg('Sorry, an error occurred during analysis.');
        return;
      }

      // Build result
      const cardHtml = buildResultCard(res);

      $('#chatArea').append(`
        <div class="msg left-msg result-card">
          <div class="msg-avatar msg-avatar-bot"><i class="fas fa-robot"></i></div>
          <div class="msg-bubble" style="padding:0;background:transparent;border:none;">
            <div class="msg-info" style="padding:0 0 10px 0;">
              <div class="msg-info-name">MindSafe Bot</div>
              <div class="msg-info-time">${formatTime(new Date())}</div>
            </div>
            ${cardHtml}
          </div>
        </div>`);

      animateBars();
      scrollToBottom();

      // Save to history
      saveToHistory(res, text);

      // Show crisis modal if High or Critical
      if (res.risk_level === 'High' || res.risk_level === 'Critical') {
        setTimeout(showCrisisModal, 600);
      }
    },
    error: function() {
      $(`#${loadingId}`).remove();
      $('#sendBtn').prop('disabled', false);
      appendErrorMsg('Connection error. Please check that the server is running.');
    }
  });
}

function appendErrorMsg(msg) {
  $('#chatArea').append(`
    <div class="msg left-msg">
      <div class="msg-avatar msg-avatar-bot"><i class="fas fa-robot"></i></div>
      <div class="msg-bubble">
        <div class="msg-info"><div class="msg-info-name">MindSafe Bot</div></div>
        <div class="msg-text" style="color:#f87171;">${escapeHtml(msg)}</div>
      </div>
    </div>`);
  scrollToBottom();
}

/* ─── Submit Handler ─── */
function submitHandler() {
  const input = $('#user-input').val().trim();
  if (!input) return;
  $('#user-input').val('');
  getPredictions(input);
}

// Enter key submit
$('#user-input').on('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitHandler();
  }
});
