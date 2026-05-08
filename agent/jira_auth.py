import base64
import os


def get_jira_headers() -> dict[str, str]:
    auth_type = os.getenv("JIRA_AUTH_TYPE", "basic")
    token = os.getenv("JIRA_API_TOKEN", "")
    if auth_type == "bearer":
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
    else:
        email = os.getenv("JIRA_EMAIL", "")
        credentials = base64.b64encode(f"{email}:{token}".encode()).decode()
        return {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
