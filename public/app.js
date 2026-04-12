import { connectors, webrtc, streams } from "@roboflow/inference-sdk";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const annotatedFrame = document.getElementById("annotatedFrame");
const detectionCount = document.getElementById("detectionCount");
const predictionOutput = document.getElementById("predictionOutput");
const viewerPlaceholder = document.getElementById("viewerPlaceholder");
const sessionState = document.getElementById("sessionState");

let cameraStream = null;
let connection = null;
let remoteStream = null;
let remoteVideo = null;
let frameCanvas = null;
let frameCtx = null;
let drawFrameId = null;

const ROBOFLOW_CONFIG = {
  apiKey: "OTkcMqpTe6jNnJydzYKT",
  workspaceName: "rpsppedetections",
  workflowId: "detect-count-and-visualize-5",
  imageInputName: "image",
  streamOutputNames: ["output_image"],
  dataOutputNames: ["count_objects", "predictions"]
};

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
  if (sessionState) sessionState.textContent = message;
}

function setButtons(isRunning) {
  startBtn.disabled = isRunning;
  stopBtn.disabled = !isRunning;
}

function setPlaceholderVisible(isVisible) {
  if (!viewerPlaceholder) return;
  viewerPlaceholder.classList.toggle("hidden", !isVisible);
}

function resetPredictionPanel() {
  if (detectionCount) detectionCount.textContent = "0";
  if (predictionOutput) predictionOutput.textContent = "No predictions yet.";
}

function stopFrameLoop() {
  if (drawFrameId) {
    cancelAnimationFrame(drawFrameId);
    drawFrameId = null;
  }
}

function ensureRenderer() {
  if (!remoteVideo) {
    remoteVideo = document.createElement("video");
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    remoteVideo.muted = true;
  }

  if (!frameCanvas) {
    frameCanvas = document.createElement("canvas");
    frameCtx = frameCanvas.getContext("2d");
  }
}

function startFrameLoop() {
  stopFrameLoop();

  const draw = () => {
    if (
      remoteVideo &&
      frameCtx &&
      annotatedFrame &&
      remoteVideo.readyState >= 2 &&
      !remoteVideo.paused &&
      !remoteVideo.ended
    ) {
      const width = remoteVideo.videoWidth || 1280;
      const height = remoteVideo.videoHeight || 720;

      if (frameCanvas.width !== width || frameCanvas.height !== height) {
        frameCanvas.width = width;
        frameCanvas.height = height;
      }

      frameCtx.drawImage(remoteVideo, 0, 0, frameCanvas.width, frameCanvas.height);
      annotatedFrame.src = frameCanvas.toDataURL("image/jpeg");
      annotatedFrame.style.display = "block";
    }

    drawFrameId = requestAnimationFrame(draw);
  };

  draw();
}

async function startApp() {
  try {
    setButtons(true);
    setStatus("Opening webcam...");
    resetPredictionPanel();

    cameraStream = await streams.useCamera({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: { ideal: "environment" }
      }
    });

    localVideo.srcObject = cameraStream;
    await localVideo.play();

    setPlaceholderVisible(false);
    setStatus("Connecting to Roboflow workflow...");

    const connector = connectors.withApiKey(ROBOFLOW_CONFIG.apiKey);

    connection = await webrtc.useStream({
      source: cameraStream,
      connector,
      wrtcParams: {
        workspaceName: ROBOFLOW_CONFIG.workspaceName,
        workflowId: ROBOFLOW_CONFIG.workflowId,
        imageInputName: ROBOFLOW_CONFIG.imageInputName,
        streamOutputNames: ROBOFLOW_CONFIG.streamOutputNames,
        dataOutputNames: ROBOFLOW_CONFIG.dataOutputNames
      },
      onData: (data) => {
        console.log("Workflow data:", data);

        const predictions = Array.isArray(data?.predictions) ? data.predictions : [];
        if (detectionCount) detectionCount.textContent = String(predictions.length);
        if (predictionOutput) predictionOutput.textContent = JSON.stringify(data, null, 2);
      }
    });

    remoteStream = await connection.remoteStream();

    ensureRenderer();
    remoteVideo.srcObject = remoteStream;

    remoteVideo.onloadedmetadata = async () => {
      try {
        await remoteVideo.play();
      } catch (error) {
        console.error("Remote stream play error:", error);
      }
      startFrameLoop();
    };

    setStatus("Workflow stream live");
  } catch (error) {
    console.error("Start app error:", error);
    setStatus(`Error: ${error.message}`);
    stopApp();
  }
}

async function stopApp() {
  stopFrameLoop();

  try {
    if (connection) {
      await connection.cleanup();
      connection = null;
    }
  } catch (error) {
    console.error("Cleanup error:", error);
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (remoteVideo) {
    remoteVideo.pause();
    remoteVideo.srcObject = null;
  }

  if (localVideo) {
    localVideo.pause();
    localVideo.srcObject = null;
  }

  if (annotatedFrame) {
    annotatedFrame.removeAttribute("src");
    annotatedFrame.style.display = "none";
  }

  resetPredictionPanel();
  setPlaceholderVisible(true);
  setStatus("Stopped");
  setButtons(false);
}

startBtn.addEventListener("click", startApp);
stopBtn.addEventListener("click", stopApp);

setButtons(false);
setPlaceholderVisible(true);
setStatus("Idle");
resetPredictionPanel();
