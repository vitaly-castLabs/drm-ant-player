import { W as WebRTCAdaptor } from "./antmedia/webrtc_adaptor-dc54c8cf.js";
import { rtcDrmConfigure, rtcDrmOnTrack, rtcDrmEnvironments } from "../../rtc-drm-transform/rtc-drm-transform.min.js";
import "./antmedia/loglevel.min.js";

const DEFAULT_SOURCE = "http://127.0.0.1:5080/live/";
const DEFAULT_KEY_ID_HEX = "00000000000000000000000000000001";
const DEFAULT_IV_HEX = "d5fbd6b82ed93e4ef98ae40931ee33b7";

const setupScreen = document.getElementById("setup_screen");
const playerScreen = document.getElementById("player_screen");
const startForm = document.getElementById("start_form");
const startButton = document.getElementById("start_button");
const sourceInput = document.getElementById("source_input");
const encryptionSelect = document.getElementById("encryption_select");
const environmentSelect = document.getElementById("environment_select");
const merchantIdInput = document.getElementById("merchant_id_input");
const keyIdInput = document.getElementById("key_id_input");
const bufferInput = document.getElementById("buffer_input");
const hwSecureInput = document.getElementById("hw_secure_input");
const outputProtectionInput = document.getElementById("output_protection_input");
const drmFields = Array.from(document.querySelectorAll(".drm-field"));
const streamLabel = document.getElementById("stream_label");
const videoInfo = document.getElementById("video_info");
const videoContainer = document.getElementById("video_container");
const videoElement = document.getElementById("video-player");
const audioElement = document.getElementById("remote-audio");
const networkWarning = document.getElementById("networkWarning");

const STORAGE_KEY = "ant-rtc-player-settings";

let adaptor = null;
let drmConfig = null;
let activeStreamId = null;

const defaultSettings = {
  source: DEFAULT_SOURCE,
  encryption: "clear",
  environment: "production",
  merchantId: "",
  keyId: DEFAULT_KEY_ID_HEX,
  bufferSize: "500",
  hwSecure: false,
  outputProtection: false
};

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getStreamId() {
  return getParam("id") || getParam("name") || "stream";
}

function normalizeSource(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) {
    return DEFAULT_SOURCE;
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function sourceToWebSocket(source) {
  const url = new URL(normalizeSource(source));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/websocket`;
  return url.toString();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInfoHtml(message) {
  const escaped = escapeHtml(message);
  return escaped.replaceAll(
    "https://castlabs.com/security/webrtc/",
    '<a href="https://castlabs.com/security/webrtc/" target="_blank" rel="noopener noreferrer">https://castlabs.com/security/webrtc/</a>'
  );
}

function setInfo(message) {
  videoInfo.innerHTML = formatInfoHtml(message);
  videoInfo.classList.remove("hidden");
}

function hideInfo() {
  videoInfo.classList.add("hidden");
}

function setWarning(message) {
  if (message) {
    networkWarning.textContent = message;
    networkWarning.classList.remove("hidden");
  } else {
    networkWarning.textContent = "";
    networkWarning.classList.add("hidden");
  }
}

function setPlayerVisible(visible) {
  videoContainer.classList.toggle("hidden", !visible);
}

function syncDrmFields() {
  const drmEnabled = encryptionSelect.value === "drm";
  environmentSelect.disabled = !drmEnabled;
  merchantIdInput.disabled = !drmEnabled;
  keyIdInput.disabled = !drmEnabled;
  bufferInput.disabled = !drmEnabled;
  hwSecureInput.disabled = !drmEnabled;
  outputProtectionInput.disabled = !drmEnabled;
  drmFields.forEach((field) => field.classList.toggle("disabled", !drmEnabled));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultSettings };
    }
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch (error) {
    console.warn("Failed to load saved settings", error);
    return { ...defaultSettings };
  }
}

function saveSettings() {
  const settings = {
    source: sourceInput.value,
    encryption: encryptionSelect.value,
    environment: environmentSelect.value,
    merchantId: merchantIdInput.value,
    keyId: keyIdInput.value,
    bufferSize: bufferInput.value,
    hwSecure: hwSecureInput.checked,
    outputProtection: outputProtectionInput.checked
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettings(settings) {
  sourceInput.value = settings.source;
  encryptionSelect.value = settings.encryption;
  environmentSelect.value = settings.environment;
  merchantIdInput.value = settings.merchantId;
  keyIdInput.value = settings.keyId;
  bufferInput.value = settings.bufferSize;
  hwSecureInput.checked = settings.hwSecure;
  outputProtectionInput.checked = settings.outputProtection;
}

function resetMediaElements() {
  videoElement.pause();
  audioElement.pause();
  videoElement.srcObject = null;
  audioElement.srcObject = null;
}

function stopPlayback() {
  if (adaptor && activeStreamId) {
    try {
      adaptor.stop(activeStreamId);
    } catch (error) {
      console.warn("Failed to stop playback", error);
    }
  }
  adaptor = null;
  drmConfig = null;
  activeStreamId = null;
  resetMediaElements();
}

function hexToBytes(hex, expectedBytes, label) {
  const normalized = (hex || "").trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes * 2} hex characters`);
  }

  const bytes = new Uint8Array(expectedBytes);
  for (let index = 0; index < expectedBytes; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function createDrmConfig() {
  const crt = {
    profile: {
      purchase: {}
    },
    outputProtection: {
      enforce: outputProtectionInput.checked
    }
  };

  const video = {
    codec: "H264",
    encryption: "cbcs",
    keyId: hexToBytes(keyIdInput.value || DEFAULT_KEY_ID_HEX, 16, "keyId"),
    iv: hexToBytes(DEFAULT_IV_HEX, 16, "iv")
  };

  if (hwSecureInput.checked) {
    video.robustness = "HW";
  }

  return {
    merchant: merchantIdInput.value.trim(),
    environment: environmentSelect.value === "staging" ? rtcDrmEnvironments.Staging : rtcDrmEnvironments.Production,
    sessionId: `crtjson:${JSON.stringify(crt)}`,
    mediaBufferMs: Number.parseInt(bufferInput.value, 10) || 500,
    videoElement,
    audioElement,
    video,
    audio: {
      codec: "AAC",
      encryption: "clear"
    }
  };
}

function onPlaybackStarted() {
  hideInfo();
  setWarning("");
  setPlayerVisible(true);
  videoElement.play().catch(() => {});
  audioElement.play().catch(() => {});
}

function onPlaybackFinished() {
  setPlayerVisible(false);
  setInfo("Playback finished or the stream is no longer active.");
  setupScreen.classList.remove("hidden");
}

function createAdaptor(source, drmEnabled) {
  const config = {
    websocketURL: sourceToWebSocket(source),
    isPlayMode: true,
    debug: false,
    reconnectIfRequiredFlag: true,
    callback(info, obj) {
      console.debug("playback", info, obj);

      if (info === "initialized") {
        adaptor.play(activeStreamId, getParam("token") || undefined, undefined, undefined, getParam("subscriberId") || undefined, getParam("subscriberCode") || undefined);
        return;
      }

      if (info === "play_started") {
        onPlaybackStarted();
        return;
      }

      if (info === "play_finished") {
        onPlaybackFinished();
        return;
      }

      if (info === "ice_connection_state_changed") {
        const state = obj?.state;
        if (state === "failed" || state === "disconnected" || state === "closed") {
          setWarning("Connection problem detected. Playback may stall or reconnect.");
        } else {
          setWarning("");
        }
      }
    },
    callbackError(error, message) {
      console.error("Playback error", error, message);
      setWarning(message || error);
      setInfo(`Playback error: ${message || error}`);
    }
  };

  if (drmEnabled) {
    config.peerconnection_config = {
      iceServers: [{ urls: "stun:stun1.l.google.com:19302" }],
      encodedInsertableStreams: true
    };
  } else {
    config.remoteVideoElement = videoElement;
  }

  return new WebRTCAdaptor(config);
}

function startClearPlayback(source) {
  adaptor = createAdaptor(source, false);
}

function startDrmPlayback(source) {
  drmConfig = createDrmConfig();
  drmConfig.videoElement.addEventListener("rtcdrmerror", (event) => {
    const message = event?.detail?.message || "Unknown DRM error";
    setWarning(message);
    setInfo(`DRM playback error: ${message}`);
    stopPlayback();
  }, { once: true });

  rtcDrmConfigure(drmConfig);
  adaptor = createAdaptor(source, true);
  adaptor.onTrack = (event) => {
    try {
      rtcDrmOnTrack(event, drmConfig);
    } catch (error) {
      setWarning(error.message);
      setInfo(`DRM track setup failed: ${error.message}`);
      stopPlayback();
    }
  };
}

function startPlayback() {
  stopPlayback();
  activeStreamId = getStreamId();

  const source = normalizeSource(sourceInput.value);
  const drmEnabled = encryptionSelect.value === "drm";

  sourceInput.value = source;
  saveSettings();
  startButton.disabled = true;
  setupScreen.classList.add("hidden");
  playerScreen.classList.remove("hidden");
  setPlayerVisible(false);
  setWarning("");
  setInfo(`Starting ${drmEnabled ? "DRM" : "clear"} playback from ${source}`);

  try {
    if (drmEnabled) {
      startDrmPlayback(source);
    } else {
      startClearPlayback(source);
    }
  } catch (error) {
    console.error(error);
    setWarning(error.message);
    setInfo(`Failed to start playback: ${error.message}`);
  } finally {
    startButton.disabled = false;
  }
}

videoElement.autoplay = true;
videoElement.controls = false;
audioElement.autoplay = true;

streamLabel.textContent = `Stream ID: ${getStreamId()}`;
applySettings(loadSettings());
syncDrmFields();

[
  sourceInput,
  encryptionSelect,
  environmentSelect,
  merchantIdInput,
  keyIdInput,
  bufferInput,
  hwSecureInput,
  outputProtectionInput
].forEach((element) => {
  element.addEventListener("change", () => {
    syncDrmFields();
    saveSettings();
  });
  element.addEventListener("input", saveSettings);
});

encryptionSelect.addEventListener("change", syncDrmFields);
startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  startPlayback();
});

window.addEventListener("beforeunload", stopPlayback);
