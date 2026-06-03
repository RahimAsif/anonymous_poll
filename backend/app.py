import os
import sqlite3
import secrets
from flask import Flask, request, jsonify, render_template, g
from dotenv import load_dotenv

DB_PATH = os.environ.get(
    "DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "poll.db")
)


app = Flask(
    __name__,
    static_folder="../frontend/static",  # adjust if needed
    template_folder="../frontend/templates",  # adjust if needed
)

# ---------- DB helpers ----------


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with app.app_context():
        db = get_db()
        with open("schema.sql", "r") as f:
            db.executescript(f.read())
        db.commit()


if not os.path.exists(DB_PATH):
    init_db()


# ---------- HTML pages ----------


@app.route("/")
def index():
    """
    Main poll page.
    Accepts optional ?poll_id= query param, defaults to 1.
    """
    poll_id = request.args.get("poll_id", default=1, type=int)
    return render_template("poll.html", poll_id=poll_id)


@app.route("/admin")
def admin_page():
    """
    Simple admin UI (no auth yet).
    """
    return render_template("admin.html")


# ---------- API: Polls & options ----------


@app.route("/api/polls", methods=["GET"])
def list_polls():
    db = get_db()
    cur = db.execute("SELECT id, question FROM polls ORDER BY id DESC")
    polls = [dict(row) for row in cur.fetchall()]
    return jsonify(polls)


@app.route("/api/polls", methods=["POST"])
def create_poll():
    """
    JSON body:
    {
      "question": "Your question?",
      "options": ["A", "B", "C"]
    }
    """
    data = request.json or {}
    question = data.get("question")
    options = data.get("options", [])

    if not question or not options:
        return jsonify({"error": "Question and options are required"}), 400

    db = get_db()
    cur = db.cursor()

    cur.execute("INSERT INTO polls (question) VALUES (?)", (question,))
    poll_id = cur.lastrowid

    for opt in options:
        cur.execute(
            "INSERT INTO options (poll_id, option_text) VALUES (?, ?)", (poll_id, opt)
        )

    db.commit()
    return jsonify({"id": poll_id, "question": question}), 201


@app.route("/api/polls/<int:poll_id>", methods=["GET"])
def get_poll(poll_id):
    db = get_db()

    cur = db.execute("SELECT id, question FROM polls WHERE id=?", (poll_id,))
    poll = cur.fetchone()
    if not poll:
        return jsonify({"error": "Poll not found"}), 404

    cur = db.execute("SELECT id, option_text FROM options WHERE poll_id=?", (poll_id,))
    options = [dict(row) for row in cur.fetchall()]

    return jsonify({"id": poll["id"], "question": poll["question"], "options": options})


@app.route("/api/polls/<int:poll_id>/results", methods=["GET"])
def poll_results(poll_id):
    db = get_db()
    cur = db.execute(
        """
        SELECT o.id, o.option_text, COUNT(v.id) AS votes
        FROM options o
        LEFT JOIN votes v ON v.option_id = o.id
        WHERE o.poll_id=?
        GROUP BY o.id, o.option_text
        ORDER BY o.id
    """,
        (poll_id,),
    )
    results = [dict(row) for row in cur.fetchall()]
    return jsonify(results)


# ---------- API: Codes (unique voting codes) ----------


@app.route("/api/polls/<int:poll_id>/generate_codes", methods=["POST"])
def generate_codes(poll_id):
    """
    JSON body:
    {
      "count": 10
    }
    Returns:
    {
      "codes": ["abc123", "def456", ...]
    }
    """
    data = request.json or {}
    count = data.get("count", 1)

    # Ensure poll exists
    db = get_db()
    cur = db.execute("SELECT id FROM polls WHERE id=?", (poll_id,))
    if not cur.fetchone():
        return jsonify({"error": "Poll not found"}), 404

    cur = db.cursor()
    codes = []

    for _ in range(int(count)):
        # token_urlsafe(8) ~ 11 chars, unguessable enough for this use
        code = secrets.token_urlsafe(8)
        cur.execute("INSERT INTO codes (poll_id, code) VALUES (?, ?)", (poll_id, code))
        codes.append(code)

    db.commit()
    return jsonify({"codes": codes})


@app.route("/api/polls/<int:poll_id>/codes", methods=["GET"])
def list_codes(poll_id):
    """
    Optional helper to see which codes exist and whether they are used.
    """
    db = get_db()
    cur = db.execute(
        """
        SELECT id, code, used, used_at
        FROM codes
        WHERE poll_id=?
        ORDER BY id
    """,
        (poll_id,),
    )
    codes = [dict(row) for row in cur.fetchall()]
    return jsonify(codes)


# ---------- API: Voting with a code ----------


@app.route("/api/vote", methods=["POST"])
def vote():
    """
    JSON body:
    {
      "option_id": 3,
      "code": "some-code"
    }
    """
    data = request.json or {}
    option_id = data.get("option_id")
    code = data.get("code")

    if not option_id or not code:
        return jsonify({"error": "option_id and code required"}), 400

    db = get_db()

    # Validate code
    cur = db.execute("SELECT id, poll_id, used FROM codes WHERE code=?", (code,))
    code_row = cur.fetchone()

    if not code_row:
        return jsonify({"error": "Invalid code"}), 403

    if code_row["used"]:
        return jsonify({"error": "Code already used"}), 403

    # Validate option belongs to same poll
    cur = db.execute("SELECT poll_id FROM options WHERE id=?", (option_id,))
    opt_row = cur.fetchone()
    if not opt_row:
        return jsonify({"error": "Option not found"}), 404

    if opt_row["poll_id"] != code_row["poll_id"]:
        return jsonify({"error": "Option does not belong to this poll"}), 400

    poll_id = opt_row["poll_id"]

    # Record vote
    db.execute(
        """
        INSERT INTO votes (poll_id, option_id)
        VALUES (?, ?)
    """,
        (poll_id, option_id),
    )

    # Mark code as used
    db.execute(
        """
        UPDATE codes
        SET used=1, used_at=CURRENT_TIMESTAMP
        WHERE id=?
    """,
        (code_row["id"],),
    )

    db.commit()

    return jsonify({"message": "Vote recorded"})


if __name__ == "__main__":
    # For local dev
    load_dotenv()
    app.run(debug=True)
