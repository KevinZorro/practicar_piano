import logging

from notacaida.api.log_redaction import RedactVideoLinks, install_log_redaction, redact


def test_redacts_youtube_links_in_any_form() -> None:
    text = "failed https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3 and http://youtu.be/dQw4w9WgXcQ."
    out = redact(text)
    assert "dQw4w9WgXcQ" not in out
    assert out.count("<video-link>") == 2


def test_keeps_unrelated_text() -> None:
    assert redact("queue full for 203.0.113.9") == "queue full for 203.0.113.9"


def test_filter_redacts_formatted_arguments() -> None:
    record = logging.LogRecord(
        "x", logging.WARNING, "f", 1, "bad %s", ("https://youtu.be/dQw4w9WgXcQ",), None
    )
    RedactVideoLinks().filter(record)
    assert record.getMessage() == "bad <video-link>"


def test_install_adds_the_filter_once_to_root_handlers() -> None:
    handler = logging.StreamHandler()
    root = logging.getLogger()
    root.addHandler(handler)
    try:
        install_log_redaction()
        install_log_redaction()
        assert sum(isinstance(f, RedactVideoLinks) for f in handler.filters) == 1
    finally:
        root.removeHandler(handler)
