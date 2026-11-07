const MAX = 5_000_000;
const stream = (value: Uint8Array<ArrayBuffer>) =>
  new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(value);
      c.close();
    },
  });
async function bytes(stream: ReadableStream<Uint8Array>, max: number) {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > max) {
      await reader.cancel();
      throw Error("取込データが大きすぎます");
    }
    chunks.push(next.value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export async function encodeWorkoutCode(json: string) {
  if (new TextEncoder().encode(json).length > MAX)
    throw Error("取込データが大きすぎます");
  const compressedStream = stream(new TextEncoder().encode(json)).pipeThrough(
      new CompressionStream("gzip"),
    ),
    compressed = await bytes(compressedStream, 128_000);
  return (
    "t2w1." +
    btoa(Array.from(compressed, (b) => String.fromCharCode(b)).join(""))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "")
  );
}
export async function decodeWorkoutCode(input: string) {
  const text = input.trim();
  if (new TextEncoder().encode(text).length > MAX)
    throw Error("取込データが大きすぎます");
  if (text.startsWith("{")) return text;
  if (!/^t2w1\.[A-Za-z0-9_-]+$/.test(text) || text.length > 180_000)
    throw Error("取込コードまたはJSONをそのまま貼り付けてください");
  if (typeof DecompressionStream === "undefined")
    throw Error(
      "このブラウザーでは取込コードを展開できません。JSONファイルを選択してください",
    );
  const raw = atob(text.slice(5).replaceAll("-", "+").replaceAll("_", "/")),
    compressed = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(
    await bytes(
      stream(compressed).pipeThrough(new DecompressionStream("gzip")),
      MAX,
    ),
  );
}
