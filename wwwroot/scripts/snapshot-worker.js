/**
 * Web Worker for parsing binary snapshots off the main thread
 */

importScripts('binary.js?v=4');

self.onmessage = function(e) {
    try {
        const snapshot = BinarySnapshot.parse(e.data);
        self.postMessage({ ok: true, snapshot });
    } catch (err) {
        self.postMessage({ ok: false, error: err.message });
    }
};
