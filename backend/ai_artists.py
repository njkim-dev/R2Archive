from unicodedata import normalize


def normalize_artist_name(artist: str | None) -> str:
    return normalize("NFKC", (artist or "").strip()).lower()


def load_ai_artists(cur) -> set[str]:
    cur.execute("SELECT artist_name FROM ai_artists")
    return {normalize_artist_name(row[0]) for row in cur.fetchall()}


def is_ai_artist(artist: str | None, ai_artists: set[str]) -> bool:
    return normalize_artist_name(artist) in ai_artists
