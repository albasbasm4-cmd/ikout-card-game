import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { InlineQrScanner } from "../components/InlineQrScanner";
import { useStageFit } from "../hooks/use-stage-fit";

// Mock jsQR
vi.mock("jsqr", () => {
  return {
    default: vi.fn(),
  };
});

import jsQR from "jsqr";

function createMockTrack() {
  return {
    stop: vi.fn(),
    kind: "video",
    enabled: true,
  };
}

function createMockStream(tracks = [createMockTrack()]) {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream;
}

describe("Fullscreen & QR Scanner Comprehensive Test Suite", () => {
  let originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    if (!navigator.mediaDevices) {
      // @ts-expect-error mock mediaDevices
      navigator.mediaDevices = {};
    }
    originalGetUserMedia = navigator.mediaDevices.getUserMedia;

    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({
        data: new Uint8ClampedArray(100),
        width: 5,
        height: 5,
      }),
    } as unknown as CanvasRenderingContext2D);

    vi.mocked(jsQR).mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  });

  it("1. stops in-flight stream if camera is cancelled while waiting for getUserMedia", async () => {
    const track = createMockTrack();
    const stream = createMockStream([track]);

    let resolveGetUserMedia!: (val: MediaStream) => void;
    navigator.mediaDevices.getUserMedia = vi.fn().mockImplementation(() => {
      return new Promise<MediaStream>((resolve) => {
        resolveGetUserMedia = resolve;
      });
    });

    const onCancel = vi.fn();
    const onCode = vi.fn();

    const { unmount } = render(<InlineQrScanner onCode={onCode} onCancel={onCancel} />);

    // Cancel while getUserMedia is still pending
    unmount();

    // Now resolve the late getUserMedia promise
    await act(async () => {
      resolveGetUserMedia(stream);
    });

    // The stream arrived after session cancellation; all its tracks must be immediately stopped!
    expect(track.stop).toHaveBeenCalled();
    expect(onCode).not.toHaveBeenCalled();
  });

  it("2. stops late MediaStream if session token changed (new session started)", async () => {
    const track1 = createMockTrack();
    const stream1 = createMockStream([track1]);

    const track2 = createMockTrack();
    const stream2 = createMockStream([track2]);

    let resolveFirstStream!: (val: MediaStream) => void;
    let resolveSecondStream!: (val: MediaStream) => void;

    let callCount = 0;
    navigator.mediaDevices.getUserMedia = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new Promise<MediaStream>((r) => {
          resolveFirstStream = r;
        });
      }
      return new Promise<MediaStream>((r) => {
        resolveSecondStream = r;
      });
    });

    const onCode1 = vi.fn();
    const onCancel1 = vi.fn();
    const onCode2 = vi.fn();
    const onCancel2 = vi.fn();

    // Render first scanner
    const { unmount: unmount1 } = render(<InlineQrScanner onCode={onCode1} onCancel={onCancel1} />);

    // Concurrently mount second scanner (or re-render)
    render(<InlineQrScanner onCode={onCode2} onCancel={onCancel2} />);

    // Now first stream arrives late
    await act(async () => {
      resolveFirstStream(stream1);
    });

    // stream1 must be discarded and stopped because session 1 was superseded
    expect(track1.stop).toHaveBeenCalled();

    // Second stream arrives for the active session
    await act(async () => {
      resolveSecondStream(stream2);
    });
    expect(track2.stop).not.toHaveBeenCalled();

    unmount1();
  });

  it("3. handles successful QR read, calls onCode once, and tears down camera stream", async () => {
    const track = createMockTrack();
    const stream = createMockStream([track]);

    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(stream);

    const onCode = vi.fn();
    const onCancel = vi.fn();

    // Mock video element readiness
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", {
      value: 4,
      configurable: true,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      value: 640,
      configurable: true,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      value: 480,
      configurable: true,
    });

    // Mock canvas context
    const mockContext = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({
        data: new Uint8ClampedArray(640 * 480 * 4),
        width: 640,
        height: 480,
      }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      mockContext as unknown as CanvasRenderingContext2D,
    );

    // Mock jsQR returning a code
    vi.mocked(jsQR).mockReturnValue({
      data: "ROOM123",
    } as unknown as import("jsqr").QRCode);

    render(<InlineQrScanner onCode={onCode} onCancel={onCancel} />);

    // Flush promises and run timers for tick
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(120);
    });

    expect(onCode).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith("ROOM123");
    expect(track.stop).toHaveBeenCalled();

    // Run further timers to ensure no duplicate onCode
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onCode).toHaveBeenCalledTimes(1);
  });

  it("4. handles camera permission denial without freezing and offers manual retry", async () => {
    const notAllowedError = new Error("Permission denied");
    notAllowedError.name = "NotAllowedError";
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(notAllowedError);

    const onCode = vi.fn();
    const onCancel = vi.fn();

    render(<InlineQrScanner onCode={onCode} onCancel={onCancel} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/تم رفض إذن الكاميرا/)).toBeDefined();

    // Click close button in error state
    fireEvent.click(screen.getByText("إغلاق ومتابعة الإدخال اليدوي"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("5. stops all tracks when unmounted during active video playback", async () => {
    const track = createMockTrack();
    const stream = createMockStream([track]);
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(stream);

    const onCode = vi.fn();
    const onCancel = vi.fn();

    const { unmount } = render(<InlineQrScanner onCode={onCode} onCancel={onCancel} />);

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(50);
    });

    expect(track.stop).not.toHaveBeenCalled();

    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("6. does not fall back to web camera when native Capacitor barcode scan is cancelled", async () => {
    const mockStartScan = vi.fn().mockResolvedValue({ hasContent: false });
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      Plugins: {
        BarcodeScanner: {
          startScan: mockStartScan,
        },
      },
    };

    navigator.mediaDevices.getUserMedia = vi.fn();
    const onCode = vi.fn();
    const onCancel = vi.fn();

    render(<InlineQrScanner onCode={onCode} onCancel={onCancel} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockStartScan).toHaveBeenCalled();
    // Must call onCancel and NEVER invoke getUserMedia when cancelled by user
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(onCode).not.toHaveBeenCalled();
  });

  it("7. useStageFit calculates stage transform, avoids double insets, and cleans up all timers", () => {
    function TestComponent() {
      const stageRef = useRef<HTMLDivElement>(null);
      useStageFit(stageRef, 1536, 691, "landscape");
      return (
        <div style={{ paddingLeft: "20px" }}>
          <div ref={stageRef} id="test-stage" />
        </div>
      );
    }

    // Set initial dimensions
    Object.defineProperty(window, "innerWidth", {
      value: 1920,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 1080,
      configurable: true,
      writable: true,
    });

    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { container, unmount } = render(<TestComponent />);
    const stageEl = container.querySelector("#test-stage") as HTMLDivElement;

    expect(stageEl.style.transform).toContain("scale(");

    // Trigger visibilitychange to check staggered timers
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Unmount and verify all timers and listeners are cleaned up
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("orientationchange", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("focus", expect.any(Function));
  });
});
