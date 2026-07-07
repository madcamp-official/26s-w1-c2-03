from routers.stores import _derive_category


def test_cafe_group_code_is_cafe_regardless_of_name():
    assert _derive_category("음식점 > 카페", "CE7") == "카페"


def test_dessert_keyword_wins_even_under_cafe_group():
    assert _derive_category("음식점 > 카페 > 디저트카페", "CE7") == "디저트"


def test_food_keyword_matching():
    assert _derive_category("음식점 > 한식 > 국수", None) == "한식"
    assert _derive_category("음식점 > 일식 > 초밥,롤", "FD6") == "일식"
    assert _derive_category("음식점 > 치킨", "FD6") == "치킨"


def test_unmatched_category_falls_back_to_기타():
    assert _derive_category("여행 > 관광,명소 > 문화유적 > 탑,비석", None) == "기타"
    assert _derive_category(None, None) == "기타"
