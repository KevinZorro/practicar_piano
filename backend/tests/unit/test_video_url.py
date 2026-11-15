import pytest

from pianola.domain.errors import InvalidVideoUrlError
from pianola.domain.video_url import VideoUrl

VID = "dQw4w9WgXcQ"


@pytest.mark.parametrize(
    "raw",
    [
        f"https://www.youtube.com/watch?v={VID}",
        f"http://youtube.com/watch?v={VID}&t=42s&list=PL123",
        f"https://m.youtube.com/watch?v={VID}",
        f"https://music.youtube.com/watch?v={VID}",
        f"https://youtu.be/{VID}",
        f"https://youtu.be/{VID}?si=abc",
        f"https://www.youtube.com/shorts/{VID}",
        f"https://www.youtube.com/embed/{VID}",
        f"https://www.youtube.com/live/{VID}",
        f"  https://WWW.YouTube.com/watch?v={VID}\n",
    ],
)
def test_parse_accepts_youtube_links_and_normalizes(raw: str) -> None:
    url = VideoUrl.parse(raw)

    assert url.video_id == VID
    assert url.canonical == f"https://www.youtube.com/watch?v={VID}"


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "not a url",
        f"ftp://www.youtube.com/watch?v={VID}",
        f"https://youtube.com.evil.com/watch?v={VID}",
        f"https://evil.com/watch?v={VID}",
        f"https://www.youtube.com.evil.com/watch?v={VID}",
        f"https://user:pass@www.youtube.com/watch?v={VID}",
        f"https://www.youtube.com:8443/watch?v={VID}",
        "https://www.youtube.com/watch?v=short",
        f"https://www.youtube.com/watch?v={VID}x",
        f"https://www.youtube.com/watch?v={VID}&v={VID}",
        "https://www.youtube.com/playlist?list=PL1234567890",
        "https://www.youtube.com/@somechannel",
        f"https://www.youtube.com/watch/{VID}",
        f"https://youtu.be/{VID}/extra",
        f"https://www.youtube.com/watch?v={VID} https://evil.com",
        "https://www.youtube.com/watch?v=../../etc/passwd",
        "file:///etc/passwd",
        "https://127.0.0.1/watch?v=" + VID,
    ],
)
def test_parse_rejects_non_youtube_or_malformed_links(raw: str) -> None:
    with pytest.raises(InvalidVideoUrlError):
        VideoUrl.parse(raw)


def test_parse_rejects_oversized_input() -> None:
    with pytest.raises(InvalidVideoUrlError):
        VideoUrl.parse("https://www.youtube.com/watch?v=" + "a" * 5000)


def test_repr_and_fingerprint_never_expose_the_video_id() -> None:
    url = VideoUrl.parse(f"https://youtu.be/{VID}")

    assert VID not in repr(url)
    assert VID not in url.fingerprint
    assert len(url.fingerprint) == 10
    assert url.fingerprint == VideoUrl.parse(url.canonical).fingerprint
