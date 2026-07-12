import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from routes.auth_routes import auth_bp
from routes.credit_routes import credit_bp
from routes.feature_routes import feature_bp
from routes.market_routes import market_bp

app = Flask(__name__)

# FIX: Flask's debug-mode interactive debugger (on by default here via
# FLASK_DEBUG defaulting to "true") intercepts unhandled exceptions BEFORE
# they reach the @app.errorhandler(500) below, returning an HTML traceback
# page instead. Any route without its own try/except then sends the
# frontend HTML where it expects JSON — res.json() throws, which is what
# actually shows up client-side as a failed request. Keep debug mode's
# auto-reload/logging, but make sure error *responses* are always JSON.
app.config['PROPAGATE_EXCEPTIONS'] = False

# CORS — restrict origins in production via env var
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*")
origins = [o.strip() for o in allowed_origins.split(",")] if "," in allowed_origins else allowed_origins
CORS(app, resources={r"/*": {"origins": origins}})

for bp in [auth_bp, credit_bp, feature_bp, market_bp]:
    app.register_blueprint(bp)

# Startup sanity check — print all registered routes so you can confirm
# /chat (and every other route) is actually mounted before hitting Postman.
print("\n── Registered routes ──────────────────────────────")
for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule):
    methods = ', '.join(sorted(m for m in rule.methods if m not in ('HEAD', 'OPTIONS')))
    print(f"  {methods:8s}  {rule.rule}")
print("────────────────────────────────────────────────────\n")


@app.route("/health")
def health():
    try:
        from routes.credit_routes import model, explainer
        model_loaded = model is not None
        shap_ready   = explainer is not None
    except Exception:
        model_loaded = False
        shap_ready   = False
    return jsonify({
        "status":       "ok",
        "version":      "2.0",
        "model_loaded": model_loaded,
        "shap_ready":   shap_ready,
    })


@app.errorhandler(404)
def not_found(e):
    return jsonify({"message": "Endpoint not found"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"message": "Method not allowed"}), 405


# FIX: several routes call get_db() (which now correctly raises when Mongo
# is unreachable/auth fails — see db.py) without their own try/except.
# Rather than needing to individually guard every single one under time
# pressure, catch the whole pymongo error family centrally so any of them
# still returns a clean, honest JSON message instead of depending on
# PROPAGATE_EXCEPTIONS/the generic 500 handler to paper over it.
try:
    from pymongo.errors import PyMongoError

    @app.errorhandler(PyMongoError)
    def mongo_error(e):
        print(f"⚠️ Unhandled MongoDB error: {e}")
        return jsonify({
            "message": "Database connection failed. Check your MONGODB_URI and that your Atlas cluster/user credentials are valid."
        }), 503
except ImportError:
    pass


@app.errorhandler(500)
def internal_error(e):
    return jsonify({"message": "Internal server error"}), 500


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    port  = int(os.getenv("PORT", 5000))
    app.run(debug=debug, port=port)