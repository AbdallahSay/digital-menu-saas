using System.Text;
using DigitalMenu.Api.Owner;

namespace DigitalMenu.IntegrationTests;

// Independent read-back decoder built only from ISO/IEC 18004 table values (not from encoder internals):
// it locates function patterns, validates format/version BCH words against the published tables, unmasks,
// de-interleaves per the level-M block table, checks every Reed-Solomon syndrome and parses the byte segment.
public sealed class QrCodeTests
{
    // Level M format words for masks 0..7 (ISO/IEC 18004 Annex C, table C.1).
    private static readonly int[] FormatM = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];
    // Version information words (Annex D, table D.1).
    private static readonly Dictionary<int, int> VersionInfo = new() { [7] = 0x07C94, [8] = 0x085BC, [9] = 0x09A99, [10] = 0x0A4D3 };
    private static readonly int[][] Alignment = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
    private static readonly int[] TotalCodewords = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
    // Level M blocks: (count, total codewords, data codewords) groups (table 9).
    private static readonly (int Count, int Total, int Data)[][] Blocks =
    [
        [], [(1, 26, 16)], [(1, 44, 28)], [(1, 70, 44)], [(2, 50, 32)], [(2, 67, 43)], [(4, 43, 27)], [(4, 49, 31)],
        [(2, 60, 38), (2, 61, 39)], [(3, 58, 36), (2, 59, 37)], [(4, 69, 43), (1, 70, 44)]
    ];

    private static bool[,] FunctionMap(int version, int size)
    {
        var f = new bool[size, size];
        void Box(int x0, int y0, int w, int h) { for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) f[y, x] = true; }
        Box(0, 0, 9, 9); Box(size - 8, 0, 8, 9); Box(0, size - 8, 9, 8); // Finders, separators, format areas, dark module.
        Box(6, 0, 1, size); Box(0, 6, size, 1);
        var a = Alignment[version];
        foreach (var cy in a) foreach (var cx in a)
            if (!((cx == 6 && cy == 6) || (cx == 6 && cy == a[^1]) || (cx == a[^1] && cy == 6))) Box(cx - 2, cy - 2, 5, 5);
        if (version >= 7) { Box(size - 11, 0, 3, 6); Box(0, size - 11, 6, 3); }
        return f;
    }

    private static bool MaskBit(int mask, int x, int y) => mask switch
    {
        0 => (y + x) % 2 == 0,
        1 => y % 2 == 0,
        2 => x % 3 == 0,
        3 => (y + x) % 3 == 0,
        4 => (y / 2 + x / 3) % 2 == 0,
        5 => (y * x) % 2 + (y * x) % 3 == 0,
        6 => ((y * x) % 2 + (y * x) % 3) % 2 == 0,
        _ => ((y + x) % 2 + (y * x) % 3) % 2 == 0
    };

    private static int Exp(int e) { var v = 1; for (var i = 0; i < e; i++) { v <<= 1; if (v > 255) v ^= 0x11D; } return v; }
    private static int Mul(int a, int b) { var r = 0; while (b > 0) { if ((b & 1) != 0) r ^= a; a <<= 1; if (a > 255) a ^= 0x11D; b >>= 1; } return r; }

    internal static string Decode(QrCode q)
    {
        var size = q.Size;
        var version = (size - 17) / 4;
        Assert.Equal(17 + 4 * version, size);
        // Finder patterns (7x7 rings) with light separators.
        foreach (var (ox, oy) in new[] { (0, 0), (size - 7, 0), (0, size - 7) })
            for (var dy = -1; dy <= 7; dy++)
                for (var dx = -1; dx <= 7; dx++)
                {
                    int x = ox + dx, y = oy + dy;
                    if (x < 0 || y < 0 || x >= size || y >= size) continue;
                    var ring = Math.Max(Math.Abs(dx - 3), Math.Abs(dy - 3));
                    Assert.Equal(ring is 0 or 1 or 3, q[x, y]);
                }
        for (var i = 8; i < size - 8; i++) { Assert.Equal(i % 2 == 0, q[i, 6]); Assert.Equal(i % 2 == 0, q[6, i]); }
        Assert.True(q[8, size - 8]);
        // Format words: both copies must equal a published level-M entry.
        int first = 0, second = 0;
        var fa = new List<(int, int)>();
        for (var i = 0; i <= 5; i++) fa.Add((8, i));
        fa.AddRange([(8, 7), (8, 8), (7, 8)]);
        for (var i = 9; i < 15; i++) fa.Add((14 - i, 8));
        for (var i = 0; i < 15; i++) if (q[fa[i].Item1, fa[i].Item2]) first |= 1 << i;
        for (var i = 0; i < 8; i++) if (q[size - 1 - i, 8]) second |= 1 << i;
        for (var i = 8; i < 15; i++) if (q[8, size - 15 + i]) second |= 1 << i;
        Assert.Equal(first, second);
        var mask = Array.IndexOf(FormatM, first);
        Assert.InRange(mask, 0, 7);
        if (version >= 7)
        {
            int v1 = 0, v2 = 0;
            for (var i = 0; i < 18; i++)
            {
                if (q[size - 11 + i % 3, i / 3]) v1 |= 1 << i;
                if (q[i / 3, size - 11 + i % 3]) v2 |= 1 << i;
            }
            Assert.Equal(VersionInfo[version], v1);
            Assert.Equal(VersionInfo[version], v2);
        }
        // Zigzag read of data modules.
        var function = FunctionMap(version, size);
        var bits = new List<bool>();
        var upward = true;
        for (var right = size - 1; right > 0; right -= 2)
        {
            if (right == 6) right--;
            for (var k = 0; k < size; k++)
            {
                var y = upward ? size - 1 - k : k;
                for (var c = 0; c < 2; c++)
                {
                    var x = right - c;
                    if (!function[y, x]) bits.Add(q[x, y] ^ MaskBit(mask, x, y));
                }
            }
            upward = !upward;
        }
        Assert.Equal(TotalCodewords[version], bits.Count / 8);
        Assert.InRange(bits.Count % 8, 0, 7);
        var stream = new int[TotalCodewords[version]];
        for (var i = 0; i < stream.Length * 8; i++) if (bits[i]) stream[i >> 3] |= 1 << (7 - (i & 7));
        // De-interleave: data codewords column-wise, then EC codewords column-wise.
        var layout = Blocks[version].SelectMany(g => Enumerable.Repeat((g.Total, g.Data), g.Count)).ToArray();
        var blocks = layout.Select(l => new int[l.Total]).ToArray();
        var n = 0;
        for (var i = 0; i < layout.Max(l => l.Data); i++)
            for (var b = 0; b < layout.Length; b++) if (i < layout[b].Data) blocks[b][i] = stream[n++];
        var ecc = layout[0].Total - layout[0].Data;
        for (var i = 0; i < ecc; i++)
            for (var b = 0; b < layout.Length; b++) blocks[b][layout[b].Data + i] = stream[n++];
        Assert.Equal(stream.Length, n);
        foreach (var block in blocks)
            for (var s = 0; s < ecc; s++)
            {
                var syndrome = 0;
                var alpha = Exp(s);
                foreach (var c in block) syndrome = Mul(syndrome, alpha) ^ c;
                Assert.Equal(0, syndrome);
            }
        var data = blocks.Zip(layout).SelectMany(p => p.First.Take(p.Second.Data)).ToArray();
        var pos = 0;
        int Read(int count) { var v = 0; for (var i = 0; i < count; i++, pos++) v = v << 1 | ((data[pos >> 3] >> (7 - (pos & 7))) & 1); return v; }
        Assert.Equal(0b0100, Read(4));
        var length = Read(version <= 9 ? 8 : 16);
        var text = new byte[length];
        for (var i = 0; i < length; i++) text[i] = (byte)Read(8);
        var remaining = data.Length * 8 - pos;
        if (remaining > 0) Assert.Equal(0, Read(Math.Min(4, remaining)));
        while (pos % 8 != 0) Assert.Equal(0, Read(1));
        for (var pad = 0xEC; pos < data.Length * 8; pad ^= 0xEC ^ 0x11) Assert.Equal(pad, Read(8));
        return Encoding.ASCII.GetString(text);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(14, 1)]
    [InlineData(15, 2)]
    [InlineData(26, 2)]
    [InlineData(42, 3)]
    [InlineData(62, 4)]
    [InlineData(84, 5)]
    [InlineData(106, 6)]
    [InlineData(122, 7)]
    [InlineData(152, 8)]
    [InlineData(180, 9)]
    [InlineData(181, 10)]
    [InlineData(213, 10)]
    public void Encodes_published_byte_capacity_boundaries_and_reads_back_exactly(int length, int version)
    {
        var random = new Random(length);
        var text = new string(Enumerable.Range(0, length).Select(_ => (char)random.Next(0x21, 0x7F)).ToArray());
        var code = QrCode.EncodeText(text);
        Assert.Equal(version, code.Version);
        Assert.Equal(text, Decode(code));
    }

    [Fact]
    public void Typical_permanent_alias_urls_round_trip_through_every_mask_choice()
    {
        var masks = new HashSet<int>();
        for (var i = 0; i < 64; i++)
        {
            var url = "https://menu.example.test/m/" + Convert.ToHexStringLower(System.Security.Cryptography.RandomNumberGenerator.GetBytes(10));
            var code = QrCode.EncodeText(url);
            masks.Add(code.Mask);
            Assert.Equal(url, Decode(code));
        }
        Assert.True(masks.Count > 1, "Mask selection should vary with content.");
    }

    [Theory]
    [InlineData("")]
    [InlineData("has space")]
    [InlineData("مرحبا")]
    [InlineData("line\nbreak")]
    public void Rejects_empty_non_ascii_or_non_printable_input(string text) =>
        Assert.Throws<ArgumentException>(() => QrCode.EncodeText(text));

    [Fact]
    public void Rejects_text_beyond_version_10_m_and_never_echoes_input_into_svg()
    {
        Assert.Throws<ArgumentException>(() => QrCode.EncodeText(new string('a', 214)));
        // Printable ASCII is encoded only as module data; the SVG never contains caller text or markup.
        var svg = QrCode.EncodeText("<script>alert(1)</script>").ToSvg();
        Assert.DoesNotContain("script", svg);
        Assert.DoesNotContain("alert", svg);
    }

    [Fact]
    public void Svg_and_png_renderings_match_the_module_matrix_with_quiet_zone()
    {
        var code = QrCode.EncodeText("https://menu.example.test/m/0123456789abcdef0123");
        var side = code.Size + 2 * QrCode.QuietZone;
        var svg = code.ToSvg();
        Assert.StartsWith("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + side + " " + side + "\"", svg);
        var dark = 0;
        for (var y = 0; y < code.Size; y++) for (var x = 0; x < code.Size; x++) if (code[x, y]) dark++;
        Assert.Equal(dark, svg.Split("h1v1h-1z").Length - 1);
        Assert.Contains($"M{QrCode.QuietZone},{QrCode.QuietZone}h1v1h-1z", svg); // Finder corner.
        var png = code.ToPng(4);
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, png[..8]);
        using var bitmap = SkiaSharp.SKBitmap.Decode(png);
        Assert.Equal(side * 4, bitmap.Width);
        Assert.Equal(side * 4, bitmap.Height);
        for (var y = -QrCode.QuietZone; y < code.Size + QrCode.QuietZone; y++)
            for (var x = -QrCode.QuietZone; x < code.Size + QrCode.QuietZone; x++)
            {
                var expected = x >= 0 && y >= 0 && x < code.Size && y < code.Size && code[x, y];
                var pixel = bitmap.GetPixel((x + QrCode.QuietZone) * 4 + 2, (y + QrCode.QuietZone) * 4 + 2);
                Assert.Equal(expected ? (byte)0 : (byte)255, pixel.Red);
            }
    }
}
