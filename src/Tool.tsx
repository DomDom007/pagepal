// Pagepal: a child reads a passage aloud; the browser follows along, then shows pace, accuracy and the tricky words.
import { useEffect, useRef, useState } from "react";
import { useStored } from "./lib/store";
import { todayISO } from "./lib/time";
import { Section, Stat, Stats } from "./ui/kit";

const T = "pagepal";
type Passage = { id: string; level: number; lang: string; title: string; text: string };
const PASSAGES: Passage[] = [
  { id: "e1", level: 1, lang: "en-US", title: "The red kite", text: "Sam has a red kite. The wind is big today. Sam runs and the kite goes up. It goes up and up. Sam is happy." },
  { id: "e2", level: 1, lang: "en-US", title: "My cat", text: "My cat is small and grey. She likes to sleep in the sun. At night she plays with a ball. I love my cat." },
  { id: "e3", level: 2, lang: "en-US", title: "The market", text: "On Saturday we go to the market with Grandma. There are oranges, bread, and big green melons. Grandma talks to everyone. I carry the bag, and it gets heavier and heavier." },
  { id: "e4", level: 2, lang: "en-US", title: "Rain day", text: "It rained all morning, so we could not play outside. We built a tent from chairs and blankets. My brother brought a torch, and we told stories until lunch." },
  { id: "e5", level: 3, lang: "en-US", title: "The lighthouse", text: "The old lighthouse stood at the edge of the cliff. Every night its light turned slowly, warning ships about the rocks below. The keeper climbed one hundred and twelve steps to reach the lamp, and he never once complained." },
  { id: "e6", level: 3, lang: "en-US", title: "Seeds", text: "A seed looks like it is doing nothing, but inside it is waiting. When the soil is warm and wet enough, it sends a tiny root down and a green shoot up towards the light. Some seeds can wait for years." },
  { id: "e7", level: 4, lang: "en-US", title: "Bridges", text: "Engineers who design bridges must think about weight, wind, and even the heat of the sun, which makes metal expand. A long bridge often has small gaps called expansion joints, so that it can stretch on hot days without cracking." },
  { id: "f1", level: 1, lang: "fr-FR", title: "Le chat", text: "Le chat dort sur le lit. Il est gris et doux. Le matin, il mange et il joue. J'aime mon chat." },
  { id: "f2", level: 2, lang: "fr-FR", title: "À la plage", text: "Samedi, nous allons à la plage. Le sable est chaud et la mer est bleue. Mon frère construit un château, et moi je cherche des coquillages." },
];
type Result = { date: string; passage: string; wpm: number; acc: number; missed: string[] };
type SR = { start(): void; stop(): void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null };
const norm = (w: string) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9']/g, "");

export default function Pagepal() {
  const [child, setChild] = useStored(T, "child", "Nour");
  const [results, setResults] = useStored<Result[]>(T, "results", [{ date: "2026-09-20", passage: "e2", wpm: 48, acc: 0.9, missed: ["grey", "plays"] }, { date: "2026-09-25", passage: "e3", wpm: 55, acc: 0.88, missed: ["heavier", "Saturday", "melons"] }]);
  const [pid, setPid] = useState("e3");
  const [state, setState] = useState<"idle" | "reading" | "done">("idle");
  const [heard, setHeard] = useState<boolean[]>([]);
  const [manualMiss, setManualMiss] = useState<number[]>([]);
  const [t0, setT0] = useState(0);
  const [secs, setSecs] = useState(0);
  const sr = useRef<SR | null>(null);
  const p = PASSAGES.find(x => x.id === pid)!;
  const words = p.text.split(/\s+/);
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const SRC = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  useEffect(() => { if (state !== "reading") return; const id = setInterval(() => setSecs((Date.now() - t0) / 1000), 250); return () => clearInterval(id); }, [state, t0]);

  const start = () => {
    setHeard(words.map(() => false)); setManualMiss([]); setT0(Date.now()); setSecs(0); setState("reading");
    if (!SRC) return;
    const r = new SRC(); r.continuous = true; r.interimResults = true; r.lang = p.lang;
    const target = words.map(norm);
    r.onresult = e => {
      // Walk through everything heard so far and tick passage words in order, allowing small skips.
      const said = Array.from(e.results).map(x => x[0].transcript).join(" ").split(/\s+/).map(norm).filter(Boolean);
      const got = target.map(() => false); let i = 0;
      for (const s of said) { for (let k = i; k < Math.min(target.length, i + 4); k++) if (target[k] === s) { got[k] = true; i = k + 1; break; } }
      setHeard(got);
    };
    r.onend = () => { if (sr.current === r) r.start(); };
    sr.current = r; r.start();
  };
  const finish = () => {
    const rec = sr.current; sr.current = null; rec?.stop();
    const minutes = Math.max(0.1, (Date.now() - t0) / 60000);
    const missedIdx = SRC ? words.map((_, i) => i).filter(i => !heard[i]) : manualMiss;
    const correct = words.length - missedIdx.length;
    setResults([...results, { date: todayISO(), passage: p.id, wpm: Math.round(correct / minutes), acc: correct / words.length, missed: missedIdx.map(i => words[i].replace(/[.,!?]/g, "")) }]);
    setState("done");
  };
  const last = results.filter(r => r.passage === pid).slice(-1)[0];
  const allMissed = Object.entries(results.flatMap(r => r.missed).reduce((a, m) => ({ ...a, [m]: (a[m] ?? 0) + 1 }), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const lastPos = heard.lastIndexOf(true);

  return (
    <div className="stack">
      <Section title={`${child} reads`}>
        <Stats><Stat value={results.length} label="Readings" /><Stat value={results.length ? `${results[results.length - 1].wpm}` : "–"} label="Words per minute, last time" /><Stat value={results.length ? `${Math.round(results[results.length - 1].acc * 100)}%` : "–"} label="Accuracy, last time" /></Stats>
        <div className="pp-trend">{results.slice(-12).map((r, i) => <span key={i} title={`${r.date}: ${r.wpm} wpm`} style={{ height: `${Math.min(100, r.wpm)}%` }} />)}</div>
      </Section>
      <section className="panel stack" style={{ gap: 14 }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label className="field"><span>Passage</span><select id="pp-p" className="input" value={pid} onChange={e => { setPid(e.target.value); setState("idle"); }}>{[1, 2, 3, 4].map(l => <optgroup key={l} label={`Level ${l}`}>{PASSAGES.filter(x => x.level === l).map(x => <option key={x.id} value={x.id}>{x.title}{x.lang.startsWith("fr") ? " (français)" : ""}</option>)}</optgroup>)}</select></label>
          <label className="field" style={{ flex: "0 0 160px" }}><span>Reader</span><input id="pp-c" className="input" value={child} onChange={e => setChild(e.target.value)} /></label>
          {state !== "reading" ? <button className="btn primary pp-go" onClick={start}>{state === "done" ? "Read again" : "Start reading"}</button> : <button className="btn pp-go pp-stop" onClick={finish}>I'm finished</button>}
          {state === "reading" && <span className="num" style={{ fontFamily: "var(--mono)", fontSize: 20 }}>{Math.floor(secs / 60)}:{String(Math.floor(secs % 60)).padStart(2, "0")}</span>}
        </div>
        {!SRC && <p className="note">Your browser cannot listen along (Chrome and Edge can). A grown-up can tap any word the reader gets stuck on.</p>}
        <p className="pp-text">{words.map((wd, i) => {
          const cls = state === "idle" ? "" : SRC ? (heard[i] ? "ok" : state === "done" || i < lastPos ? "miss" : i === lastPos + 1 ? "next" : "") : manualMiss.includes(i) ? "miss" : "";
          return <span key={i} className={cls} onClick={() => !SRC && state === "reading" && setManualMiss(manualMiss.includes(i) ? manualMiss.filter(x => x !== i) : [...manualMiss, i])}>{wd} </span>;
        })}</p>
        {state === "done" && last && <div className="pp-result"><Stats><Stat value={last.wpm} label="Words per minute" /><Stat value={`${Math.round(last.acc * 100)}%`} label="Words read correctly" tone={last.acc >= 0.95 ? "good" : last.acc >= 0.85 ? "warn" : "bad"} /></Stats>
          {last.missed.length > 0 && <p style={{ marginTop: 10 }}>Practise these: {last.missed.map(m => <span key={m} className="pill" style={{ marginRight: 4 }}>{m}</span>)}</p>}
          <p className="note" style={{ marginTop: 8 }}>{last.acc >= 0.95 ? "Great reading. Try the next level." : last.acc >= 0.9 ? "Good. Read it once more tomorrow." : "This passage is still tricky. Read it together first, then try alone."}</p></div>}
      </section>
      <Section title="Tricky words so far">{allMissed.length === 0 ? <p className="empty-note">None yet.</p> : <div className="pp-words">{allMissed.map(([wd, n]) => <span key={wd}><b>{wd}</b><em>{n}×</em></span>)}</div>}</Section>
      <style>{`.pp-trend{display:flex;gap:4px;align-items:flex-end;height:60px;margin-top:14px}.pp-trend span{width:18px;background:var(--accent);border-radius:3px 3px 0 0}.pp-go{font-size:18px;padding:14px 22px}.pp-stop{background:var(--good);color:#fff;border-color:var(--good)}
      .pp-text{font-family:var(--serif);font-size:clamp(24px,3.2vw,36px);line-height:1.7}.pp-text span{border-radius:6px;padding:0 2px;cursor:default}.pp-text .ok{background:color-mix(in srgb,var(--good) 25%,transparent)}.pp-text .miss{background:color-mix(in srgb,var(--bad) 22%,transparent);text-decoration:underline wavy var(--bad)}.pp-text .next{outline:2px solid var(--accent)}
      .pp-result{padding:14px;border-radius:10px;background:var(--sunk)}.pp-words{display:flex;flex-wrap:wrap;gap:10px}.pp-words span{display:flex;gap:6px;align-items:baseline;border:1px solid var(--line);border-radius:8px;padding:6px 12px}.pp-words b{font-family:var(--serif);font-weight:400;font-size:22px}.pp-words em{font-style:normal;color:var(--muted);font-size:12px}`}</style>
    </div>
  );
}
