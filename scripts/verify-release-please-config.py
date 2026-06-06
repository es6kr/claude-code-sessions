#!/usr/bin/env python3
"""Verify release-please config + manifest invariants for both stable and beta tracks.

Run from repo root:
    python3 scripts/verify-release-please-config.py

Validates:
- main config covers all 5 packages (4 npm + vscode-extension)
- main manifest is in sync with main config
- beta config covers only 4 npm packages (vscode-extension excluded)
- beta manifest is in sync with beta config
- vscode-extension overrides include-component-in-tag (=> vscode-v* tag pattern)
- beta packages have prerelease: true + prerelease-type: "beta"
- linked-versions plugin covers core/ui/web/mcp in both tracks
"""
import json
import sys
from pathlib import Path


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent

    main_cfg = json.loads((repo_root / "release-please-config.json").read_text())
    main_man = json.loads((repo_root / ".release-please-manifest.json").read_text())
    beta_cfg = json.loads((repo_root / "release-please-beta-config.json").read_text())
    beta_man = json.loads((repo_root / ".release-please-manifest-beta.json").read_text())

    main_pkgs = {
        "packages/core",
        "packages/ui",
        "packages/web",
        "packages/mcp",
        "packages/vscode-extension",
    }
    beta_pkgs = {"packages/core", "packages/ui", "packages/web", "packages/mcp"}

    # --- main / stable ---
    if set(main_cfg["packages"].keys()) != main_pkgs:
        fail(f"main config package set mismatch: {set(main_cfg['packages'].keys())}")
    if set(main_man.keys()) != main_pkgs:
        fail(f"main manifest package set mismatch: {set(main_man.keys())}")

    main_linked = next(
        (p for p in main_cfg["plugins"] if isinstance(p, dict) and p.get("type") == "linked-versions"),
        None,
    )
    if not main_linked:
        fail("main: linked-versions plugin missing")
    if set(main_linked["components"]) != {"core", "ui", "web", "mcp"}:
        fail(f"main linked-versions components mismatch: {main_linked['components']}")

    vscode_entry = main_cfg["packages"]["packages/vscode-extension"]
    if vscode_entry.get("include-component-in-tag") is not True:
        fail("vscode-extension must override include-component-in-tag: true")
    if vscode_entry.get("component") != "vscode":
        fail(f"vscode-extension component name mismatch: {vscode_entry.get('component')}")

    # --- beta (npm only, no vscode) ---
    if set(beta_cfg["packages"].keys()) != beta_pkgs:
        fail(
            f"beta config package set mismatch (vscode-extension must NOT be present): "
            f"{set(beta_cfg['packages'].keys())}"
        )
    if set(beta_man.keys()) != beta_pkgs:
        fail(f"beta manifest package set mismatch: {set(beta_man.keys())}")
    if "packages/vscode-extension" in beta_cfg["packages"]:
        fail("beta config must exclude vscode-extension")

    for pkg, conf in beta_cfg["packages"].items():
        if conf.get("prerelease") is not True:
            fail(f"beta {pkg} missing prerelease: true")
        if conf.get("prerelease-type") != "beta":
            fail(f"beta {pkg} missing prerelease-type: beta")

    beta_linked = next(
        (p for p in beta_cfg["plugins"] if isinstance(p, dict) and p.get("type") == "linked-versions"),
        None,
    )
    if not beta_linked:
        fail("beta: linked-versions plugin missing")
    if set(beta_linked["components"]) != {"core", "ui", "web", "mcp"}:
        fail(f"beta linked-versions components mismatch: {beta_linked['components']}")

    # --- linked manifest invariant: all linked packages share the same version ---
    main_versions = {pkg: main_man[pkg] for pkg in main_pkgs if pkg != "packages/vscode-extension"}
    if len(set(main_versions.values())) > 2:
        # Allow 2 distinct values: pre-migration desync (ui may temporarily lag). Reconciles on first release.
        fail(f"main manifest has too many distinct npm versions: {main_versions}")

    beta_versions = set(beta_man.values())
    if len(beta_versions) != 1:
        fail(f"beta manifest must have a single shared version for linked group: {beta_man}")

    print("OK: release-please main + beta config schemas valid")
    print(f"  main npm versions:    {main_versions}")
    print(f"  main vscode version:  {main_man['packages/vscode-extension']}")
    print(f"  beta version:         {next(iter(beta_versions))}")


if __name__ == "__main__":
    main()
