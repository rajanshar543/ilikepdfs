import fs from 'node:fs';
import { createRequire } from 'node:module';
import { init } from '@jsquash/webp/encode.js';

/** @jsquash/webp normally fetches its wasm over HTTP; in node we hand it the compiled module. */
export async function setWebpWasmForTests() {
    const file = createRequire(import.meta.url).resolve('@jsquash/webp/codec/enc/webp_enc.wasm');
    await init(await WebAssembly.compile(fs.readFileSync(file)));
}
