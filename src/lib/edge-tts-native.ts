import crypto from "crypto";

export async function generateEdgeTTS(text: string, voice = "te-IN-ShrutiNeural", lang = "te-IN"): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomBytes(16).toString("hex");
    const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${requestId}`;

    // Node's global WebSocket (undici) takes only `protocols` as its second argument and
    // throws a WebIDL conversion error on an options object. This call previously passed
    // `{ headers: … }`, so every neural-TTS attempt threw immediately and the route
    // silently served the lower-quality Google fallback instead. Auth travels in the
    // TrustedClientToken query parameter, so no request headers are needed here.
    //
    // If custom headers ever become necessary, that requires a WebSocket client which
    // supports them (e.g. the `ws` package) — the global one cannot set them.
    const ws = new WebSocket(wsUrl);
    // Ask for ArrayBuffer frames so the binary branch below is hit directly.
    ws.binaryType = "arraybuffer";

    const audioChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      if (audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks));
      } else {
        reject(new Error("TTS timeout"));
      }
    }, 8000);

    ws.onopen = () => {
      // 1. Send speech.config
      const configMsg =
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        });
      ws.send(configMsg);

      // 2. Send SSML request
      const escapedText = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

      const ssmlMsg =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `Path:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
        `<voice name='${voice}'>${escapedText}</voice>` +
        `</speak>`;
      ws.send(ssmlMsg);
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          resolve(Buffer.concat(audioChunks));
        }
      } else if (event.data instanceof Blob) {
        const arrayBuf = await event.data.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        // Header length is 2 bytes (big endian)
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0);
          if (buf.length > 2 + headerLen) {
            const header = buf.subarray(2, 2 + headerLen).toString("utf8");
            if (header.includes("Path:audio")) {
              const audioData = buf.subarray(2 + headerLen);
              if (audioData.length > 0) {
                audioChunks.push(audioData);
              }
            }
          }
        }
      } else if (Buffer.isBuffer(event.data) || event.data instanceof ArrayBuffer) {
        const buf = Buffer.isBuffer(event.data)
          ? event.data
          : Buffer.from(new Uint8Array(event.data));
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0);
          if (buf.length > 2 + headerLen) {
            const header = buf.subarray(2, 2 + headerLen).toString("utf8");
            if (header.includes("Path:audio")) {
              const audioData = buf.subarray(2 + headerLen);
              if (audioData.length > 0) {
                audioChunks.push(audioData);
              }
            }
          }
        }
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      if (audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks));
      } else {
        reject(err);
      }
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks));
      }
    };
  });
}
