# PDF export fonts

These unmodified SIL Open Font License assets are served by this application,
not a third-party font CDN. They are used only by PDF export, not by the UI.
The font loader checks the recorded byte count and SHA-256 before embedding.
Only used glyphs are embedded into each PDF. No Note text, participant identifier
or private URL is sent to a font service. Keep both accompanying OFL files.
License text is retained with trailing whitespace removed.

| Asset | Official source | Git blob | SHA-256 |
| --- | --- | --- | --- |
| noto-sans-sc-regular.fc0fda93.otf | [Noto Sans SC](https://github.com/notofonts/noto-cjk/blob/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf) | fc0fda9394367c16c1af7555a2ae4d5e2e6a6f02 | faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9 |
| noto-emoji-variable.c2c26ab6.ttf | [Noto Emoji](https://github.com/google/fonts/blob/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf) | c2c26ab612a88a8610ff9cfbb89299bf2aea6c7a | de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551 |

Retrieved and Git-blob-verified on 2026-09-08. Noto Sans SC: 8,331,336 bytes;
Noto Emoji: 1,982,596 bytes. Font parsing and embedding use pinned
`pdf-lib@1.17.1` and `fontkit@2.0.4`, with a small subset serialization bridge
for pdf-lib's older stream API. Do not substitute `@pdf-lib/fontkit@1.1.1`:
actual Poppler renders exposed invalid CJK subset fonts with that older fork.
Emoji are monochrome. Unsupported
graphemes fail explicitly rather than becoming missing-glyph boxes. This is not
a claim of universal script, emoji-sequence, PDF/A or tagged-PDF support.
