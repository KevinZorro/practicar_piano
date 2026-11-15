from pianola.application.links import parse_links

A = "https://youtu.be/aaaaaaaaaaa"
B = "https://www.youtube.com/watch?v=bbbbbbbbbbb"


def test_parse_links_reads_labels_urls_and_skips_comments() -> None:
    text = f"# my covers\n\nRiver Flows | {A}\n{B}\n"

    entries, issues = parse_links(text)

    assert issues == []
    assert [(e.index, e.label) for e in entries] == [(1, "River Flows"), (2, "song-02")]
    assert entries[1].url.video_id == "bbbbbbbbbbb"


def test_parse_links_reports_line_numbers_without_echoing_the_link() -> None:
    entries, issues = parse_links(f"{A}\nhttps://evil.example/watch?v=ccccccccccc\n")

    assert len(entries) == 1
    assert [issue.line_number for issue in issues] == [2]
    assert "evil.example" not in issues[0].reason


def test_parse_links_sanitizes_labels() -> None:
    entries, _ = parse_links(f"bad `label`\x07 | {A}")

    assert entries[0].label == "bad label"


def test_parse_links_allows_pipes_inside_the_label() -> None:
    entries, issues = parse_links(f"Reze Arc OST (Piano) | Kensuke Ushio | {A}")

    assert issues == []
    assert entries[0].url.video_id == "aaaaaaaaaaa"
    assert entries[0].label == "Reze Arc OST (Piano)  Kensuke Ushio"


def test_parse_links_accepts_real_world_urls_with_radio_parameters() -> None:
    url = "https://www.youtube.com/watch?v=OaXPV3dbamU&list=RDOaXPV3dbamU&start_radio=1"

    entries, issues = parse_links(f"Ofelia (Piano Cover) | {url}")

    assert issues == []
    assert entries[0].url.canonical == "https://www.youtube.com/watch?v=OaXPV3dbamU"
