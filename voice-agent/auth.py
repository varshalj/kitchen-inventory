"""
User authentication for the voice agent.

The browser sends the user's Supabase access token as a query param on the
WebSocket URL (`wss://.../ws?token=<jwt>`). This module:

  1. Validates the JWT signature + expiry using SUPABASE_JWT_SECRET
  2. Extracts the user UUID from the `sub` claim
  3. Provides a `supabase_as_user()` helper that builds a Supabase client
     scoped to that user — RLS applies, so the agent's tool calls only
     see that user's data

Mirrors the TypeScript `lib/server/supabase-as-user.ts` pattern used by
the Alexa skill, but goes one step further: instead of minting a new JWT
server-side, we reuse the user's actual access token from the browser
session. Same trust model; one fewer signing operation.
"""

from __future__ import annotations

import os
from typing import Optional

import jwt as pyjwt
from supabase import Client, create_client


class InvalidToken(Exception):
    """Raised when a JWT fails verification — missing, expired, wrong signature, etc."""


def verify_user_token(token: str) -> dict:
    """
    Verify a Supabase user JWT and return its claims dict.

    Handles both Supabase signing modes:
      - Legacy HS256 (shared SUPABASE_JWT_SECRET) — original Supabase Auth.
      - Modern RS256 / ES256 (per-project key pair, verified via JWKS at
        <SUPABASE_URL>/auth/v1/.well-known/jwks.json) — Supabase has been
        rolling out asymmetric signing on newer projects. PyJWKClient caches
        the fetched key set (default ~1 hour) so this isn't a per-request
        network call.

    Raises InvalidToken on any verification failure. The caller is expected
    to refuse the WebSocket connection with a meaningful close code.
    """
    if not token:
        raise InvalidToken("No token provided")

    # Inspect the JWT header WITHOUT verifying — we need the alg to decide
    # which verification path to take. This is safe because we still verify
    # signature next.
    try:
        header = pyjwt.get_unverified_header(token)
    except pyjwt.DecodeError as e:
        raise InvalidToken(f"Token header malformed: {e}")

    alg = header.get("alg")

    # Diagnostic: log shape + alg + kid so paste errors and signing mode
    # mismatches are debuggable without leaking contents.
    parts = token.split(".")
    print(
        f"voice-auth: token shape — total_len={len(token)} parts={len(parts)} "
        f"part_lens={[len(p) for p in parts]} alg={alg!r} kid={header.get('kid')!r}",
        flush=True,
    )

    if not alg:
        raise InvalidToken("Token header missing 'alg'")

    try:
        if alg == "HS256":
            # Legacy symmetric verification.
            secret = os.environ.get("SUPABASE_JWT_SECRET")
            if not secret:
                raise InvalidToken(
                    "SUPABASE_JWT_SECRET not configured (needed for HS256 tokens)"
                )
            claims = pyjwt.decode(
                token, secret, algorithms=["HS256"], audience="authenticated"
            )
        elif alg in ("RS256", "ES256", "ES384", "ES512"):
            # Modern asymmetric verification via Supabase's JWKS endpoint.
            supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            if not supabase_url:
                raise InvalidToken(
                    "NEXT_PUBLIC_SUPABASE_URL not configured (needed to fetch JWKS)"
                )
            jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
            jwks_client = pyjwt.PyJWKClient(jwks_url)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            claims = pyjwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                audience="authenticated",
            )
        else:
            raise InvalidToken(f"Unsupported alg '{alg}'")
    except pyjwt.ExpiredSignatureError:
        raise InvalidToken("Token expired — sign in again to get a fresh one")
    except pyjwt.InvalidAudienceError:
        raise InvalidToken("Token audience is not 'authenticated' — not a user session")
    except pyjwt.InvalidTokenError as e:
        hint = ""
        if len(parts) != 3:
            hint = (
                f" (got {len(parts)} dot-separated parts; a JWT must have exactly 3 — "
                f"check you pasted only the access_token value, not the whole JSON)"
            )
        raise InvalidToken(f"Token failed verification: {e}{hint}")
    except Exception as e:  # noqa: BLE001
        # Catch PyJWKClient network errors etc. so they surface cleanly
        # rather than bubbling up to the WebSocket handler.
        raise InvalidToken(f"JWKS verification failed: {type(e).__name__}: {e}")

    if not claims.get("sub"):
        raise InvalidToken("Token missing sub claim (user id)")

    return claims


def supabase_as_user(user_token: str) -> Client:
    """
    Build a Supabase client scoped to the user identified by `user_token`.

    The caller must have already verified the token via `verify_user_token`.
    Subsequent queries via this client are subject to the user's RLS — the
    agent can only see the user's own rows.
    """
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    anon = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not url or not anon:
        raise RuntimeError(
            "Supabase URL / anon key not configured (NEXT_PUBLIC_SUPABASE_URL, "
            "NEXT_PUBLIC_SUPABASE_ANON_KEY missing from the Modal secret)"
        )

    client = create_client(url, anon)
    # PostgREST auth() sets the Authorization header on subsequent queries.
    # RLS sees this token's sub claim and scopes accordingly.
    client.postgrest.auth(user_token)
    return client
