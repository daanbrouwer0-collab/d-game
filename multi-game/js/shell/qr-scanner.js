/**
 * Camera QR scanner (voorhoorn.nl pattern):
 * BarcodeDetector when available, jsQR fallback, getUserMedia overlay.
 */

let jsQrLoaded = false;

async function loadJsQR() {
  if (jsQrLoaded && typeof window.jsQR === "function") return true;
  if (typeof window.jsQR === "function") {
    jsQrLoaded = true;
    return true;
  }
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    script.onload = () => {
      jsQrLoaded = typeof window.jsQR === "function";
      resolve(jsQrLoaded);
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * @param {HTMLVideoElement} video
 * @returns {Promise<string | null>}
 */
export async function detectQrFromVideo(video) {
  if (video.readyState < 2) return null;

  if (typeof BarcodeDetector !== "undefined") {
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(video);
      const raw = codes[0]?.rawValue;
      if (raw) return String(raw);
    } catch {
      /* fallback */
    }
  }

  if (!(await loadJsQR())) return null;
  const canvas = document.createElement("canvas");
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const result = window.jsQR(image.data, image.width, image.height, {
    inversionAttempts: "dontInvert",
  });
  return result?.data ? String(result.data) : null;
}

/**
 * @typedef {{
 *   hint?: string,
 *   onScan: (value: string) => void | Promise<void>,
 *   onError?: (message: string) => void,
 * }} ScannerOptions
 */

/** @type {ReturnType<typeof createScannerOverlay> | null} */
let overlay = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = createScannerOverlay();
  document.body.appendChild(overlay.root);
  return overlay;
}

function createScannerOverlay() {
  const root = document.createElement("div");
  root.className = "qr-scanner";
  root.hidden = true;
  root.innerHTML = `
    <div class="qr-scanner-frame">
      <video class="qr-scanner-video" playsinline muted></video>
      <div class="qr-scanner-permission">
        <p class="qr-scanner-permission-text">Camera heeft nog geen toegang.</p>
        <button type="button" class="btn btn-primary qr-scanner-allow">Toestemming geven</button>
      </div>
    </div>
    <p class="qr-scanner-status">Richt de camera op een QR-code</p>
    <button type="button" class="btn btn-ghost qr-scanner-close">Sluiten</button>`;

  const video = /** @type {HTMLVideoElement} */ (
    root.querySelector(".qr-scanner-video")
  );
  const permission = /** @type {HTMLElement} */ (
    root.querySelector(".qr-scanner-permission")
  );
  const permissionText = /** @type {HTMLElement} */ (
    root.querySelector(".qr-scanner-permission-text")
  );
  const allowBtn = /** @type {HTMLButtonElement} */ (
    root.querySelector(".qr-scanner-allow")
  );
  const statusEl = /** @type {HTMLElement} */ (
    root.querySelector(".qr-scanner-status")
  );
  const closeBtn = /** @type {HTMLButtonElement} */ (
    root.querySelector(".qr-scanner-close")
  );
  const frame = /** @type {HTMLElement} */ (
    root.querySelector(".qr-scanner-frame")
  );

  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {number | null} */
  let loopId = null;
  let scanBusy = false;
  /** @type {ScannerOptions | null} */
  let activeOpts = null;

  function setStatus(msg) {
    statusEl.textContent = msg;
  }

  function showPermission(msg, showAllow = true) {
    permission.hidden = false;
    root.classList.remove("is-live");
    permissionText.textContent = msg;
    allowBtn.hidden = !showAllow;
  }

  function hidePermission() {
    permission.hidden = true;
    root.classList.add("is-live");
  }

  async function stop() {
    if (loopId != null) {
      clearTimeout(loopId);
      loopId = null;
    }
    scanBusy = false;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    root.hidden = true;
    activeOpts = null;
  }

  async function scanLoop() {
    if (root.hidden || !activeOpts) return;
    if (!scanBusy) {
      scanBusy = true;
      try {
        const value = await detectQrFromVideo(video);
        if (value) {
          await stop();
          await activeOpts.onScan(value);
          return;
        }
      } catch (err) {
        console.error(err);
      } finally {
        scanBusy = false;
      }
    }
    loopId = window.setTimeout(scanLoop, 250);
  }

  async function startCamera() {
    allowBtn.disabled = true;
    allowBtn.textContent = "Bezig…";
    setStatus("Camera starten…");

    if (!window.isSecureContext) {
      showPermission(
        "Camera werkt alleen via https of localhost. Open de site op je telefoon via hetzelfde netwerk.",
      );
      allowBtn.disabled = false;
      allowBtn.textContent = "Toestemming geven";
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showPermission("Camera niet ondersteund in deze browser. Probeer Chrome.", false);
      allowBtn.disabled = false;
      allowBtn.textContent = "Toestemming geven";
      return;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      hidePermission();
      setStatus(activeOpts?.hint || "Richt de camera op een QR-code");
      scanLoop();
    } catch (err) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String(/** @type {{ name?: string }} */ (err).name)
          : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        showPermission("Cameratoegang geweigerd. Sta camera toe in je browser.");
      } else {
        showPermission("Camera kon niet starten. Probeer opnieuw.");
      }
      activeOpts?.onError?.(name || "camera_error");
    } finally {
      allowBtn.disabled = false;
      allowBtn.textContent = "Toestemming geven";
    }
  }

  allowBtn.addEventListener("click", () => startCamera());
  closeBtn.addEventListener("click", () => stop());

  return {
    root,
    frame,
    video,
    /**
     * @param {ScannerOptions} opts
     */
    async open(opts) {
      activeOpts = opts;
      root.hidden = false;
      setStatus(opts.hint || "Richt de camera op een QR-code");
      showPermission("Camera heeft nog geen toegang.", true);
      await startCamera();
    },
    stop,
  };
}

/**
 * Open full-screen QR scanner; calls onScan with raw QR text.
 * @param {ScannerOptions} opts
 */
export async function openQrScanner(opts) {
  const ui = ensureOverlay();
  await ui.open(opts);
}

export async function closeQrScanner() {
  if (overlay) await overlay.stop();
}
