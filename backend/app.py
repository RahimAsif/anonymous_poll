import os
import sqlite3
import random
import string
from flask import Flask, request, jsonify, render_template, g, redirect, url_for

# --- Paths for backend/frontend split ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

app = Flask(
    __name__,
    template_folder=os.path.join(FRONTEND_DIR, "templates"),
    static_folder=os.path.join(FRONTEND_DIR, "static"),
)

# --- Database path (local + Render) ---
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "poll.db"))


# ---------- DB helpers ----------


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    with open(os.path.join(BASE_DIR, "schema.sql"), "r") as f:
        db.executescript(f.read())
    db.commit()


# Ensure DB exists
if not os.path.exists(DB_PATH):
    (
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        if os.path.dirname(DB_PATH)
        else None
    )
    with open(DB_PATH, "w"):
        pass
    with app.app_context():
        init_db()


# ---------- Helpers ----------


def generate_code(length=6):
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def generate_unique_codes(db, poll_id, count):
    codes = []
    cur = db.cursor()
    for _ in range(count):
        while True:
            code = generate_code()
            row = cur.execute("SELECT id FROM codes WHERE code = ?", (code,)).fetchone()
            if not row:
                cur.execute(
                    "INSERT INTO codes (poll_id, code, used) VALUES (?, ?, 0)",
                    (poll_id, code),
                )
                codes.append(code)
                break
    db.commit()
    return codes


# ---------- Routes (pages) ----------


@app.route("/")
def home():
    # Simple landing: list polls
    db = get_db()
    polls = db.execute("SELECT id, question FROM polls ORDER BY id DESC").fetchall()
    return render_template("admin.html", polls=polls)


@app.route("/admin")
def admin():
    db = get_db()
    polls = db.execute("SELECT id, question FROM polls ORDER BY id DESC").fetchall()
    return render_template("admin.html", polls=polls)


@app.route("/poll/<int:poll_id>")
def poll_view(poll_id):
    db = get_db()
    poll = db.execute(
        """
        SELECT id, question, multiple_allowed, max_choices, hide_results
        FROM polls
        WHERE id = ?
        """,
        (poll_id,),
    ).fetchone()

    if not poll:
        return "Poll not found", 404

    options = db.execute(
        "SELECT id, option_text FROM options WHERE poll_id = ? ORDER BY id", (poll_id,)
    ).fetchall()

    return render_template("poll.html", poll=poll, options=options)


# ---------- API: create poll ----------


@app.route("/api/create-poll", methods=["POST"])
def create_poll():
    data = request.get_json(force=True)

    question = data.get("question", "").strip()
    options = data.get("options", [])
    multiple_allowed = int(data.get("multiple_allowed", 0))
    max_choices = data.get("max_choices")
    hide_results = int(data.get("hide_results", 0))

    if not question:
        return jsonify({"error": "Question is required"}), 400

    options = [o.strip() for o in options if o.strip()]
    if len(options) < 2:
        return jsonify({"error": "At least two options are required"}), 400

    if multiple_allowed:
        try:
            max_choices = int(max_choices)
            if max_choices < 1:
                raise ValueError
        except (TypeError, ValueError):
            return jsonify({"error": "Max choices must be a positive integer"}), 400
    else:
        max_choices = None

    db = get_db()
    cur = db.cursor()

    cur.execute(
        """
        INSERT INTO polls (question, multiple_allowed, max_choices, hide_results)
        VALUES (?, ?, ?, ?)
        """,
        (question, multiple_allowed, max_choices, hide_results),
    )
    poll_id = cur.lastrowid

    for opt in options:
        cur.execute(
            "INSERT INTO options (poll_id, option_text) VALUES (?, ?)", (poll_id, opt)
        )

    db.commit()

    return jsonify({"success": True, "poll_id": poll_id})


# ---------- API: generate codes for a poll ----------


@app.route("/api/polls/<int:poll_id>/generate-codes", methods=["POST"])
def generate_codes_endpoint(poll_id):
    data = request.get_json(force=True)
    count = data.get("count")

    try:
        count = int(count)
        if count < 1:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "Count must be a positive integer"}), 400

    db = get_db()
    poll = db.execute("SELECT id FROM polls WHERE id = ?", (poll_id,)).fetchone()
    if not poll:
        return jsonify({"error": "Poll not found"}), 404

    codes = generate_unique_codes(db, poll_id, count)
    return jsonify({"success": True, "codes": codes})


# ---------- API: validate code ----------


@app.route("/api/polls/<int:poll_id>/validate-code", methods=["POST"])
def validate_code(poll_id):
    data = request.get_json(force=True)
    code = data.get("code", "").strip().upper()

    if not code:
        return jsonify({"valid": False, "reason": "empty"})

    db = get_db()
    row = db.execute(
        "SELECT id, used FROM codes WHERE poll_id = ? AND code = ?", (poll_id, code)
    ).fetchone()

    if not row:
        return jsonify({"valid": False, "reason": "invalid"})
    if row["used"]:
        return jsonify({"valid": False, "reason": "used"})

    return jsonify({"valid": True})


# ---------- API: cast vote (with code) ----------


@app.route("/api/polls/<int:poll_id>/vote", methods=["POST"])
def vote(poll_id):
    data = request.get_json(force=True)
    option_ids = data.get("option_ids", [])
    code = data.get("code", "").strip().upper()

    if not isinstance(option_ids, list):
        return jsonify({"error": "option_ids must be a list"}), 400

    if not code:
        return jsonify({"error": "Voting code is required"}), 400

    db = get_db()

    poll = db.execute(
        "SELECT id, multiple_allowed, max_choices FROM polls WHERE id = ?", (poll_id,)
    ).fetchone()
    if not poll:
        return jsonify({"error": "Poll not found"}), 404

    # Validate code
    code_row = db.execute(
        "SELECT id, used FROM codes WHERE poll_id = ? AND code = ?", (poll_id, code)
    ).fetchone()
    if not code_row:
        return jsonify({"error": "Invalid code"}), 400
    if code_row["used"]:
        return jsonify({"error": "This code has already been used"}), 400

    multiple_allowed = poll["multiple_allowed"]
    max_choices = poll["max_choices"]

    # Validate selection count
    if multiple_allowed:
        if len(option_ids) == 0:
            return jsonify({"error": "Select at least one option"}), 400
        if max_choices is not None and len(option_ids) > max_choices:
            return (
                jsonify({"error": f"You can select up to {max_choices} options"}),
                400,
            )
    else:
        if len(option_ids) != 1:
            return jsonify({"error": "You must select exactly one option"}), 400

    # Validate options belong to this poll
    placeholders = ",".join("?" for _ in option_ids) or "NULL"
    rows = db.execute(
        f"SELECT id FROM options WHERE poll_id = ? AND id IN ({placeholders})",
        (poll_id, *option_ids) if option_ids else (poll_id,),
    ).fetchall()

    if len(rows) != len(option_ids):
        return jsonify({"error": "Invalid option(s)"}), 400

    cur = db.cursor()
    for oid in option_ids:
        cur.execute(
            "INSERT INTO votes (poll_id, option_id) VALUES (?, ?)", (poll_id, oid)
        )

    # Mark code as used
    cur.execute("UPDATE codes SET used = 1 WHERE id = ?", (code_row["id"],))

    db.commit()

    return jsonify({"success": True})


# ---------- API: results ----------


@app.route("/api/polls/<int:poll_id>/results")
def poll_results(poll_id):
    db = get_db()

    poll = db.execute(
        "SELECT hide_results FROM polls WHERE id = ?", (poll_id,)
    ).fetchone()
    if not poll:
        return jsonify({"error": "Poll not found"}), 404

    if poll["hide_results"] == 1:
        total = db.execute(
            "SELECT COUNT(*) AS c FROM votes WHERE poll_id = ?", (poll_id,)
        ).fetchone()["c"]
        return jsonify({"hidden": True, "total_votes": total})

    rows = db.execute(
        """
        SELECT o.id, o.option_text,
               COUNT(v.id) AS votes
        FROM options o
        LEFT JOIN votes v ON v.option_id = o.id
        WHERE o.poll_id = ?
        GROUP BY o.id, o.option_text
        ORDER BY o.id
        """,
        (poll_id,),
    ).fetchall()

    return jsonify(
        {
            "hidden": False,
            "results": [
                {"id": r["id"], "option_text": r["option_text"], "votes": r["votes"]}
                for r in rows
            ],
        }
    )


if __name__ == "__main__":
    print("Using DB:", DB_PATH)
    app.run(debug=True)
