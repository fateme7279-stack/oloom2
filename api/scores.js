// Vercel Serverless Function: واسطه بین بازی علوم و Firebase
// مرورگر فقط با همین سایت حرف می‌زند؛ ارتباط با Firebase از سمت سرور Vercel انجام می‌شود.
const DB = "https://loom2-1db58-default-rtdb.firebaseio.com";
const PUBLIC_NODE = "waScores";   // نام و امتیاز (برای جدول برترین‌ها)
const PRIVATE_NODE = "waPlayers"; // نام، پایه، مدرسه و امتیاز (خصوصی)
const MAX_SCORE = 1000000;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      let r = await fetch(`${DB}/${PUBLIC_NODE}.json?orderBy=${encodeURIComponent('"score"')}&limitToLast=10`);
      if (!r.ok) r = await fetch(`${DB}/${PUBLIC_NODE}.json`);
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 200);
        return res.status(502).json({ error: "firebase_read_failed", status: r.status, detail });
      }
      const data = (await r.json()) || {};
      const rows = Object.entries(data)
        .map(([key, v]) => ({ key, name: String((v && v.name) || ""), score: Number(v && v.score) }))
        .filter(x => Number.isFinite(x.score))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body);
      body = body || {};
      const name = String(body.name || "").trim().slice(0, 20) || "قهرمان";
      const grade = String(body.grade || "").trim();
      const school = String(body.school || "").trim().slice(0, 40);
      const score = Number(body.score);
      const GRADES = ["اول", "دوم", "سوم", "چهارم", "پنجم", "ششم"];
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
        return res.status(400).json({ error: "invalid_score" });
      }
      if (!GRADES.includes(grade) || !school) {
        return res.status(400).json({ error: "invalid_grade_or_school" });
      }
      const post = (node, data) => fetch(`${DB}/${node}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const createdAt = { ".sv": "timestamp" };

      const rp = await post(PRIVATE_NODE, { name, grade, school, score, createdAt });
      if (!rp.ok) return res.status(502).json({ error: "firebase_write_failed", where: PRIVATE_NODE, status: rp.status });

      const rs = await post(PUBLIC_NODE, { name, score, createdAt });
      if (!rs.ok) return res.status(502).json({ error: "firebase_write_failed", where: PUBLIC_NODE, status: rs.status });
      const out = await rs.json();
      return res.status(200).json({ key: out.name });
    }

    return res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    return res.status(500).json({ error: "server_error", message: String(e.message || e) });
  }
};
