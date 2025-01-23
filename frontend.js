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
  if (!mediaRecorder) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      audioChunks = [];
      const audioBase64 = await blobToBase64(audioBlob);

      // Initialize WebSocket if not already connected
      if (!websocket || websocket.readyState === WebSocket.CLOSED) {
        websocket = new WebSocket(
          "wss://excelai-ml-model-api.vastlearn.io/ws/conversation"
        );
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

        websocket.onmessage = (event) => {
          const message = JSON.parse(event.data);

          if (message) {
            console.log("Received message in client");
            // console.log(message);
          }
          // Check if the stream object and video_chunk exist
          if (message.stream && message.stream.video_stream) {
            console.log("Received video");

            try {
              const base64String = message.stream.video_stream;
              const byteCharacters = atob(base64String); // Decode Base64
              const byteNumbers = Array.from(byteCharacters, (char) =>
                char.charCodeAt(0)
              ); // Convert to byte numbers
              const byteArray = new Uint8Array(byteNumbers); // Create a Uint8Array
              const blob = new Blob([byteArray], { type: "video/mp4" }); // Create a Blob

              // Set the video source and play
              videoPlayer.src = URL.createObjectURL(blob);
              videoPlayer.play().catch((err) => {
                console.error("Error playing video:", err);
              });
            } catch (error) {
              console.error("Error decoding video chunk:", error);
            }
          }
        };
      } else {
        websocket.send(
          JSON.stringify({ session_id: "wool", audio: audioBase64 })
        );
      }
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
//=w#m4L:#Ho4COWcG*3Yw
