# -*- mode: python ; coding: utf-8 -*-

import os
from pathlib import Path

# Get the directory of this spec file
script_dir = Path(__file__).parent
blink_detector_path = script_dir / "blink_detector.py"
model_source = script_dir.parent / "electron" / "assets" / "models"

a = Analysis(
    [str(blink_detector_path)],
    pathex=[],
    binaries=[],
    datas=[(str(model_source), 'assets/models')] if model_source.exists() else [],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='blink_detector',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
