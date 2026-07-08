from routers.stores import _derive_category


def test_cafe_group_code_is_cafe_dessert_regardless_of_name():
    assert _derive_category("음식점 > 카페", "CE7") == "카페·디저트"


def test_dessert_keyword_wins_even_under_cafe_group():
    assert _derive_category("음식점 > 카페 > 디저트카페", "CE7") == "카페·디저트"


def test_food_keyword_matching():
    assert _derive_category("음식점 > 한식 > 국수", None) == "한식"
    assert _derive_category("음식점 > 일식 > 돈까스", "FD6") == "일식·돈까스"
    assert _derive_category("음식점 > 치킨", "FD6") == "치킨"
    assert _derive_category("음식점 > 피자", "FD6") == "피자"
    assert _derive_category("음식점 > 햄버거", "FD6") == "햄버거"
    assert _derive_category("음식점 > 족발,보쌈", "FD6") == "족발·보쌈"
    assert _derive_category("음식점 > 일식 > 초밥,롤", "FD6") == "회·초밥"
    assert _derive_category("음식점 > 한식 > 찜닭", "FD6") == "한식"  # "찜"이 들어가도 찜·탕이 아니라 한식으로
    assert _derive_category("음식점 > 한식 > 감자탕", "FD6") == "찜·탕"
    assert _derive_category("음식점 > 술집 > 호프,요리주점", "FD6") == "야식"
    assert _derive_category("음식점 > 아시아음식 > 베트남음식", "FD6") == "아시안"
    assert _derive_category("음식점 > 도시락", "FD6") == "도시락"
    assert _derive_category("음식점 > 패스트푸드 > 샌드위치", "FD6") == "샌드위치·샐러드·죽"


def test_unmatched_category_falls_back_to_기타():
    assert _derive_category("여행 > 관광,명소 > 문화유적 > 탑,비석", None) == "기타"
    assert _derive_category(None, None) == "기타"
