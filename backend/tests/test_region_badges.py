from routers.badges import (
    CITY_STAMP_THRESHOLD,
    DONG_CATEGORY_STAMP_THRESHOLD,
    _region_badges_from_totals,
)


def test_below_threshold_gives_no_badges():
    dong_totals = {("전포동", "카페"): DONG_CATEGORY_STAMP_THRESHOLD - 1}
    city_totals = {"대전": CITY_STAMP_THRESHOLD - 1}
    assert _region_badges_from_totals(dong_totals, city_totals) == []


def test_district_badge_at_threshold():
    dong_totals = {("전포동", "카페"): DONG_CATEGORY_STAMP_THRESHOLD}
    badges = _region_badges_from_totals(dong_totals, {})
    assert len(badges) == 1
    badge = badges[0]
    assert badge["type"] == "district"
    assert badge["name"] == "전포동 카페 거리 정복"
    assert badge["region"] == "전포동"
    assert badge["category"] == "카페"
    assert badge["total_stamps"] == DONG_CATEGORY_STAMP_THRESHOLD


def test_city_badge_at_threshold():
    city_totals = {"대전": CITY_STAMP_THRESHOLD}
    badges = _region_badges_from_totals({}, city_totals)
    assert len(badges) == 1
    badge = badges[0]
    assert badge["type"] == "city"
    assert badge["name"] == "대전 정복"
    assert badge["region"] == "대전"
    assert badge["category"] is None
    assert badge["total_stamps"] == CITY_STAMP_THRESHOLD


def test_multiple_badges_sorted_by_stamps_descending():
    dong_totals = {("전포동", "카페"): 30, ("성수동", "한식"): 45}
    city_totals = {"대전": 50, "서울": 100}
    badges = _region_badges_from_totals(dong_totals, city_totals)
    totals = [b["total_stamps"] for b in badges]
    assert totals == sorted(totals, reverse=True)
    assert len(badges) == 4


def test_district_badge_requires_both_dong_and_category_key():
    # 카테고리 없이 동만 있는 매장(미인증 매장)은 애초에 dong_category_totals에 안 들어오므로
    # 이 함수 레벨에서는 항상 (dong, category) 튜플 키가 있다고 가정해도 안전함을 확인
    dong_totals = {("전포동", "카페"): DONG_CATEGORY_STAMP_THRESHOLD}
    badges = _region_badges_from_totals(dong_totals, {})
    assert badges[0]["category"] == "카페"
