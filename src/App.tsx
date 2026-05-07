import { useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import './App.css'

type FocusKey = 'natalidade' | 'materna' | 'infantil'
type PresetKey = 'full' | 'p1' | 'p2' | 'custom'

type YearDatum = {
  year: number
  natalidadeAl: number
  natalidadeBr: number
  mortalidadeMaterna: number
  mortalidadeInfantil: number
  consultas: number
  births: number
}

const YEARS = [
  2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015,
  2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
]

const NATALIDADE_AL = [
  18.9, 18.3, 17.3, 17.36, 17.05, 16.12, 15.91, 15.62, 15.65,
  14.34, 14.92, 15.49, 14.92, 14.31, 14.15, 14.62, 14.47, 14.11, 14.34,
]

const NATALIDADE_BR = [
  16.2, 16.0, 15.8, 15.4, 15.2, 15.1, 14.9, 14.8, 14.7,
  14.4, 14.3, 14.4, 14.2, 14.1, 14.0, 13.9, 13.8, 13.7, 13.6,
]

const MORTALIDADE_MATERNA = [
  43.5, 46.5, 34.3, 59.1, 51.6, 45.7, 59.1, 104.1, 57.4,
  51.9, 31.8, 49.5, 58.2, 82.7, 53.3, 44.1, 58.0, 45.8, 43.3,
]

const MORTALIDADE_INFANTIL = [
  19.1, 18.8, 18.2, 17.9, 17.7, 17.3, 17.0, 16.9, 16.8,
  16.7, 16.6, 16.5, 16.4, 16.3, 16.2, 16.1, 16.0, 15.9, 15.8,
]

const CONSULTAS = [
  341_200, 352_400, 361_900, 373_800, 386_400, 395_100, 402_700, 414_800, 426_500,
  439_700, 451_800, 465_000, 480_400, 498_200, 515_700, 531_800, 540_300, 546_700, 551_974,
]

const BIRTHS = [
  56_900, 56_200, 55_300, 54_500, 53_900, 53_000, 52_300, 51_700, 51_100,
  50_700, 50_100, 49_600, 49_000, 48_700, 48_400, 48_000, 47_600, 47_300, 46_797,
]

const YEAR_DATA: YearDatum[] = YEARS.map((year, index) => ({
  year,
  natalidadeAl: NATALIDADE_AL[index],
  natalidadeBr: NATALIDADE_BR[index],
  mortalidadeMaterna: MORTALIDADE_MATERNA[index],
  mortalidadeInfantil: MORTALIDADE_INFANTIL[index],
  consultas: CONSULTAS[index],
  births: BIRTHS[index],
}))

const PRESETS: Record<PresetKey, [number, number]> = {
  full: [0, YEAR_DATA.length - 1],
  p1: [0, 7],
  p2: [8, YEAR_DATA.length - 1],
  custom: [0, YEAR_DATA.length - 1],
}

const FOCUS_LABELS: Record<FocusKey, string> = {
  natalidade: 'Taxa de natalidade',
  materna: 'Razão de mortalidade materna',
  infantil: 'Mortalidade infantil',
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${formatNumber(value, 1)}%`
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function makeLinePoints(values: number[], width: number, height: number, padding = 28) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(max - min, 0.0001)
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2
  const stepX = values.length > 1 ? innerWidth / (values.length - 1) : innerWidth

  return values.map((value, index) => {
    const x = padding + index * stepX
    const y = padding + innerHeight - ((value - min) / spread) * innerHeight
    return { x, y, value }
  })
}

function makeLinePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
}

function makeAreaPath(points: Array<{ x: number; y: number }>, height: number, padding = 28) {
  if (!points.length) return ''
  const baseline = height - padding
  const first = points[0]
  const last = points[points.length - 1]
  return `${makeLinePath(points)} L ${last.x.toFixed(2)} ${baseline} L ${first.x.toFixed(2)} ${baseline} Z`
}

function signedDelta(current: number, previous: number) {
  if (!previous) return 0
  return ((current - previous) / previous) * 100
}

function metricTone(value: number, inverted = false) {
  if (value === 0) return 'neutral'
  const positive = inverted ? value < 0 : value > 0
  return positive ? 'good' : 'bad'
}

function MiniDial({
  label,
  value,
  target,
  unit,
  tone = 'good',
}: {
  label: string
  value: number
  target: number
  unit: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  const max = Math.max(target * 1.15, value * 1.05)
  const progress = clamp((value / max) * 100, 8, 100)
  return (
    <div className={`mini-dial mini-dial--${tone}`}>
      <div
        className="mini-dial__ring"
        style={{
          background: `conic-gradient(var(--dial-accent) ${progress}%, rgba(15, 23, 42, 0.08) ${progress}% 100%)`,
        }}
        aria-hidden="true"
      >
        <div className="mini-dial__core">
          <strong>{formatNumber(value, value < 100 ? 2 : 0)}</strong>
          <span>{unit}</span>
        </div>
      </div>
      <div className="mini-dial__meta">
        <span>{label}</span>
        <small>Meta / referência: {formatNumber(target, target < 100 ? 2 : 0)}{unit}</small>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  delta,
  deltaLabel,
  note,
  tone = 'neutral',
}: {
  label: string
  value: string
  delta: string
  deltaLabel: string
  note: string
  tone?: 'neutral' | 'good' | 'bad' | 'warn'
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__delta">
        <strong>{delta}</strong>
        <span>{deltaLabel}</span>
      </div>
      <p>{note}</p>
    </article>
  )
}

function ChartFrame({
  eyebrow,
  title,
  subtitle,
  children,
  action,
}: {
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="panel chart-frame">
      <div className="chart-frame__header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {action ? <div className="chart-frame__action">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

function ComparisonBar({
  label,
  value,
  reference,
  accent,
}: {
  label: string
  value: number
  reference: number
  accent: string
}) {
  const max = Math.max(value, reference) * 1.1
  const valueWidth = (value / max) * 100
  const referenceWidth = (reference / max) * 100
  return (
    <div className="comparison-bar">
      <div className="comparison-bar__copy">
        <span>{label}</span>
        <strong>{formatNumber(value, 2)}</strong>
      </div>
      <div className="comparison-bar__track">
        <div className="comparison-bar__reference" style={{ width: `${referenceWidth}%` }} />
        <div className="comparison-bar__value" style={{ width: `${valueWidth}%`, background: accent }} />
      </div>
      <small>Base de comparação: {formatNumber(reference, 2)}</small>
    </div>
  )
}

function App() {
  const [preset, setPreset] = useState<PresetKey>('full')
  const [rangeStart, setRangeStart] = useState(PRESETS.full[0])
  const [rangeEnd, setRangeEnd] = useState(PRESETS.full[1])
  const [focus, setFocus] = useState<FocusKey>('natalidade')

  const visible = useMemo(() => {
    const start = Math.min(rangeStart, rangeEnd)
    const end = Math.max(rangeStart, rangeEnd)
    return YEAR_DATA.slice(start, end + 1)
  }, [rangeStart, rangeEnd])

  const p1 = useMemo(() => YEAR_DATA.slice(0, 8), [])
  const p2 = useMemo(() => YEAR_DATA.slice(8), [])

  const totalBirths = sum(visible.map((item) => item.births))
  const avgMaterna = average(visible.map((item) => item.mortalidadeMaterna))
  const avgInfantil = average(visible.map((item) => item.mortalidadeInfantil))
  const consultasLatest = visible[visible.length - 1]?.consultas ?? 0
  const natalidadeAvg = average(visible.map((item) => item.natalidadeAl))
  const natalidadePrev = average(visible.map((item) => item.natalidadeBr))

  const firstPeriod = average(p1.map((item) => item.natalidadeAl))
  const secondPeriod = average(p2.map((item) => item.natalidadeAl))
  const firstMaterna = average(p1.map((item) => item.mortalidadeMaterna))
  const secondMaterna = average(p2.map((item) => item.mortalidadeMaterna))
  const firstInfantil = average(p1.map((item) => item.mortalidadeInfantil))
  const secondInfantil = average(p2.map((item) => item.mortalidadeInfantil))

  const startYear = visible[0]?.year ?? YEAR_DATA[0].year
  const endYear = visible[visible.length - 1]?.year ?? YEAR_DATA[YEAR_DATA.length - 1].year

  const natalidadeDelta = signedDelta(secondPeriod, firstPeriod)
  const maternaDelta = signedDelta(secondMaterna, firstMaterna)
  const infantilDelta = signedDelta(secondInfantil, firstInfantil)
  const consultasDelta = signedDelta(consultasLatest, visible[0]?.consultas ?? consultasLatest)

  const natalidadePoints = useMemo(() => makeLinePoints(visible.map((item) => item.natalidadeAl), 760, 320), [visible])
  const natalidadeBrPoints = useMemo(() => makeLinePoints(visible.map((item) => item.natalidadeBr), 760, 320), [visible])
  const infantilPoints = useMemo(() => makeLinePoints(visible.map((item) => item.mortalidadeInfantil), 760, 260), [visible])

  const natalidadeArea = makeAreaPath(natalidadePoints, 320)
  const natalidadeBrArea = makeAreaPath(natalidadeBrPoints, 320)
  const maternaBars = visible.map((item) => item.mortalidadeMaterna)

  const presetRange = (key: PresetKey) => {
    const [start, end] = PRESETS[key]
    setPreset(key)
    setRangeStart(start)
    setRangeEnd(end)
  }

  const onRangeChange = (setter: (value: number) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setPreset('custom')
    setter(Number(event.target.value))
  }

  return (
    <main className="app-shell">
      <div className="page-shell">
        <header className="hero panel">
          <div className="hero__topbar">
            <div className="brand-pill">
              <span className="brand-pill__dot" />
              SECRIA · Painel estratégico
            </div>
            <div className="hero__logos" aria-label="Identidade institucional">
              <span>ALAGOAS</span>
              <span>secretaria de estado</span>
              <span>cria</span>
            </div>
          </div>

          <div className="hero__main">
            <div className="hero__copy">
              <div className="eyebrow">Diagnóstico gerencial</div>
              <h1>Diagnóstico Gerencial da Primeira Infância de Alagoas</h1>
              <p>
                Monitoramento executivo de 2007 a 2025 com leitura rápida de nascidos vivos,
                razão de mortalidade materna, taxa de mortalidade infantil e consultas pré-natal.
              </p>
            </div>

            <div className="hero__stats">
              <div>
                <span>Período ativo</span>
                <strong>{startYear}–{endYear}</strong>
              </div>
              <div>
                <span>Escopo</span>
                <strong>Alagoas</strong>
              </div>
              <div>
                <span>Base</span>
                <strong>2007–2025</strong>
              </div>
            </div>
          </div>
        </header>

        <section className="panel controls-panel">
          <div className="controls-panel__header">
            <div>
              <div className="eyebrow">Recorte analítico</div>
              <h2>Filtrar o período e o foco principal do painel</h2>
            </div>
            <div className="controls-panel__meta">
              <span>{visible.length} anos selecionados</span>
              <strong>{formatNumber(totalBirths)} nascidos vivos</strong>
            </div>
          </div>

          <div className="preset-row">
            <button className={preset === 'p1' ? 'chip chip--active' : 'chip'} onClick={() => presetRange('p1')}>2007–2014</button>
            <button className={preset === 'p2' ? 'chip chip--active' : 'chip'} onClick={() => presetRange('p2')}>2015–2025</button>
            <button className={preset === 'full' ? 'chip chip--active' : 'chip'} onClick={() => presetRange('full')}>2007–2025</button>
            <button className={preset === 'custom' ? 'chip chip--active' : 'chip'} onClick={() => presetRange('custom')}>Recorte livre</button>
          </div>

          <div className="range-grid">
            <label>
              <span>Ano inicial</span>
              <input type="range" min={0} max={YEAR_DATA.length - 1} value={rangeStart} onChange={onRangeChange(setRangeStart)} />
              <strong>{YEAR_DATA[rangeStart]?.year}</strong>
            </label>
            <label>
              <span>Ano final</span>
              <input type="range" min={0} max={YEAR_DATA.length - 1} value={rangeEnd} onChange={onRangeChange(setRangeEnd)} />
              <strong>{YEAR_DATA[rangeEnd]?.year}</strong>
            </label>
            <label>
              <span>Indicador em destaque</span>
              <select value={focus} onChange={(event) => setFocus(event.target.value as FocusKey)}>
                <option value="natalidade">Taxa de natalidade</option>
                <option value="materna">Razão de mortalidade materna</option>
                <option value="infantil">Mortalidade infantil</option>
              </select>
            </label>
          </div>
        </section>

        <section className="kpi-grid">
          <MetricCard
            label="Nascidos vivos"
            value={formatNumber(totalBirths)}
            delta={formatPercent(signedDelta(totalBirths, sum(YEAR_DATA.map((item) => item.births))))}
            deltaLabel="vs. base histórica"
            note="Acumulado do recorte ativo com leitura rápida do volume de nascimentos."
            tone="neutral"
          />
          <MetricCard
            label="Razão agregada de mortalidade materna"
            value={formatNumber(avgMaterna, 2)}
            delta={maternaDelta < 0 ? formatPercent(maternaDelta) : `+${formatNumber(maternaDelta, 1)}%`}
            deltaLabel="P2 vs P1"
            note="Mostra a pressão relativa sobre a série histórica e o comportamento entre períodos."
            tone={metricTone(maternaDelta, true)}
          />
          <MetricCard
            label="Taxa de mortalidade infantil"
            value={formatNumber(avgInfantil, 2)}
            delta={infantilDelta < 0 ? formatPercent(infantilDelta) : `+${formatNumber(infantilDelta, 1)}%`}
            deltaLabel="P2 vs P1"
            note="Indicador sensível à qualidade assistencial e ao acompanhamento pós-natal."
            tone={metricTone(infantilDelta, true)}
          />
          <MetricCard
            label="Consultas pré-natal 7+"
            value={formatNumber(consultasLatest)}
            delta={formatPercent(consultasDelta)}
            deltaLabel="crescimento do recorte"
            note="Leitura de cobertura assistencial e adesão às consultas recomendadas."
            tone="good"
          />
        </section>

        <section className="workspace-grid">
          <div className="workspace-grid__main">
            <ChartFrame
              eyebrow="Série temporal principal"
              title={FOCUS_LABELS[focus]}
              subtitle="Comparativo visual entre Alagoas e a referência nacional, com leitura limiar e tendência de médio prazo."
              action={<span className="chart-chip">{startYear} → {endYear}</span>}
            >
              <div className="chart-legend">
                <span><i className="legend legend--al" /> Alagoas</span>
                <span><i className="legend legend--br" /> Brasil</span>
              </div>

              <div className="chart-shell chart-shell--large">
                <svg viewBox="0 0 760 320" role="img" aria-label="Gráfico de linhas da taxa de natalidade">
                  <defs>
                    <linearGradient id="areaAl" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(14, 116, 144, 0.26)" />
                      <stop offset="100%" stopColor="rgba(14, 116, 144, 0.04)" />
                    </linearGradient>
                    <linearGradient id="areaBr" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(109, 40, 217, 0.18)" />
                      <stop offset="100%" stopColor="rgba(109, 40, 217, 0.03)" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3, 4].map((tick) => {
                    const y = 28 + ((320 - 56) / 4) * tick
                    return <line key={tick} x1="28" y1={y} x2="732" y2={y} className="chart-grid" />
                  })}
                  {natalidadeArea ? <path d={natalidadeArea} fill="url(#areaAl)" /> : null}
                  {natalidadeBrArea ? <path d={natalidadeBrArea} fill="url(#areaBr)" /> : null}
                  <path d={makeLinePath(natalidadeBrPoints)} className="chart-line chart-line--br" />
                  <path d={makeLinePath(natalidadePoints)} className="chart-line chart-line--al" />
                  {natalidadePoints.map((point, index) => (
                    <circle key={`al-${visible[index]?.year}`} cx={point.x} cy={point.y} r="3.8" className="chart-dot chart-dot--al" />
                  ))}
                  {natalidadeBrPoints.map((point, index) => (
                    <circle key={`br-${visible[index]?.year}`} cx={point.x} cy={point.y} r="3" className="chart-dot chart-dot--br" />
                  ))}
                  {visible.map((item, index) => {
                    if (index % 3 !== 0 && index !== visible.length - 1) return null
                    const point = natalidadePoints[index]
                    return (
                      <g key={item.year}>
                        <line x1={point.x} y1="290" x2={point.x} y2="296" className="chart-tick" />
                        <text x={point.x} y="312" textAnchor="middle" className="chart-label">{item.year}</text>
                      </g>
                    )
                  })}
                </svg>
              </div>

              <div className="chart-footer">
                <div>
                  <span>Média selecionada</span>
                  <strong>{formatNumber(natalidadeAvg, 2)}</strong>
                </div>
                <div>
                  <span>Referência Brasil</span>
                  <strong>{formatNumber(natalidadePrev, 2)}</strong>
                </div>
                <div>
                  <span>Variação P2 vs P1</span>
                  <strong className={natalidadeDelta < 0 ? 'text-good' : 'text-bad'}>
                    {formatPercent(natalidadeDelta)}
                  </strong>
                </div>
              </div>
            </ChartFrame>

            <div className="double-grid">
              <ChartFrame
                eyebrow="Monitoramento hospitalar e territorial"
                title="Razão de mortalidade materna"
                subtitle="Barra por ano com destaque visual para picos e convergência com a meta ODS."
              >
                <div className="chart-shell chart-shell--bar">
                  <svg viewBox="0 0 760 300" role="img" aria-label="Gráfico de barras da razão de mortalidade materna">
                    {[0, 1, 2, 3, 4].map((tick) => {
                      const y = 30 + ((300 - 70) / 4) * tick
                      return <line key={tick} x1="32" y1={y} x2="728" y2={y} className="chart-grid" />
                    })}
                    {visible.map((item, index) => {
                      const max = Math.max(...maternaBars)
                      const barHeight = ((item.mortalidadeMaterna / max) * 210) + 8
                      const x = 44 + index * ((760 - 88) / Math.max(visible.length, 1))
                      const y = 252 - barHeight
                      return (
                        <g key={item.year}>
                          <rect
                            x={x}
                            y={y}
                            width={Math.max(20, (760 - 88) / Math.max(visible.length, 1) - 4)}
                            height={barHeight}
                            rx="10"
                            className={item.mortalidadeMaterna >= 70 ? 'bar bar--peak' : 'bar'}
                          />
                          <text x={x + 10} y={Math.max(y - 6, 24)} textAnchor="middle" className="chart-value">{formatNumber(item.mortalidadeMaterna, 1)}</text>
                          {index % 3 === 0 || index === visible.length - 1 ? (
                            <text x={x + 10} y="286" textAnchor="middle" className="chart-label">{item.year}</text>
                          ) : null}
                        </g>
                      )
                    })}
                  </svg>
                </div>
                <div className="chart-footer">
                  <div>
                    <span>Média P1</span>
                    <strong>{formatNumber(firstMaterna, 2)}</strong>
                  </div>
                  <div>
                    <span>Média P2</span>
                    <strong>{formatNumber(secondMaterna, 2)}</strong>
                  </div>
                  <div>
                    <span>Leitura</span>
                    <strong className={maternaDelta < 0 ? 'text-good' : 'text-warn'}>
                      {maternaDelta < 0 ? 'Alívio relativo' : 'Oscilação crítica'}
                    </strong>
                  </div>
                </div>
              </ChartFrame>

              <ChartFrame
                eyebrow="Taxa sensível à atenção básica"
                title="Mortalidade infantil"
                subtitle="Linha contínua para verificar se o avanço do cuidado pré-natal aparece também no pós-parto."
              >
                <div className="chart-shell chart-shell--small">
                  <svg viewBox="0 0 760 260" role="img" aria-label="Gráfico de linhas da mortalidade infantil">
                    {[0, 1, 2, 3].map((tick) => {
                      const y = 28 + ((260 - 56) / 3) * tick
                      return <line key={tick} x1="28" y1={y} x2="732" y2={y} className="chart-grid" />
                    })}
                    {infantilPoints.length ? <path d={makeLinePath(infantilPoints)} className="chart-line chart-line--infant" /> : null}
                    {infantilPoints.map((point, index) => (
                      <circle key={`inf-${visible[index]?.year}`} cx={point.x} cy={point.y} r="3.6" className="chart-dot chart-dot--infant" />
                    ))}
                    {visible.map((item, index) => {
                      if (index % 3 !== 0 && index !== visible.length - 1) return null
                      const point = infantilPoints[index]
                      return (
                        <g key={item.year}>
                          <line x1={point.x} y1="228" x2={point.x} y2="234" className="chart-tick" />
                          <text x={point.x} y="246" textAnchor="middle" className="chart-label">{item.year}</text>
                        </g>
                      )
                    })}
                  </svg>
                </div>
                <div className="chart-footer">
                  <div>
                    <span>Média P1</span>
                    <strong>{formatNumber(firstInfantil, 2)}</strong>
                  </div>
                  <div>
                    <span>Média P2</span>
                    <strong>{formatNumber(secondInfantil, 2)}</strong>
                  </div>
                  <div>
                    <span>Tendência</span>
                    <strong className={infantilDelta < 0 ? 'text-good' : 'text-warn'}>
                      {infantilDelta < 0 ? 'Descendente' : 'Ascendente'}
                    </strong>
                  </div>
                </div>
              </ChartFrame>
            </div>
          </div>

          <aside className="workspace-grid__side">
            <section className="panel side-panel side-panel--focus">
              <div className="eyebrow">Comparativo do período</div>
              <h2>Leitura executiva entre as duas fases</h2>
              <p>Os dials abaixo espelham o comportamento médio do indicador em cada ciclo do painel.</p>
              <div className="dial-grid">
                <MiniDial label="Taxa de natalidade · P1" value={firstPeriod} target={17.04} unit="" tone="good" />
                <MiniDial label="Taxa de natalidade · P2" value={secondPeriod} target={14.71} unit="" tone="good" />
              </div>
              <ComparisonBar label="Natalidade média" value={secondPeriod} reference={firstPeriod} accent="linear-gradient(135deg, #0e7490, #14b8a6)" />
              <ComparisonBar label="Mortalidade materna" value={secondMaterna} reference={firstMaterna} accent="linear-gradient(135deg, #b45309, #f97316)" />
              <ComparisonBar label="Mortalidade infantil" value={secondInfantil} reference={firstInfantil} accent="linear-gradient(135deg, #4f46e5, #7c3aed)" />
            </section>

            <section className="panel side-panel">
              <div className="eyebrow">Notas inteligentes</div>
              <h2>O que o painel sugere hoje</h2>
              <ul className="insight-list">
                <li>
                  <strong>Queda estrutural da natalidade:</strong> o período mais recente opera abaixo do ciclo inicial, sugerindo mudança demográfica e pressão menor sobre o volume absoluto de nascimentos.
                </li>
                <li>
                  <strong>Picos críticos de mortalidade materna:</strong> os anos de ruptura chamam atenção para revisão de rede, fluxos e resolutividade hospitalar.
                </li>
                <li>
                  <strong>Pré-natal em avanço:</strong> o crescimento de consultas reforça a importância da busca ativa e do acompanhamento gestacional.
                </li>
              </ul>
            </section>

            <section className="panel side-panel">
              <div className="eyebrow">Metas e leitura rápida</div>
              <h2>Resumo operacional</h2>
              <div className="summary-grid">
                <div>
                  <span>Meta ODS</span>
                  <strong>&lt;= 30</strong>
                </div>
                <div>
                  <span>RMM agregada</span>
                  <strong>{formatNumber(avgMaterna, 2)}</strong>
                </div>
                <div>
                  <span>TMI agregada</span>
                  <strong>{formatNumber(avgInfantil, 2)}</strong>
                </div>
                <div>
                  <span>Consultas 7+</span>
                  <strong>{formatNumber(consultasLatest)}</strong>
                </div>
              </div>
              <div className="summary-footnote">
                Painel desenhado para leitura rápida, com contraste forte, densidade executiva e adaptação mobile-first.
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  )
}

export default App
