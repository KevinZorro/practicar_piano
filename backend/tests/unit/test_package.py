import notacaida


def test_package_exposes_version() -> None:
    assert notacaida.__version__ == "0.1.0"
