SCREENSHOT_RECORD_ELIGIBLE_SQL = """
r.user_id IS NOT NULL
AND NOT r.is_manual
AND r.screenshot_path IS NOT NULL
"""
