SCREENSHOT_RECORD_ELIGIBLE_SQL = """
r.user_id IS NOT NULL
AND NOT r.is_manual
AND r.screenshot_path IS NOT NULL
"""


def can_view_screenshot(owner_uid, viewer_uid, visibility, owner_show, shares_group=False):
    if owner_uid is not None and viewer_uid is not None and int(owner_uid) == int(viewer_uid):
        return True
    return bool(owner_show and (
        visibility == "public" or (visibility == "group" and shares_group)
    ))
