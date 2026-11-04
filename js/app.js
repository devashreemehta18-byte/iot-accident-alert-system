/**
 * =============================================================================
 * CRASHGUARD IoT - Master Application Controller
 * Real-time MPU6050 Telemetry, Arduino IDE Serial Monitor, Web Serial API,
 * Multi-Channel Emergency Dispatch to +91 9265843734 & Cyber-Tactical Visuals.
 * =============================================================================
 */

const state = {
  connected: false,
  port: "COM4",
  baudrate: 9600,
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
  hasRequestedNotification: false,
  autoscroll: true,
  showTimestamp: true,
  criticalCount: 0,
  highRiskCount: 0,
  normalCount: 128,
  activeAlertCount: 0
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
    osc.frequency.setValueAtTime(960, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(540, audioCtx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
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
  sirenInterval = setInterval(playSirenTone, 480);
}

function stopSiren() {
  if (sirenInterval) {
    clearInterval(sirenInterval);
    sirenInterval = null;
  }
}

// -----------------------------------------------------------------------------
// Desktop Push Notifications (HTML5 Notification API)
// -----------------------------------------------------------------------------
function requestNotificationPermission() {
  if ("Notification" in window) {
    Notification.requestPermission().then((permission) => {
      state.hasRequestedNotification = true;
      if (permission === "granted") {
        appendIdeTerminal("[SYSTEM] Desktop push notifications authorized for +91 9265843734.", "ide-info");
      }
    });
  }
}

function triggerDesktopNotification(peakMagnitude) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("CRITICAL: VEHICLE ACCIDENT DETECTED!", {
        body: `Emergency Alert sent to ${state.emergencyPhone}!\nPeak Impact: ${peakMagnitude.toFixed(2)} m/s²\nLocation: ${state.fixedLat}, ${state.fixedLon}\nBuzzer Active on Pin D8.`,
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
  const msg = `🚨 EMERGENCY ALERT: Vehicle accident detected at ${now}! Peak Impact: ${peakMagnitude.toFixed(2)} m/s². Location: ${state.fixedLat}, ${state.fixedLon}. Google Maps: ${state.googleMapsUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?phone=91${state.rawPhone}&text=${encodeURIComponent(msg)}`;

  if (toastDetails) {
    toastDetails.innerHTML = `
      <div style="font-weight: 800; color: #fff; font-size: 0.88rem; letter-spacing: 0.03em;">ACCIDENT ALERT DISPATCHED</div>
      <div style="color: #cbd5e1; font-size: 0.78rem; margin-top: 0.2rem;">
        Notification dispatched to <strong style="color: #38bdf8;">${state.emergencyPhone}</strong><br>
        Peak Force: <strong style="color: #f87171;">${peakMagnitude.toFixed(2)} m/s²</strong> | Buzzer: <strong>ACTIVE</strong><br>
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
// Emergency Collision Modal
// -----------------------------------------------------------------------------
function openAccidentModal(peakMagnitude) {
  const modal = document.getElementById("accidentModal");
  const peakEl = document.getElementById("modalPeakForce");
  const waBtn = document.getElementById("modalWhatsAppBtn");

  if (!modal) return;
  if (peakEl) peakEl.innerText = `${peakMagnitude.toFixed(2)} m/s²`;

  const msg = `🚨 EMERGENCY ALERT: Accident detected! Peak Impact: ${peakMagnitude.toFixed(2)} m/s². Location: ${state.fixedLat}, ${state.fixedLon}. Google Maps: ${state.googleMapsUrl}`;
  if (waBtn) waBtn.href = `https://api.whatsapp.com/send?phone=91${state.rawPhone}&text=${encodeURIComponent(msg)}`;

  modal.classList.add("active");
}

function closeAccidentModal() {
  const modal = document.getElementById("accidentModal");
  if (modal) modal.classList.remove("active");
}

// -----------------------------------------------------------------------------
// Leaflet Dark Map Tracking
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
      <div style="background: #0284c7; width: 30px; height: 30px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 18px #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 14px;">
        🚗
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  vehicleMarker = L.marker([state.fixedLat, state.fixedLon], { icon: customIcon }).addTo(map);
  vehicleMarker.bindPopup(`
    <div style="font-family: var(--font-sans); color: #0f172a; font-size: 12px; line-height: 1.4;">
      <strong>Vehicle Incident Location</strong><br>
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
        fillOpacity: 0.32,
        radius: 120,
        weight: 3
      }).addTo(map);
    }
  } else if (radarCircle) {
    map.removeLayer(radarCircle);
    radarCircle = null;
  }
}

// -----------------------------------------------------------------------------
// Real-Time Acceleration Dynamics Waveform (Spline Bezier Curves)
// -----------------------------------------------------------------------------
let dynamicsChart = null;
const MAX_WAVE_POINTS = 32;

function initDynamicsChart() {
  const ctx = document.getElementById("dynamicsWaveCanvas");
  if (!ctx) return;

  const labels = Array(MAX_WAVE_POINTS).fill("");
  const blanks = Array(MAX_WAVE_POINTS).fill(null);

  dynamicsChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [...labels],
      datasets: [
        {
          label: "Total (|a|)",
          data: [...blanks],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.15)",
          borderWidth: 2.5,
          tension: 0.42,
          fill: true,
          pointRadius: 0
        },
        {
          label: "Lateral X",
          data: [...blanks],
          borderColor: "#f43f5e",
          borderWidth: 1.8,
          borderDash: [3, 3],
          tension: 0.42,
          fill: false,
          pointRadius: 0
        },
        {
          label: "Longitudinal Y",
          data: [...blanks],
          borderColor: "#10b981",
          borderWidth: 1.8,
          borderDash: [3, 3],
          tension: 0.42,
          fill: false,
          pointRadius: 0
        },
        {
          label: "Vertical Z",
          data: [...blanks],
          borderColor: "#818cf8",
          borderWidth: 1.8,
          borderDash: [3, 3],
          tension: 0.42,
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
        legend: { display: false }
      },
      scales: {
        x: { display: false },
        y: {
          min: -10,
          suggestedMax: 35,
          grid: { color: "rgba(255, 255, 255, 0.04)" },
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

function pushWaveChartData(ax, ay, az, total) {
  if (!dynamicsChart) return;
  const data = dynamicsChart.data;
  data.labels.push("");
  data.datasets[0].data.push(total);
  data.datasets[1].data.push(ax);
  data.datasets[2].data.push(ay);
  data.datasets[3].data.push(az);

  if (data.labels.length > MAX_WAVE_POINTS) {
    data.labels.shift();
    data.datasets.forEach((ds) => ds.data.shift());
  }
  dynamicsChart.update("none");
}

// -----------------------------------------------------------------------------
// Timeline Dual Bar Chart (Safe Sessions vs Shock Spikes)
// -----------------------------------------------------------------------------
let incidentBarsChart = null;

function initIncidentBarsChart() {
  const ctx = document.getElementById("incidentBarsCanvas");
  if (!ctx) return;

  const sampleLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  incidentBarsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sampleLabels,
      datasets: [
        {
          label: "Safe Driving",
          data: [18, 22, 19, 25, 20, 24, 21],
          backgroundColor: "#38bdf8",
          borderRadius: 3,
          barPercentage: 0.6
        },
        {
          label: "Shock Spikes",
          data: [1, 0, 2, 0, 1, 3, 0],
          backgroundColor: "#f43f5e",
          borderRadius: 3,
          barPercentage: 0.6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#64748b", font: { size: 10 } }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.03)" },
          ticks: { color: "#64748b", font: { size: 9 }, stepSize: 10 }
        }
      }
    }
  });
}

// -----------------------------------------------------------------------------
// Circular Donut Gauge Update
// -----------------------------------------------------------------------------
function updateDonutGauge(totalAccel) {
  const ring = document.getElementById("donutProgressRing");
  const pctText = document.getElementById("donutPercentText");
  const labelText = document.getElementById("donutRiskLevel");
  const critEl = document.getElementById("countCritical");
  const highEl = document.getElementById("countHighRisk");

  if (!ring || !pctText) return;

  pctText.innerText = totalAccel.toFixed(1);

  // Circumference for r=64 is 2 * PI * 64 ≈ 402.12
  const maxAccel = 32.0;
  const ratio = Math.min(1.0, Math.max(0.0, totalAccel / maxAccel));
  const offset = 402 - (402 * ratio);
  ring.style.strokeDashoffset = offset;

  if (totalAccel >= 17.5) {
    ring.style.stroke = "#ef4444";
    if (labelText) {
      labelText.innerText = "CRITICAL COLLISION";
      labelText.style.color = "#ef4444";
    }
    state.criticalCount++;
    if (critEl) critEl.innerText = state.criticalCount;
  } else if (totalAccel >= 12.0) {
    ring.style.stroke = "#f59e0b";
    if (labelText) {
      labelText.innerText = "Elevated G-Force";
      labelText.style.color = "#f59e0b";
    }
    state.highRiskCount++;
    if (highEl) highEl.innerText = state.highRiskCount;
  } else {
    ring.style.stroke = "#10b981";
    if (labelText) {
      labelText.innerText = "Normal Safe";
      labelText.style.color = "#34d399";
    }
  }
}

// -----------------------------------------------------------------------------
// Official Arduino IDE-Style Serial Monitor Logic
// -----------------------------------------------------------------------------
function appendIdeTerminal(text, lineClass = "ide-rx") {
  const consoleEl = document.getElementById("ideSerialTerminal");
  if (!consoleEl) return;

  const line = document.createElement("div");
  line.className = `ide-line ${lineClass}`;

  let timePrefix = "";
  if (state.showTimestamp) {
    const now = new Date();
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    const timeStr = now.toLocaleTimeString([], { hour12: false }) + "." + ms;
    timePrefix = `<span style="color: #64748b; font-size: 0.72rem; margin-right: 0.5rem;">[${timeStr}]</span>`;
  }

  line.innerHTML = `${timePrefix}${escapeHtml(text)}`;
  consoleEl.appendChild(line);

  // Limit memory buffer
  if (consoleEl.children.length > 250) {
    consoleEl.removeChild(consoleEl.firstChild);
  }

  if (state.autoscroll) {
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendIdeCommand() {
  const inputEl = document.getElementById("ideSerialInput");
  const lineEndingSelect = document.getElementById("ideLineEndingSelect");
  if (!inputEl) return;

  const msg = inputEl.value;
  if (!msg.trim()) return;

  const lineEnding = lineEndingSelect ? lineEndingSelect.value : "\n";
  const fullPayload = msg + lineEnding;

  // 1. If Web Serial is active in browser
  if (webSerialWriter) {
    try {
      await webSerialWriter.write(fullPayload);
      appendIdeTerminal(`>> ${msg}`, "ide-tx");
      inputEl.value = "";
      return;
    } catch (e) {
      appendIdeTerminal(`[ERROR] Web Serial write failed: ${e.message}`, "ide-alert");
    }
  }

  // 2. Otherwise send via Python Flask Serial API
  try {
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, line_ending: lineEnding })
    });
    const data = await res.json();
    if (data.success) {
      appendIdeTerminal(`>> ${msg}`, "ide-tx");
      inputEl.value = "";
    } else {
      appendIdeTerminal(`[SEND FAILED] ${data.message || "Could not write to COM port"}`, "ide-warn");
    }
  } catch (err) {
    appendIdeTerminal(`>> ${msg} (Sent to local buffer)`, "ide-tx");
    inputEl.value = "";
  }
}

// -----------------------------------------------------------------------------
// Browser-Native Web Serial API (Chrome / Edge / Vercel direct hardware connect)
// -----------------------------------------------------------------------------
let webSerialPort = null;
let webSerialWriter = null;

async function connectWebSerial() {
  if (!("serial" in navigator)) {
    alert("Web Serial API is supported in Google Chrome, Microsoft Edge, and Opera.\nWhen running on localhost, use the Python Flask COM port connection.");
    return;
  }

  try {
    webSerialPort = await navigator.serial.requestPort();
    const baudRate = parseInt(document.getElementById("ideBaudRateSelect")?.value || "9600", 10);
    await webSerialPort.open({ baudRate });

    const textEncoder = new TextEncoderStream();
    textEncoder.readable.pipeTo(webSerialPort.writable);
    webSerialWriter = textEncoder.writable.getWriter();

    state.connected = true;
    updateHardwareConnectionStatus(true, `Web Serial (${baudRate} baud)`);
    appendIdeTerminal(`[SYSTEM] Connected via browser Web Serial API @ ${baudRate} baud.`, "ide-sys");

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
        if (trimmed) parseIncomingSerialLine(trimmed);
      }
    }
  } catch (err) {
    appendIdeTerminal(`[WEB SERIAL ERROR] ${err.message}`, "ide-alert");
  }
}

function parseIncomingSerialLine(lineStr) {
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
// Unified Telemetry Handler (SSE Stream & Web Serial)
// -----------------------------------------------------------------------------
function handleTelemetryUpdate(data) {
  if (!data) return;

  const isConnected = !!data.connected;
  const ax = parseFloat(data.ax) || 0.0;
  const ay = parseFloat(data.ay) || 0.0;
  const az = parseFloat(data.az) || 9.81;
  const total = parseFloat(data.total) || 9.81;

  // 1. Buzzer State Normalization
  const rawBuzzer = data.buzzer;
  let isBuzzerOn = false;
  if (rawBuzzer === true || rawBuzzer === 1 || rawBuzzer === "1") {
    isBuzzerOn = true;
  } else if (typeof rawBuzzer === "string") {
    const bzClean = rawBuzzer.trim().toUpperCase();
    isBuzzerOn = (bzClean === "ON" || bzClean === "HIGH" || bzClean === "ACTIVE" || bzClean === "TRUE");
  }

  // 2. Accident Detection Logic
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

  // 3. Update Hardware Connection Badges
  updateHardwareConnectionStatus(isConnected, data.port ? `${data.port} @ ${data.baudrate || 9600}` : "Arduino Uno");

  // 4. Update Overview Status Pill
  const statusPill = document.getElementById("overviewStatusBadge");
  const statActiveAlerts = document.getElementById("statActiveAlerts");
  const navAlertBadge = document.getElementById("navAlertBadge");

  if (isAccident) {
    if (statusPill) {
      statusPill.className = "status-pill status-pill-crash";
      statusPill.innerText = "ACCIDENT";
    }
    state.activeAlertCount = 1;
    if (statActiveAlerts) statActiveAlerts.innerText = "1 CRITICAL";
    if (navAlertBadge) {
      navAlertBadge.innerText = "1";
      navAlertBadge.style.display = "flex";
    }

    document.body.classList.add("accident-active");
    startSiren();
    updateMapBeacon(true);

    // Multi-channel alert dispatch
    showEmergencyToast(total);
    triggerDesktopNotification(total);
    openAccidentModal(total);
  } else {
    if (statusPill) {
      statusPill.className = "status-pill status-pill-safe";
      statusPill.innerText = "NORMAL";
    }
    state.activeAlertCount = 0;
    if (statActiveAlerts) statActiveAlerts.innerText = "0";
    if (navAlertBadge) navAlertBadge.innerText = "0";

    document.body.classList.remove("accident-active");
    stopSiren();
    updateMapBeacon(false);
  }

  // 5. Update Buzzer Device Status Badge
  const badgeBuzzer = document.getElementById("badgeBuzzerStatus");
  if (badgeBuzzer) {
    if (state.buzzerStatus === "ON") {
      badgeBuzzer.className = "device-state-pill pill-active-buzzer";
      badgeBuzzer.innerText = "SOUNDING (D8) ›";
    } else {
      badgeBuzzer.className = "device-state-pill pill-silent";
      badgeBuzzer.innerText = "OFF (Silent) ›";
    }
  }

  // 6. Update Circular Gauge
  updateDonutGauge(total);

  // 7. Push data to Spline Wave Chart
  pushWaveChartData(ax, ay, az, total);

  // 8. Stream to Arduino IDE Serial Monitor
  if (data.raw) {
    appendIdeTerminal(data.raw, isAccident ? "ide-alert" : "ide-rx");
  } else if (data.logs && Array.isArray(data.logs)) {
    const latest = data.logs[data.logs.length - 1];
    if (latest && latest.text) {
      appendIdeTerminal(latest.text, latest.type === "alert" ? "ide-alert" : "ide-rx");
    }
  }

  // 9. Fetch fresh alert history
  if (isAccident) {
    fetchAlertHistory();
  }
}

function updateHardwareConnectionStatus(isConnected, label) {
  const navBadge = document.getElementById("hardwareLinkBadge");
  const navText = document.getElementById("hardwareLinkText");
  const arduinoBadge = document.getElementById("badgeArduinoStatus");
  const idePortBadge = document.getElementById("idePortBadge");
  const ideStatusLabel = document.getElementById("ideStatusLabel");

  if (isConnected) {
    if (navBadge) {
      navBadge.style.background = "rgba(16, 185, 129, 0.12)";
      navBadge.style.borderColor = "rgba(16, 185, 129, 0.3)";
    }
    if (navText) navText.innerText = label;
    if (arduinoBadge) {
      arduinoBadge.className = "device-state-pill pill-online";
      arduinoBadge.innerText = "Connected ›";
    }
    if (idePortBadge) idePortBadge.innerText = label;
    if (ideStatusLabel) ideStatusLabel.innerText = "CONNECTED @ 9600 BAUD";
  } else {
    if (navBadge) {
      navBadge.style.background = "rgba(100, 116, 139, 0.12)";
      navBadge.style.borderColor = "rgba(100, 116, 139, 0.3)";
    }
    if (navText) navText.innerText = "Disconnected";
    if (arduinoBadge) {
      arduinoBadge.className = "device-state-pill pill-silent";
      arduinoBadge.innerText = "Disconnected ›";
    }
    if (ideStatusLabel) ideStatusLabel.innerText = "DISCONNECTED";
  }
}

// -----------------------------------------------------------------------------
// Real-Time Server-Sent Events (SSE) from Python Backend
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
      setTimeout(connect, 2000);
    };
  }
  connect();
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
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          No accident incidents recorded. Vehicle is operating safely.
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
        <td style="font-family: var(--font-mono); color: var(--text-secondary);">${alert.timestamp}</td>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 800; color: #f87171;">
            ${alert.peak_magnitude.toFixed(2)} m/s²
          </span>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.74rem; color: var(--text-muted);">
          X:${alert.ax} Y:${alert.ay} Z:${alert.az}
        </td>
        <td>
          <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 4px;">
            ${alert.sms_recipient || "+919265843734"} [SENT]
          </span>
        </td>
        <td>
          <span style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 0.7rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 4px;">
            CRASH
          </span>
        </td>
        <td>
          <a href="${alert.google_maps_url}" target="_blank" class="btn btn-glass btn-sm">
            🗺️ Google Maps
          </a>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// -----------------------------------------------------------------------------
// Hardware Port Scanner & Connect Logic
// -----------------------------------------------------------------------------
async function scanSerialPorts() {
  const portSelect = document.getElementById("idePortSelect");
  if (!portSelect) return;

  try {
    const res = await fetch("/api/ports");
    const json = await res.json();
    if (json.success && json.ports) {
      portSelect.innerHTML = "";
      json.ports.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.port;
        opt.innerText = `${p.port} (${p.description})`;
        if (p.is_recommended || p.port === "COM4") opt.selected = true;
        portSelect.appendChild(opt);
      });
      // Add Web Serial option as well
      const optWeb = document.createElement("option");
      optWeb.value = "WEB_SERIAL";
      optWeb.innerText = "Web Serial API (Browser Direct)";
      portSelect.appendChild(optWeb);
    }
  } catch (e) {}
}

async function connectSelectedPort() {
  const portSelect = document.getElementById("idePortSelect");
  const baudSelect = document.getElementById("ideBaudRateSelect");
  const port = portSelect ? portSelect.value : "COM4";
  const baud = baudSelect ? parseInt(baudSelect.value, 10) : 9600;

  if (port === "WEB_SERIAL") {
    connectWebSerial();
    return;
  }

  appendIdeTerminal(`[SYSTEM] Attempting connection to ${port} @ ${baud} baud...`, "ide-sys");
  try {
    const res = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port, baudrate: baud })
    });
    const data = await res.json();
    if (data.success) {
      appendIdeTerminal(`[SYSTEM] Successfully connected to ${port} at ${baud} baud.`, "ide-info");
      updateHardwareConnectionStatus(true, `${port} (Arduino Uno)`);
    } else {
      appendIdeTerminal(`[SYSTEM ERROR] ${data.message}`, "ide-alert");
    }
  } catch (e) {
    appendIdeTerminal(`[SYSTEM ERROR] Failed to connect: ${e.message}`, "ide-alert");
  }
}

// -----------------------------------------------------------------------------
// UI Initialization & Event Listeners
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  initDynamicsChart();
  initIncidentBarsChart();
  startSSE();
  fetchAlertHistory();
  scanSerialPorts();

  // Request Desktop Notification on first click anywhere
  document.body.addEventListener("click", () => {
    if (!state.hasRequestedNotification && "Notification" in window && Notification.permission === "default") {
      requestNotificationPermission();
    }
  }, { once: true });

  // 1-Click Connect Arduino Uno
  const btnQuickConnect = document.getElementById("btnQuickConnectArduino");
  if (btnQuickConnect) {
    btnQuickConnect.addEventListener("click", () => {
      connectSelectedPort();
    });
  }

  // Web Serial Connect Button
  const btnWebSerial = document.getElementById("btnWebSerialConnect");
  if (btnWebSerial) {
    btnWebSerial.addEventListener("click", () => {
      connectWebSerial();
    });
  }

  // Simulate Crash Test
  const btnCrash = document.getElementById("btnTestCrash");
  if (btnCrash) {
    btnCrash.addEventListener("click", () => {
      handleTelemetryUpdate({
        connected: true,
        ax: 25.8,
        ay: 13.4,
        az: 8.6,
        total: 29.85,
        status: "ACCIDENT DETECTED",
        buzzer: "ON",
        raw: '{"ax":25.80,"ay":13.40,"az":8.60,"total":29.85,"status":"ACCIDENT DETECTED","buzzer":"ON"}'
      });
      appendIdeTerminal("[SIMULATION] High G-Force collision detected! Hardware buzzer sounding on Pin D8.", "ide-alert");
    });
  }

  // Reset Safe Button
  const btnSafe = document.getElementById("btnResetSafe");
  if (btnSafe) {
    btnSafe.addEventListener("click", () => {
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
      closeAccidentModal();
      appendIdeTerminal("[SYSTEM] Vehicle status restored to NORMAL OPERATION.", "ide-info");
    });
  }

  // Test SOS Notification Dispatch Button
  const btnTestNotif = document.getElementById("btnTestNotification");
  const btnTriggerSOS = document.getElementById("btnTriggerSOSNow");
  const triggerSOS = async () => {
    showEmergencyToast(28.4);
    triggerDesktopNotification(28.4);
    openAccidentModal(28.4);
    appendIdeTerminal(`[DISPATCH] Automated Emergency Notification dispatched to ${state.emergencyPhone}`, "ide-info");
    try {
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peak: 28.4 })
      });
      fetchAlertHistory();
    } catch (e) {}
  };

  if (btnTestNotif) btnTestNotif.addEventListener("click", triggerSOS);
  if (btnTriggerSOS) btnTriggerSOS.addEventListener("click", triggerSOS);

  // Audio Siren Toggle
  const btnSound = document.getElementById("btnToggleSound");
  const soundIcon = document.getElementById("soundIcon");
  if (btnSound) {
    btnSound.addEventListener("click", () => {
      state.audioMuted = !state.audioMuted;
      initAudio();
      if (soundIcon) soundIcon.innerText = state.audioMuted ? "🔇" : "🔊";
      if (state.audioMuted) stopSiren();
      else if (state.isAccidentActive) startSiren();
    });
  }

  // Arduino IDE Serial Monitor Send Command
  const btnSend = document.getElementById("btnIdeSend");
  const serialInput = document.getElementById("ideSerialInput");
  if (btnSend) btnSend.addEventListener("click", sendIdeCommand);
  if (serialInput) {
    serialInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendIdeCommand();
    });
  }

  // Autoscroll Checkbox
  const chkAutoscroll = document.getElementById("chkIdeAutoscroll");
  if (chkAutoscroll) {
    chkAutoscroll.addEventListener("change", (e) => {
      state.autoscroll = e.target.checked;
    });
  }

  // Show Timestamp Checkbox
  const chkTimestamp = document.getElementById("chkIdeTimestamp");
  if (chkTimestamp) {
    chkTimestamp.addEventListener("change", (e) => {
      state.showTimestamp = e.target.checked;
    });
  }

  // Clear Terminal Output
  const btnClearConsole = document.getElementById("btnIdeClearConsole");
  if (btnClearConsole) {
    btnClearConsole.addEventListener("click", () => {
      const consoleEl = document.getElementById("ideSerialTerminal");
      if (consoleEl) consoleEl.innerHTML = "";
    });
  }

  // Copy Terminal Output
  const btnCopyConsole = document.getElementById("btnIdeCopyConsole");
  if (btnCopyConsole) {
    btnCopyConsole.addEventListener("click", () => {
      const consoleEl = document.getElementById("ideSerialTerminal");
      if (!consoleEl) return;
      navigator.clipboard.writeText(consoleEl.innerText).then(() => {
        const orig = btnCopyConsole.innerText;
        btnCopyConsole.innerText = "✅ Copied!";
        setTimeout(() => btnCopyConsole.innerText = orig, 1800);
      });
    });
  }

  // Expand IDE Terminal
  const btnExpand = document.getElementById("btnToggleIdeExpand");
  if (btnExpand) {
    btnExpand.addEventListener("click", () => {
      const consoleEl = document.getElementById("ideSerialTerminal");
      if (consoleEl) {
        consoleEl.classList.toggle("expanded");
        btnExpand.innerText = consoleEl.classList.contains("expanded") ? "🗗 Shrink" : "⛶ Expand";
      }
    });
  }

  // Port Connect & Scan Buttons
  const btnConnectPort = document.getElementById("btnIdeConnectPort");
  const btnScanPorts = document.getElementById("btnIdeScanPorts");
  if (btnConnectPort) btnConnectPort.addEventListener("click", connectSelectedPort);
  if (btnScanPorts) btnScanPorts.addEventListener("click", scanSerialPorts);

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

  // Clear Alert History
  const btnClearHistory = document.getElementById("btnClearAlertHistory");
  if (btnClearHistory) {
    btnClearHistory.addEventListener("click", async () => {
      if (confirm("Clear all recorded accident logs from the database?")) {
        await fetch("/api/alerts", { method: "DELETE" });
        fetchAlertHistory();
      }
    });
  }

  // Modal Close & Dismiss Buttons
  const btnCloseModal = document.getElementById("btnCloseAccidentModal");
  const btnDismissModal = document.getElementById("btnDismissModal");
  if (btnCloseModal) btnCloseModal.addEventListener("click", closeAccidentModal);
  if (btnDismissModal) btnDismissModal.addEventListener("click", closeAccidentModal);

  // Navigation Tabs Switching
  const navTabs = document.querySelectorAll(".nav-tab");
  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      navTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const tabName = tab.getAttribute("data-tab");
      if (tabName === "serial") {
        document.getElementById("serialMonitorSection")?.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
});
