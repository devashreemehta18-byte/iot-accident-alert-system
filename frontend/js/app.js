/**
 * IoT Accident Alert System - Application Controller
 * Handles real-time MPU6050 telemetry, Web Serial API, and Cyber Card UI.
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
  audioMuted: false,
  isAccidentActive: false,
  serialPaused: false
};

// Audio Alarm Synthesizer
let audioCtx = null;
let sirenTimer = null;

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
    osc.frequency.setValueAtTime(920, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(560, audioCtx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) {}
}

function startSiren() {
  if (sirenTimer) return;
  initAudio();
  playSirenTone();
  sirenTimer = setInterval(playSirenTone, 450);
}

function stopSiren() {
  if (sirenTimer) {
    clearInterval(sirenTimer);
    sirenTimer = null;
  }
}

// Chart.js Instances
let threatChart = null;
let barChart = null;
const MAX_CHART_POINTS = 30;

function initCharts() {
  // 1. Spline Telemetry Activity Waveform
  const ctxThreat = document.getElementById("threatActivityCanvas");
  if (ctxThreat) {
    const labels = Array(MAX_CHART_POINTS).fill("");
    const blanks = Array(MAX_CHART_POINTS).fill(null);

    threatChart = new Chart(ctxThreat, {
      type: "line",
      data: {
        labels: [...labels],
        datasets: [
          {
            label: "Total Magnitude",
            data: [...blanks],
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.1)",
            borderWidth: 2.2,
            tension: 0.4,
            fill: true,
            pointRadius: 0
          },
          {
            label: "Lateral X",
            data: [...blanks],
            borderColor: "#f97316",
            borderWidth: 1.8,
            tension: 0.4,
            fill: false,
            pointRadius: 0
          },
          {
            label: "Longitudinal Y",
            data: [...blanks],
            borderColor: "#10b981",
            borderWidth: 1.8,
            tension: 0.4,
            fill: false,
            pointRadius: 0
          },
          {
            label: "Vertical Z",
            data: [...blanks],
            borderColor: "#818cf8",
            borderWidth: 1.8,
            tension: 0.4,
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            min: -15,
            suggestedMax: 35,
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: {
              color: "#64748b",
              font: { family: "'JetBrains Mono', monospace", size: 9 },
              maxTicksLimit: 5
            }
          }
        }
      }
    });
  }

  // 2. Incident Summary Bar Chart
  const ctxBar = document.getElementById("incidentBarCanvas");
  if (ctxBar) {
    const barLabels = ["10s", "20s", "30s", "40s", "50s", "60s", "70s", "80s", "90s", "Now"];
    const safeData = [12, 19, 14, 18, 22, 25, 20, 18, 24, 26];
    const riskData = [0, 0, 1, 0, 0, 0, 0, 2, 0, 0];

    barChart = new Chart(ctxBar, {
      type: "bar",
      data: {
        labels: barLabels,
        datasets: [
          {
            label: "Safe Driving",
            data: safeData,
            backgroundColor: "#2563eb",
            borderRadius: 4
          },
          {
            label: "Crash Spikes",
            data: riskData,
            backgroundColor: "#ef4444",
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#64748b", font: { size: 9 } }
          },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: { color: "#64748b", font: { size: 9 }, maxTicksLimit: 3 }
          }
        }
      }
    });
  }
}

function pushChartPoint(ax, ay, az, total) {
  if (!threatChart) return;
  const data = threatChart.data;
  data.labels.push("");
  data.datasets[0].data.push(total);
  data.datasets[1].data.push(ax);
  data.datasets[2].data.push(ay);
  data.datasets[3].data.push(az);

  if (data.labels.length > MAX_CHART_POINTS) {
    data.labels.shift();
    data.datasets.forEach((ds) => ds.data.shift());
  }
  threatChart.update("none");
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
// Web Serial API (Direct Browser USB Serial - Works on Vercel!)
// -----------------------------------------------------------------------------
let webSerialPort = null;

async function connectWebSerial() {
  if (!("serial" in navigator)) {
    alert("Web Serial is supported in Google Chrome, Microsoft Edge, and Opera.\nWhen running locally, you can use the Python backend.");
    return;
  }

  try {
    webSerialPort = await navigator.serial.requestPort();
    await webSerialPort.open({ baudRate: 9600 });
    state.connected = true;
    updateDeviceRow("arduinoStatusBadge", "Online >", "status-online");
    appendSerialLog("Web Serial Connected to Arduino UNO @ 9600 baud.", "success");

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = webSerialPort.readable.pipeTo(textDecoder.writable);
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
        if (trimmed) processSerialRaw(trimmed);
      }
    }
  } catch (err) {
    console.error("Web Serial error:", err);
    appendSerialLog(`Web Serial error: ${err.message}`, "error");
  }
}

function processSerialRaw(lineStr) {
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
// Unified Telemetry Handler (Handles both Backend SSE & Web Serial)
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
  const isAccidentDetected = (
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
  state.vehicleStatus = isAccidentDetected ? "ACCIDENT DETECTED" : "NORMAL";
  state.buzzerStatus = (isBuzzerOn || isAccidentDetected) ? "ON" : "OFF";
  state.isAccidentActive = isAccidentDetected;

  // 3. Update Overview Card
  const txtActiveThreats = document.getElementById("txtActiveThreats");
  const systemStatusBadge = document.getElementById("systemStatusBadge");

  if (isAccidentDetected) {
    if (txtActiveThreats) {
      txtActiveThreats.innerText = "1";
      txtActiveThreats.className = "val-red";
    }
    if (systemStatusBadge) {
      systemStatusBadge.innerText = "CRITICAL: ACCIDENT DETECTED >";
      systemStatusBadge.className = "critical-pill";
    }
    document.body.classList.add("accident-active");
    startSiren();

    const radar = document.getElementById("mapRadar");
    if (radar) radar.style.display = "block";
  } else {
    if (txtActiveThreats) {
      txtActiveThreats.innerText = "0";
      txtActiveThreats.className = "val-green";
    }
    if (systemStatusBadge) {
      systemStatusBadge.innerText = isConnected ? "NORMAL (SAFE) >" : "DISCONNECTED >";
      systemStatusBadge.className = isConnected ? "secure-pill" : "secure-pill style-offline";
    }
    document.body.classList.remove("accident-active");
    stopSiren();

    const radar = document.getElementById("mapRadar");
    if (radar) radar.style.display = "none";
  }

  // 4. Update Device Status Card
  updateDeviceRow(
    "arduinoStatusBadge",
    isConnected ? "Online >" : "Offline >",
    isConnected ? "status-online" : "status-muted"
  );
  updateDeviceRow(
    "sensorStatusBadge",
    isConnected ? "Active >" : "Standby >",
    isConnected ? (isAccidentDetected ? "status-risk" : "status-online") : "status-muted"
  );
  updateDeviceRow(
    "buzzerStatusBadge",
    (state.buzzerStatus === "ON") ? "ACTIVE (SOUNDING) >" : "OFF (Silent) >",
    (state.buzzerStatus === "ON") ? "status-risk" : "status-muted"
  );

  // 5. Update Donut Meter (G-Force & Risk %)
  const riskPct = Math.min(100, Math.max(8, Math.round((total / 28.0) * 100)));
  const donutVal = document.getElementById("donutPct");
  const donutLabel = document.getElementById("donutLabel");
  const donutCircle = document.getElementById("donutCircle");

  if (donutVal) donutVal.innerText = `${riskPct}%`;
  if (donutLabel) {
    if (isAccidentDetected || riskPct >= 70) {
      donutLabel.innerText = "Critical Crash";
      donutLabel.style.color = "var(--color-critical)";
    } else if (riskPct >= 45) {
      donutLabel.innerText = "High G-Force";
      donutLabel.style.color = "var(--color-high)";
    } else {
      donutLabel.innerText = "Normal Safe";
      donutLabel.style.color = "var(--color-secure)";
    }
  }

  if (donutCircle) {
    const offset = 251.2 - (251.2 * riskPct) / 100;
    donutCircle.style.strokeDashoffset = offset;
    donutCircle.style.stroke = isAccidentDetected ? "#ef4444" : (riskPct > 50 ? "#f97316" : "#10b981");
  }

  // 6. Push to Waveform Chart
  pushChartPoint(ax, ay, az, total);

  // 7. Update Serial Feed
  if (data.raw && !state.serialPaused) {
    appendSerialLog(data.raw, isAccidentDetected ? "alert" : "normal");
  } else if (data.logs && Array.isArray(data.logs)) {
    renderBackendLogs(data.logs);
  }
}

function updateDeviceRow(elemId, text, className) {
  const el = document.getElementById(elemId);
  if (el) {
    el.innerText = text;
    el.className = `device-status-badge ${className}`;
  }
}

// -----------------------------------------------------------------------------
// User-Friendly Serial Monitor Feed
// -----------------------------------------------------------------------------
function appendSerialLog(text, type = "normal") {
  const container = document.getElementById("serialFeedContainer");
  if (!container || state.serialPaused) return;

  const now = new Date().toLocaleTimeString([], { hour12: false });
  const item = document.createElement("div");
  item.className = `feed-item ${type === "alert" ? "alert-feed" : ""}`;

  let icon = "⚡";
  let color = "var(--text-main)";
  if (type === "alert") {
    icon = "🚨";
    color = "var(--color-critical)";
  } else if (type === "success") {
    icon = "✅";
    color = "var(--color-secure)";
  } else if (type === "error") {
    icon = "❌";
    color = "var(--color-critical)";
  }

  item.innerHTML = `
    <div class="feed-left">
      <span>${icon}</span>
      <span style="color: ${color};">${text}</span>
    </div>
    <span class="feed-time">${now}</span>
  `;

  container.prepend(item);

  if (container.children.length > 40) {
    container.removeChild(container.lastChild);
  }
}

function renderBackendLogs(logs) {
  const container = document.getElementById("serialFeedContainer");
  if (!container || state.serialPaused || logs.length === 0) return;
  const latest = logs[logs.length - 1];
  if (latest && latest.text) {
    appendSerialLog(latest.text, latest.type);
  }
}

// -----------------------------------------------------------------------------
// UI Event Handlers & Initialization
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  initCharts();
  startSSE();

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
    });
  });

  const soundBell = document.getElementById("soundToggleBell");
  if (soundBell) {
    soundBell.addEventListener("click", () => {
      state.audioMuted = !state.audioMuted;
      initAudio();
      soundBell.title = state.audioMuted ? "Alarm Siren Muted" : "Alarm Siren Active";
      appendSerialLog(`Alarm Siren ${state.audioMuted ? "MUTED" : "UNMUTED"}`, "normal");
    });
  }

  const scanBtn = document.getElementById("btnScanNow");
  const modal = document.getElementById("cyberModal");
  const closeModal = document.getElementById("closeCyberModal");

  if (scanBtn && modal) {
    scanBtn.addEventListener("click", () => modal.classList.add("active"));
  }
  if (closeModal && modal) {
    closeModal.addEventListener("click", () => modal.classList.remove("active"));
  }

  const btnWebSerial = document.getElementById("btnConnectWebSerial");
  if (btnWebSerial) {
    btnWebSerial.addEventListener("click", () => {
      connectWebSerial();
      if (modal) modal.classList.remove("active");
    });
  }

  const btnClearLogs = document.getElementById("btnClearSerialLogs");
  if (btnClearLogs) {
    btnClearLogs.addEventListener("click", () => {
      const container = document.getElementById("serialFeedContainer");
      if (container) container.innerHTML = "";
    });
  }

  const btnPauseLogs = document.getElementById("btnPauseSerialLogs");
  if (btnPauseLogs) {
    btnPauseLogs.addEventListener("click", () => {
      state.serialPaused = !state.serialPaused;
      btnPauseLogs.innerText = state.serialPaused ? "▶️ Resume" : "⏸️ Pause";
    });
  }

  // Demo Trigger (Testing Crash Impact)
  const btnSimCrash = document.getElementById("btnSimCrash");
  if (btnSimCrash) {
    btnSimCrash.addEventListener("click", () => {
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
    });
  }

  const btnSimReset = document.getElementById("btnSimReset");
  if (btnSimReset) {
    btnSimReset.addEventListener("click", () => {
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
    });
  }
});
