import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Lead = {
  name: string
  lat: number
  lon: number
  city?: string
  state: string
  phone?: string
  phone_link?: string
  website?: string
  opening_hours?: string
  shop?: string
  office?: string
  source?: string[]
  score: number
  tier: 'A' | 'B' | 'C'
  fit: 'alto' | 'médio' | 'baixo'
  google_maps_url: string
  tags?: Record<string, string>
}

type Payload = {
  meta: {
    state: string
    focus: string
    source: string
    generated_at: string
    total_raw_candidates: number
    total_leads: number
  }
  leads: Lead[]
}

const money = new Intl.NumberFormat('pt-BR')

function segmentLabel(lead: Lead) {
  const name = `${lead.name} ${(lead.shop || '')} ${(lead.office || '')}`.toLowerCase()
  if (name.includes('home center')) return 'Home center'
  if (name.includes('casa da construção') || name.includes('casa e construção')) return 'Casa de construção'
  if (name.includes('material de construção') || name.includes('materiais de construção')) return 'Material de construção'
  if (name.includes('madeireira')) return 'Madeireira'
  if (name.includes('tintas') || name.includes('paint')) return 'Tintas'
  if (name.includes('construtora') || name.includes('construções') || name.includes('construcoes')) return 'Construtora'
  if (lead.office === 'construction_company') return 'Construtora'
  if (lead.shop === 'hardware' || lead.shop === 'doityourself') return 'Ferragens / acabamento'
  return 'Obra e infraestrutura'
}

function scoreLabel(score: number) {
  if (score >= 60) return 'Alta'
  if (score >= 40) return 'Média'
  return 'Baixa'
}

function downloadCsv(leads: Lead[]) {
  const headers = ['nome', 'cidade', 'estado', 'score', 'tier', 'fit', 'segmento', 'telefone', 'site', 'maps']
  const rows = leads.map((lead) => [
    lead.name,
    lead.city || '',
    lead.state,
    String(lead.score),
    lead.tier,
    lead.fit,
    segmentLabel(lead),
    lead.phone || '',
    lead.website || '',
    lead.google_maps_url,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'leads-alagoas-construcao.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [tier, setTier] = useState<'all' | 'A' | 'B' | 'C'>('all')
  const [minScore, setMinScore] = useState(0)
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'city'>('score')

  useEffect(() => {
    let mounted = true
    fetch('/leads.json')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Falha ao carregar leads (${res.status})`)
        return (await res.json()) as Payload
      })
      .then((data) => {
        if (!mounted) return
        setPayload(data)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Erro ao carregar os dados')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const leads = useMemo(() => payload?.leads ?? [], [payload])
  const cities = useMemo(() => {
    return Array.from(new Set(leads.map((lead) => lead.city?.trim()).filter(Boolean) as string[])).sort()
  }, [leads])

  const stats = useMemo(() => {
    const valid = leads.filter((lead) => lead.score >= minScore)
    return {
      total: leads.length,
      a: leads.filter((lead) => lead.tier === 'A').length,
      withPhone: leads.filter((lead) => lead.phone).length,
      withWebsite: leads.filter((lead) => lead.website).length,
      highFit: leads.filter((lead) => lead.fit === 'alto').length,
      filtered: valid.length,
    }
  }, [leads, minScore])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let next = [...leads]

    if (q) {
      next = next.filter((lead) => {
        const hay = [lead.name, lead.city, lead.shop, lead.office, segmentLabel(lead), lead.phone, lead.website]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }

    if (city) {
      next = next.filter((lead) => (lead.city || '').toLowerCase() === city.toLowerCase())
    }

    if (tier !== 'all') {
      next = next.filter((lead) => lead.tier === tier)
    }

    next = next.filter((lead) => lead.score >= minScore)

    next.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'pt-BR')
      if (sortBy === 'city') return (a.city || '').localeCompare(b.city || '', 'pt-BR') || b.score - a.score
      return b.score - a.score || a.name.localeCompare(b.name, 'pt-BR')
    })

    return next
  }, [leads, search, city, tier, minScore, sortBy])

  if (loading) {
    return (
      <main className="page-shell center-state">
        <div className="loading-card">
          <p className="eyebrow">Radar Comercial Alagoas</p>
          <h1>Carregando os leads públicos…</h1>
          <p>Estou preparando a lista de construtoras, casas de construção, depósitos e madeireiras.</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page-shell center-state">
        <div className="loading-card error">
          <p className="eyebrow">Erro de carregamento</p>
          <h1>Não consegui abrir a base de leads</h1>
          <p>{error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="hero-top">
          <div>
            <p className="eyebrow">Radar Comercial Alagoas</p>
            <h1>Leads de construção em Alagoas, com foco no que realmente compra obra.</h1>
            <p className="hero-copy">
              Base pública de prospecção para construtoras, depósitos, madeireiras, home centers e casas de
              construção. A ideia é enxergar oportunidade, filtrar rápido e sair com lista pronta para abordagem.
            </p>
          </div>
          <div className="hero-badge">
            <span>{payload?.meta.state}</span>
            <strong>{money.format(payload?.meta.total_leads || 0)}</strong>
            <small>leads na base</small>
          </div>
        </div>

        <div className="stats-grid">
          <article>
            <span>Total bruto</span>
            <strong>{money.format(stats.total)}</strong>
          </article>
          <article>
            <span>Tier A</span>
            <strong>{money.format(stats.a)}</strong>
          </article>
          <article>
            <span>Com telefone</span>
            <strong>{money.format(stats.withPhone)}</strong>
          </article>
          <article>
            <span>Com site</span>
            <strong>{money.format(stats.withWebsite)}</strong>
          </article>
          <article>
            <span>Alta aderência</span>
            <strong>{money.format(stats.highFit)}</strong>
          </article>
          <article>
            <span>Após filtros</span>
            <strong>{money.format(stats.filtered)}</strong>
          </article>
        </div>

        <div className="hero-actions">
          <a className="primary-button" href="#lista">Ver leads</a>
          <button className="secondary-button" type="button" onClick={() => downloadCsv(filtered)}>
            Baixar CSV filtrado
          </button>
          <a className="secondary-button" href="https://www.google.com/maps" target="_blank" rel="noreferrer">
            Abrir Google Maps
          </a>
        </div>

        <p className="hero-meta">
          Fonte: {payload?.meta.source} · gerado em {payload?.meta.generated_at} · foco em {payload?.meta.focus}.
        </p>
      </section>

      <section className="filters-card">
        <div className="filters-row">
          <label>
            <span>Buscar</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, cidade, segmento…" />
          </label>
          <label>
            <span>Cidade</span>
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Todo o estado</option>
              {cities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Tier</span>
            <select value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}>
              <option value="all">Todos</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </label>
          <label>
            <span>Score mínimo</span>
            <input
              type="range"
              min="0"
              max="100"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
            <strong>{minScore}</strong>
          </label>
          <label>
            <span>Ordenar por</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
              <option value="score">Score</option>
              <option value="name">Nome</option>
              <option value="city">Cidade</option>
            </select>
          </label>
        </div>
      </section>

      <section className="summary-strip">
        <div>
          <strong>{filtered.length}</strong>
          <span>leads visíveis</span>
        </div>
        <div>
          <strong>{cities.length}</strong>
          <span>cidades na base</span>
        </div>
        <div>
          <strong>{scoreLabel(Math.max(...filtered.map((lead) => lead.score), 0))}</strong>
          <span>melhor oportunidade</span>
        </div>
      </section>

      <section className="list-wrap" id="lista">
        <div className="section-head">
          <div>
            <p className="eyebrow">Lista operacional</p>
            <h2>Top leads para prospecção</h2>
          </div>
          <p>
            Dica: os leads com score mais alto tendem a ter melhor fit para obra, revenda ou suprimento de materiais.
          </p>
        </div>

        <div className="lead-grid">
          {filtered.map((lead, index) => (
            <article className="lead-card" key={`${lead.name}-${lead.lat}-${lead.lon}`}>
              <div className="lead-top">
                <div>
                  <p className="rank">#{index + 1}</p>
                  <h3>{lead.name}</h3>
                  <p className="segment">{segmentLabel(lead)}</p>
                </div>
                <div className={`score-pill tier-${lead.tier}`}>
                  <strong>{lead.score}</strong>
                  <span>{lead.tier}</span>
                </div>
              </div>

              <div className="lead-meta">
                <span>{lead.city || 'Cidade não informada'}</span>
                <span>{lead.state}</span>
                <span>Fit {lead.fit}</span>
              </div>

              <p className="lead-note">
                {lead.opening_hours ? `Horário público: ${lead.opening_hours}` : 'Sem horário público informado.'}
              </p>

              <div className="tag-row">
                {lead.shop && <span className="tag">shop={lead.shop}</span>}
                {lead.office && <span className="tag">office={lead.office}</span>}
                {lead.source?.map((src) => (
                  <span className="tag" key={src}>
                    {src}
                  </span>
                ))}
              </div>

              <div className="lead-actions">
                <a href={lead.google_maps_url} target="_blank" rel="noreferrer">
                  Abrir no Maps
                </a>
                {lead.website && (
                  <a href={lead.website} target="_blank" rel="noreferrer">
                    Site
                  </a>
                )}
                {lead.phone_link && (
                  <a href={lead.phone_link}>
                    Ligar
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer-note">
        <p>
          Dados públicos de OpenStreetMap/Nominatim. Use como base comercial inicial e valide telefone, cidade e
          operação antes do contato.
        </p>
      </footer>
    </main>
  )
}

export default App
