import { useEffect, useMemo, useRef, useState } from 'react';
import { pageForProblem } from '../../app/registry';
import { href, navigate, useRoute } from '../../app/router';
import { getFormula } from '../../content/formulas';
import { PROBLEMS, Problem, TOPICS, Topic, getProblem } from '../../content/problems';
import { getVideo, videoUrl } from '../../content/videos';
import { AnswerVerdict, checkAnswer } from '../../mathlab/answers';
import { Tex } from '../../ui/controls';
import { MathField } from '../solver/MathField';
import { RichText } from '../solver/RichText';
import '../solver/solver.css';
import './practice.css';
import { Entry, Progress, Status, useProgress } from './progress';

type StatusFilter = 'all' | 'todo' | 'solved' | 'review';

const topicLabel = (t: Topic) => TOPICS.find((k) => k.id === t)?.label ?? t;

function pickRandom(pool: Problem[], progress: Progress, not?: number): Problem | undefined {
  const unsolved = pool.filter((p) => progress[p.n]?.status !== 'solved' && p.n !== not);
  const from = unsolved.length ? unsolved : pool.filter((p) => p.n !== not);
  return from[Math.floor(Math.random() * from.length)];
}

function StatusBadge({ status }: { status?: Status }) {
  if (status === 'solved') return <span className="badge good">Solved</span>;
  if (status === 'review') return <span className="badge warn">Review</span>;
  return <span className="badge">To do</span>;
}

// ---------------------------------------------------------------- list

function ProblemList({ progress, topic, setTopic, status, setStatus, onReset }: {
  progress: Progress;
  topic: Topic | 'all';
  setTopic: (t: Topic | 'all') => void;
  status: StatusFilter;
  setStatus: (s: StatusFilter) => void;
  onReset: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const solved = PROBLEMS.filter((p) => progress[p.n]?.status === 'solved').length;
  const review = PROBLEMS.filter((p) => progress[p.n]?.status === 'review').length;
  const inTopic = PROBLEMS.filter((p) => topic === 'all' || p.topic === topic);
  const shown = inTopic.filter((p) => {
    const s = progress[p.n]?.status;
    return status === 'all' || (status === 'todo' ? !s : s === status);
  });

  return (
    <div className="page practice">
      <h1>Practice problems</h1>
      <p className="page-lead">
        The 65 additional problems. Type your answer as a formula and any equivalent form is accepted. Stuck? Take a hint, open the lab for
        that exact situation, or read the worked solution.
      </p>

      <div className="box progress-box">
        <div className="progress-top">
          <div>
            <strong>{solved}</strong> of {PROBLEMS.length} solved
            {review > 0 && <span className="muted"> · {review} to review</span>}
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const p = pickRandom(inTopic, progress);
                if (p) navigate(`/practice/${p.n}`);
              }}
            >
              Quiz me
            </button>
            {confirmReset ? (
              <>
                <button type="button" className="btn danger" onClick={() => { onReset(); setConfirmReset(false); }}>Yes, clear my progress</button>
                <button type="button" className="btn" onClick={() => setConfirmReset(false)}>Keep it</button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmReset(true)} disabled={solved + review === 0}>Reset progress</button>
            )}
          </div>
        </div>
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={PROBLEMS.length} aria-valuenow={solved}>
          <span className="progress-solved" style={{ width: `${(solved / PROBLEMS.length) * 100}%` }} />
          <span className="progress-review" style={{ width: `${(review / PROBLEMS.length) * 100}%` }} />
        </div>
      </div>

      <div className="filters">
        <div className="topic-chips" role="radiogroup" aria-label="Topic">
          <button type="button" role="radio" aria-checked={topic === 'all'} className={`chip ${topic === 'all' ? 'on' : ''}`} onClick={() => setTopic('all')}>
            All topics <span className="count">{solved}/{PROBLEMS.length}</span>
          </button>
          {TOPICS.map((t) => {
            const all = PROBLEMS.filter((p) => p.topic === t.id);
            const done = all.filter((p) => progress[p.n]?.status === 'solved').length;
            return (
              <button key={t.id} type="button" role="radio" aria-checked={topic === t.id} className={`chip ${topic === t.id ? 'on' : ''}`} onClick={() => setTopic(t.id)}>
                {t.label} <span className="count">{done}/{all.length}</span>
              </button>
            );
          })}
        </div>
        <div className="segmented status-filter" role="radiogroup" aria-label="Status">
          {(['all', 'todo', 'solved', 'review'] as StatusFilter[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              {s === 'all' ? 'All' : s === 'todo' ? 'To do' : s === 'solved' ? 'Solved' : 'Review'}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="muted empty">No problems match these filters.</p>
      ) : (
        <ul className="problem-list">
          {shown.map((p) => (
            <li key={p.n}>
              <a href={href(`/practice/${p.n}`)} className={`problem-row ${progress[p.n]?.status ?? ''}`}>
                <span className="problem-n">{p.n}</span>
                <span className="problem-title">{p.title}</span>
                <span className="problem-topic">{topicLabel(p.topic)}</span>
                <span className="problem-kind">{p.checks.length ? 'formula' : 'in words'}</span>
                <StatusBadge status={progress[p.n]?.status} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- one problem

function ProblemView({ problem, entry, update, progress, pool }: {
  problem: Problem;
  entry: Entry | undefined;
  update: (n: number, patch: (e: Entry) => Entry) => void;
  progress: Progress;
  pool: Problem[];
}) {
  const [inputs, setInputs] = useState<string[]>(() => problem.checks.map(() => ''));
  /** Latest text of each answer box, readable from event handlers without waiting for a render. */
  const inputsRef = useRef(inputs);
  const [verdicts, setVerdicts] = useState<(AnswerVerdict | null)[]>(() => problem.checks.map(() => null));
  const [revealed, setRevealed] = useState(false);
  const [hints, setHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  const allCorrect = problem.checks.length > 0 && verdicts.every((v) => v?.ok);
  const showAnswer = revealed || allCorrect;
  const lab = pageForProblem(problem.n);
  const index = PROBLEMS.findIndex((p) => p.n === problem.n);
  const prev = PROBLEMS[index - 1];
  const next = PROBLEMS[index + 1];

  const mark = (status: Status) => update(problem.n, (e) => ({ ...e, status, at: Date.now() }));

  const check = (i: number, typed?: string) => {
    if (typed !== undefined && typed !== inputsRef.current[i]) {
      inputsRef.current = inputsRef.current.map((s, j) => (j === i ? typed : s));
      setInputs(inputsRef.current);
    }
    const verdict = checkAnswer(inputsRef.current[i], problem.checks[i]);
    const nextVerdicts = verdicts.map((v, j) => (j === i ? verdict : v));
    setVerdicts(nextVerdicts);
    if (verdict.ok || verdict.kind !== 'empty') {
      const done = nextVerdicts.every((v) => v?.ok);
      update(problem.n, (e) => ({
        ...e,
        attempts: e.attempts + 1,
        // solving it after peeking at the answer keeps it on the review pile
        status: done ? (revealed ? e.status ?? 'review' : 'solved') : e.status,
        at: done ? Date.now() : e.at,
      }));
    }
  };

  const reveal = () => {
    setRevealed(true);
    if (problem.checks.length && !allCorrect && entry?.status !== 'solved') mark('review');
  };

  const moreHints = () => {
    const h = Math.min(problem.hints.length, hints + 1);
    setHints(h);
    update(problem.n, (e) => ({ ...e, hints: Math.max(e.hints, h) }));
  };

  return (
    <div className="page practice problem-view">
      <nav className="problem-nav">
        <a href={href('/practice')}>← All problems</a>
        <span className="spacer" />
        {prev && <a className="btn" href={href(`/practice/${prev.n}`)}>Previous</a>}
        {next && <a className="btn" href={href(`/practice/${next.n}`)}>Next</a>}
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const p = pickRandom(pool, progress, problem.n);
            if (p) navigate(`/practice/${p.n}`);
          }}
        >
          Quiz me
        </button>
      </nav>

      <header className="problem-head">
        <h1>Problem {problem.n}</h1>
        <span className="problem-topic">{topicLabel(problem.topic)}</span>
        <StatusBadge status={entry?.status} />
      </header>
      <p className="problem-subtitle">{problem.title}</p>

      <div className="box statement">
        <RichText text={problem.statement} />
      </div>

      <section className="box answer-box">
        <h3>Your answer</h3>
        {problem.checks.length > 0 ? (
          <>
            {problem.checks.map((c, i) => {
              const v = verdicts[i];
              return (
                <div key={i} className="check">
                  <p className="check-prompt">
                    {c.label && <span className="check-label">{c.label}</span>}
                    <RichText text={c.prompt} />
                  </p>
                  <div className="check-row">
                    <MathField
                      value={inputs[i]}
                      onChange={(tex) => {
                        if (tex === inputsRef.current[i]) return;
                        inputsRef.current = inputsRef.current.map((s, j) => (j === i ? tex : s));
                        setInputs(inputsRef.current);
                        // a verdict belongs to the text it was given for
                        setVerdicts((vs) => (vs[i] ? vs.map((x, j) => (j === i ? null : x)) : vs));
                      }}
                      onEnter={(tex) => check(i, tex)}
                      label={`Answer${c.label ? ' ' + c.label : ''}`}
                      placeholder={String.raw`\text{Type a formula}`}
                    />
                    <button type="button" className="btn primary" onClick={() => check(i)}>Check</button>
                  </div>
                  {v && (
                    <p className={`verdict ${v.ok ? 'good' : 'bad'}`} role="status">
                      {v.ok ? 'Correct.' : <RichText text={v.message} />}
                    </p>
                  )}
                </div>
              );
            })}
            {allCorrect && (
              <p className="verdict good big">
                {revealed ? 'That matches. It stays on your review list because the answer was showing.' : 'Solved. Any equivalent form would have been accepted.'}
              </p>
            )}
            {!showAnswer && (
              <button type="button" className="link-btn" onClick={reveal}>Give up and show the answer</button>
            )}
          </>
        ) : (
          <>
            <p className="muted">
              This one is answered in words. Decide on your answer first (say it out loud or write it down), then reveal it and mark yourself
              honestly.
            </p>
            {!revealed && <button type="button" className="btn primary" onClick={reveal}>Reveal the answer</button>}
          </>
        )}

        {showAnswer && (
          <div className="revealed">
            <h4>Answer</h4>
            <p className="answer-text"><RichText text={problem.answer} /></p>
            {problem.sheetAnswer && (
              <p className="sheet-answer">
                <span className="muted">On the problem sheet: </span>
                <RichText text={problem.sheetAnswer} />
              </p>
            )}
            {problem.note && (
              <div className="note warn">
                <strong className="note-title">About the sheet’s answer</strong>
                {problem.note}
              </div>
            )}
            {problem.checks.length === 0 && (
              <div className="self-mark">
                <span>How did you do?</span>
                <button type="button" className={`btn ${entry?.status === 'solved' ? 'on' : ''}`} onClick={() => mark('solved')}>I got it</button>
                <button type="button" className={`btn ${entry?.status === 'review' ? 'on' : ''}`} onClick={() => mark('review')}>I missed it</button>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="help-grid">
        <section className="box">
          <h3>Hints</h3>
          {hints === 0 && <p className="muted">Hints go from a nudge to nearly the whole method. Take one at a time.</p>}
          <ol className="hints">
            {problem.hints.slice(0, hints).map((h, i) => (
              <li key={i}><RichText text={h} /></li>
            ))}
          </ol>
          {hints < problem.hints.length ? (
            <button type="button" className="btn" onClick={moreHints}>
              Show hint {hints + 1} of {problem.hints.length}
            </button>
          ) : (
            <p className="muted">That is every hint. The worked solution has the rest.</p>
          )}
        </section>

        <section className="box">
          <h3>See it</h3>
          {lab && (
            <a className="btn lab-link" href={href(`${lab.path}?preset=p${problem.n}`)}>
              Open in lab: {lab.title}
            </a>
          )}
          <ul className="video-list">
            {problem.videos.map((n) => {
              const v = getVideo(n);
              if (!v) return null;
              return (
                <li key={n}>
                  <a href={videoUrl(v)} target="_blank" rel="noreferrer">
                    <span className="video-n">{n}</span>
                    <span className="video-title">{v.title}</span>
                    <span className="video-dur">{v.duration}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="box solution-box">
        <div className="solution-head">
          <h3>Worked solution</h3>
          <button type="button" className="btn" aria-expanded={showSolution} onClick={() => { setShowSolution(!showSolution); if (!showSolution) reveal(); }}>
            {showSolution ? 'Hide' : 'Show worked solution'}
          </button>
        </div>
        {showSolution && (
          <>
            <ol className="steps">
              {problem.solution.map((s, i) => (
                <li key={i}><RichText text={s} /></li>
              ))}
            </ol>
            {problem.uses.length > 0 && (
              <div className="uses">
                <span className="muted">From the formula sheet</span>
                <div className="uses-list">
                  {problem.uses.map((id) => {
                    const f = getFormula(id);
                    if (!f) return null;
                    const target = f.calcs[0] ? `/solver?expr=${encodeURIComponent(f.calcs[0].tex)}` : '/solver';
                    return (
                      <a key={id} className="use" href={href(target)} title={`${f.name}: open in the solver`}>
                        <Tex>{f.tex}</Tex>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function PracticePage() {
  const route = useRoute();
  const { progress, update, reset } = useProgress();
  const [topic, setTopic] = useState<Topic | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const n = route.parts[1] ? Number(route.parts[1]) : NaN;
  const problem = Number.isInteger(n) ? getProblem(n) : undefined;
  const pool = useMemo(() => PROBLEMS.filter((p) => topic === 'all' || p.topic === topic), [topic]);

  useEffect(() => {
    document.querySelector('.content')?.scrollTo({ top: 0 });
    if (problem) document.title = `Problem ${problem.n} · E&M Lab`;
  }, [problem]);

  if (route.parts[1] && !problem) {
    return (
      <div className="page practice">
        <h1>Problem not found</h1>
        <p className="page-lead">There are 65 problems, numbered 1 to 65.</p>
        <a className="btn" href={href('/practice')}>All problems</a>
      </div>
    );
  }
  if (problem) return <ProblemView key={problem.n} problem={problem} entry={progress[problem.n]} update={update} progress={progress} pool={pool} />;
  return <ProblemList progress={progress} topic={topic} setTopic={setTopic} status={status} setStatus={setStatus} onReset={reset} />;
}
