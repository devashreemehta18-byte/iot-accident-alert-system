/**
 * CRASHGUARD IoT - High-Performance Application Controller
 * Real-time MPU6050 telemetry, Web Serial API, Emergency SMS/WhatsApp to +91 9265843734,
 * Desktop Web Notifications, and Leaflet Map Tracking.
 */

const state = {
  connected: false,
  vehicleStatus: "NORMAL",
  buzzerStatus: "OFF",
  ax: 0.0,
  ay: 0.0,
  az: 9.81,
  totalAccel: 9.81,
  fixedLat: 23.203549,
  fixedLon: 72.583860,
  googleMapsUrl: "https://www.google.com/maps?q=23.203549,72.583860",
  emergencyPhone: "+919265843734",
  rawPhone: "9265843734",
  audioMuted: false,
  isAccidentActive: false,
  serialPaused: false,
  hasRequestedNotification: false
};

// -----------------------------------------------------------------------------
// Audio Alarm Synthesizer (Web Audio API)
// -----------------------------------------------------------------------------
let audioCtx = null;
let sirenInterval = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
}

function playSirenTone() {
  if (state.audioMuted || !audioCtx) return;
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(950, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(560, audioCtx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) {}
}

function startSiren() {
  if (sirenInterval) return;
  initAudio();
  playSirenTone();
  sirenInterval = setInterval(playSirenTone, 450);
}

function stopSiren() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
}

// -----------------------------------------------------------------------------
// Browser Native Desktop Push Notifications
// -----------------------------------------------------------------------------
function requestNotificationPermission() {
  if ("Notification" in window) {
    Notification.requestPermission().then((permission) => {
      state.hasRequestedNotification = true;
      if (permission === "granted") {
        appendSerialLog("Desktop notifications authorized.", "dispatch");
      }
    });
  }
}

function triggerDesktopNotification(peakMagnitude) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("CRITICAL VEHICLE ACCIDENT DETECTED!", {
        body: `Emergency Alert Dispatched to ${state.emergencyPhone}!\nPeak Impact: ${peakMagnitude.toFixed(2)} m/s²\nLocation: ${state.fixedLat}, ${state.fixedLon}\nBuzzer Active on Pin D8.`,
        icon: "https://maps.google.com/mapfiles/kml/shapes/caution.png",
        requireInteraction: true
      });
    } catch (e) {}
  }
}

// -----------------------------------------------------------------------------
// Sliding In-App Emergency Notification Toast
// -----------------------------------------------------------------------------
function showEmergencyToast(peakMagnitude) {
  const toast = document.getElementById("emergencyToast");
  const toastDetails = document.getElementById("toastDetails");
  const toastWhatsApp = document.getElementById("toastWhatsApp");

  if (!toast) return;

  const now = new Date().toLocaleTimeString([], { hour12: false });
  const msg = `🚨 EMERGENCY ALERT: Accident detected at ${now}! Peak Impact: ${peakMagnitude.toFixed(2)} m/s². Location: ${state.fixedLat}, ${state.fixedLon}. Google Maps: ${state.googleMapsUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?phone=91${state.rawPhone}&text=${encodeURIComponent(msg)}`;

  if (toastDetails) {
    toastDetails.innerHTML = `
      <div style="font-weight: 700; color: #fff; font-size: 0.85rem;">🚨 ACCIDENT ALERT DISPATCHED</div>
      <div style="color: #cbd5e1; font-size: 0.78rem; margin-top: 0.2rem;">
        Notification sent to <strong style="color: #38bdf8;">${state.emergencyPhone}</strong><br>
        Peak Force: <strong style="color: #f87171;">${peakMagnitude.toFixed(2)} m/s²</strong><br>
        Location: <strong style="color: #38bdf8;">${state.fixedLat}, ${state.fixedLon}</strong>
      </div>
    `;
  }

  if (toastWhatsApp) {
    toastWhatsApp.href = whatsappUrl;
  }

  toast.classList.add("active");
  setTimeout(() => {
    toast.classList.remove("active");
  }, 10000);
}

// -----------------------------------------------------------------------------
// Leaflet Map Controller
// -----------------------------------------------------------------------------
let map = null;
let vehicleMarker = null;
let radarCircle = null;

function initMap() {
  const mapEl = document.getElementById("gpsMap");
  if (!mapEl) return;

  map = L.map("gpsMap", {
    center: [state.fixedLat, state.fixedLon],
    zoom: 15,
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd"
  }).addTo(map);

  const customIcon = L.divIcon({
    className: "vehicle-pin",
    html: `
      <div style="background: #0284c7; width: 28px; height: 28px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 16px #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 13px;">
        🚗
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

  vehicleMarker = L.marker([state.fixedLat, state.fixedLon], { icon: customIcon }).addTo(map);
  vehicleMarker.bindPopup(`
    <div style="font-family: var(--font-sans); color: #0f172a; font-size: 12px; line-height: 1.4;">
      <strong>Fixed Incident Location</strong><br>
      Lat: ${state.fixedLat}<br>
      Lon: ${state.fixedLon}<br>
      <a href="${state.googleMapsUrl}" target="_blank" style="color: #0284c7; font-weight: bold;">Open in Google Maps</a>
    </div>
  `);
}

function updateMapBeacon(isCrash) {
  if (!map) return;
  if (isCrash) {
    if (!radarCircle) {
      radarCircle = L.circle([state.fixedLat, state.fixedLon], {
        color: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 0.28,
        radius: 90,
        weight: 3
      }).addTo(map);
    }
  } else if (radarCircle) {
    map.removeLayer(radarCircle);
    radarCircle = null;
  }
}

// -----------------------------------------------------------------------------
// Real-time Chart.js Waveform
// -----------------------------------------------------------------------------
let telemetryChart = null;
const MAX_CHART_POINTS = 35;

function initChart() {
  const ctx = document.getElementById("telemetryCanvas");
  if (!ctx) return;

  const labels = Array(MAX_CHART_POINTS).fill("");
  const blanks = Array(MAX_CHART_POINTS).fill(null);

  telemetryChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [...labels],
      datasets: [
        {
          label: "Total Magnitude (|a|)",
          data: [...blanks],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.12)",
          borderWidth: 2.4,
          tension: 0.3,
          fill: true,
          pointRadius: 0
        },
        {
          label: "Lateral X",
          data: [...blanks],
          borderColor: "#f43f5e",
          borderWidth: 1.8,
          borderDash: [3, 3],
          tension: 0.3,
          fill: false,
          pointRadius: 0
        },
        {
          label: "Longitudinal Y",
          data: [...blanks],
          borderColor: "#10b981",
          borderWidth: 1.8,
          borderDash: [3, 3],
          tension: 0.3,
          fill: false,
          pointRadius: 0
        },
        {
          label: "Vertical Z",
          data: [...blanks],
          borderColor: "#818cf8",
          borderWidth: 1.8,
          borderDash: [3, 3],
          tension: 0.3,
          fill: false,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            color: "#94a3b8",
            font: { family: "'Inter', sans-serif", size: 11, weight: "600" },
            usePointStyle: true,
            boxWidth: 8
          }
        }
      },
      scales: {
        x: { display: false },
        y: {
          min: -15,
          suggestedMax: 35,
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: {
            color: "#64748b",
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            callback: (v) => `${v} m/s²`
          }
        }
      }
    }
  });
}

function pushChartData(ax, ay, az, total) {
  if (!telemetryChart) return;
  const data = telemetryChart.data;
  data.labels.push("");
  data.datasets[0].data.push(total);
  data.datasets[1].data.push(ax);
  data.datasets[2].data.push(ay);
  data.datasets[3].data.push(az);

  if (data.labels.length > MAX_CHART_POINTS) {
    data.labels.shift();
    data.datasets.forEach((ds) => ds.data.shift());
  }
  telemetryChart.update("none");
}

// -----------------------------------------------------------------------------
// Real-Time SSE Stream Listener (Python Backend)
// -----------------------------------------------------------------------------
function startSSE() {
  let sse = null;
  function connect() {
    sse = new EventSource("/api/stream");
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleTelemetryUpdate(data);
      } catch (e) {}
    };
    sse.onerror = () => {
      sse.close();
      setTimeout(connect, 2500);
    };
  }
  connect();
}

// -----------------------------------------------------------------------------
// Browser-Native Web Serial API (Works on Vercel deployment!)
// -----------------------------------------------------------------------------
let webSerialPort = null;

async function connectWebSerial() {
  if (!("serial" in navigator)) {
    alert("Web Serial is supported in Google Chrome, Microsoft Edge, and Opera.\nWhen running locally, use the Python backend.");
    return;
  }

  try {
    webSerialPort = await navigator.serial.requestPort();
    await webSerialPort.open({ baudRate: 9600 });
    state.connected = true;
    updateHardwareBadge(true, "Web Serial (9600 bps)");
    appendSerialLog("Connected via browser Web Serial API @ 9600 baud.", "dispatch");

    const textDecoder = new TextDecoderStream();
    webSerialPort.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) processRawLine(trimmed);
      }
    }
  } catch (err) {
    appendSerialLog(`Web Serial error: ${err.message}`, "alert");
  }
}

function processRawLine(lineStr) {
  let parsed = null;
  try {
    parsed = JSON.parse(lineStr);
  } catch (e) {
    const upper = lineStr.toUpperCase();
    const isAcc = upper.includes("ACCIDENT") || upper.includes("CRASH");
    const isBz = upper.includes("BUZZER: ON") || upper.includes("BUZZER ON") || upper.includes("BUZZER=ON");
    parsed = {
      ax: 0.1, ay: -0.1, az: 9.8, total: 9.8,
      status: isAcc ? "ACCIDENT DETECTED" : "NORMAL",
      buzzer: isBz ? "ON" : "OFF",
      raw: lineStr
    };
  }
  if (parsed) {
    parsed.connected = true;
    handleTelemetryUpdate(parsed);
  }
}

// -----------------------------------------------------------------------------
// Unified Telemetry Handler (SSE & Web Serial)
// -----------------------------------------------------------------------------
function handleTelemetryUpdate(data) {
  if (!data) return;

  const isConnected = !!data.connected;
  const ax = parseFloat(data.ax) || 0.0;
  const ay = parseFloat(data.ay) || 0.0;
  const az = parseFloat(data.az) || 9.81;
  const total = parseFloat(data.total) || 9.81;

  // 1. Buzzer Normalization
  const rawBuzzer = data.buzzer;
  let isBuzzerOn = false;
  if (rawBuzzer === true || rawBuzzer === 1 || rawBuzzer === "1") {
    isBuzzerOn = true;
  } else if (typeof rawBuzzer === "string") {
    const bzClean = rawBuzzer.trim().toUpperCase();
    isBuzzerOn = (bzClean === "ON" || bzClean === "HIGH" || bzClean === "ACTIVE" || bzClean === "TRUE");
  }

  // 2. Accident Normalization
  const rawStatus = (data.status || "").toString().trim().toUpperCase();
  const isAccident = (
    rawStatus.includes("ACCIDENT") ||
    rawStatus.includes("CRASH") ||
    rawStatus.includes("EMERGENCY") ||
    total >= 17.5 ||
    isBuzzerOn
  );

  state.connected = isConnected;
  state.ax = ax;
  state.ay = ay;
  state.az = az;
  state.totalAccel = total;
  state.vehicleStatus = isAccident ? "ACCIDENT DETECTED" : "NORMAL";
  state.buzzerStatus = (isBuzzerOn || isAccident) ? "ON" : "OFF";
  state.isAccidentActive = isAccident;

  // 3. Update Hardware Connection Badge
  updateHardwareBadge(isConnected, data.port ? `${data.port} @ ${data.baudrate || 9600}` : "Connected");

  // 4. Vehicle Status Card
  const statusPill = document.getElementById("vehicleStatusPill");
  if (statusPill) {
    if (isAccident) {
      statusPill.className = "status-banner-box status-crash";
      statusPill.innerHTML = `<span>🚨</span> CRITICAL: ACCIDENT DETECTED`;
      document.body.classList.add("accident-active");
      startSiren();
      updateMapBeacon(true);

      // Trigger multi-channel alert notification
      showEmergencyToast(total);
      triggerDesktopNotification(total);
    } else {
      statusPill.className = "status-banner-box status-safe";
      statusPill.innerHTML = `<span>🛡️</span> NORMAL OPERATION (SAFE)`;
      document.body.classList.remove("accident-active");
      stopSiren();
      updateMapBeacon(false);
    }
  }

  // 5. Buzzer State Card
  const buzzerBadge = document.getElementById("buzzerBadge");
  if (buzzerBadge) {
    if (state.buzzerStatus === "ON") {
      buzzerBadge.className = "buzzer-badge buzzer-active";
      buzzerBadge.innerHTML = `<span style="font-size: 11px;">🔊</span> ACTIVE (SOUNDING)`;
    } else {
      buzzerBadge.className = "buzzer-badge buzzer-silent";
      buzzerBadge.innerHTML = `<span style="font-size: 11px;">🔇</span> INACTIVE (OFF)`;
    }
  }

  // 6. Total Acceleration & Dynamic Progress Bar
  const valTotal = document.getElementById("valTotalAccel");
  const fillProgress = document.getElementById("fillProgressTotal");
  const txtGForce = document.getElementById("txtGForce");
  if (valTotal) valTotal.innerText = total.toFixed(2);
  if (txtGForce) txtGForce.innerText = `${(total / 9.80665).toFixed(2)} g`;
  if (fillProgress) {
    const pct = Math.min(100, Math.max(0, (total / 32.0) * 100));
    fillProgress.style.width = `${pct}%`;
  }

  // 7. 3-Axis Accelerometer Progress
  const valAx = document.getElementById("valAx");
  const valAy = document.getElementById("valAy");
  const valAz = document.getElementById("valAz");
  const barAx = document.getElementById("barAx");
  const barAy = document.getElementById("barAy");
  const barAz = document.getElementById("barAz");

  if (valAx) valAx.innerText = `${ax.toFixed(2)} m/s²`;
  if (valAy) valAy.innerText = `${ay.toFixed(2)} m/s²`;
  if (valAz) valAz.innerText = `${az.toFixed(2)} m/s²`;

  const normBar = (v) => Math.min(100, Math.max(0, ((v + 20) / 40) * 100));
  if (barAx) barAx.style.width = `${normBar(ax)}%`;
  if (barAy) barAy.style.width = `${normBar(ay)}%`;
  if (barAz) barAz.style.width = `${normBar(az)}%`;

  // 8. 3D Tilt Bubble
  const tiltDot = document.getElementById("tiltDot");
  const txtTilt = document.getElementById("txtTiltAngles");
  if (tiltDot) {
    const bx = Math.min(18, Math.max(-18, (ax / 12) * 18));
    const by = Math.min(18, Math.max(-18, (ay / 12) * 18));
    tiltDot.style.transform = `translate(${bx}px, ${by}px)`;
  }
  if (txtTilt) {
    const pitch = Math.round(Math.atan2(ax, Math.sqrt(ay * ay + az * az)) * (180 / Math.PI));
    const roll = Math.round(Math.atan2(ay, az) * (180 / Math.PI));
    txtTilt.innerText = `Pitch: ${pitch}° | Roll: ${roll}°`;
  }

  // 9. Push to Real-time Chart
  pushChartData(ax, ay, az, total);

  // 10. Append to Live Serial Monitor
  if (data.raw && !state.serialPaused) {
    appendSerialLog(data.raw, isAccident ? "alert" : "normal");
  } else if (data.logs && Array.isArray(data.logs)) {
    const latest = data.logs[data.logs.length - 1];
    if (latest && latest.text) appendSerialLog(latest.text, latest.type);
  }

  // 11. Refresh alert history table on accident
  if (isAccident) {
    fetchAlertHistory();
  }
}

function updateHardwareBadge(isConnected, label) {
  const badge = document.getElementById("hardwareLinkBadge");
  if (!badge) return;
  if (isConnected) {
    badge.className = "btn btn-glass";
    badge.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span> ${label}`;
  } else {
    badge.className = "btn btn-glass";
    badge.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: #64748b;"></span> Disconnected`;
  }
}

// -----------------------------------------------------------------------------
// Live Serial Monitor Feed
// -----------------------------------------------------------------------------
function appendSerialLog(text, logType = "normal") {
  const consoleEl = document.getElementById("serialConsole");
  if (!consoleEl || state.serialPaused) return;

  const now = new Date().toLocaleTimeString([], { hour12: false });
  const entry = document.createElement("div");
  entry.className = `log-entry ${logType}`;

  let icon = "⚡";
  if (logType === "alert") icon = "🚨";
  else if (logType === "dispatch") icon = "📲";

  entry.innerHTML = `
    <span style="color: var(--text-dim); font-size: 0.72rem;">[${now}]</span>
    <span>${icon}</span>
    <span>${text}</span>
  `;

  consoleEl.prepend(entry);

  if (consoleEl.children.length > 50) {
    consoleEl.removeChild(consoleEl.lastChild);
  }
}

// -----------------------------------------------------------------------------
// Accident Alert History Table
// -----------------------------------------------------------------------------
async function fetchAlertHistory() {
  try {
    const res = await fetch("/api/alerts");
    const json = await res.json();
    if (json.success) {
      renderAlertsTable(json.alerts || []);
    }
  } catch (e) {}
}

function renderAlertsTable(alerts) {
  const tbody = document.getElementById("alertsTableBody");
  const countBadge = document.getElementById("alertsCountBadge");
  if (!tbody) return;

  if (countBadge) countBadge.innerText = `${alerts.length} Incidents`;

  if (alerts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2rem;">
          No accidents recorded. Vehicle is operating safely.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  alerts.forEach((alert) => {
    html += `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 700; color: #38bdf8;">#${alert.id}</td>
        <td style="font-family: var(--font-mono); color: var(--text-muted);">${alert.timestamp}</td>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 700; color: #f87171;">
            ${alert.peak_magnitude.toFixed(2)} m/s²
          </span>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-dim);">
          X:${alert.ax} Y:${alert.ay} Z:${alert.az}
        </td>
        <td>
          <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 4px;">
            ${alert.sms_recipient || "+919265843734"} [SENT]
          </span>
        </td>
        <td>
          <span style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 4px;">
            CRASH
          </span>
        </td>
        <td>
          <a href="${alert.google_maps_url}" target="_blank" class="btn btn-glass" style="padding: 0.2rem 0.55rem; font-size: 0.72rem;">
            🗺️ Google Maps
          </a>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// -----------------------------------------------------------------------------
// UI Event Handlers & Initialization
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initChart();
  startSSE();
  fetchAlertHistory();

  // Request Desktop Notification on first click
  document.body.addEventListener("click", () => {
    if (!state.hasRequestedNotification && "Notification" in window && Notification.permission === "default") {
      requestNotificationPermission();
    }
  }, { once: true });

  // Live Clock
  const clockEl = document.getElementById("liveClock");
  if (clockEl) {
    setInterval(() => {
      clockEl.innerText = new Date().toLocaleTimeString([], { hour12: false });
    }, 1000);
  }

  // Audio Mute Toggle
  const btnSound = document.getElementById("btnToggleSound");
  if (btnSound) {
    btnSound.addEventListener("click", () => {
      state.audioMuted = !state.audioMuted;
      initAudio();
      btnSound.innerHTML = state.audioMuted ? "🔇 Siren: Muted" : "🔊 Siren: Active";
      if (state.audioMuted) stopSiren();
      else if (state.isAccidentActive) startSiren();
    });
  }

  // Clear Serial Logs
  const btnClearLogs = document.getElementById("btnClearLogs");
  if (btnClearLogs) {
    btnClearLogs.addEventListener("click", () => {
      const consoleEl = document.getElementById("serialConsole");
      if (consoleEl) consoleEl.innerHTML = "";
    });
  }

  // Pause / Resume Serial Stream
  const btnPauseLogs = document.getElementById("btnPauseLogs");
  if (btnPauseLogs) {
    btnPauseLogs.addEventListener("click", () => {
      state.serialPaused = !state.serialPaused;
      btnPauseLogs.innerText = state.serialPaused ? "▶️ Resume" : "⏸️ Pause";
    });
  }

  // Test Collision Crash Impact (Demo Simulation Button)
  const btnTestCrash = document.getElementById("btnTestCrash");
  if (btnTestCrash) {
    btnTestCrash.addEventListener("click", () => {
      handleTelemetryUpdate({
        connected: true,
        ax: 26.4,
        ay: 14.8,
        az: 8.2,
        total: 31.38,
        status: "ACCIDENT DETECTED",
        buzzer: "ON",
        raw: '{"ax":26.40,"ay":14.80,"az":8.20,"total":31.38,"status":"ACCIDENT DETECTED","buzzer":"ON"}'
      });
      appendSerialLog("TEST CRASH IMPACT TRIGGERED! Dispatching emergency notifications...", "alert");
    });
  }

  // Reset to Safe Driving
  const btnResetSafe = document.getElementById("btnResetSafe");
  if (btnResetSafe) {
    btnResetSafe.addEventListener("click", () => {
      handleTelemetryUpdate({
        connected: true,
        ax: 0.12,
        ay: -0.05,
        az: 9.81,
        total: 9.81,
        status: "NORMAL",
        buzzer: "OFF",
        raw: '{"ax":0.12,"ay":-0.05,"az":9.81,"total":9.81,"status":"NORMAL","buzzer":"OFF"}'
      });
      appendSerialLog("Vehicle operating in NORMAL (SAFE) condition.", "normal");
    });
  }

  // Test Notification Dispatch Button
  const btnTestNotification = document.getElementById("btnTestNotification");
  if (btnTestNotification) {
    btnTestNotification.addEventListener("click", async () => {
      showEmergencyToast(27.4);
      triggerDesktopNotification(27.4);
      appendSerialLog(`Manual Emergency Notification dispatched to ${state.emergencyPhone}`, "dispatch");
      try {
        await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peak: 27.4 })
        });
        fetchAlertHistory();
      } catch (e) {}
    });
  }

  // Copy GPS Coordinates
  const btnCopyCoords = document.getElementById("btnCopyCoords");
  if (btnCopyCoords) {
    btnCopyCoords.addEventListener("click", () => {
      navigator.clipboard.writeText(`${state.fixedLat}, ${state.fixedLon}`).then(() => {
        const orig = btnCopyCoords.innerHTML;
        btnCopyCoords.innerHTML = "✅ Copied!";
        setTimeout(() => btnCopyCoords.innerHTML = orig, 1800);
      });
    });
  }

  // Export CSV
  const btnExportCsv = document.getElementById("btnExportCsv");
  if (btnExportCsv) {
    btnExportCsv.addEventListener("click", () => {
      window.location.href = "/api/alerts/export";
    });
  }

  // Clear Alert History
  const btnClearHistory = document.getElementById("btnClearHistory");
  if (btnClearHistory) {
    btnClearHistory.addEventListener("click", async () => {
      if (confirm("Clear all recorded accident logs?")) {
        await fetch("/api/alerts", { method: "DELETE" });
        fetchAlertHistory();
      }
    });
  }

  // Modal Settings
  const btnOpenModal = document.getElementById("btnOpenSettings");
  const modal = document.getElementById("settingsModal");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const btnWebSerial = document.getElementById("btnWebSerial");

  if (btnOpenModal && modal) btnOpenModal.addEventListener("click", () => modal.classList.add("active"));
  if (btnCloseModal && modal) btnCloseModal.addEventListener("click", () => modal.classList.remove("active"));
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });

  if (btnWebSerial) {
    btnWebSerial.addEventListener("click", () => {
      connectWebSerial();
      if (modal) modal.classList.remove("active");
    });
  }
});
