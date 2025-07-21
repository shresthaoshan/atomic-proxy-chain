"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestTrafficTracker = void 0;
const tslib_1 = require("tslib");
const node_buffer_1 = require("node:buffer");
const node_http_1 = tslib_1.__importDefault(require("node:http"));
const node_events_1 = require("node:events");
class RequestTrafficTracker extends node_events_1.EventEmitter {
    constructor() {
        super();
        Object.defineProperty(this, "activeRequests", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "requestCounter", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
    /**
     * Start tracking a new request
     */
    startRequest(request, connectionId, isHttp = true) {
        const requestId = `${connectionId}-${++this.requestCounter}`;
        // Handle both HTTP requests and CONNECT requests
        let hostname;
        let port;
        let url;
        if (request.method === 'CONNECT') {
            // CONNECT requests: request.url is "hostname:port"
            const [host, portStr] = request.url.split(':');
            hostname = host;
            port = parseInt(portStr) || 443;
            url = `${hostname}:${port}`;
        }
        else {
            // HTTP requests: request.url is full URL
            try {
                const parsedUrl = new URL(request.url);
                hostname = parsedUrl.hostname;
                port = parseInt(parsedUrl.port) || (parsedUrl.protocol === 'https:' ? 443 : 80);
                url = request.url;
            }
            catch {
                hostname = 'unknown';
                port = 80;
                url = request.url || 'unknown';
            }
        }
        const stats = {
            requestId,
            method: request.method,
            url,
            hostname,
            port,
            startTime: Date.now(),
            isHttp,
            clientUploadBytes: 0,
            clientDownloadBytes: 0,
            targetUploadBytes: 0,
            targetDownloadBytes: 0,
            totalUploadBytes: 0,
            totalDownloadBytes: 0,
        };
        this.activeRequests.set(requestId, stats);
        return requestId;
    }
    /**
     * Track HTTP request/response cycle
     */
    trackHttpRequest(requestId, request, response) {
        const stats = this.activeRequests.get(requestId);
        if (!stats)
            return;
        // Track request headers size
        const requestHeadersSize = this.calculateHeadersSize(request.rawHeaders);
        stats.clientUploadBytes += requestHeadersSize;
        // Track request body
        request.on('data', (chunk) => {
            stats.clientUploadBytes += chunk.length;
            stats.totalUploadBytes = stats.clientUploadBytes;
        });
        // Track response
        const originalWrite = response.write.bind(response);
        const originalEnd = response.end.bind(response);
        const tracker = this;
        response.write = function (chunk, encoding, callback) {
            const size = node_buffer_1.Buffer.isBuffer(chunk) ? chunk.length : node_buffer_1.Buffer.byteLength(chunk, encoding);
            stats.clientDownloadBytes += size;
            stats.totalDownloadBytes = stats.clientDownloadBytes;
            return originalWrite(chunk, encoding, callback);
        };
        response.end = function (chunk, encoding, callback) {
            if (chunk) {
                const size = node_buffer_1.Buffer.isBuffer(chunk) ? chunk.length : node_buffer_1.Buffer.byteLength(chunk, encoding);
                stats.clientDownloadBytes += size;
                stats.totalDownloadBytes = stats.clientDownloadBytes;
            }
            // Track response headers size
            const responseHeadersSize = tracker.calculateResponseHeadersSize(response);
            stats.clientDownloadBytes += responseHeadersSize;
            stats.totalDownloadBytes = stats.clientDownloadBytes;
            stats.statusCode = response.statusCode;
            return originalEnd(chunk, encoding, callback);
        };
        // Handle request completion
        response.on('finish', () => {
            this.endRequest(requestId);
        });
        response.on('close', () => {
            this.endRequest(requestId);
        });
    }
    /**
     * Track CONNECT request (HTTPS tunneling)
     */
    trackConnectRequest(requestId, socket) {
        const stats = this.activeRequests.get(requestId);
        if (!stats)
            return;
        // Track data from client
        socket.on('data', (chunk) => {
            stats.clientUploadBytes += chunk.length;
            stats.totalUploadBytes = stats.clientUploadBytes;
        });
        // Track socket close
        socket.on('close', () => {
            this.endRequest(requestId);
        });
        socket.on('error', (error) => {
            this.endRequest(requestId, error.message);
        });
    }
    /**
     * Track target socket (connection to upstream proxy or target server)
     */
    trackTargetSocket(requestId, socket) {
        const stats = this.activeRequests.get(requestId);
        if (!stats)
            return;
        // Track data to target
        const originalWrite = socket.write.bind(socket);
        socket.write = function (chunk, encoding, callback) {
            const size = node_buffer_1.Buffer.isBuffer(chunk) ? chunk.length : node_buffer_1.Buffer.byteLength(chunk, encoding);
            stats.targetUploadBytes += size;
            return originalWrite(chunk, encoding, callback);
        };
        // Track data from target
        socket.on('data', (chunk) => {
            stats.targetDownloadBytes += chunk.length;
        });
    }
    /**
     * Calculate headers size
     */
    calculateHeadersSize(rawHeaders) {
        return node_buffer_1.Buffer.byteLength(rawHeaders.join('\r\n') + '\r\n\r\n');
    }
    /**
     * Calculate response headers size
     */
    calculateResponseHeadersSize(response) {
        const statusLine = `HTTP/1.1 ${response.statusCode} ${node_http_1.default.STATUS_CODES[response.statusCode]}\r\n`;
        const headers = Object.entries(response.getHeaders())
            .map(([key, value]) => `${key}: ${value}`)
            .join('\r\n');
        return node_buffer_1.Buffer.byteLength(statusLine + headers + '\r\n\r\n');
    }
    /**
     * Complete tracking for a request
     */
    endRequest(requestId, error) {
        const stats = this.activeRequests.get(requestId);
        if (!stats)
            return;
        stats.endTime = Date.now();
        stats.duration = stats.endTime - stats.startTime;
        if (error) {
            stats.error = error;
        }
        // Final calculation
        stats.totalUploadBytes = stats.clientUploadBytes;
        stats.totalDownloadBytes = stats.clientDownloadBytes;
        this.activeRequests.delete(requestId);
        // Emit the final stats
        this.emit('requestComplete', stats);
    }
    /**
     * Get current stats for a request
     */
    getRequestStats(requestId) {
        return this.activeRequests.get(requestId);
    }
    /**
     * Get all active requests
     */
    getActiveRequests() {
        return Array.from(this.activeRequests.values());
    }
    /**
     * Clear all active requests
     */
    clear() {
        this.activeRequests.clear();
    }
}
exports.RequestTrafficTracker = RequestTrafficTracker;
//# sourceMappingURL=request_traffic_tracker.js.map