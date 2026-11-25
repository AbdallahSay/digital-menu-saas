using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

public sealed class RunResult {
    // OK, NONZERO, TIMEOUT, CAP_EXCEEDED, CAPTURE_ERROR, DRAIN_TIMEOUT, RUNNER_ERROR, START_ERROR
    public string Status;
    public int ExitCode;
    public long StdoutBytes, StderrBytes, Lines;
    public double Seconds;
    public bool ChildReaped;
}

public static class CappedRunner {
    // Runs a process (UseShellExecute=false), captures raw bytes of stdout+stderr into one private file.
    // Enforces a total byte cap and a deadline, kills the process tree on breach, and NEVER returns OK unless the child
    // exited 0 within the deadline, both pumps finished cleanly, and nothing exceeded the cap. Returns counts and a status only.
    public static RunResult Run(string exe, string[] args, string rawPath, long capBytes, int timeoutMs) {
        var r = new RunResult { Status = "START_ERROR", ExitCode = -1 };
        var sw = Stopwatch.StartNew();
        Process p = null; FileStream fs = null; bool started = false;
        try {
            var psi = new ProcessStartInfo(exe) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
            foreach (var a in args) psi.ArgumentList.Add(a);
            fs = new FileStream(rawPath, FileMode.Create, FileAccess.Write, FileShare.None);
            p = new Process { StartInfo = psi };
            var gate = new object();
            long total = 0, outB = 0, errB = 0, lines = 0; bool capHit = false, capErr = false;
            Action<Stream, bool> pump = (s, isOut) => {
                var buf = new byte[8192]; int n;
                try {
                    while ((n = s.Read(buf, 0, buf.Length)) > 0) {
                        lock (gate) {
                            if (capHit || capErr) continue; // keep draining so the child never blocks, store nothing
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
                } catch (Exception) { lock (gate) { capErr = true; } try { p.Kill(true); } catch { } }
            };
            p.Start(); started = true;
            var t1 = Task.Run(() => pump(p.StandardOutput.BaseStream, true));
            var t2 = Task.Run(() => pump(p.StandardError.BaseStream, false));
            bool exited = p.WaitForExit(timeoutMs);
            if (!exited) { try { p.Kill(true); } catch { } p.WaitForExit(5000); }
            bool drained = Task.WaitAll(new[] { t1, t2 }, 10000);
            bool drainTimedOut = !drained;
            if (!drained) {
                // a grandchild may still hold the pipes: kill the tree again, close our ends, then wait for the pumps to finish
                try { p.Kill(true); } catch { }
                try { p.StandardOutput.Dispose(); } catch { }
                try { p.StandardError.Dispose(); } catch { }
                drained = Task.WaitAll(new[] { t1, t2 }, 5000);
            }
            lock (gate) { try { fs.Flush(); } catch (Exception) { capErr = true; } r.StdoutBytes = outB; r.StderrBytes = errB; r.Lines = lines; }
            r.ExitCode = p.HasExited ? p.ExitCode : -1;
            if (capErr) r.Status = "CAPTURE_ERROR";
            else if (capHit) r.Status = "CAP_EXCEEDED";
            else if (!exited) r.Status = "TIMEOUT";
            else if (drainTimedOut || !drained) r.Status = "DRAIN_TIMEOUT";
            else r.Status = (r.ExitCode == 0 ? "OK" : "NONZERO");
        } catch (Exception) {
            r.Status = started ? "RUNNER_ERROR" : "START_ERROR";
        } finally {
            if (p != null && started) {
                try { if (!p.HasExited) { p.Kill(true); p.WaitForExit(5000); } } catch { }
                try { r.ChildReaped = p.HasExited; } catch { r.ChildReaped = false; }
            } else { r.ChildReaped = true; }
            if (fs != null) { try { fs.Dispose(); } catch { } }
            if (p != null) { try { p.Dispose(); } catch { } }
            r.Seconds = Math.Round(sw.Elapsed.TotalSeconds, 1);
        }
        return r;
    }
}
