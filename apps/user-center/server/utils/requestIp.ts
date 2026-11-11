import { isIP } from 'node:net';
import { getHeader, type H3Event } from 'h3';

function normalizeIp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6 || ip.includes('%')) return null;
  // Canonicalize IPv6, including the alternate forms of IPv4-mapped sockets.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase();
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    const low = parseInt(mapped[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return canonical;
}

function isTrustedProxy(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('127.')) return true;
  // This is a comma-separated list of exact proxy IPs, not client-supplied CIDRs.
  return (process.env.TRUSTED_PROXY_IPS || '').split(',')
    .some(value => normalizeIp(value) === ip);
}

/** Read the TCP peer by default; forwarding headers require a known proxy peer. */
export function getRequestClientIp(event: H3Event): string {
  const peer = normalizeIp(event.node.req.socket?.remoteAddress);
  if (!peer) return 'unknown';
  if (!isTrustedProxy(peer)) return peer;

  const cdnIp = normalizeIp(getHeader(event, 'ali-cdn-real-ip'));
  if (cdnIp) return cdnIp;

  const forwarded = getHeader(event, 'x-forwarded-for');
  if (forwarded) {
    const chain = forwarded.split(',').map(normalizeIp);
    if (chain.every((ip): ip is string => ip !== null)) {
      // Ignore trusted proxy suffixes; do not trust a spoofed leftmost value.
      for (let index = chain.length - 1; index >= 0; index--) {
        if (!isTrustedProxy(chain[index])) return chain[index];
      }
      if (chain.length) return chain[0];
    }
  }
  return normalizeIp(getHeader(event, 'x-real-ip')) || peer;
}
