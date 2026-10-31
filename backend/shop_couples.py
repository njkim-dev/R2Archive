from fastapi import HTTPException


def lock_couple_changes(cur):
    cur.execute('SELECT pg_advisory_xact_lock(742113061)')


def partner_character(cur,uid,character_id):
    cur.execute("SELECT other.id,other.user_id,other.name,other.sex,other.thumbnail_key FROM shop_couple_members mine JOIN shop_characters own ON own.id=mine.character_id JOIN shop_couple_relationships r ON r.id=mine.relationship_id JOIN shop_couple_members peer ON peer.relationship_id=r.id AND peer.character_id<>mine.character_id JOIN shop_characters other ON other.id=peer.character_id WHERE mine.character_id=%s AND own.user_id=%s AND r.status='accepted'",(character_id,uid))
    row=cur.fetchone()
    if not row:raise HTTPException(404,'등록된 커플이 없습니다')
    return row
