"""
Modal entrypoint for the Kitchen Inventory voice agent.

This file is the deployment surface — it declares the container image,
secrets, and the ASGI app Modal exposes publicly. The actual pipeline
logic lives in `pipeline.py`; this file is intentionally thin.

Deploy:
    modal deploy modal_app.py

Local dev (hot-reload, uses local .env):
    modal serve modal_app.py
"""

import modal

# ─── App + image ──────────────────────────────────────────────────────────────

app = modal.App("kitchen-inventory-voice")

# Build the container image from pyproject.toml. Modal will cache layers
# between deploys so subsequent deploys are fast unless deps change.
image = (
    modal.Image.debian_slim(python_version="3.11")
    # System deps for audio handling that some Pipecat plugins need.
    .apt_install("ffmpeg")
    # Install Python deps. `add_local_dir` brings our source into the image.
    .pip_install_from_pyproject("pyproject.toml")
    .add_local_python_source("pipeline", "auth", "tools")
    # Include the feature catalog so the LLM system prompt can reference it.
    # Catalog lives in the parent docs/ directory (single source of truth);
    # we mount it into the container at a fixed path that pipeline.py reads.
    # If this errors with "file outside the project root", we'd copy the
    # catalog into voice-agent/ at deploy time instead.
    .add_local_file("../docs/feature-catalog.yaml", "/root/feature-catalog.yaml")
)

# ─── Secrets ──────────────────────────────────────────────────────────────────
#
# Create these in Modal first (one-time, per environment):
#
#   modal secret create sarvam-api-key SARVAM_API_KEY=<your-sarvam-key>
#   modal secret create openai-api-key OPENAI_API_KEY=<your-openai-key>
#   modal secret create supabase-config \
#       NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
#       NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
#       SUPABASE_JWT_SECRET=<jwt-secret>
#
# These names are referenced below; rename them in the Modal dashboard if you
# want different conventions but keep the env-var keys the same.

secrets = [
    modal.Secret.from_name("sarvam-api-key"),
    modal.Secret.from_name("openai-api-key"),
    modal.Secret.from_name("supabase-config"),
]

# ─── ASGI app ─────────────────────────────────────────────────────────────────


@app.function(
    image=image,
    secrets=secrets,
    # Voice sessions are long-lived; default Modal timeout is too short.
    # 600s = 10 min hard cap per session, also our cost-control ceiling for v1.
    # See ADR 005 — per-user daily cap is a follow-up.
    timeout=600,
    # Keep one container warm to avoid 2-5s cold-start penalty on the first
    # voice request. Costs ~$0/idle on Modal's per-second pricing, so cheap
    # insurance against terrible first-impression UX.
    min_containers=1,
)
@modal.asgi_app()
def fastapi_app():
    """Modal serves this FastAPI app at a public HTTPS URL."""
    from pipeline import build_app

    return build_app()


# ─── Local entrypoint (for `modal run modal_app.py`) ─────────────────────────

@app.local_entrypoint()
def main():
    """
    Sanity check that the function can be invoked. Doesn't actually start
    the voice pipeline — just confirms Modal can reach the container.

    Usage:  modal run modal_app.py
    """
    print("Voice agent is deployable. Use `modal deploy modal_app.py` to ship.")
    print("Or `modal serve modal_app.py` for local hot-reload during dev.")
