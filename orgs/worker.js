// Decodes DataMatrix in a background thread so the camera preview stays smooth.
// The page builds this worker from vendor/zxing-reader.js + this file and sends
// the wasm module itself, so the worker never touches the network: everything
// it needs comes from the page, which the offline cache always serves.
let ready = null;

// Live frames are small and frequent: keep the search cheap.
const OPTIONS = {
  live: { formats: ["DataMatrix"], tryHarder: true, tryRotate: true, tryInvert: false, tryDownscale: false, textMode: "Plain", maxNumberOfSymbols: 4 },
  photo: { formats: ["DataMatrix"], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, textMode: "Plain", maxNumberOfSymbols: 255 },
};

self.onmessage = async (e) => {
  const { id, image, mode, wasm } = e.data;
  try {
    if (wasm) {
      ready = ZXingWASM.prepareZXingModule({
        overrides: { wasmBinary: wasm, locateFile: (p) => p },
        fireImmediately: true,
      });
      await ready;
      self.postMessage({ id, ready: true });
      return;
    }
    if (!ready) throw new Error("decoder not initialised");
    await ready;
    const pixels = new ImageData(new Uint8ClampedArray(image.buffer), image.width, image.height);
    const res = await ZXingWASM.readBarcodes(pixels, OPTIONS[mode] || OPTIONS.photo);
    self.postMessage({
      id,
      results: res
        .filter((r) => r.isValid && r.text)
        .map((r) => ({ text: r.text, gs1: r.contentType === "GS1" })),
    });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
