using Microsoft.AspNetCore.Diagnostics;

namespace DigitalMenu.Api.Media;

public sealed class MediaProblemHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        if (exception is not MediaException media) return false;
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        context.Response.Headers["X-Frame-Options"] = "DENY";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
        var title = media.Status switch
        {
            413 => "Image request too large.",
            415 => "Unsupported image format.",
            429 => "Image processing busy. Retry later.",
            503 => "Media storage unavailable.",
            _ => "Invalid image request."
        };
        await Results.Problem(statusCode: media.Status, title: title).ExecuteAsync(context);
        return true;
    }
}
