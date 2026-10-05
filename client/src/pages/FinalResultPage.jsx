import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function FinalResultPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get('/rounds/final-result')
      .then(({ data }) => {
        setResult(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Final result error:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="page round-page-centered">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ fontFamily: 'var(--font-heading)', letterSpacing: '0.2em', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            CALCULATING FINAL SCORE...
          </p>
        </div>
      </div>
    )
  }

  const r1 = result?.round1 || { score: 0, maxMarks: 30 }
  const r2 = result?.round2 || { score: 0, maxMarks: 30 }
  const r3 = result?.round3 || { score: 0, maxMarks: 40 }
  const total = result?.totalScore ?? 0
  const percentage = result?.percentage ?? 0

  return (
    <div className="page round-page-centered" style={{ animation: 'fadeIn 400ms ease', padding: '24px 16px' }}>
      <div
        className="card card-glow"
        style={{
          width: 'min(100%, 540px)',
          padding: '36px 28px',
          textAlign: 'center',
          borderColor: 'rgba(74, 222, 128, 0.4)',
          boxShadow: '0 0 40px rgba(74, 222, 128, 0.15)',
        }}
      >
        
        <h1
          className="display-title"
          style={{
            fontSize: 'clamp(1.8rem, 5vw, 2.4rem)',
            letterSpacing: '0.1em',
            background: 'linear-gradient(135deg, #4ade80, #60a5fa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '4px',
          }}
        >
          ALL ROUNDS COMPLETED
        </h1>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.82rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '28px' }}>
          {user?.teamName || user?.name || user?.username} — SUBMISSION RECORDED
        </p>

        {/* Round Points Breakdown & Scorecard Card */}
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            marginBottom: '24px',
            textAlign: 'left',
          }}
        >
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', letterSpacing: '0.08em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '14px' }}>
            YOUR TRIAL POINTS BREAKDOWN
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '4px' }}>TRIAL 1 (MCQ)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#4ade80', fontSize: '1.1rem' }}>{r1.score} <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>/ 30</span></div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '4px' }}>TRIAL 2 (OUTPUT)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#4ade80', fontSize: '1.1rem' }}>{r2.score} <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>/ 30</span></div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '4px' }}>TRIAL 3 (DEBUG)</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#4ade80', fontSize: '1.1rem' }}>{r3.score} <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>/ 40</span></div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>CUMULATIVE SCORE</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.2rem', color: 'var(--red-bright)' }}>{total} / 100 pts ({percentage}%)</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={async () => {
              try {
                const response = await fetch('/api/rounds/scorecard-pdf', {
                  headers: { Authorization: `Bearer ${localStorage.getItem('cb_token')}` },
                })
                if (!response.ok) throw new Error('Failed to download')
                const blob = await response.blob()
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `${(user?.teamName || user?.username || 'participant').replace(/[^a-zA-Z0-9_-]/g, '_')}_scorecard.pdf`
                a.click()
              } catch (err) {
                alert('Failed to download scorecard PDF')
              }
            }}
            style={{ fontSize: '0.85rem', gap: '8px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', boxShadow: '0 0 16px rgba(239,68,68,0.3)' }}
          >
            📄 Download Official Scorecard (PDF)
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ fontSize: '0.85rem' }}>
            ← Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
