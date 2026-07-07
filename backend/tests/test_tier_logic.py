from routers.badges import _tier_for


def test_below_bronze_threshold_has_no_tier():
    assert _tier_for(0, is_top10=False) is None


def test_tier_thresholds():
    assert _tier_for(1, is_top10=False) == "bronze"
    assert _tier_for(4, is_top10=False) == "bronze"
    assert _tier_for(5, is_top10=False) == "silver"
    assert _tier_for(9, is_top10=False) == "silver"
    assert _tier_for(10, is_top10=False) == "gold"
    assert _tier_for(14, is_top10=False) == "gold"
    assert _tier_for(15, is_top10=False) == "platinum"
    assert _tier_for(24, is_top10=False) == "platinum"


def test_25_without_top10_is_diamond_not_challenger():
    assert _tier_for(25, is_top10=False) == "diamond"


def test_25_with_top10_is_challenger():
    assert _tier_for(25, is_top10=True) == "challenger"


def test_top10_below_25_stamps_is_not_challenger():
    # 상위 10명이어도 25개를 못 채웠으면 챌린저가 아니라 그 구간 티어 그대로
    assert _tier_for(20, is_top10=True) == "platinum"
