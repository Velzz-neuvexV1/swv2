// DOM Elements
const dropZone = document.getElementById('dropZone');
const videoInput = document.getElementById('videoInput');
const processSection = document.getElementById('processSection');
const progressSection = document.getElementById('progressSection');
const resultSection = document.getElementById('resultSection');

const fileNameEl = document.getElementById('fileName');
const fileSizeEl = document.getElementById('fileSize');
const btnReset = document.getElementById('btnReset');
const btnCompress = document.getElementById('btnCompress');
const qualitySelect = document.getElementById('qualitySelect');

const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const statusText = document.getElementById('statusText');

const sizeBeforeEl = document.getElementById('sizeBefore');
const sizeAfterEl = document.getElementById('sizeAfter');
const downloadLink = document.getElementById('downloadLink');

let rawFile = null;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(2) + ' MB';
}

// Drag & Drop Handling
dropZone.addEventListener('click', () => videoInput.click());
dropZone.addEventListener('dragover', (e) => { 
  e.preventDefault(); 
  dropZone.classList.add('dragover'); 
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

videoInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith('video/')) {
    alert('Harap masukkan file video yang valid.');
    return;
  }
  rawFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);

  dropZone.classList.add('hidden');
  processSection.classList.remove('hidden');
}

btnReset.addEventListener('click', () => {
  rawFile = null;
  videoInput.value = '';
  processSection.classList.add('hidden');
  resultSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  dropZone.classList.remove('hidden');
});

// Engine Pemprosesan Video Native Panda
btnCompress.addEventListener('click', async () => {
  if (!rawFile) return;

  processSection.classList.add('hidden');
  progressSection.classList.remove('hidden');

  try {
    statusText.textContent = "Menganalisis meta video...";
    progressBar.style.width = '5%';
    progressPercent.textContent = '5%';

    const videoEl = document.createElement('video');
    videoEl.src = URL.createObjectURL(rawFile);
    videoEl.muted = true;
    videoEl.playsInline = true;

    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = resolve;
      videoEl.onerror = () => reject(new Error('Gagal memuat file video.'));
    });

    // Preset Kualitas ala Panda Compressor
    const preset = qualitySelect.value;
    let targetH = 720;
    let targetBitrate = 2200000; // 2.2 Mbps (Jernih untuk Status WA)

    if (preset === 'small') {
      targetH = 480;
      targetBitrate = 900000;
    } else if (preset === 'high') {
      targetH = 1080;
      targetBitrate = 4000000;
    }

    let targetWidth = videoEl.videoWidth;
    let targetHeight = videoEl.videoHeight;

    if (targetHeight > targetH) {
      const ratio = targetH / targetHeight;
      targetHeight = targetH;
      targetWidth = Math.round(videoEl.videoWidth * ratio);
    }
    
    // Pastikan dimensi genap untuk encoder
    targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
    targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });

    const stream = canvas.captureStream(30);

    // Stream Audio Routing
    let audioContext = null;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const sourceNode = audioContext.createMediaElementSource(videoEl);
      const destNode = audioContext.createMediaStreamDestination();
      sourceNode.connect(destNode);

      if (destNode.stream.getAudioTracks().length > 0) {
        stream.addTrack(destNode.stream.getAudioTracks()[0]);
      }
    } catch (e) {
      console.warn("Audio track error / silent video", e);
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4');

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      videoBitsPerSecond: targetBitrate
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const compressedBlob = new Blob(chunks, { type: mimeType });
      sizeBeforeEl.textContent = formatBytes(rawFile.size);
      sizeAfterEl.textContent = formatBytes(compressedBlob.size);

      if (downloadLink.href) URL.revokeObjectURL(downloadLink.href);
      downloadLink.href = URL.createObjectURL(compressedBlob);
      downloadLink.download = `panda_compressed.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`;

      progressSection.classList.add('hidden');
      resultSection.classList.remove('hidden');

      if (audioContext) audioContext.close();
      URL.revokeObjectURL(videoEl.src);
    };

    statusText.textContent = "Mengompresi video...";
    mediaRecorder.start(1000); // Record per detik (chunking) untuk mencegah RAM bocor

    await videoEl.play();

    const drawLoop = () => {
      if (!videoEl.ended && !videoEl.paused) {
        ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
        const progress = Math.min(Math.round((videoEl.currentTime / videoEl.duration) * 100), 99);
        progressBar.style.width = `${progress}%`;
        progressPercent.textContent = `${progress}%`;
        requestAnimationFrame(drawLoop);
      } else {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          progressBar.style.width = '100%';
          progressPercent.textContent = '100%';
        }
      }
    };

    drawLoop();

  } catch (err) {
    console.error("Detail Error:", err);
    alert("Proses kompresi gagal: " + err.message);
    progressSection.classList.add('hidden');
    processSection.classList.remove('hidden');
  }
});
