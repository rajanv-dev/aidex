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
        <div style={{ fontSize: '3.5rem', marginBottom: '8px' }}>🏆</div>
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
          FINAL RESULT
        </h1>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: '0.82rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '28px' }}>
          {user?.teamName || user?.name || user?.username} — PERFORMANCE SUMMARY
        </p>

        {/* Breakdown Table */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            marginBottom: '24px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
            <span>Round 1 (Basic)</span>
            <strong style={{ color: 'var(--text-primary)' }}>
              {r1.score} / {r1.maxMarks}
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
            <span>Round 2 (Intermediate)</span>
            <strong style={{ color: 'var(--text-primary)' }}>
              {r2.score} / {r2.maxMarks}
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-muted)' }}>
            <span>Round 3 (Advanced)</span>
            <strong style={{ color: 'var(--text-primary)' }}>
              {r3.score} / {r3.maxMarks}
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px 0', fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>
            <span>TOTAL</span>
            <span>
              {total} / 100
            </span>
          </div>
        </div>

        {/* Percentage Card */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 24px',
            background: 'rgba(74, 222, 128, 0.1)',
            borderRadius: '24px',
            border: '1px solid rgba(74, 222, 128, 0.3)',
            marginBottom: '28px',
          }}
        >
          <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-heading)', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>PERCENTAGE:</span>
          <span style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#4ade80' }}>{percentage}%</span>
        </div>

        <div>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/')} style={{ width: '100%', maxWidth: '280px' }}>
            ← RETURN TO DASHBOARD
          </button>
        </div>
      </div>
    </div>
  )
}
