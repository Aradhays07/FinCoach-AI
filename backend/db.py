from pymongo import MongoClient
import os

_client = None

def get_db():
    global _client
    if _client is None:
        _client = MongoClient(
            os.getenv('MONGODB_URI', 'mongodb://localhost:27017'),
            serverSelectionTimeoutMS=3000
        )

        # 🔥 Connection test (VERY USEFUL)
        # FIX: this used to catch the ping failure, print it, and then still
        # return a handle as if the connection were fine. Every call site
        # that does `try: db = get_db() except: ...` was relying on this
        # actually raising when Mongo is unreachable/misconfigured — it
        # never did, so those routes always "succeeded" here and only found
        # out something was wrong several DB calls later (each paying its
        # own ~3s server-selection timeout instead of failing once, fast).
        try:
            _client.admin.command('ping')
            print("✅ MongoDB connected")
        except Exception as e:
            print("❌ MongoDB connection failed:", e)
            _client = None
            raise

    return _client[os.getenv('DB_NAME', 'fincoach_v2')]


def email_from_token(request):
    import jwt
    SECRET = os.getenv('JWT_SECRET_KEY', 'dev-secret-change-me')

    header = request.headers.get('Authorization', '')

    # 🔒 Safer parsing
    if not header.startswith("Bearer "):
        return None

    token = header.split(" ")[1]

    try:
        decoded = jwt.decode(token, SECRET, algorithms=['HS256'])
        return decoded.get('sub')
    except Exception:
        return None
    
    
