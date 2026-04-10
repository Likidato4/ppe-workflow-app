const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const localVideo = document.getElementById("localVideo");
const annotatedFrame = document.getElementById("annotatedFrame");
const detectionCount = document.getElementById("detectionCount");
const predictionOutput = document.getElementById("predictionOutput");

let stream = null;
let pc = null;
let dataChannel = null;

function setStatus(message) {
  statusEl.textContent = message;
}

async function startApp() {
  try {
    startBtn.disabled = true;
    setStatus("Requesting webcam...");

    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: false
    });

    localVideo.srcObject = stream;
    setStatus("Creating workflow session...");

    const sessionRes = await fetch("/api/session", {
      method: "POST"
    });

    const session = await sessionRes.json();

    if (!sessionRes.ok) {
      throw new Error(session.details || session.error || "Failed to create session");
    }

    console.log("Workflow session:", session);

    pc = new RTCPeerConnection({
      iceServers: session.ice_servers || []
    });

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const remoteVideo = document.createElement("video");
      remoteVideo.srcObject = remoteStream;
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      remoteVideo.addEventListener("loadedmetadata", () => {
        canvas.width = remoteVideo.videoWidth || 1280;
        canvas.height = remoteVideo.videoHeight || 720;

        const draw = () => {
          if (!remoteVideo.paused && !remoteVideo.ended) {
            ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
            annotatedFrame.src = canvas.toDataURL("image/jpeg");
          }
          requestAnimationFrame(draw);
        };

        draw();
      });
    };

    pc.ondatachannel = (event) => {
      dataChannel = event.channel;

      dataChannel.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          console.log("Workflow data:", data);

          const predictions = data.predictions || [];
          detectionCount.textContent = String(predictions.length);
          predictionOutput.textContent = JSON.stringify(data, null, 2);
        } catch (err) {
          console.error("Data parse error:", err);
        }
      };
    };

    await pc.setRemoteDescription({
      type: "offer",
      sdp: session.offer
    });

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await fetch(session.answer_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        answer: answer.sdp
      })
    });

    setStatus("Workflow stream live");
    stopBtn.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(`Error: ${error.message}`);
    startBtn.disabled = false;
  }
}

function stopApp() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }

  if (pc) {
    pc.close();
    pc = null;
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  localVideo.srcObject = null;
  annotatedFrame.removeAttribute("src");
  detectionCount.textContent = "0";
  predictionOutput.textContent = "No predictions yet.";
  setStatus("Stopped");

  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener("click", startApp);
stopBtn.addEventListener("click", stopApp);
