"""S3 / MinIO artifact storage.

Uses S3_ENDPOINT_URL for MinIO in dev; omit for real AWS S3 in prod.
All functions are async — they wrap the synchronous boto3 client with asyncio.to_thread.
"""

import asyncio
import os
import re

import boto3

_BUCKET = "sdet-artifacts"


def _client():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL") or None,
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )


async def upload_artifact(
    run_id: str, tc_id: str, filename: str, content_bytes: bytes
) -> str:
    """Upload bytes to s3://sdet-artifacts/{run_id}/{tc_id}/{filename}.
    Returns the S3 URI."""
    key = f"{run_id}/{tc_id}/{filename}"
    await asyncio.to_thread(
        _client().put_object,
        Bucket=_BUCKET,
        Key=key,
        Body=content_bytes,
    )
    return f"s3://{_BUCKET}/{key}"


async def generate_presigned_url(s3_uri: str, expires_in: int = 3600) -> str:
    """Return an HTTPS pre-signed URL for the given S3 URI."""
    m = re.match(r"s3://([^/]+)/(.+)", s3_uri)
    if not m:
        raise ValueError(f"Invalid S3 URI: {s3_uri!r}")
    bucket, key = m.group(1), m.group(2)
    return await asyncio.to_thread(
        _client().generate_presigned_url,
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )
