"""OPS ROOM Admin API -- Real client-IP resolution (Cloudflare-aware).

Trust model: nginx is the only entry point to this API. nginx
unconditionally overwrites X-Real-IP with $remote_addr, which the
`real_ip_header CF-Connecting-IP` + `set_real_ip_from` block in nginx.conf
rewrites to the real visitor IP for Cloudflare peers (and leaves as the
socket IP for direct peers). X-Real-IP is therefore always the trusted,
spoof-proof resolved IP -- client-supplied X-Real-IP headers are replaced
by nginx, and nginx strips CF-Connecting-IP before forwarding (so that
injectable header never reaches us).

We prefer X-Real-IP first, then X-Forwarded-For (for any non-nginx dev
invocations), then the socket peer.
"""

from __future__ import annotations

from fastapi import Request


def client_ip(request: Request) -> str:
    """Return the best-known client IP for rate limiting and audit logs."""
    real = request.headers.get("x-real-ip")
    if real:
        return real.split(",")[0].strip()

    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()

    if request.client:
        return request.client.host

    return "unknown"
