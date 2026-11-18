using System.Text;
using SkiaSharp;

namespace DigitalMenu.Api.Owner;

/// <summary>
/// Minimal ISO/IEC 18004 QR encoder: byte mode, error correction level M, versions 1-10.
/// Scope is deliberately narrow (platform-generated ASCII URLs only), so no third-party
/// encoder or its transitive System.Drawing dependency is needed. Input is never HTML.
/// </summary>
public sealed class QrCode
{
    public const int MaxVersion = 10;
    public const int QuietZone = 4;
    // Level M per version 1..10: EC codewords per block and number of blocks (ISO/IEC 18004 table 9).
    private static readonly int[] EccPerBlock = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
    private static readonly int[] BlockCount = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

    private readonly bool[,] modules;
    private readonly bool[,] function;
    public int Version { get; }
    public int Size { get; }
    public int Mask { get; private set; }
    public bool this[int x, int y] => modules[y, x];

    private QrCode(int version, byte[] codewords)
    {
        Version = version;
        Size = version * 4 + 17;
        modules = new bool[Size, Size];
        function = new bool[Size, Size];
        DrawFunctionPatterns();
        DrawCodewords(AddEccAndInterleave(codewords));
        var best = 0;
        var bestPenalty = int.MaxValue;
        for (var mask = 0; mask < 8; mask++)
        {
            ApplyMask(mask);
            DrawFormatBits(mask);
            var penalty = Penalty();
            if (penalty < bestPenalty) { best = mask; bestPenalty = penalty; }
            ApplyMask(mask); // XOR again to undo.
        }
        Mask = best;
        ApplyMask(best);
        DrawFormatBits(best);
    }

    /// <summary>Encodes printable ASCII text; throws <see cref="ArgumentException"/> when it cannot fit version 10-M.</summary>
    public static QrCode EncodeText(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        if (text.Length == 0 || text.Any(c => c < 0x21 || c > 0x7E))
            throw new ArgumentException("Only non-empty printable ASCII is supported.", nameof(text));
        var data = Encoding.ASCII.GetBytes(text);
        for (var version = 1; version <= MaxVersion; version++)
        {
            var capacityBits = DataCodewords(version) * 8;
            var countBits = version <= 9 ? 8 : 16;
            var needed = 4 + countBits + data.Length * 8;
            if (needed > capacityBits) continue;
            var bits = new List<bool>(capacityBits);
            Append(bits, 0b0100, 4); // Byte mode.
            Append(bits, data.Length, countBits);
            foreach (var b in data) Append(bits, b, 8);
            Append(bits, 0, Math.Min(4, capacityBits - bits.Count));
            Append(bits, 0, (8 - bits.Count % 8) % 8);
            for (var pad = 0xEC; bits.Count < capacityBits; pad ^= 0xEC ^ 0x11) Append(bits, pad, 8);
            var codewords = new byte[bits.Count / 8];
            for (var i = 0; i < bits.Count; i++)
                if (bits[i]) codewords[i >> 3] |= (byte)(1 << (7 - (i & 7)));
            return new QrCode(version, codewords);
        }
        throw new ArgumentException("Text is too long for the supported QR versions.", nameof(text));
    }

    private static void Append(List<bool> bits, int value, int length)
    {
        for (var i = length - 1; i >= 0; i--) bits.Add(((value >> i) & 1) != 0);
    }

    private static int RawDataModules(int version)
    {
        var result = (16 * version + 128) * version + 64;
        if (version >= 2)
        {
            var align = version / 7 + 2;
            result -= (25 * align - 10) * align - 55;
            if (version >= 7) result -= 36;
        }
        return result;
    }
    internal static int DataCodewords(int version) => RawDataModules(version) / 8 - EccPerBlock[version] * BlockCount[version];

    private byte[] AddEccAndInterleave(byte[] data)
    {
        var blocks = BlockCount[Version];
        var ecc = EccPerBlock[Version];
        var raw = RawDataModules(Version) / 8;
        var shortBlocks = blocks - raw % blocks;
        var shortLength = raw / blocks;
        var divisor = ReedSolomonDivisor(ecc);
        var all = new List<byte[]>(blocks);
        for (int i = 0, k = 0; i < blocks; i++)
        {
            var length = shortLength - ecc + (i < shortBlocks ? 0 : 1);
            var block = data.AsSpan(k, length).ToArray();
            k += length;
            var remainder = ReedSolomonRemainder(block, divisor);
            var padded = new byte[shortLength + 1];
            // Short blocks carry one unused slot so every block has the same layout before interleaving.
            block.CopyTo(padded, 0);
            remainder.CopyTo(padded, shortLength + 1 - ecc);
            all.Add(padded);
        }
        var result = new byte[raw];
        var n = 0;
        for (var i = 0; i < shortLength + 1; i++)
            for (var j = 0; j < blocks; j++)
                if (i != shortLength - ecc || j >= shortBlocks) result[n++] = all[j][i];
        return result;
    }

    private static byte[] ReedSolomonDivisor(int degree)
    {
        var result = new byte[degree];
        result[degree - 1] = 1;
        byte root = 1;
        for (var i = 0; i < degree; i++)
        {
            for (var j = 0; j < degree; j++)
            {
                result[j] = Multiply(result[j], root);
                if (j + 1 < degree) result[j] ^= result[j + 1];
            }
            root = Multiply(root, 0x02);
        }
        return result;
    }
    private static byte[] ReedSolomonRemainder(byte[] data, byte[] divisor)
    {
        var result = new byte[divisor.Length];
        foreach (var b in data)
        {
            var factor = (byte)(b ^ result[0]);
            Array.Copy(result, 1, result, 0, result.Length - 1);
            result[^1] = 0;
            for (var i = 0; i < result.Length; i++) result[i] ^= Multiply(divisor[i], factor);
        }
        return result;
    }
    private static byte Multiply(byte x, byte y)
    {
        var z = 0;
        for (var i = 7; i >= 0; i--)
        {
            z = (z << 1) ^ ((z >> 7) * 0x11D);
            z ^= ((y >> i) & 1) * x;
        }
        return (byte)z;
    }

    private void Set(int x, int y, bool dark)
    {
        modules[y, x] = dark;
        function[y, x] = true;
    }

    private void DrawFunctionPatterns()
    {
        for (var i = 0; i < Size; i++)
        {
            Set(6, i, i % 2 == 0);
            Set(i, 6, i % 2 == 0);
        }
        DrawFinder(3, 3);
        DrawFinder(Size - 4, 3);
        DrawFinder(3, Size - 4);
        var positions = AlignmentPositions();
        for (var i = 0; i < positions.Length; i++)
            for (var j = 0; j < positions.Length; j++)
                if (!((i == 0 && j == 0) || (i == 0 && j == positions.Length - 1) || (i == positions.Length - 1 && j == 0)))
                    for (var dy = -2; dy <= 2; dy++)
                        for (var dx = -2; dx <= 2; dx++)
                            Set(positions[i] + dx, positions[j] + dy, Math.Max(Math.Abs(dx), Math.Abs(dy)) != 1);
        DrawFormatBits(0); // Reserve the area; real bits are drawn after masking.
        if (Version >= 7)
        {
            var remainder = Version;
            for (var i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >> 11) * 0x1F25);
            var bits = Version << 12 | remainder;
            for (var i = 0; i < 18; i++)
            {
                var dark = ((bits >> i) & 1) != 0;
                int a = Size - 11 + i % 3, b = i / 3;
                Set(a, b, dark);
                Set(b, a, dark);
            }
        }
    }
    private void DrawFinder(int x, int y)
    {
        for (var dy = -4; dy <= 4; dy++)
            for (var dx = -4; dx <= 4; dx++)
            {
                int xx = x + dx, yy = y + dy;
                var distance = Math.Max(Math.Abs(dx), Math.Abs(dy));
                if (xx >= 0 && xx < Size && yy >= 0 && yy < Size) Set(xx, yy, distance != 2 && distance != 4);
            }
    }
    internal int[] AlignmentPositions()
    {
        if (Version == 1) return [];
        var count = Version / 7 + 2;
        var step = (Version * 8 + count * 3 + 5) / (count * 4 - 4) * 2;
        var result = new int[count];
        result[0] = 6;
        for (int i = count - 1, pos = Size - 7; i >= 1; i--, pos -= step) result[i] = pos;
        return result;
    }

    private void DrawFormatBits(int mask)
    {
        var data = 0b00 << 3 | mask; // Level M format indicator is 00.
        var remainder = data;
        for (var i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >> 9) * 0x537);
        var bits = (data << 10 | remainder) ^ 0x5412;
        bool Bit(int i) => ((bits >> i) & 1) != 0;
        for (var i = 0; i <= 5; i++) Set(8, i, Bit(i));
        Set(8, 7, Bit(6));
        Set(8, 8, Bit(7));
        Set(7, 8, Bit(8));
        for (var i = 9; i < 15; i++) Set(14 - i, 8, Bit(i));
        for (var i = 0; i < 8; i++) Set(Size - 1 - i, 8, Bit(i));
        for (var i = 8; i < 15; i++) Set(8, Size - 15 + i, Bit(i));
        Set(8, Size - 8, true); // Always-dark module.
    }

    private void DrawCodewords(byte[] data)
    {
        var i = 0;
        for (var right = Size - 1; right >= 1; right -= 2)
        {
            if (right == 6) right = 5; // Skip the vertical timing column.
            for (var vertical = 0; vertical < Size; vertical++)
                for (var j = 0; j < 2; j++)
                {
                    var x = right - j;
                    var upward = ((right + 1) & 2) == 0;
                    var y = upward ? Size - 1 - vertical : vertical;
                    if (!function[y, x] && i < data.Length * 8)
                    {
                        modules[y, x] = ((data[i >> 3] >> (7 - (i & 7))) & 1) != 0;
                        i++;
                    }
                }
        }
    }

    private void ApplyMask(int mask)
    {
        for (var y = 0; y < Size; y++)
            for (var x = 0; x < Size; x++)
            {
                var invert = mask switch
                {
                    0 => (x + y) % 2 == 0,
                    1 => y % 2 == 0,
                    2 => x % 3 == 0,
                    3 => (x + y) % 3 == 0,
                    4 => (x / 3 + y / 2) % 2 == 0,
                    5 => x * y % 2 + x * y % 3 == 0,
                    6 => (x * y % 2 + x * y % 3) % 2 == 0,
                    _ => ((x + y) % 2 + x * y % 3) % 2 == 0
                };
                if (invert && !function[y, x]) modules[y, x] = !modules[y, x];
            }
    }

    private int Penalty()
    {
        var result = 0;
        for (var pass = 0; pass < 2; pass++)
            for (var a = 0; a < Size; a++)
            {
                var run = 1;
                for (var b = 1; b < Size; b++)
                {
                    bool current = pass == 0 ? modules[a, b] : modules[b, a], previous = pass == 0 ? modules[a, b - 1] : modules[b - 1, a];
                    if (current == previous) { run++; if (run == 5) result += 3; else if (run > 5) result++; }
                    else run = 1;
                }
                for (var b = 0; b + 10 < Size; b++)
                {
                    bool M(int k) => pass == 0 ? modules[a, b + k] : modules[b + k, a];
                    var core = M(0) && !M(1) && M(2) && M(3) && M(4) && !M(5) && M(6);
                    // Finder-like 1:1:3:1:1 with four light modules on either side.
                    if ((core && !M(7) && !M(8) && !M(9) && !M(10)) ||
                        (!M(0) && !M(1) && !M(2) && !M(3) && M(4) && !M(5) && M(6) && M(7) && M(8) && !M(9) && M(10)))
                        result += 40;
                }
            }
        var dark = 0;
        for (var y = 0; y < Size; y++)
            for (var x = 0; x < Size; x++)
            {
                if (modules[y, x]) dark++;
                if (x + 1 < Size && y + 1 < Size && modules[y, x] == modules[y, x + 1] &&
                    modules[y, x] == modules[y + 1, x] && modules[y, x] == modules[y + 1, x + 1]) result += 3;
            }
        var total = Size * Size;
        result += ((Math.Abs(dark * 20 - total * 10) + total - 1) / total - 1) * 10;
        return result;
    }

    /// <summary>Black-on-white SVG with a 4-module quiet zone; contains no caller text.</summary>
    public string ToSvg()
    {
        var side = Size + QuietZone * 2;
        var path = new StringBuilder();
        for (var y = 0; y < Size; y++)
            for (var x = 0; x < Size; x++)
                if (modules[y, x]) path.Append('M').Append(x + QuietZone).Append(',').Append(y + QuietZone).Append("h1v1h-1z");
        return $"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {side} {side}\" width=\"{side * 8}\" height=\"{side * 8}\" shape-rendering=\"crispEdges\">" +
            $"<rect width=\"{side}\" height=\"{side}\" fill=\"#fff\"/><path fill=\"#000\" d=\"{path}\"/></svg>";
    }

    /// <summary>Lossless grayscale PNG, <paramref name="scale"/> pixels per module, with a 4-module quiet zone.</summary>
    public byte[] ToPng(int scale)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(scale, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(scale, 32);
        var side = (Size + QuietZone * 2) * scale;
        using var bitmap = new SKBitmap(new SKImageInfo(side, side, SKColorType.Gray8, SKAlphaType.Opaque));
        var stride = bitmap.RowBytes;
        var pixels = new byte[stride * side];
        for (var py = 0; py < side; py++)
        {
            var y = py / scale - QuietZone;
            for (var px = 0; px < side; px++)
            {
                var x = px / scale - QuietZone;
                var dark = x >= 0 && y >= 0 && x < Size && y < Size && modules[y, x];
                pixels[py * stride + px] = dark ? (byte)0 : (byte)255;
            }
        }
        System.Runtime.InteropServices.Marshal.Copy(pixels, 0, bitmap.GetPixels(), pixels.Length);
        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(SKEncodedImageFormat.Png, 100)
            ?? throw new InvalidOperationException("PNG encoding failed.");
        return encoded.ToArray();
    }
}
