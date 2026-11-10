// silk-wasm 的最小类型声明（包本身不随 .d.ts 分发时兜底）
declare module "silk-wasm" {
  export function decode(buffer: Uint8Array, sampleRate: number): Promise<Int16Array>;
  export function encode(pcm: Int16Array, sampleRate: number): Promise<Uint8Array>;
}
