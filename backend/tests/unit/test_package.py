import pianola


def test_package_exposes_version() -> None:
    assert pianola.__version__ == "0.1.0"
