const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const annotatedFrame = document.getElementById("annotatedFrame");
const detectionCount = document.getElementById("detectionCount");
const predictionOutput = document.getElementById("predictionOutput");
const viewerPlaceholder = document.getElementById("viewerPlaceholder");
const sessionState = document.getElementById("sessionState");

let stream = null;
let pc = null;
let dataChannel = null;
let remoteVideo = null;
let frameCanvas = null;
let frameCtx = null;
let drawFrameId = null;

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

function ensureRemoteRenderer() {
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

function stopFrameLoop() {
  if (drawFrameId) {
    cancelAnimationFrame(drawFrameId);
    drawFrameId = null;
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

function cleanupConnectionOnly() {
  stopFrameLoop();

  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }

  if (pc) {
    pc.close();
    pc = null;
  }

  if (remoteVideo) {
    remoteVideo.pause();
    remoteVideo.srcObject = null;
  }

  if (annotatedFrame) {
    annotatedFrame.removeAttribute("src");
    annotatedFrame.style.display = "none";
  }
}

async function startApp() {
  try {
    console.log("Start button clicked");
    setButtons(true);
    setStatus("Requesting webcam...");
    resetPredictionPanel();

    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: false
    });

    console.log("Webcam granted");
    localVideo.srcObject = stream;
    await localVideo.play();

    setPlaceholderVisible(false);
    setStatus("Creating workflow session...");

    const sessionRes = await fetch("/api/session", {
      method: "POST"
    });

    console.log("Session response status:", sessionRes.status);

    const session = await sessionRes.json();
    console.log("Workflow session:", session);

    if (!sessionRes.ok) {
      throw new Error(
        typeof session.details === "string"
          ? session.details
          : JSON.stringify(session.details || session.error || "Failed to create session")
      );
    }

    if (!session.offer || !session.answer_url) {
      throw new Error("Session response is missing required WebRTC fields: offer or answer_url");
    }

    setStatus("Connecting to workflow...");

    pc = new RTCPeerConnection({
      iceServers: session.ice_servers || []
    });

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.onconnectionstatechange = () => {
      console.log("Peer connection state:", pc.connectionState);

      if (pc.connectionState === "connected") {
        setStatus("Workflow stream live");
      } else if (pc.connectionState === "connecting" || pc.connectionState === "new") {
        setStatus("Connecting to workflow...");
      } else if (pc.connectionState === "failed") {
        setStatus("Workflow connection failed");
      } else if (pc.connectionState === "disconnected") {
        setStatus("Workflow disconnected");
      } else if (pc.connectionState === "closed") {
        setStatus("Workflow closed");
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE state:", pc.iceConnectionState);
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      console.log("Remote workflow stream received:", remoteStream);

      ensureRemoteRenderer();
      remoteVideo.srcObject = remoteStream;

      remoteVideo.onloadedmetadata = async () => {
        try {
          await remoteVideo.play();
          console.log("Remote annotated stream playing");
        } catch (error) {
          console.error("Remote video play error:", error);
        }
        startFrameLoop();
      };
    };

    pc.ondatachannel = (event) => {
      dataChannel = event.channel;
      console.log("Data channel received:", dataChannel.label);

      dataChannel.onopen = () => {
        console.log("Data channel opened");
      };

      dataChannel.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          console.log("Workflow data:", data);

          const predictions = Array.isArray(data.predictions) ? data.predictions : [];
          if (detectionCount) detectionCount.textContent = String(predictions.length);
          if (predictionOutput) predictionOutput.textContent = JSON.stringify(data, null, 2);
        } catch (err) {
          console.error("Data parse error:", err);
        }
      };

      dataChannel.onerror = (error) => {
        console.error("Data channel error:", error);
      };

      dataChannel.onclose = () => {
        console.log("Data channel closed");
      };
    };

    await pc.setRemoteDescription({
      type: "offer",
      sdp: session.offer
    });

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const answerRes = await fetch(session.answer_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        answer: answer.sdp
      })
    });

    if (!answerRes.ok) {
      const answerText = await answerRes.text();
      throw new Error(`Failed to send WebRTC answer: ${answerText}`);
    }

    setStatus("Starting workflow stream...");
  } catch (error) {
    console.error("Start app error:", error);
    setStatus(`Error: ${error.message}`);

    if (predictionOutput) {
      predictionOutput.textContent = `Startup error:\n${error.message}`;
    }

    cleanupConnectionOnly();

    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function stopApp() {
  cleanupConnectionOnly();

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  if (localVideo) {
    localVideo.pause();
    localVideo.srcObject = null;
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
