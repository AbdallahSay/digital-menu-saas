using SkiaSharp;
using System.Buffers.Binary;

namespace DigitalMenu.Api.Media;

public sealed class MediaException(int status) : Exception("Media operation rejected.")
{
    public int Status { get; } = status;
}
public sealed record NormalizedImage(byte[] Main, byte[] Thumbnail, int Width, int Height);
public sealed class ImageNormalizer
{
    public const int MaxBytes = 5 * 1024 * 1024;
    private readonly SemaphoreSlim decoders = new(2);
    public NormalizedImage Normalize(byte[] bytes, string mime)
    {
        if (bytes.Length == 0) throw new MediaException(400);
        if (bytes.Length > MaxBytes) throw new MediaException(413);
        var format = mime switch
        {
            "image/jpeg" when bytes.AsSpan().StartsWith(new byte[] { 255, 216, 255 }) => SKEncodedImageFormat.Jpeg,
            "image/png" when bytes.AsSpan().StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) => SKEncodedImageFormat.Png,
            "image/webp" when bytes.Length >= 12 && bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) && bytes.AsSpan(8, 4).SequenceEqual("WEBP"u8) => SKEncodedImageFormat.Webp,
            _ => throw new MediaException(415)
        };
        if (!decoders.Wait(0)) throw new MediaException(429);
        try
        {
            ValidateContainer(bytes, format);
            using var data = SKData.CreateCopy(bytes);
            using var codec = SKCodec.Create(data);
            if (codec is null || codec.EncodedFormat != format) throw new MediaException(400);
            var width = codec.Info.Width;
            var height = codec.Info.Height;
            if (width < 1 || height < 1 || width > 6000 || height > 6000 || (long)width * height > 12_000_000 || codec.FrameCount > 1)
                throw new MediaException(400);
            using var bitmap = new SKBitmap(new SKImageInfo(width, height, SKColorType.Bgra8888, SKAlphaType.Premul));
            if (codec.GetPixels(bitmap.Info, bitmap.GetPixels()) != SKCodecResult.Success) throw new MediaException(400);
            var swapped = codec.EncodedOrigin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
            using var oriented = new SKBitmap(swapped ? height : width, swapped ? width : height);
            using (var canvas = new SKCanvas(oriented))
            {
                switch (codec.EncodedOrigin)
                {
                    case SKEncodedOrigin.TopRight: canvas.Translate(width, 0); canvas.Scale(-1, 1); break;
                    case SKEncodedOrigin.BottomRight: canvas.Translate(width, height); canvas.RotateDegrees(180); break;
                    case SKEncodedOrigin.BottomLeft: canvas.Translate(0, height); canvas.Scale(1, -1); break;
                    case SKEncodedOrigin.LeftTop: canvas.RotateDegrees(90); canvas.Scale(1, -1); break;
                    case SKEncodedOrigin.RightTop: canvas.Translate(height, 0); canvas.RotateDegrees(90); break;
                    case SKEncodedOrigin.RightBottom: canvas.Translate(height, width); canvas.RotateDegrees(90); canvas.Scale(-1, 1); break;
                    case SKEncodedOrigin.LeftBottom: canvas.Translate(0, width); canvas.RotateDegrees(270); break;
                }
                canvas.DrawBitmap(bitmap, 0, 0, new SKSamplingOptions(SKFilterMode.Linear));
            }
            var main = Encode(oriented, 1600);
            var thumbnail = Encode(oriented, 480);
            return new(main.Bytes, thumbnail.Bytes, main.Width, main.Height);
        }
        finally { decoders.Release(); }
    }
    private static readonly uint[] CrcTable = Enumerable.Range(0, 256).Select(value =>
    {
        var crc = (uint)value;
        for (var bit = 0; bit < 8; bit++) crc = (crc >> 1) ^ ((crc & 1) != 0 ? 0xedb88320u : 0);
        return crc;
    }).ToArray();
    private static void ValidateContainer(byte[] bytes, SKEncodedImageFormat format)
    {
        if (format == SKEncodedImageFormat.Jpeg)
        {
            if (!bytes.AsSpan().EndsWith(new byte[] { 255, 217 })) throw new MediaException(400);
        }
        else if (format == SKEncodedImageFormat.Webp)
        {
            if ((long)BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(4, 4)) + 8 != bytes.Length) throw new MediaException(400);
        }
        else
        {
            var offset = 8;
            while (offset <= bytes.Length - 12)
            {
                var length = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
                if (length > bytes.Length - offset - 12) throw new MediaException(400);
                var size = (int)length;
                var type = bytes.AsSpan(offset + 4, 4);
                if (type.SequenceEqual("acTL"u8)) throw new MediaException(400); // Static raster images only.
                uint crc = uint.MaxValue;
                foreach (var b in bytes.AsSpan(offset + 4, size + 4)) crc = CrcTable[(crc ^ b) & 255] ^ (crc >> 8);
                if (~crc != BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset + size + 8, 4))) throw new MediaException(400);
                offset += size + 12;
                if (type.SequenceEqual("IEND"u8))
                {
                    if (size != 0 || offset != bytes.Length) throw new MediaException(400);
                    return;
                }
            }
            throw new MediaException(400);
        }
    }
    private static (byte[] Bytes, int Width, int Height) Encode(SKBitmap source, int maxSide)
    {
        var scale = Math.Min(1d, (double)maxSide / Math.Max(source.Width, source.Height));
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
        using var target = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(target))
            canvas.DrawBitmap(source, new SKRect(0, 0, width, height), new SKSamplingOptions(SKFilterMode.Linear));
        using var image = SKImage.FromBitmap(target);
        using var encoded = image.Encode(SKEncodedImageFormat.Webp, 80);
        if (encoded is null) throw new MediaException(400);
        return (encoded.ToArray(), width, height);
    }
}
