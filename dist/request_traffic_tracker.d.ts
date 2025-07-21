/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import http from 'node:http';
import type net from 'node:net';
import { EventEmitter } from 'node:events';
export interface RequestTrafficStats {
    requestId: string;
    method: string;
    url: string;
    hostname: string;
    port: number;
    startTime: number;
    endTime?: number;
    duration?: number;
    isHttp: boolean;
    clientUploadBytes: number;
    clientDownloadBytes: number;
    targetUploadBytes: number;
    targetDownloadBytes: number;
    totalUploadBytes: number;
    totalDownloadBytes: number;
    statusCode?: number;
    error?: string;
}
export declare class RequestTrafficTracker extends EventEmitter {
    private activeRequests;
    private requestCounter;
    constructor();
    /**
     * Start tracking a new request
     */
    startRequest(request: http.IncomingMessage, connectionId: number, isHttp?: boolean): string;
    /**
     * Track HTTP request/response cycle
     */
    trackHttpRequest(requestId: string, request: http.IncomingMessage, response: http.ServerResponse): void;
    /**
     * Track CONNECT request (HTTPS tunneling)
     */
    trackConnectRequest(requestId: string, socket: net.Socket): void;
    /**
     * Track target socket (connection to upstream proxy or target server)
     */
    trackTargetSocket(requestId: string, socket: net.Socket): void;
    /**
     * Calculate headers size
     */
    private calculateHeadersSize;
    /**
     * Calculate response headers size
     */
    private calculateResponseHeadersSize;
    /**
     * Complete tracking for a request
     */
    endRequest(requestId: string, error?: string): void;
    /**
     * Get current stats for a request
     */
    getRequestStats(requestId: string): RequestTrafficStats | undefined;
    /**
     * Get all active requests
     */
    getActiveRequests(): RequestTrafficStats[];
    /**
     * Clear all active requests
     */
    clear(): void;
}
//# sourceMappingURL=request_traffic_tracker.d.ts.map