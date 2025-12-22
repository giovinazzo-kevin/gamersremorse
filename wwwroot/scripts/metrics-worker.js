importScripts('metrics.js');

self.onmessage = function(e) {
    try {
        const { snapshot, options } = e.data;
        const result = Metrics.compute(snapshot, options);
        self.postMessage({ ok: true, result });
    } catch (err) {
        self.postMessage({ ok: false, error: err.message });
    }
};
