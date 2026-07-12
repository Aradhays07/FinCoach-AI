from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta, timezone
import jwt, os
from db import get_db

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

auth_bp = Blueprint('auth', __name__)
SECRET  = os.getenv('JWT_SECRET_KEY', 'dev-secret-change-me')

def make_token(email):
    return jwt.encode({'sub': email, 'exp': utcnow() + timedelta(days=7)}, SECRET, algorithm='HS256')

@auth_bp.route('/signup', methods=['POST'])
def signup():
    d = request.get_json()
    name    = d.get('name','').strip()
    email   = d.get('email','').strip().lower()
    pw      = d.get('password','')
    company = d.get('company','').strip()

    if not name or not email or not pw:
        return jsonify({'message': 'Name, email and password required'}), 400

    try:
        db = get_db()
    except Exception as e:
        return jsonify({'message': f'Signup unavailable — database connection failed: {e}'}), 503

    if db.users.find_one({'email': email}):
        return jsonify({'message': 'Email already registered'}), 409

    # Save ALL profile fields from step 2
    user_doc = {
        'name':                  name,
        'email':                 email,
        'password':              generate_password_hash(pw),
        'company':               company,
        'monthly_income':        d.get('monthly_income') or None,
        'existing_debt':         d.get('existing_debt')  or None,
        'employment_type':       d.get('employment_type') or None,
        'credit_history_length': d.get('credit_history_length') or None,
        'loan_purpose':          d.get('loan_purpose') or None,
        'created_at':            utcnow(),
    }
    db.users.insert_one(user_doc)
    user = {'name': name, 'email': email, 'company': company}
    return jsonify({'token': make_token(email), 'user': user}), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    d     = request.get_json()
    email = d.get('email','').strip().lower()
    pw    = d.get('password','')
    try:
        db = get_db()
    except Exception as e:
        return jsonify({'message': f'Login unavailable — database connection failed: {e}'}), 503
    u     = db.users.find_one({'email': email})
    if not u or not check_password_hash(u['password'], pw):
        return jsonify({'message': 'Invalid email or password'}), 401
    user = {'name': u['name'], 'email': u['email'], 'company': u.get('company','')}
    return jsonify({'token': make_token(email), 'user': user})

@auth_bp.route('/home', methods=['GET'])
def home():
    from db import email_from_token
    email = email_from_token(request)
    if not email:
        return jsonify({'message': 'Unauthorised'}), 401
    try:
        db = get_db()
        u  = db.users.find_one({'email': email}, {'password': 0, '_id': 0})
    except Exception as e:
        return jsonify({'message': f'Profile unavailable — database connection failed: {e}'}), 503
    return jsonify(u or {})
