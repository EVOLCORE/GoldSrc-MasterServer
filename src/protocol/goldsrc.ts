/**
 * GoldSrc Master Server Protocol Constants
 * Optimized for zero-allocation hot path
 */

// Request byte that identifies a valid GoldSrc master server query
export const REQUEST_BYTE = 0x31;

// Response packet header: 0xFF 0xFF 0xFF 0xFF 0x66 0x0A
export const RESPONSE_HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x66, 0x0a]);

// Response packet terminator: 6 null bytes (0.0.0.0:0)
export const RESPONSE_TERMINATOR = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// Pre-allocated empty response (header + terminator only)
export const EMPTY_RESPONSE = Buffer.concat([RESPONSE_HEADER, RESPONSE_TERMINATOR]);

/**
 * Convert server address to 6-byte buffer
 * Format: 4 bytes IP + 2 bytes port (big-endian)
 * 
 * @param address - Server address in format "ip:port"
 * @returns 6-byte buffer or null if invalid
 */
export function serverToBuffer(address: string): Buffer | null {
    const colonIndex = address.lastIndexOf(':');
    if (colonIndex === -1) return null;

    const ip = address.substring(0, colonIndex);
    const port = parseInt(address.substring(colonIndex + 1), 10);

    if (isNaN(port) || port < 1 || port > 65535) return null;

    const octets = ip.split('.');
    if (octets.length !== 4) return null;

    const buffer = Buffer.allocUnsafe(6);

    for (let i = 0; i < 4; i++) {
        const octet = parseInt(octets[i], 10);
        if (isNaN(octet) || octet < 0 || octet > 255) return null;
        buffer[i] = octet;
    }

    // Port in big-endian (network byte order)
    buffer[4] = (port >> 8) & 0xff;
    buffer[5] = port & 0xff;

    return buffer;
}

/**
 * Create optimized server list response packet
 * Pre-computes full response buffer for zero-allocation sending
 * 
 * @param addresses - Array of server addresses
 * @returns Complete response buffer ready to send
 */
export function createResponsePacket(addresses: string[]): Buffer {
    if (!addresses || addresses.length === 0) {
        return EMPTY_RESPONSE;
    }

    // Convert all addresses to buffers, filter invalid ones
    const serverBuffers: Buffer[] = [];
    for (const address of addresses) {
        const buf = serverToBuffer(address);
        if (buf) {
            serverBuffers.push(buf);
        }
    }

    if (serverBuffers.length === 0) {
        return EMPTY_RESPONSE;
    }

    // Calculate total size and pre-allocate
    const totalSize = RESPONSE_HEADER.length + (serverBuffers.length * 6) + RESPONSE_TERMINATOR.length;
    const response = Buffer.allocUnsafe(totalSize);

    // Copy header
    let offset = RESPONSE_HEADER.copy(response, 0);

    // Copy all server buffers
    for (const buf of serverBuffers) {
        offset += buf.copy(response, offset);
    }

    // Copy terminator
    RESPONSE_TERMINATOR.copy(response, offset);

    return response;
}

/**
 * Validate incoming UDP packet as GoldSrc master server query
 * 
 * @param msg - Incoming UDP message buffer
 * @returns true if valid request
 */
export function isValidRequest(msg: Buffer): boolean {
    return msg.length > 0 && msg[0] === REQUEST_BYTE;
}
