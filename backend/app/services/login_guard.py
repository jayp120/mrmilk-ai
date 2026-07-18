"""
Brute-force protection for the login endpoint.

WHY: the app was written for a LAN, where an unlimited-guess login is a
non-issue. The moment it is reachable from the internet that changes — behind
this login sits every customer's name, mobile number, home address and a GPS
coordinate accurate to roughly a building. An attacker who can guess passwords
at full speed, forever, will eventually get in.

Deliberately in-process (no Redis): this deploys as a single uvicorn service,
so a dict is sufficient and adds no infrastructure. If it is ever scaled to
multiple workers or hosts, this must move to shared storage — a per-process
counter is trivially defeated by spreading attempts across workers.

Two independent limits, because they stop different attacks:
  * per USERNAME  — stops a password list being run against one known account
  * per CLIENT IP — stops one host spraying many usernames

A successful login clears that username's counter, so a legitimate user who
mistypes twice and then succeeds is never penalised.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Generous enough that a real person fumbling their password is unaffected,
# strict enough that online guessing is hopeless: 5 tries then a 15-minute
# freeze caps an attacker at ~480 guesses/day per username.
MAX_FAILURES = 5
LOCKOUT_SECONDS = 15 * 60
# Failures older than this stop counting, so an occasional typo weeks apart
# never accumulates into a lockout.
FAILURE_WINDOW_SECONDS = 15 * 60

# An IP gets more room than a single username — an office behind one NAT may
# have several people legitimately signing in.
MAX_FAILURES_PER_IP = 20
LOCKOUT_SECONDS_IP = 15 * 60


@dataclass
class _Bucket:
    failures: list[float] = field(default_factory=list)
    locked_until: float = 0.0


_lock = threading.Lock()
_by_user: dict[str, _Bucket] = {}
_by_ip: dict[str, _Bucket] = {}


def _prune(bucket: _Bucket, now: float) -> None:
    bucket.failures = [t for t in bucket.failures if now - t < FAILURE_WINDOW_SECONDS]


def _check(store: dict[str, _Bucket], key: str, now: float) -> float:
    """Return seconds remaining on a lockout, or 0 if not locked."""
    b = store.get(key)
    if not b:
        return 0.0
    if b.locked_until > now:
        return b.locked_until - now
    if b.locked_until:          # lockout expired — reset cleanly
        b.locked_until = 0.0
        b.failures.clear()
    return 0.0


def check_allowed(username: str, ip: str) -> float:
    """Seconds the caller must wait, or 0.0 if the attempt may proceed."""
    now = time.time()
    with _lock:
        return max(
            _check(_by_user, (username or "").strip().lower(), now),
            _check(_by_ip, ip or "", now),
        )


def record_failure(username: str, ip: str) -> None:
    now = time.time()
    u = (username or "").strip().lower()
    ipk = ip or ""
    with _lock:
        for store, key, limit, lock_for in (
            (_by_user, u, MAX_FAILURES, LOCKOUT_SECONDS),
            (_by_ip, ipk, MAX_FAILURES_PER_IP, LOCKOUT_SECONDS_IP),
        ):
            if not key:
                continue
            b = store.setdefault(key, _Bucket())
            _prune(b, now)
            b.failures.append(now)
            if len(b.failures) >= limit:
                b.locked_until = now + lock_for
                # Log the fact, never the password or the attempted value.
                logger.warning(
                    "login_guard: locked %s=%s for %ds after %d failures",
                    "user" if store is _by_user else "ip", key, lock_for, len(b.failures),
                )


def record_success(username: str, ip: str) -> None:
    """Clear the username's counter. The IP counter is deliberately NOT cleared:
    one valid credential should not wipe the evidence of spraying from that host."""
    u = (username or "").strip().lower()
    with _lock:
        _by_user.pop(u, None)


def stats() -> dict:
    now = time.time()
    with _lock:
        return {
            "tracked_users": len(_by_user),
            "tracked_ips": len(_by_ip),
            "locked_users": sum(1 for b in _by_user.values() if b.locked_until > now),
            "locked_ips": sum(1 for b in _by_ip.values() if b.locked_until > now),
        }
