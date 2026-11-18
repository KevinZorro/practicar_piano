"""Guard rails for the WireGuard + home proxy files in ``infra/``.

These are offline checks of the committed templates and scripts: they cannot prove the
tunnel works (that is verified on the VPS), but they stop the mistakes that would hurt
most: a real key in git, a full tunnel on the home side, or a proxy exposed beyond the
tunnel.
"""

import base64
import ipaddress
import re
import subprocess
from pathlib import Path

import pytest

INFRA = Path(__file__).resolve().parents[3] / "infra"
VPS_DIR = INFRA / "wireguard" / "vps"
HOME_CONF = INFRA / "wireguard" / "home" / "pianola-home.conf.example"
KEY_RE = re.compile(r"[A-Za-z0-9+/]{43}=")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _setting(text: str, name: str) -> str:
    match = re.search(rf"^{name}\s*=\s*(\S+)", text, re.MULTILINE)
    assert match, f"{name} missing"
    return match.group(1)


def _fake_key(seed: bytes) -> str:
    return base64.b64encode(seed * 32).decode()


def test_templates_contain_no_real_keys() -> None:
    for path in [VPS_DIR / "wg0.conf.template", HOME_CONF]:
        assert not KEY_RE.search(_read(path)), f"{path.name} looks like it holds a key"


def test_tunnel_addresses_share_one_subnet_and_are_distinct() -> None:
    server = _read(VPS_DIR / "wg0.conf.template")
    home = _read(HOME_CONF)
    server_if = ipaddress.ip_interface(_setting(server, "Address"))
    home_if = ipaddress.ip_interface(_setting(home, "Address"))
    assert server_if.network == home_if.network
    assert server_if.ip != home_if.ip


def test_each_side_routes_only_the_other_peer_address() -> None:
    server = _read(VPS_DIR / "wg0.conf.template")
    home = _read(HOME_CONF)
    server_ip = ipaddress.ip_interface(_setting(server, "Address")).ip
    home_ip = ipaddress.ip_interface(_setting(home, "Address")).ip
    assert _setting(server, "AllowedIPs") == f"{home_ip}/32"
    assert _setting(home, "AllowedIPs") == f"{server_ip}/32"  # never 0.0.0.0/0 (split tunnel)


def test_home_client_keeps_the_nat_mapping_alive_and_uses_the_server_port() -> None:
    server = _read(VPS_DIR / "wg0.conf.template")
    home = _read(HOME_CONF)
    assert 0 < int(_setting(home, "PersistentKeepalive")) <= 30
    assert _setting(home, "Endpoint").endswith(f":{_setting(server, 'ListenPort')}")


def test_firewall_script_opens_the_server_listen_port_by_default() -> None:
    port = _setting(_read(VPS_DIR / "wg0.conf.template"), "ListenPort")
    assert f"WG_PORT:-{port}" in _read(VPS_DIR / "firewall.sh")


def test_render_fills_both_keys_and_leaves_no_placeholder(tmp_path: Path) -> None:
    key_file = tmp_path / "server.key"
    key_file.write_text(_fake_key(b"s") + "\n", encoding="utf-8")
    home_pub = _fake_key(b"h")
    result = subprocess.run(  # noqa: S603
        ["bash", str(VPS_DIR / "render-wg0-conf.sh"), str(key_file), home_pub],  # noqa: S607
        capture_output=True,
        text=True,
        check=True,
    )
    assert f"PrivateKey = {_fake_key(b's')}" in result.stdout
    assert f"PublicKey = {home_pub}" in result.stdout
    assert "@" not in result.stdout


BAD_KEYS = ["", "not-a-key", "a|b", "x" * 44, _fake_key(b"h") + "\n[Peer]"]


@pytest.mark.parametrize("bad_key", BAD_KEYS)
def test_render_rejects_malformed_public_keys(tmp_path: Path, bad_key: str) -> None:
    key_file = tmp_path / "server.key"
    key_file.write_text(_fake_key(b"s"), encoding="utf-8")
    result = subprocess.run(  # noqa: S603
        ["bash", str(VPS_DIR / "render-wg0-conf.sh"), str(key_file), bad_key],  # noqa: S607
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert result.stdout == ""


def test_shell_scripts_have_valid_syntax() -> None:
    for script in VPS_DIR.glob("*.sh"):
        subprocess.run(["bash", "-n", str(script)], check=True)  # noqa: S603, S607


def test_windows_proxy_binds_to_the_tunnel_and_is_firewalled_to_the_vps() -> None:
    server = _read(VPS_DIR / "wg0.conf.template")
    home = _read(HOME_CONF)
    home_ip = str(ipaddress.ip_interface(_setting(home, "Address")).ip)
    vps_ip = str(ipaddress.ip_interface(_setting(server, "Address")).ip)
    windows = INFRA / "home-proxy" / "windows"
    run = _read(windows / "Run-HomeProxy.ps1")
    install = _read(windows / "Install-HomeProxy.ps1")
    assert f"'{home_ip}'" in run and f"'{home_ip}'" in install
    assert f"'{vps_ip}'" in install
    assert "0.0.0.0" not in run + install  # noqa: S104
    assert "-RemoteAddress $VpsAddress" in install
    assert "-LocalAddress $BindAddress" in install


def test_compose_probe_uses_the_same_proxy_variable_as_the_benchmark() -> None:
    compose = _read(INFRA / "docker-compose.yml")
    assert compose.count('TECLARIO_PROXY_URL: "${TECLARIO_PROXY_URL:-}"') == 3
    assert "check-proxy" in compose
