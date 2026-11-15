// camera.js – Handles camera access and image capture for PrivateScan
// Provides functions to start the video stream, capture a frame, and load from file input.

/** Start the rear‑facing camera if available, otherwise any camera. */
export async function startCamera(videoElement) {
  const constraints = {
    video: {
      facingMode: { ideal: "environment" }, // rear camera on mobile
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    await videoElement.play();
    return stream;
  } catch (e) {
    console.warn('Camera not available, falling back to file input.', e);
    return null;
  }
}

/** Capture the current video frame and return an HTMLImageElement */
export function captureFrame(videoElement, canvasElement) {
  const ctx = canvasElement.getContext('2d');
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  const dataUrl = canvasElement.toDataURL('image/jpeg');
  const img = new Image();
  img.src = dataUrl;
  return img;
}

/** Load an image from a File object (selected via file input) */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
