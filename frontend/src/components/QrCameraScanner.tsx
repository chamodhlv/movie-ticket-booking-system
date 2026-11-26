import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

// A friendly sentence for each way the camera can fail.
function describeCameraError(err: unknown): string {
  if (!window.isSecureContext)
    return "The camera only works on HTTPS (or localhost). Use the code box below.";
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError")
    return "Camera access was blocked. Allow it in the browser's address bar, or use the code box below.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No camera was found on this device. Use the code box below.";
  return "The camera could not be started. Use the code box below.";
}

// HOW SCANNING WORKS, in four steps, repeated about 8 times a second:
//   1. The camera stream plays in a <video> element (that is the live picture you see on screen).
//   2. We copy the current video frame onto a <canvas>, scaled down (a QR code doesn't need HD).
//   3. getImageData turns that canvas into raw pixels.
//   4. jsQR looks for a QR code in the pixels. If it finds one, we hand its text to the parent.
export default function QrCameraScanner({
  active,
  onScan,
}: {
  // The parent switches this off while it shows a result, and on again for the next ticket.
  active: boolean;
  onScan: (text: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  // The scanning loop below runs for as long as the camera is on, and must not be restarted just
  // because the parent re-rendered. So the loop reads the LATEST values through refs.
  const onScanRef = useRef(onScan);
  const activeRef = useRef(active);
  // Set once a code was reported. Stops us from reporting the same code 8 times a second while it
  // is still in front of the camera. Cleared when the parent turns `active` back on.
  const reportedRef = useRef(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    activeRef.current = active;
    if (active) reportedRef.current = false;
  }, [active]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0; // id of the next animation frame, so cleanup can cancel it
    let cancelled = false;
    let lastScan = 0;
    const video = videoRef.current!;
    const canvas = document.createElement("canvas"); // never added to the page: only a work surface
    // willReadFrequently: we read pixels back all the time, so keep them in normal memory
    // instead of on the graphics card (faster for this use).
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function tick() {
      frame = requestAnimationFrame(tick);

      const now = performance.now();
      if (now - lastScan < 120) return; // about 8 scans per second is plenty, and saves battery
      lastScan = now;

      if (!activeRef.current || reportedRef.current) return;
      if (
        !ctx ||
        video.readyState < video.HAVE_CURRENT_DATA ||
        !video.videoWidth
      )
        return;

      // Scale the frame so it is at most 640 px wide. Fewer pixels = much faster, and a QR code
      // held at normal distance is still large enough to read.
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // "dontInvert": our QR codes are dark on light, so skip the second, slower pass that
      // looks for light-on-dark codes.
      const code = jsQR(pixels.data, pixels.width, pixels.height, {
        inversionAttempts: "dontInvert",
      });
      if (code?.data) {
        reportedRef.current = true;
        onScanRef.current(code.data);
      }
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // "ideal" environment = the BACK camera on a phone (the laptop has only one, which is
          // fine too). It is a preference, not a demand, so it never fails for lack of one.
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          // The person left the page while the browser was still asking for permission.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        tick();
      } catch (err) {
        if (!cancelled) setError(describeCameraError(err));
      }
    }
    void start();

    // CLEANUP, important: stopping the tracks is what turns the camera (and its light) OFF.
    // Without this the camera would stay on after leaving the page.
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error)
    return (
      <p
        role="alert"
        className="rounded-lg border border-amber-800 bg-amber-950 px-3 py-6 text-center text-sm text-amber-200"
      >
        {error}
      </p>
    );

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      {/* muted + playsInline are REQUIRED for the video to start by itself on phones (iOS would
          otherwise open it fullscreen) */}
      <video
        ref={videoRef}
        muted
        playsInline
        className="aspect-[4/3] w-full object-cover"
      />
      {/* A square "aim here" frame. Purely decorative: the whole picture is scanned. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-3/5 w-3/5 rounded-xl border-2 border-emerald-400/80" />
      </div>
    </div>
  );
}
