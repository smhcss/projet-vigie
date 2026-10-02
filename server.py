#!/usr/bin/env python3
"""Local-only Vigie test server. Uses only the Python standard library."""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from contextlib import contextmanager
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("VIGIE_DATA_DIR", str(ROOT))).expanduser()
DB_PATH = DATA_DIR / os.environ.get("VIGIE_DB_FILENAME", ".vigie-test.sqlite3")
os.umask(0o077)
HOST = os.environ.get("VIGIE_HOST", "127.0.0.1")
PORT = int(os.environ.get("VIGIE_PORT", os.environ.get("VIGIE_TEST_PORT", "8765")))
PUBLIC_ORIGIN = os.environ.get("VIGIE_PUBLIC_ORIGIN", f"http://127.0.0.1:{PORT}").rstrip("/")
COOKIE_SECURE = os.environ.get("VIGIE_COOKIE_SECURE", "0") == "1"
ALLOW_TRYCLOUDFLARE_ORIGIN = os.environ.get("VIGIE_ALLOW_TRYCLOUDFLARE_ORIGIN", "0") == "1"
PBKDF2_ROUNDS = 310_000
SESSION_SECONDS = 60 * 60 * 8
SETUP_SECONDS = 60 * 60 * 24


@contextmanager
def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('client','admin')),
          identifier TEXT NOT NULL UNIQUE, display_identifier TEXT NOT NULL,
          company TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS requests (
          id INTEGER PRIMARY KEY, public_id TEXT NOT NULL UNIQUE,
          client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          company TEXT NOT NULL, contact TEXT NOT NULL, contact_method TEXT NOT NULL,
          event_type TEXT NOT NULL, agent_type TEXT NOT NULL,
          event_date TEXT NOT NULL, agents INTEGER NOT NULL, location TEXT NOT NULL,
          details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
          team TEXT NOT NULL DEFAULT '', coordination_note TEXT NOT NULL DEFAULT '',
          rejection_reason TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS setup_tokens (
          token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, used_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS requests_status_idx ON requests(status);
        CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
        """)
        request_columns = {row["name"] for row in db.execute("PRAGMA table_info(requests)")}
        if "rejection_reason" not in request_columns:
            db.execute("ALTER TABLE requests ADD COLUMN rejection_reason TEXT NOT NULL DEFAULT ''")
    try:
        DB_PATH.chmod(0o600)
    except OSError:
        pass


def hash_password(password: str, salt: bytes | None = None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return digest.hex(), salt.hex()


def normalize_identifier(value: str):
    value = (value or "").strip()
    if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        return value.lower(), value
    digits = re.sub(r"\D", "", value)
    if 8 <= len(digits) <= 15:
        normalized = "+" + digits
        return normalized, value
    raise ValueError("Entrez un courriel valide ou un numéro de téléphone (8 à 15 chiffres).")


def token_hash(token: str):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_admin_setup_link():
    init_db()
    with connect() as db:
        if db.execute("SELECT 1 FROM users WHERE role='admin' LIMIT 1").fetchone():
            print("Un compte administrateur existe déjà. Aucun nouveau lien n’a été créé.", file=sys.stderr)
            raise SystemExit(1)
        token = secrets.token_urlsafe(32)
        db.execute("INSERT INTO setup_tokens(token_hash, expires_at) VALUES(?,?)",
                   (token_hash(token), int(time.time()) + SETUP_SECONDS))
    print(f"Lien d’activation unique (valide 24 h) : {PUBLIC_ORIGIN}/admin-setup.html?token={token}")
    print("Transmets ce lien au propriétaire de l’entreprise par un canal privé.")


def safe_user(row):
    if not row:
        return None
    return {"id": row["id"], "role": row["role"], "identifier": row["display_identifier"],
            "company": row["company"]}


def valid_event_date(value):
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value or ""))


class Handler(SimpleHTTPRequestHandler):
    server_version = "VigieTest/0.1"
    login_attempts = {}

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Do not log request bodies or credentials.
        super().log_message(fmt, *args)

    def send_json(self, status, payload, cookies=()):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for cookie in cookies:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def send_redirect(self, path):
        self.send_response(303)
        self.send_header("Location", path)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def cookies(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            pass
        return cookie

    def csrf_cookie(self):
        cookie = self.cookies()
        token = cookie.get("vigie_csrf")
        return token.value if token else ""

    def secure_mutation(self):
        cookie_token = self.csrf_cookie()
        header_token = self.headers.get("X-CSRF-Token", "")
        origin = self.headers.get("Origin")
        expected = PUBLIC_ORIGIN
        if not cookie_token or not hmac.compare_digest(cookie_token, header_token):
            self.send_json(403, {"error": "Jeton de sécurité invalide. Recharge la page et réessaie."})
            return False
        origin_allowed = not origin or origin == expected
        if origin and not origin_allowed and ALLOW_TRYCLOUDFLARE_ORIGIN:
            parsed_origin = urlparse(origin)
            hostname = parsed_origin.hostname or ""
            origin_allowed = (parsed_origin.scheme == "https" and
                              parsed_origin.netloc == hostname and
                              re.fullmatch(r"[a-z0-9-]+\.trycloudflare\.com", hostname) is not None)
        if not origin_allowed:
            self.send_json(403, {"error": "Origine de requête refusée."})
            return False
        return True

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 65536:
                raise ValueError("Taille de requête invalide.")
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            raise ValueError("Requête invalide.")

    def current_user(self):
        cookie = self.cookies().get("vigie_session")
        if not cookie:
            return None
        with connect() as db:
            row = db.execute("""SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
                WHERE s.token_hash=? AND s.expires_at>?""", (token_hash(cookie.value), int(time.time()))).fetchone()
        return row

    def require_role(self, role):
        user = self.current_user()
        if not user or user["role"] != role:
            self.send_json(401, {"error": "Connexion requise."})
            return None
        return user

    def issue_session(self, user_id):
        raw = secrets.token_urlsafe(32)
        expires = int(time.time()) + SESSION_SECONDS
        with connect() as db:
            db.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
                       (token_hash(raw), user_id, expires))
        return self.cookie_string("vigie_session", raw, http_only=True, max_age=SESSION_SECONDS)

    @staticmethod
    def cookie_string(name, value, http_only, max_age):
        parts = [f"{name}={value}", "Path=/", "SameSite=Strict", f"Max-Age={max_age}"]
        if http_only:
            parts.append("HttpOnly")
        if COOKIE_SECURE:
            parts.append("Secure")
        return "; ".join(parts)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/csrf":
            csrf = self.csrf_cookie() or secrets.token_urlsafe(32)
            cookie = self.cookie_string("vigie_csrf", csrf, http_only=False, max_age=SESSION_SECONDS)
            self.send_json(200, {"csrf": csrf}, (cookie,))
            return
        if path == "/api/me":
            user = self.current_user()
            csrf = self.csrf_cookie() or secrets.token_urlsafe(32)
            cookie = self.cookie_string("vigie_csrf", csrf, http_only=False, max_age=SESSION_SECONDS)
            self.send_json(200, {"user": safe_user(user), "csrf": csrf}, (cookie,))
            return
        if path == "/api/client/requests":
            user = self.require_role("client")
            if not user:
                return
            with connect() as db:
                rows = db.execute("SELECT * FROM requests WHERE client_id=? ORDER BY created_at DESC", (user["id"],)).fetchall()
            self.send_json(200, {"requests": [dict(row) for row in rows]})
            return
        if path == "/api/admin/requests":
            if not self.require_role("admin"):
                return
            with connect() as db:
                rows = db.execute("SELECT * FROM requests ORDER BY created_at DESC").fetchall()
            self.send_json(200, {"requests": [dict(row) for row in rows]})
            return
        if path == "/admin.html":
            user = self.current_user()
            if not user or user["role"] != "admin":
                self.send_redirect("/admin-login.html")
                return
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in ("/api/signup", "/api/login", "/api/logout", "/api/requests", "/api/admin/setup"):
            self.send_json(404, {"error": "Route introuvable."})
            return
        if not self.secure_mutation():
            return
        try:
            data = self.read_json()
            if path == "/api/signup":
                self.signup(data)
            elif path == "/api/login":
                self.login(data)
            elif path == "/api/logout":
                self.logout()
            elif path == "/api/requests":
                self.create_request(data)
            elif path == "/api/admin/setup":
                self.setup_admin(data)
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except sqlite3.IntegrityError:
            self.send_json(409, {"error": "Un compte utilise déjà cette adresse courriel ou ce numéro."})

    def do_PATCH(self):
        if not self.secure_mutation():
            return
        user = self.require_role("admin")
        if not user:
            return
        match = re.fullmatch(r"/api/admin/requests/(\d+)", urlparse(self.path).path)
        if not match:
            self.send_json(404, {"error": "Route introuvable."})
            return
        try:
            data = self.read_json()
            request_id = int(match.group(1))
            action = data.get("action")
            transitions = {"take": ("pending", "review"), "approve": ("review", "approved"),
                           "reject": ("review", "rejected"), "assign": ("approved", "assigned")}
            if action not in transitions:
                raise ValueError("Action de suivi invalide.")
            before, after = transitions[action]
            reason = (data.get("reason") or "").strip()[:1000] if action == "reject" else ""
            if action == "reject" and len(reason) < 5:
                raise ValueError("Indique un motif de refus d’au moins 5 caractères.")
            with connect() as db:
                row = db.execute("SELECT id FROM requests WHERE id=? AND status=?", (request_id, before)).fetchone()
                if not row:
                    self.send_json(409, {"error": "Le statut de cette demande a changé. Recharge la liste."})
                    return
                if action == "assign":
                    team = (data.get("team") or "").strip()[:120]
                    if not team:
                        raise ValueError("Indique l’équipe ou le responsable de la coordination.")
                    db.execute("UPDATE requests SET status=?,team=?,coordination_note=? WHERE id=?",
                               (after, team, (data.get("note") or "").strip()[:1000], request_id))
                elif action == "reject":
                    db.execute("UPDATE requests SET status=?,rejection_reason=? WHERE id=?",
                               (after, reason, request_id))
                else:
                    db.execute("UPDATE requests SET status=? WHERE id=?", (after, request_id))
            self.send_json(200, {"ok": True, "status": after})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})

    def signup(self, data):
        identifier, display = normalize_identifier(data.get("identifier", ""))
        company = (data.get("company") or "").strip()
        password = data.get("password") or ""
        if len(company) < 2:
            raise ValueError("Indique le nom de l’entreprise.")
        if len(password) < 8 or len(password) > 256:
            raise ValueError("Le mot de passe doit contenir au moins 8 caractères.")
        digest, salt = hash_password(password)
        with connect() as db:
            cursor = db.execute("INSERT INTO users(role,identifier,display_identifier,company,password_hash,password_salt,created_at) VALUES('client',?,?,?,?,?,?)",
                                (identifier, display, company, digest, salt, int(time.time())))
            user_id = cursor.lastrowid
        self.send_json(201, {"ok": True, "user": {"role": "client", "identifier": display, "company": company}},
                       (self.issue_session(user_id),))

    def login(self, data):
        identifier, _ = normalize_identifier(data.get("identifier", ""))
        password = data.get("password") or ""
        client_ip = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",", 1)[0].strip()
        key = (client_ip, identifier)
        now = time.time()
        recent = [stamp for stamp in self.login_attempts.get(key, []) if now - stamp < 900]
        if len(recent) >= 8:
            self.login_attempts[key] = recent
            self.send_json(429, {"error": "Trop de tentatives. Réessaie dans 15 minutes."})
            return
        with connect() as db:
            user = db.execute("SELECT * FROM users WHERE identifier=?", (identifier,)).fetchone()
        if not user:
            # Keep response indistinguishable from incorrect password.
            hash_password(password, b"vigie-dummy-salt")
            recent.append(now); self.login_attempts[key] = recent
            self.send_json(401, {"error": "Identifiant ou mot de passe incorrect."})
            return
        digest, _ = hash_password(password, bytes.fromhex(user["password_salt"]))
        if not hmac.compare_digest(digest, user["password_hash"]):
            recent.append(now); self.login_attempts[key] = recent
            self.send_json(401, {"error": "Identifiant ou mot de passe incorrect."})
            return
        self.login_attempts.pop(key, None)
        self.send_json(200, {"ok": True, "user": safe_user(user)}, (self.issue_session(user["id"]),))

    def logout(self):
        cookie = self.cookies().get("vigie_session")
        if cookie:
            with connect() as db:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash(cookie.value),))
        self.send_json(200, {"ok": True}, (self.cookie_string("vigie_session", "", http_only=True, max_age=0),))

    def create_request(self, data):
        user = self.current_user()
        company = (data.get("company") or (user["company"] if user else "")).strip()
        contact = (data.get("contact") or "").strip()
        method = data.get("contactMethod") or (user["display_identifier"] if user else "")
        _, method_display = normalize_identifier(method)
        event_type = (data.get("eventType") or "").strip()
        agent_type = (data.get("agentType") or "").strip()
        event_date = (data.get("date") or "").strip()
        location = (data.get("location") or "").strip()
        details = (data.get("details") or "").strip()[:3000]
        try:
            agents = int(data.get("agents", 0))
        except (TypeError, ValueError):
            agents = 0
        if len(company) < 2 or len(contact) < 2 or not event_type or not agent_type or not valid_event_date(event_date) or not location:
            raise ValueError("Complète les champs obligatoires de la demande.")
        if agents < 1 or agents > 500:
            raise ValueError("Le nombre d’agents doit être entre 1 et 500.")
        public_id = "VG-" + secrets.token_hex(3).upper()
        with connect() as db:
            cursor = db.execute("""INSERT INTO requests(public_id,client_id,company,contact,contact_method,event_type,agent_type,event_date,agents,location,details,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (public_id, user["id"] if user and user["role"] == "client" else None, company, contact, method_display,
                 event_type, agent_type, event_date, agents, location, details, int(time.time())))
            request_id = cursor.lastrowid
        self.send_json(201, {"ok": True, "id": request_id, "publicId": public_id,
                             "historyLinked": bool(user and user["role"] == "client")})

    def setup_admin(self, data):
        token = (data.get("token") or "").strip()
        name = (data.get("name") or "").strip()
        password = data.get("password") or ""
        identifier, display = normalize_identifier(data.get("identifier", ""))
        if len(name) < 2:
            raise ValueError("Indique le nom du propriétaire.")
        if len(password) < 8 or len(password) > 256:
            raise ValueError("Le mot de passe doit contenir au moins 8 caractères.")
        if not token:
            raise ValueError("Le lien d’activation est incomplet.")
        digest, salt = hash_password(password)
        with connect() as db:
            invite = db.execute("SELECT * FROM setup_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
                                (token_hash(token), int(time.time()))).fetchone()
            if not invite:
                self.send_json(410, {"error": "Ce lien a expiré ou a déjà été utilisé."})
                return
            if db.execute("SELECT 1 FROM users WHERE role='admin' LIMIT 1").fetchone():
                self.send_json(409, {"error": "Le compte administrateur initial existe déjà."})
                return
            db.execute("INSERT INTO users(role,identifier,display_identifier,company,password_hash,password_salt,created_at) VALUES('admin',?,?,?,?,?,?)",
                       (identifier, display, name, digest, salt, int(time.time())))
            db.execute("UPDATE setup_tokens SET used_at=? WHERE token_hash=?", (int(time.time()), token_hash(token)))
            row = db.execute("SELECT id FROM users WHERE identifier=?", (identifier,)).fetchone()
        self.send_json(201, {"ok": True, "message": "Compte propriétaire créé."}, (self.issue_session(row["id"]),))


def main():
    parser = argparse.ArgumentParser(description="Serveur de test local Vigie")
    parser.add_argument("--create-admin-link", action="store_true", help="génère le lien privé initial à usage unique pour le propriétaire")
    args = parser.parse_args()
    init_db()
    if args.create_admin_link:
        create_admin_setup_link()
        return
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serveur Vigie de test : http://{HOST}:{PORT}")
    print("Accessible uniquement sur cet ordinateur. Arrêter avec Ctrl+C.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
