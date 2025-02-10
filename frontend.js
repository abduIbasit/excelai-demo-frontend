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
  // statusDiv.textContent = "Recording audio and generating stream...";
  
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
// const statusDiv = document.getElementById('status');
// Use HTTP on port 8080 since NGINX is serving HLS over HTTP
var videoSrc = 'https://ec2-44-210-103-222.compute-1.amazonaws.com:8080/hls/stream.m3u8';

// hls.js configuration for low latency live streaming
const hlsConfig = {
  maxBufferLength: 5,         // Maximum buffer length in seconds
  maxBufferSize: 0,           // 0 disables a fixed byte limit (using duration instead)
  liveSyncDuration: 1,        // Target live sync duration in seconds
  enableWorker: true          // Offload parsing to a web worker
};

let hls = null;
let pollingInterval = null;

// Function to initialize or reinitialize hls.js
function initializeHLS() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  console.log("Initializing HLS stream...");
  hls = new Hls(hlsConfig);
  hls.loadSource(videoSrc);
  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED, function () {
    // statusDiv.textContent = "Stream available. Playing...";
    video.play().catch(error => {
      console.error("Error playing video:", error);
    });
  });
  hls.on(Hls.Events.ERROR, function(event, data) {
    if (data.fatal) {
      console.error("HLS fatal error:", data);
      // Optionally, try reinitializing after a delay.
      setTimeout(() => {
        initializeHLS();
      }, 5000);
    }
  });
}

// Function to check stream availability with a HEAD request
function checkStreamAvailability() {
  fetch(videoSrc, { method: 'HEAD' })
    .then(response => {
      if (response.ok) {
        // statusDiv.textContent = "Stream available. Loading...";
        if (!hls) {
          initializeHLS();
        }
        clearInterval(pollingInterval);
      } else {
        // statusDiv.textContent = "Stream not available yet (status " + response.status + ").";
        console.log("Stream not available yet, status: " + response.status);
      }
    })
    .catch(error => {
      // statusDiv.textContent = "Error checking stream.";
      console.error("Error checking stream availability:", error);
    });
}

// Start polling every 5 seconds to check if the stream is available.
function startPolling() {
  pollingInterval = setInterval(checkStreamAvailability, 5000);
  checkStreamAvailability();
}

// Initially, start polling for stream availability.
startPolling();

// Listen for the "ended" event. When the stream ends, restart polling.
// video.addEventListener("ended", function () {
//   console.log("Video ended. Resetting stream...");
//   if (hls) {
//     hls.destroy();
//     hls = null;
//   }
//   statusDiv.textContent = "Stream ended. Waiting for new stream...";
//   startPolling();
// });