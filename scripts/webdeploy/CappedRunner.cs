using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

public sealed class RunResult {
    public string Status;      // OK, NONZERO, TIMEOUT, CAP_EXCEEDED, START_ERROR
    public int ExitCode;
    public long StdoutBytes, StderrBytes, Lines;
    public double Seconds;
}

public static class CappedRunner {
    // Runs a process with UseShellExecute=false and raw byte capture of stdout+stderr into one private file.
    // Total cap and deadline are enforced; on breach the process tree is killed. No output content is ever returned.
    public static RunResult Run(string exe, string[] args, string rawPath, long capBytes, int timeoutMs) {
        var r = new RunResult { Status = "START_ERROR", ExitCode = -1 };
        var sw = Stopwatch.StartNew();
        Process p = null;
        FileStream fs = null;
        try {
            var psi = new ProcessStartInfo(exe) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
            foreach (var a in args) psi.ArgumentList.Add(a);
            fs = new FileStream(rawPath, FileMode.Create, FileAccess.Write, FileShare.None);
            p = new Process { StartInfo = psi };
            var gate = new object();
            long total = 0, outB = 0, errB = 0, lines = 0; bool capHit = false;
            Action<Stream, bool> pump = (s, isOut) => {
                var buf = new byte[8192]; int n;
                try {
                    while ((n = s.Read(buf, 0, buf.Length)) > 0) {
                        lock (gate) {
                            if (capHit) continue; // drain without storing
                            long room = capBytes - total;
                            int take = (int)Math.Min((long)n, Math.Max(0L, room));
                            if (take > 0) {
                                fs.Write(buf, 0, take); total += take;
                                if (isOut) outB += take; else errB += take;
                                for (int i = 0; i < take; i++) if (buf[i] == (byte)'\n') lines++;
                            }
                            if (take < n) { capHit = true; try { p.Kill(true); } catch { } }
                        }
                    }
                } catch { }
            };
            p.Start();
            var t1 = Task.Run(() => pump(p.StandardOutput.BaseStream, true));
            var t2 = Task.Run(() => pump(p.StandardError.BaseStream, false));
            bool exited = p.WaitForExit(timeoutMs);
            if (!exited) { try { p.Kill(true); } catch { } p.WaitForExit(5000); }
            Task.WaitAll(new[] { t1, t2 }, 10000);
            lock (gate) { fs.Flush(); r.StdoutBytes = outB; r.StderrBytes = errB; r.Lines = lines; }
            r.ExitCode = p.HasExited ? p.ExitCode : -1;
            r.Status = capHit ? "CAP_EXCEEDED" : (!exited ? "TIMEOUT" : (r.ExitCode == 0 ? "OK" : "NONZERO"));
        } catch (Exception) { r.Status = "START_ERROR"; }
        finally {
            if (fs != null) fs.Dispose();
            if (p != null) p.Dispose();
            r.Seconds = Math.Round(sw.Elapsed.TotalSeconds, 1);
        }
        return r;
    }
}
