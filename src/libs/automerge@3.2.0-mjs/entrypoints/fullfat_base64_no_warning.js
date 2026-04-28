import { automergeWasmBase64 } from '../wasm_bindgen_output/web/automerge_wasm_bg_base64.js';
import * as Automerge from '../index.js';

if (!Automerge.isWasmInitialized()) {
  await Automerge.initializeBase64Wasm(automergeWasmBase64);
}

export * from '../index.js';
