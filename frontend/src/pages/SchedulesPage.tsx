import { useEffect, useState } from "react";
import { api } from "../api";

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [seed, setSeed] = useState("");
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);

  const load = () => { api.schedules.list().then(setSchedules); };
  useEffect(load, []);

  const create = async () => {
    if (!seed.trim()) return;
    setBusy(true);
    try {
      await api.schedules.create({ seeds: [seed.trim()], every_hours: hours });
      setSeed("");
      load();
    } finally { setBusy(false); }
  };

  const toggle = async (s: any) => { await api.schedules.update(s.id, { enabled: !s.enabled }); load(); };
  const remove = async (id: number) => { if (confirm("Delete this schedule?")) { await api.schedules.delete(id); load(); } };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Schedules</div>
          <div className="page-sub">Recurring crawls that run automatically in the background</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="form-grid">
          <div className="field">
            <label>Seed URL</label>
            <input className="input" placeholder="https://example.com" value={seed} onChange={(e) => setSeed(e.target.value)} />
          </div>
          <div className="field">
            <label>Repeat every (hours)</label>
            <input className="input" type="number" value={hours} onChange={(e) => setHours(+e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={create} disabled={busy}>Add schedule</button>
      </div>

      {schedules.length === 0 ? (
        <div className="card empty"><div className="empty-title">No schedules yet</div></div>
      ) : (
        <div className="card">
          <table>
            <thead><tr><th>Seed</th><th>Frequency</th><th>Next run</th><th>Enabled</th><th></th></tr></thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.seeds?.[0]}</td>
                  <td>every {s.every_hours}h</td>
                  <td className="muted">{s.next_run_at ? new Date(s.next_run_at + "Z").toLocaleString() : "—"}</td>
                  <td>
                    <label className="switch"><input type="checkbox" checked={s.enabled} onChange={() => toggle(s)} /><span className="track" /><span className="thumb-dot" /></label>
                  </td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
