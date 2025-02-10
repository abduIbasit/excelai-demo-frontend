const recordButton = document.getElementById("recordButton");
const videoPlayer = document.getElementById("videoPlayer");
let mediaRecorder;
let audioChunks = [];
let websocket; // Declare WebSocket globally to access it outside the recording function
let heartbeatInterval; // Store the interval ID for the heartbeat

// Function to send a heartbeat message to keep WebSocket connection alive
function startHeartbeat() {
  if (heartbeatInterval) return; // Prevent multiple intervals
  heartbeatInterval = setInterval(() => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: "ping" })); // Send a "ping" message
      console.log("Heartbeat sent to WebSocket server.");
    }
  }, 5000); // Send every 5 seconds
}

// Function to stop the heartbeat when WebSocket is closed
function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// Select the camera feed video element
const cameraFeed = document.getElementById("cameraFeed");

// Start the camera feed
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    cameraFeed.srcObject = stream;
  } catch (error) {
    console.error("Error accessing the camera:", error);
  }
}

// Automatically start the camera feed when the page loads
document.addEventListener("DOMContentLoaded", startCamera);

// Record voice
recordButton.addEventListener("click", async () => {
  // Clear/reset the polling interval when the user clicks the record button.
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  // Also, if hls.js is running, destroy it so that the client will wait for a new stream.
  if (hls) {
    hls.destroy();
    hls = null;
  }
  
  if (!mediaRecorder) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      audioChunks = [];
      const audioBase64 = await blobToBase64(audioBlob);

      // Initialize WebSocket if not already connected
      if (!websocket || websocket.readyState === WebSocket.CLOSED) {
        websocket = new WebSocket("wss://ec2-44-210-103-222.compute-1.amazonaws.com/ws/conversation");
        websocket.onopen = () => {
          console.log("WebSocket connection established");
          websocket.send(
            JSON.stringify({ session_id: "wool", audio: audioBase64 })
          );
          startHeartbeat(); // Start sending heartbeat messages
        };

        websocket.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        websocket.onclose = () => {
          console.log("WebSocket connection closed.");
          stopHeartbeat(); // Stop sending heartbeat messages
        };

      } else {
        websocket.send(
          JSON.stringify({ session_id: "wool", audio: audioBase64 })
        );
      }

      startPolling();
    };
  }

  if (mediaRecorder.state === "inactive") {
    audioChunks = [];
    mediaRecorder.start();
    recordButton.innerHTML =
      '<i class="fa fa-stop-circle" aria-hidden="true"></i>';
  } else {
    mediaRecorder.stop();
    recordButton.innerHTML =
      '<i class="fa fa-microphone" aria-hidden="true"></i>';
  }
});

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

var video = document.getElementById('videoPlayer');
var videoSrc = 'https://ec2-44-210-103-222.compute-1.amazonaws.com/hls/stream.m3u8';

// hls.js configuration for low latency live streaming
const hlsConfig = {
  maxBufferLength: 5,
  maxBufferSize: 0,
  liveSyncDuration: 1,
  enableWorker: true
};

let hls = null;
let pollingInterval = null;

// Function to initialize or reinitialize hls.js
function initializeHLS() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  hls = new Hls(hlsConfig);
  hls.loadSource(videoSrc);
  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED, function () {
    video.play().catch(error => {
      console.error("Error playing video:", error);
    });
  });
  hls.on(Hls.Events.ERROR, function(event, data) {
    if (data.fatal) {
      setTimeout(() => {
        initializeHLS();
      }, 1000);
    }
  });
}

// Function to check stream availability with a HEAD request
function checkStreamAvailability() {
  fetch(videoSrc, { method: 'HEAD' })
    .then(response => {
      if (response.ok) {
        setTimeout(() => {
          if (!hls) {
            initializeHLS();
          }
          clearInterval(pollingInterval);
        }, 1000);
      }
    })
}

// Start polling every 2 seconds to check if the stream is available.
function startPolling() {
  pollingInterval = setInterval(checkStreamAvailability, 2000);
  checkStreamAvailability();
}

// Initially, start polling for stream availability.
startPolling();
