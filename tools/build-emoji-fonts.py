#!/usr/bin/env python3
"""Adds Noto Emoji's black-and-white glyphs to the bundled Vazirmatn fonts.

Roku's system font has no emoji glyphs and a Label can only use one font, so labels whose text has
emoji switch to the bundled font (see RtlText.bs), which then needs both Persian and emoji glyphs.
Roku draws neither colour glyphs nor OpenType ligatures, so only the single code point emoji are
added (ZWJ sequences, flags and skin tones fall back to their parts, which RtlText cleans up).

Sources are in tools/fonts (Vazirmatn and Noto Emoji, both OFL), the output goes to
playlet-lib/src/fonts. Needs fontTools: `pip3 install fonttools`, then `npm run build-emoji-fonts`.
"""

import os

from fontTools import subset
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._c_m_a_p import cmap_format_12
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "fonts")
OUT = os.path.join(ROOT, "playlet-lib", "src", "fonts")
EMOJI_FONT = os.path.join(SRC, "NotoEmoji[wght].ttf")

# Code points below this are left to Vazirmatn (digits, #, *, (c) and (R) have emoji glyphs too)
MIN_CODE_POINT = 0x2000
# Joiners, variation selectors, skin tone modifiers, regional indicators and tags only make sense
# in sequences, which Roku can't draw.
SKIPPED_RANGES = [
    (0x200C, 0x200D),
    (0xFE00, 0xFE0F),
    (0x1F1E6, 0x1F1FF),
    (0x1F3FB, 0x1F3FF),
    (0xE0020, 0xE007F),
]


def is_skipped(code_point):
    return code_point < MIN_CODE_POINT or any(start <= code_point <= end for start, end in SKIPPED_RANGES)


def emoji_subset(weight, base_cmap):
    font = instancer.instantiateVariableFont(TTFont(EMOJI_FONT), {"wght": weight})
    code_points = [c for c in font.getBestCmap() if c not in base_cmap and not is_skipped(c)]

    options = subset.Options()
    options.layout_features = []
    options.notdef_outline = False
    options.name_IDs = []
    options.hinting = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=code_points)
    subsetter.subset(font)
    return font


def merge(base_name, weight):
    base = TTFont(os.path.join(SRC, base_name))
    base_cmap = base.getBestCmap()
    emoji = emoji_subset(weight, base_cmap)
    if base["head"].unitsPerEm != emoji["head"].unitsPerEm:
        raise Exception("unitsPerEm differ")

    renamed = {name: "emoji." + name for name in emoji.getGlyphOrder() if name != ".notdef"}
    glyph_order = base.getGlyphOrder() + list(renamed.values())

    base_glyf = base["glyf"]
    emoji_glyf = emoji["glyf"]
    for name, new_name in renamed.items():
        glyph = emoji_glyf[name]
        if glyph.isComposite():
            for component in glyph.components:
                component.glyphName = renamed[component.glyphName]
        base_glyf.glyphs[new_name] = glyph
        base["hmtx"].metrics[new_name] = emoji["hmtx"].metrics[name]
    base.setGlyphOrder(glyph_order)
    base_glyf.glyphOrder = glyph_order

    mapping = dict(base_cmap)
    for code_point, name in emoji.getBestCmap().items():
        mapping[code_point] = renamed[name]

    cmap = newTable("cmap")
    cmap.tableVersion = 0
    cmap.tables = []
    for platform_id, encoding_id in ((0, 4), (3, 10)):
        table = cmap_format_12(12)
        table.platformID = platform_id
        table.platEncID = encoding_id
        table.format = 12
        table.reserved = 0
        table.length = 0
        table.language = 0
        table.nGroups = 0
        table.cmap = mapping
        cmap.tables.append(table)
    # A format 4 table for BMP-only readers
    bmp = {c: g for c, g in mapping.items() if c <= 0xFFFF}
    cmap.tables.append(build_format_4(0, 3, bmp))
    cmap.tables.append(build_format_4(3, 1, bmp))
    base["cmap"] = cmap

    # glyph names aren't needed and keep the file smaller
    base["post"].formatType = 3.0
    if "DSIG" in base:
        del base["DSIG"]

    out_path = os.path.join(OUT, base_name)
    base.save(out_path)
    print(f"{out_path}: {len(renamed)} emoji glyphs, {os.path.getsize(out_path)} bytes")


def build_format_4(platform_id, encoding_id, mapping):
    from fontTools.ttLib.tables._c_m_a_p import cmap_format_4

    table = cmap_format_4(4)
    table.platformID = platform_id
    table.platEncID = encoding_id
    table.format = 4
    table.length = 0
    table.language = 0
    table.cmap = mapping
    return table


if __name__ == "__main__":
    merge("Vazirmatn-Regular.ttf", 400)
    merge("Vazirmatn-Bold.ttf", 700)
