from routers.stores import _validate_brn_checksum


def test_valid_registered_store_brn_passes():
    # 실제 승인된 매장에 쓰인 사업자등록번호 — 체크섬이 맞아야 함
    assert _validate_brn_checksum("3141681602") is True


def test_wrong_length_fails():
    assert _validate_brn_checksum("12345") is False
    assert _validate_brn_checksum("12345678901") is False


def test_non_digit_fails():
    assert _validate_brn_checksum("314168160a") is False


def test_wrong_checksum_digit_fails():
    # 마지막 검증 숫자만 하나 바꾸면 체크섬이 깨져야 함
    assert _validate_brn_checksum("3141681601") is False
