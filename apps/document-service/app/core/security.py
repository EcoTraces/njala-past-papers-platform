import hmac

from fastapi import Header, HTTPException, status

from app.core.config import settings


async def verify_internal_secret(x_internal_secret: str = Header(default="")) -> None:
    """Every inbound call from the Node API must present the shared
    secret configured in DOCUMENT_SERVICE_SHARED_SECRET. This service
    has no user-facing authentication of its own - it is an internal
    worker only ever called by the trusted Node API, never by a
    browser client."""
    if not hmac.compare_digest(x_internal_secret, settings.document_service_shared_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal service credentials")
