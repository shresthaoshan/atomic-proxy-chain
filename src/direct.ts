import type { Buffer } from 'node:buffer';
import type dns from 'node:dns';
import type { EventEmitter } from 'node:events';
import net from 'node:net';
import { URL } from 'node:url';

import type { Socket } from './socket';
import { countTargetBytes } from './utils/count_target_bytes';

export interface HandlerOpts {
    localAddress?: string;
    ipFamily?: number;
    dnsLookup?: typeof dns['lookup'];
    customTag?: unknown;
    requestId: string;
    id: number;
}

interface DirectOpts {
    request: { url?: string, [key: string]: any };
    sourceSocket: Socket;
    head: Buffer;
    server: EventEmitter & {
        log: (connectionId: unknown, str:string) => void,
        emit: (event: string, ...args: any[]) => boolean,
    };
    handlerOpts: HandlerOpts;
}

/**
 * Directly connects to the target.
 * Client -> Apify (CONNECT) -> Web
 * Client <- Apify (CONNECT) <- Web
 */
export const direct = (
    {
        request,
        sourceSocket,
        head,
        server,
        handlerOpts,
    }: DirectOpts,
): void => {
    const url = new URL(`connect://${request.url}`);

    if (!url.hostname) {
        throw new Error('Missing CONNECT hostname');
    }

    if (!url.port) {
        throw new Error('Missing CONNECT port');
    }

    if (head.length > 0) {
        // See comment in chain.ts
        sourceSocket.unshift(head);
    }

    const options = {
        port: Number(url.port),
        host: url.hostname,
        localAddress: handlerOpts.localAddress,
        family: handlerOpts.ipFamily,
        lookup: handlerOpts.dnsLookup,
    };

    if (options.host[0] === '[') {
        options.host = options.host.slice(1, -1);
    }

    const targetSocket = net.createConnection(options, () => {
        try {
            sourceSocket.write(`HTTP/1.1 200 Connection Established\r\n\r\n`);
        } catch (error) {
            sourceSocket.destroy(error as Error);
        }
    });

    countTargetBytes(sourceSocket, targetSocket);

    sourceSocket.pipe(targetSocket);
    targetSocket.pipe(sourceSocket);

    // Once target socket closes forcibly, the source socket gets paused.
    // We need to enable flowing, otherwise the socket would remain open indefinitely.
    // Nothing would consume the data, we just want to close the socket.
    targetSocket.on('close', () => {
        const { requestId, customTag, id: connectionId } = handlerOpts;

        server.emit('requestFinished', {
            id: requestId,
            request,
            connectionId,
            customTag,
        });

        sourceSocket.resume();

        if (sourceSocket.writable) {
            sourceSocket.end();
        }
    });

    // Same here.
    sourceSocket.on('close', () => {
        targetSocket.resume();

        if (targetSocket.writable) {
            targetSocket.end();
        }
    });

    const { proxyChainId } = sourceSocket;

    targetSocket.on('error', (error) => {
        server.log(proxyChainId, `Direct Destination Socket Error: ${error.stack}`);

        sourceSocket.destroy();
    });

    sourceSocket.on('error', (error) => {
        server.log(proxyChainId, `Direct Source Socket Error: ${error.stack}`);

        targetSocket.destroy();
    });
};
