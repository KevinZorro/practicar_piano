import teclario


def test_package_exposes_version() -> None:
    assert teclario.__version__ == "0.1.0"
