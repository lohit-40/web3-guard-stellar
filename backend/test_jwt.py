import os
import time
import jwt
from dotenv import load_dotenv

load_dotenv()

app_id = os.getenv("GITHUB_APP_ID")
private_key = os.getenv("GITHUB_APP_PRIVATE_KEY")
if private_key:
    private_key = private_key.replace('\\n', '\n')
    
print("App ID:", app_id)
print("Private Key starts with:", private_key[:30] if private_key else "None")

try:
    now = int(time.time())
    payload = {
        "iat": now - 60,
        "exp": now + (10 * 60),
        "iss": app_id
    }
    encoded_jwt = jwt.encode(payload, private_key, algorithm="RS256")
    print("\n✅ JWT successfully generated!")
    print("Token prefix:", encoded_jwt[:20] + "...")
except Exception as e:
    print("\n❌ Failed to generate JWT:", e)
