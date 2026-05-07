import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import './App.css'

type StateCode = 'ALL' | 'AL' | 'BA'
type Tier = 'A' | 'B' | 'C' | 'D'
type SortKey = 'score_desc' | 'rank_asc' | 'stars_desc' | 'contact_desc' | 'city_asc' | 'name_asc'
type ContactFilter = 'all' | 'with-contact' | 'phone' | 'website' | 'email'

type AmenityKey = 'wifi' | 'air_conditioning' | 'wheelchair' | 'parking' | 'restaurant' | 'pool'

type HotelRecord = {
  rank: number
  score: number
  tier: Tier
  tourism: string
  type_label: string
  name: string
  city: string | null
  state: string
  address: string | null
  phone: string | null
  website: string | null
  email: string | null
  stars: number | null
  opening_hours: string | null
  wheelchair: string | null
  parking: string | null
  wifi: string | null
  air_conditioning: string | null
  restaurant: string | null
  pool: string | null
  lat: number | null
  lon: number | null
  google_maps: string | null
  osm_url: string | null
  osm_type: string | null
  osm_id: number | string | null
  tags_count: number | null
  relevant_tags: string | null
  state_code: 'AL' | 'BA'
  state_name: string
  location_label: string
  has_phone: boolean
  has_website: boolean
  has_email: boolean
  has_contact: boolean
  photo_query: string
  score_band: 'premium' | 'opportunity' | 'long_tail'
}

type StatePayload = {
  stateCode: 'AL' | 'BA'
  stateName: string
  summary: {
    total: number
    scoreAvg: number
    scoreMedian: number
    scoreMin: number
    scoreMax: number
    tierCounts: Record<string, number>
    typeCounts: Record<string, number>
    cityCounts: Record<string, number>
    contactCounts: Record<string, number>
    amenityCounts: Record<string, number>
    starAvg: number
    starNonZero: number
    topSample: Array<Record<string, unknown>>
    areaNote: string
    source: string
  }
  records: HotelRecord[]
}

type Filters = {
  state: StateCode
  search: string
  city: string
  tier: 'all' | Tier
  typeLabel: string
  minScore: number
  minStars: number
  contact: ContactFilter
  amenities: Record<AmenityKey, boolean>
  sort: SortKey
}

type PhotoState = {
  loading: boolean
  urls: string[]
  source: string
}

type PhotoCache = Record<string, PhotoState>

type Stats = {
  total: number
  avgScore: number
  topCount: number
  contactCount: number
  websiteCount: number
  phoneCount: number
  emailCount: number
  premiumCount: number
  averageStars: number
}

const PHOTO_CACHE_KEY = 'litoral-intelligence-photo-cache-v1'
const FILTERS_KEY = 'litoral-intelligence-filters-v1'
const SELECTED_KEY = 'litoral-intelligence-selected-v1'

const STATE_LABELS: Record<StateCode, string> = {
  ALL: 'Todos',
  AL: 'Alagoas',
  BA: 'Bahia',
}

const AMENITIES: Array<{ key: AmenityKey; label: string }> = [
  { key: 'wifi', label: 'Wi‑Fi' },
  { key: 'air_conditioning', label: 'Ar-cond.' },
  { key: 'wheelchair', label: 'Acessível' },
  { key: 'parking', label: 'Estacion.' },
  { key: 'restaurant', label: 'Restaur.' },
  { key: 'pool', label: 'Piscina' },
]

const INITIAL_FILTERS: Filters = {
  state: 'ALL',
  search: '',
  city: 'all',
  tier: 'all',
  typeLabel: 'all',
  minScore: 0,
  minStars: 0,
  contact: 'all',
  amenities: {
    wifi: false,
    air_conditioning: false,
    wheelchair: false,
    parking: false,
    restaurant: false,
    pool: false,
  },
  sort: 'score_desc',
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

function formatStars(value: number | null) {
  if (!value || value <= 0) return '—'
  return `${value.toFixed(1)}★`
}

function formatCompactContact(record: HotelRecord) {
  const pieces = [record.city || '—', record.state]
  return pieces.join(' · ')
}

function mapUrl(record: HotelRecord) {
  if (record.google_maps) return record.google_maps
  if (record.lat != null && record.lon != null) {
    return `https://www.google.com/maps/search/?api=1&query=${record.lat},${record.lon}`
  }
  return '#'
}

function osmUrl(record: HotelRecord) {
  if (record.osm_url) return record.osm_url
  return '#'
}

function scoreBandColor(tier: Tier) {
  switch (tier) {
    case 'A':
      return 'var(--accent-ink)'
    case 'B':
      return 'var(--accent-gold)'
    case 'C':
      return 'var(--accent-ocean)'
    default:
      return 'var(--muted-2)'
  }
}

function getAmenityValue(record: HotelRecord, key: AmenityKey) {
  const value = record[key]
  return value != null && value !== '' && value !== 'no' && value !== 'No' && value !== '0'
}

function buildContactScore(record: HotelRecord) {
  return (record.has_phone ? 1 : 0) + (record.has_website ? 1 : 0) + (record.has_email ? 1 : 0)
}

function filterRecords(records: HotelRecord[], filters: Filters) {
  const q = normalizeText(filters.search)
  const city = normalizeText(filters.city)
  const type = normalizeText(filters.typeLabel)

  return records.filter((record) => {
    if (filters.minScore && safeNumber(record.score) < filters.minScore) return false
    if (filters.minStars && safeNumber(record.stars) < filters.minStars) return false
    if (filters.tier !== 'all' && record.tier !== filters.tier) return false
    if (filters.city !== 'all') {
      const recordCity = normalizeText(record.city || '')
      if (!recordCity || recordCity !== city) return false
    }
    if (filters.typeLabel !== 'all' && normalizeText(record.type_label) !== type) return false
    if (filters.contact === 'with-contact' && !record.has_contact) return false
    if (filters.contact === 'phone' && !record.has_phone) return false
    if (filters.contact === 'website' && !record.has_website) return false
    if (filters.contact === 'email' && !record.has_email) return false

    for (const amenity of AMENITIES) {
      if (filters.amenities[amenity.key] && !getAmenityValue(record, amenity.key)) return false
    }

    if (q) {
      const haystack = [
        record.name,
        record.city ?? '',
        record.state,
        record.address ?? '',
        record.type_label,
        record.tourism,
        record.phone ?? '',
        record.website ?? '',
        record.email ?? '',
        record.relevant_tags ?? '',
      ]
        .map(normalizeText)
        .join(' ')
      if (!haystack.includes(q)) return false
    }

    return true
  })
}

function sortRecords(records: HotelRecord[], sort: SortKey) {
  return [...records].sort((a, b) => {
    switch (sort) {
      case 'rank_asc':
        return a.rank - b.rank
      case 'stars_desc':
        return safeNumber(b.stars) - safeNumber(a.stars) || b.score - a.score
      case 'contact_desc':
        return buildContactScore(b) - buildContactScore(a) || b.score - a.score
      case 'city_asc':
        return (a.city || 'zzz').localeCompare(b.city || 'zzz', 'pt-BR') || b.score - a.score
      case 'name_asc':
        return a.name.localeCompare(b.name, 'pt-BR')
      case 'score_desc':
      default:
        return b.score - a.score || a.rank - b.rank
    }
  })
}

function computeStats(records: HotelRecord[]): Stats {
  const total = records.length
  const scores = records.map((item) => item.score)
  const stars = records.map((item) => safeNumber(item.stars)).filter((value) => value > 0)
  return {
    total,
    avgScore: total ? round(scores.reduce((acc, item) => acc + item, 0) / total, 1) : 0,
    topCount: records.filter((item) => item.tier === 'A').length,
    contactCount: records.filter((item) => item.has_contact).length,
    websiteCount: records.filter((item) => item.has_website).length,
    phoneCount: records.filter((item) => item.has_phone).length,
    emailCount: records.filter((item) => item.has_email).length,
    premiumCount: records.filter((item) => item.score >= 70).length,
    averageStars: stars.length ? round(stars.reduce((acc, item) => acc + item, 0) / stars.length, 1) : 0,
  }
}

function createInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function stateAccent(record: HotelRecord) {
  return record.state_code === 'AL' ? 'var(--accent-gold)' : 'var(--accent-ocean)'
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildFallbackPhotoDataUri(record: HotelRecord, variant: 'hero' | 'thumb-a' | 'thumb-b') {
  const isAl = record.state_code === 'AL'
  const gradients = isAl
    ? {
        base: variant === 'hero' ? ['#0f172a', '#134e4a'] : variant === 'thumb-a' ? ['#155e75', '#0ea5e9'] : ['#7c3aed', '#4c1d95'],
        accent: ['#f59e0b', '#fbbf24'],
      }
    : {
        base: variant === 'hero' ? ['#111827', '#3b82f6'] : variant === 'thumb-a' ? ['#0c4a6e', '#2563eb'] : ['#7c3aed', '#9333ea'],
        accent: ['#10b981', '#34d399'],
      }
  const title = escapeXml(record.name.length > 30 ? `${record.name.slice(0, 30).trim()}…` : record.name)
  const location = escapeXml([record.city || record.state_name, record.state_code].filter(Boolean).join(' · '))
  const badge = escapeXml(`${record.tier} • ${record.score.toFixed(0)}`)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1200" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          ${gradients.base.map((color, index) => `<stop offset="${index === 0 ? 0 : 100}%" stop-color="${color}"/>`).join('')}
        </linearGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="1200" rx="56" fill="url(#bg)"/>
      <circle cx="1320" cy="180" r="220" fill="${gradients.accent[0]}" fill-opacity="0.22"/>
      <circle cx="1360" cy="900" r="320" fill="${gradients.accent[1]}" fill-opacity="0.18"/>
      <path d="M0 860 C 240 760, 360 1100, 640 980 C 920 860, 1060 560, 1360 620 C 1480 645, 1550 690, 1600 740 L 1600 1200 L 0 1200 Z" fill="url(#shine)"/>
      <path d="M0 930 C 260 820, 430 1180, 720 1040 C 980 915, 1120 650, 1600 780" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="18" stroke-linecap="round"/>
      <g transform="translate(90 96)">
        <rect x="0" y="0" width="220" height="68" rx="34" fill="#ffffff" fill-opacity="0.14" stroke="#ffffff" stroke-opacity="0.18"/>
        <text x="32" y="44" fill="#fff" font-size="28" font-family="Inter, Arial, sans-serif" font-weight="700">${badge}</text>
      </g>
      <g transform="translate(90 260)">
        <text x="0" y="0" fill="#fff" font-size="64" font-family="Fraunces, Georgia, serif" font-weight="700">${title}</text>
        <text x="0" y="76" fill="#fff" fill-opacity="0.88" font-size="34" font-family="Inter, Arial, sans-serif" font-weight="500">${location}</text>
      </g>
      <g transform="translate(90 950)">
        <rect x="0" y="0" width="380" height="120" rx="28" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.16"/>
        <text x="28" y="50" fill="#fff" fill-opacity="0.84" font-size="24" font-family="Inter, Arial, sans-serif" font-weight="600">Foto não disponível</text>
        <text x="28" y="88" fill="#fff" fill-opacity="0.68" font-size="22" font-family="Inter, Arial, sans-serif">Visual de fallback premium</text>
      </g>
    </svg>
  `
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

async function fetchWikiPhotos(query: string) {
  const searches = [
    `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4&prop=pageimages|info&piprop=thumbnail&pithumbsize=1600&inprop=url&origin=*`,
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=4&prop=imageinfo&iiprop=url|size&iiurlwidth=1600&origin=*`,
  ]

  const urls: string[] = []
  for (const apiUrl of searches) {
    try {
      const response = await fetch(apiUrl)
      if (!response.ok) continue
      const data = await response.json()
      const pages = data?.query?.pages ? Object.values(data.query.pages) : []
      for (const page of pages as Array<Record<string, unknown>>) {
        const thumb = page.thumbnail as { source?: string } | undefined
        const imageInfo = Array.isArray(page.imageinfo) ? page.imageinfo[0] as { url?: string } : undefined
        const source = thumb?.source || imageInfo?.url
        if (source && !urls.includes(source)) urls.push(source)
      }
    } catch {
      // ignore network lookup failures and rely on fallback imagery
    }
  }

  return urls
}

function useHotelPhotos(record: HotelRecord | null) {
  const [state, setState] = useState<PhotoState>({ loading: false, urls: [], source: 'fallback visual' })

  useEffect(() => {
    let active = true
    if (!record) {
      setState({ loading: false, urls: [], source: 'fallback visual' })
      return
    }

    const key = `${record.state_code}-${record.osm_type ?? ''}-${record.osm_id ?? ''}-${record.rank}`
    try {
      const cachedRaw = window.localStorage.getItem(PHOTO_CACHE_KEY)
      if (cachedRaw) {
        const cache = JSON.parse(cachedRaw) as PhotoCache
        const cached = cache[key]
        if (cached) {
          setState(cached)
          return
        }
      }
    } catch {
      // ignore cache parse issues
    }

    setState({ loading: true, urls: [], source: 'Wikimedia Commons' })
    const query = [record.name, record.city, record.state_name].filter(Boolean).join(' ')

    void (async () => {
      const wiki = await fetchWikiPhotos(query)
      const next = {
        loading: false,
        urls: wiki,
        source: wiki.length ? 'Wikimedia Commons' : 'fallback visual',
      }
      if (!active) return
      setState(next)

      try {
        const raw = window.localStorage.getItem(PHOTO_CACHE_KEY)
        const cache = raw ? (JSON.parse(raw) as PhotoCache) : {}
        cache[key] = next
        window.localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cache))
      } catch {
        // best effort cache
      }
    })()

    return () => {
      active = false
    }
  }, [record])

  return state
}

function preloadImage(src: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.referrerPolicy = 'no-referrer'
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = src
  })
}

function PhotoFrame({
  sources,
  fallbackSource,
  alt,
  className,
  variant,
}: {
  sources: string[]
  fallbackSource: string
  alt: string
  className: string
  variant: 'hero' | 'thumb-a' | 'thumb-b'
}) {
  const [resolvedSource, setResolvedSource] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setResolvedSource('')

    void (async () => {
      for (const source of sources) {
        const ok = await preloadImage(source)
        if (!active) return
        if (ok) {
          setResolvedSource(source)
          setLoading(false)
          return
        }
      }
      if (!active) return
      setResolvedSource(fallbackSource)
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [sources, fallbackSource, variant])

  const fallbackSelected = resolvedSource === fallbackSource
  return (
    <div className={`photo-frame ${className} ${fallbackSelected ? 'fallback-selected' : ''}`}>
      {loading ? (
        <div className="photo-skeleton photo-skeleton-overlay">Buscando imagem premium...</div>
      ) : resolvedSource ? (
        <img src={resolvedSource} alt={alt} className="photo-media" />
      ) : (
        <div className="photo-skeleton photo-skeleton-overlay">Imagem indisponível</div>
      )}
    </div>
  )
}

function App() {
  const mapRef = useRef<L.Map | null>(null)
  const mapNodeRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payloads, setPayloads] = useState<Record<'AL' | 'BA', StatePayload> | null>(null)
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(SELECTED_KEY) ?? ''
  })
  const [filters, setFilters] = useState<Filters>(() => {
    if (typeof window === 'undefined') return INITIAL_FILTERS
    try {
      const raw = window.localStorage.getItem(FILTERS_KEY)
      if (!raw) return INITIAL_FILTERS
      const parsed = JSON.parse(raw) as Partial<Filters>
      return {
        ...INITIAL_FILTERS,
        ...parsed,
        amenities: { ...INITIAL_FILTERS.amenities, ...(parsed.amenities ?? {}) },
      }
    } catch {
      return INITIAL_FILTERS
    }
  })

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const [al, ba] = await Promise.all([
          fetch('/data/hotelaria-al.json').then((response) => response.json() as Promise<StatePayload>),
          fetch('/data/hotelaria-ba.json').then((response) => response.json() as Promise<StatePayload>),
        ])
        if (!active) return
        setPayloads({ AL: al, BA: ba })
        setError('')
      } catch {
        if (!active) return
        setError('Não consegui carregar os dados dos dois estados.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const allRecords = useMemo(() => {
    if (!payloads) return []
    return [...payloads.AL.records, ...payloads.BA.records]
  }, [payloads])

  const activeRecords = useMemo(() => {
    const source = filters.state === 'AL' ? payloads?.AL.records : filters.state === 'BA' ? payloads?.BA.records : allRecords
    return source ? sortRecords(filterRecords(source, filters), filters.sort) : []
  }, [allRecords, filters, payloads])

  useEffect(() => {
    if (!activeRecords.length) return
    const selectedStillVisible = activeRecords.some((item) => selectedId ? buildRecordKey(item) === selectedId : false)
    if (!selectedStillVisible) {
      setSelectedId(buildRecordKey(activeRecords[0]))
    }
  }, [activeRecords, selectedId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
  }, [filters])

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedId) return
    window.localStorage.setItem(SELECTED_KEY, selectedId)
  }, [selectedId])

  const cityOptions = useMemo(() => {
    const pool = filters.state === 'AL' ? payloads?.AL.records : filters.state === 'BA' ? payloads?.BA.records : allRecords
    const unique = new Map<string, string>()
    for (const item of pool || []) {
      if (!item.city) continue
      const key = normalizeText(item.city)
      if (!unique.has(key)) unique.set(key, item.city)
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [allRecords, filters.state, payloads])

  const typeOptions = useMemo(() => {
    const pool = filters.state === 'AL' ? payloads?.AL.records : filters.state === 'BA' ? payloads?.BA.records : allRecords
    const unique = new Set<string>()
    for (const item of pool || []) unique.add(item.type_label)
    return [...unique.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [allRecords, filters.state, payloads])

  const selected = useMemo(() => activeRecords.find((item) => buildRecordKey(item) === selectedId) ?? activeRecords[0] ?? null, [activeRecords, selectedId])
  const selectedPhotos = useHotelPhotos(selected)

  const stats = useMemo(() => computeStats(activeRecords), [activeRecords])
  const overallStats = useMemo(() => computeStats(allRecords), [allRecords])

  const tierCounts = useMemo(() => {
    const counter: Record<Tier, number> = { A: 0, B: 0, C: 0, D: 0 }
    for (const item of activeRecords) counter[item.tier] += 1
    return counter
  }, [activeRecords])

  const cityCounts = useMemo(() => {
    const counter = new Map<string, number>()
    for (const item of activeRecords) {
      const city = item.city || 'Sem cidade'
      counter.set(city, (counter.get(city) || 0) + 1)
    }
    return [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [activeRecords])

  const filteredPageSize = 18
  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
  }, [filters.search, filters.city, filters.tier, filters.typeLabel, filters.minScore, filters.minStars, filters.contact, filters.sort, filters.state, JSON.stringify(filters.amenities)])

  const pagedRecords = useMemo(() => {
    const start = (page - 1) * filteredPageSize
    return activeRecords.slice(start, start + filteredPageSize)
  }, [activeRecords, page])

  const totalPages = Math.max(1, Math.ceil(activeRecords.length / filteredPageSize))

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return
    layerRef.current.clearLayers()

    const renderer = L.canvas()
    const bounds = L.latLngBounds([])

    for (const record of activeRecords) {
      if (record.lat == null || record.lon == null) continue
      const marker = L.circleMarker([record.lat, record.lon], {
        renderer,
        radius: record.rank <= 10 ? 9 : 6,
        color: stateAccent(record),
        fillColor: stateAccent(record),
        fillOpacity: record.rank <= 10 ? 0.95 : 0.78,
        weight: buildRecordKey(record) === selectedId ? 2.5 : 1.25,
        opacity: 1,
      })

      const popupHtml = `
        <div style="min-width:180px">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${escapeHtml(record.name)}</div>
          <div style="font-size:12px;color:#555;margin-bottom:8px">${escapeHtml(formatCompactContact(record))}</div>
          <div style="font-size:12px;display:flex;gap:8px;flex-wrap:wrap">
            <span>Score ${record.score}</span>
            <span>${record.tier}</span>
            <span>${formatStars(record.stars)}</span>
          </div>
        </div>
      `
      marker.bindPopup(popupHtml)
      marker.on('click', () => setSelectedId(buildRecordKey(record)))
      marker.addTo(layerRef.current)
      bounds.extend([record.lat, record.lon])
    }

    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds.pad(0.15), { animate: true, duration: 0.4 })
    }
  }, [activeRecords, selectedId])

  useEffect(() => {
    if (loading || !mapNodeRef.current || mapRef.current) return

    const map = L.map(mapNodeRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([-12.5, -39.0], 6)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const layer = L.layerGroup().addTo(map)
    mapRef.current = map
    layerRef.current = layer

    window.requestAnimationFrame(() => {
      map.invalidateSize()
    })

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [loading])

  useEffect(() => {
    if (!selected || !mapRef.current || selected.lat == null || selected.lon == null) return
    mapRef.current.flyTo([selected.lat, selected.lon], Math.max(mapRef.current.getZoom(), 11), { duration: 0.55 })
  }, [selected])

  function buildStateRecordsScope() {
    if (filters.state === 'AL') return payloads?.AL.records ?? []
    if (filters.state === 'BA') return payloads?.BA.records ?? []
    return allRecords
  }

  function updateAmenity(key: AmenityKey) {
    setFilters((current) => ({
      ...current,
      amenities: { ...current.amenities, [key]: !current.amenities[key] },
    }))
  }

  function exportCsv(records: HotelRecord[]) {
    const columns = [
      'rank',
      'score',
      'tier',
      'type_label',
      'name',
      'city',
      'state',
      'address',
      'phone',
      'website',
      'email',
      'stars',
      'lat',
      'lon',
      'google_maps',
      'osm_url',
    ]
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [columns.join(',')]
    for (const item of records) {
      rows.push(
        [
          item.rank,
          item.score,
          item.tier,
          item.type_label,
          item.name,
          item.city ?? '',
          item.state,
          item.address ?? '',
          item.phone ?? '',
          item.website ?? '',
          item.email ?? '',
          item.stars ?? '',
          item.lat ?? '',
          item.lon ?? '',
          item.google_maps ?? '',
          item.osm_url ?? '',
        ]
          .map(quote)
          .join(','),
      )
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `litoral-intelligence-${filters.state.toLowerCase()}-filtered.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function resetFilters() {
    setFilters(INITIAL_FILTERS)
  }

  function buildRecordKey(record: HotelRecord) {
    return `${record.state_code}-${record.osm_type ?? 'x'}-${record.osm_id ?? record.rank}`
  }

  if (loading) {
    return (
      <main className="app-shell">
        <LoadingState />
      </main>
    )
  }

  if (error) {
    return (
      <main className="app-shell">
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <div className="eyebrow-row">
            <span className="eyebrow">Litoral Intelligence</span>
            <span className="eyebrow badge">Hotelaria AL + BA</span>
          </div>
          <h1>Radar premium de hotelaria com ranking, mapa e detalhe por local.</h1>
          <p className="lead">
            Um painel robusto para explorar Alagoas e Bahia com filtros avançados, pins no mapa, indicadores de
            contato e análise de potencial comercial. Tudo sem backend, pronto para validar operação e UX.
          </p>

          <div className="hero-actions">
            <button type="button" className="button button-dark" onClick={() => document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              Explorar ranking
            </button>
            <button type="button" className="button button-light" onClick={() => exportCsv(activeRecords)}>
              Exportar CSV
            </button>
            <button type="button" className="button button-light" onClick={resetFilters}>
              Limpar filtros
            </button>
          </div>
        </div>

        <div className="hero-panel">
          <div className="state-switcher">
            {(['ALL', 'AL', 'BA'] as StateCode[]).map((state) => (
              <button
                key={state}
                type="button"
                className={`state-pill ${filters.state === state ? 'active' : ''}`}
                onClick={() => setFilters((current) => ({ ...current, state }))}
              >
                <span>{STATE_LABELS[state]}</span>
                <strong>{state === 'ALL' ? formatNumber(overallStats.total) : formatNumber((payloads?.[state]?.summary.total ?? 0))}</strong>
              </button>
            ))}
          </div>

          <div className="hero-stats">
            <StatCard label="Resultados filtrados" value={formatNumber(stats.total)} meta={`de ${formatNumber(filters.state === 'ALL' ? overallStats.total : buildStateRecordsScope().length)} locais`} />
            <StatCard label="Score médio" value={`${stats.avgScore}`} meta="qualidade do ranking" />
            <StatCard label="Contato direto" value={formatNumber(stats.contactCount)} meta={`${formatNumber(stats.phoneCount)} telefone · ${formatNumber(stats.websiteCount)} site`} />
            <StatCard label="Tier A" value={formatNumber(tierCounts.A)} meta={`${formatNumber(stats.premiumCount)} com score ≥ 70`} />
          </div>
        </div>
      </section>

      <section className="insights-grid">
        <article className="insight-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Distribuição por tier</p>
              <h2>Ranking por qualidade</h2>
            </div>
            <span className="card-kicker">Atualiza com filtros</span>
          </div>
          <TierBars counts={tierCounts} total={Math.max(stats.total, 1)} />
        </article>

        <article className="insight-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Top cidades</p>
              <h2>Concentração de oferta</h2>
            </div>
            <span className="card-kicker">Top 6</span>
          </div>
          <CityBars rows={cityCounts} total={Math.max(stats.total, 1)} />
        </article>

        <article className="insight-card contact-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Cobertura de contato</p>
              <h2>Capacidade de abordagem</h2>
            </div>
            <span className="card-kicker">Phone / site / e-mail</span>
          </div>
          <ContactCoverage stats={stats} total={Math.max(stats.total, 1)} />
        </article>
      </section>

      <section id="workspace" className="workspace-grid">
        <aside className="filters-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Filtros</p>
              <h2>Controle do painel</h2>
            </div>
            <button type="button" className="pill-button" onClick={resetFilters}>
              Reset
            </button>
          </div>

          <div className="control-group">
            <label className="field">
              <span>Busca</span>
              <input value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} placeholder="Hotel, pousada, cidade, rua, website..." />
            </label>
          </div>

          <div className="control-grid two-up">
            <label className="field">
              <span>Cidade</span>
              <select value={filters.city} onChange={(e) => setFilters((current) => ({ ...current, city: e.target.value }))}>
                <option value="all">Todas</option>
                {cityOptions.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Tipo</span>
              <select value={filters.typeLabel} onChange={(e) => setFilters((current) => ({ ...current, typeLabel: e.target.value }))}>
                <option value="all">Todos</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Tier</span>
              <select value={filters.tier} onChange={(e) => setFilters((current) => ({ ...current, tier: e.target.value as Filters['tier'] }))}>
                <option value="all">Todos</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </label>

            <label className="field">
              <span>Ordenar por</span>
              <select value={filters.sort} onChange={(e) => setFilters((current) => ({ ...current, sort: e.target.value as SortKey }))}>
                <option value="score_desc">Score desc.</option>
                <option value="rank_asc">Ranking</option>
                <option value="stars_desc">Estrelas</option>
                <option value="contact_desc">Contato</option>
                <option value="city_asc">Cidade</option>
                <option value="name_asc">Nome</option>
              </select>
            </label>
          </div>

          <div className="control-grid three-up">
            <label className="field">
              <span>Score mínimo</span>
              <input type="range" min="0" max="100" value={filters.minScore} onChange={(e) => setFilters((current) => ({ ...current, minScore: Number(e.target.value) }))} />
              <small className="hint">{filters.minScore}+ pontos</small>
            </label>

            <label className="field">
              <span>Estrelas mín.</span>
              <select value={filters.minStars} onChange={(e) => setFilters((current) => ({ ...current, minStars: Number(e.target.value) }))}>
                <option value={0}>Qualquer</option>
                <option value={3}>3+</option>
                <option value={4}>4+</option>
                <option value={5}>5</option>
              </select>
            </label>

            <label className="field">
              <span>Contato</span>
              <select value={filters.contact} onChange={(e) => setFilters((current) => ({ ...current, contact: e.target.value as ContactFilter }))}>
                <option value="all">Todos</option>
                <option value="with-contact">Tem contato</option>
                <option value="phone">Telefone</option>
                <option value="website">Website</option>
                <option value="email">E-mail</option>
              </select>
            </label>
          </div>

          <div className="amenities-box">
            <div className="mini-title">Amenidades</div>
            <div className="amenity-grid">
              {AMENITIES.map((amenity) => (
                <button
                  key={amenity.key}
                  type="button"
                  className={`chip ${filters.amenities[amenity.key] ? 'active' : ''}`}
                  onClick={() => updateAmenity(amenity.key)}
                >
                  {amenity.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-footer">
            <button type="button" className="button button-dark full" onClick={() => exportCsv(activeRecords)}>
              Exportar filtrado
            </button>
            <p className="tiny-note">Busca sem acento, ordenação dinâmica e mapa sincronizado.</p>
          </div>
        </aside>

        <section className="main-column">
          <div className="map-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">Mapa interativo</p>
                <h2>Pins clicáveis no OSM</h2>
              </div>
              <span className="card-kicker">{formatNumber(activeRecords.length)} pontos visíveis</span>
            </div>
            <div className="map-wrap">
              <div ref={mapNodeRef} className="map-canvas" aria-label="Mapa interativo com os locais filtrados" />
            </div>
          </div>

          <div className="ranking-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">Ranking</p>
                <h2>Locais em destaque</h2>
              </div>
              <span className="card-kicker">Página {page} de {totalPages}</span>
            </div>

            <div className="ranking-list">
              {pagedRecords.length ? pagedRecords.map((record) => {
                const key = buildRecordKey(record)
                const isSelected = selected ? buildRecordKey(selected) === key : false
                return (
                  <button key={key} type="button" className={`ranking-row ${isSelected ? 'active' : ''}`} onClick={() => setSelectedId(key)}>
                    <div className="rank-badge">
                      <span>{record.rank}</span>
                    </div>
                    <div className="ranking-main">
                      <div className="row-head">
                        <strong>{record.name}</strong>
                        <span className="score-pill" style={{ background: scoreBandColor(record.tier) }}>
                          {record.score}
                        </span>
                      </div>
                      <div className="row-meta">
                        <span>{record.type_label}</span>
                        <span>{record.city || 'Sem cidade'} · {record.state_code}</span>
                        <span>{formatStars(record.stars)}</span>
                        <span>{record.has_contact ? 'Contato pronto' : 'Contato parcial'}</span>
                      </div>
                    </div>
                    <div className="row-tail">
                      <span className={`tier tier-${record.tier}`}>Tier {record.tier}</span>
                      <span>{record.has_website ? 'Site' : 'Sem site'}</span>
                    </div>
                  </button>
                )
              }) : (
                <div className="empty-state large">
                  Nenhum resultado com esses filtros. Tente remover um filtro de cidade, contato ou amenidade.
                </div>
              )}
            </div>

            <div className="pagination">
              <button type="button" className="button button-light" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
                Anterior
              </button>
              <span>{page} / {totalPages}</span>
              <button type="button" className="button button-light" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>
                Próxima
              </button>
            </div>
          </div>
        </section>

        <aside className="detail-panel">
          <div className="card-head">
            <div>
              <p className="eyebrow">Detalhe do local</p>
              <h2>Experiência premium</h2>
            </div>
            {selected && <span className="card-kicker">{selected.state_name}</span>}
          </div>

          {selected ? (
            <>
              <div className="detail-hero">
                <div className="detail-copy">
                  <div className="detail-topline">
                    <span className={`tier tier-${selected.tier}`}>Tier {selected.tier}</span>
                    <span className="detail-score">Score {selected.score}</span>
                  </div>
                  <h3>{selected.name}</h3>
                  <p>{selected.type_label} · {formatCompactContact(selected)}</p>
                </div>
                <div className="detail-badge">
                  <div className="detail-initials">{createInitials(selected.name)}</div>
                  <small>OSM ID</small>
                  <strong>{selected.osm_id ?? '—'}</strong>
                </div>
              </div>

              <div className="detail-photos">
                {selectedPhotos.loading ? (
                  <div className="photo-skeleton">Buscando imagens premium...</div>
                ) : (
                  <div className="photo-grid">
                    <PhotoFrame
                      sources={selectedPhotos.urls}
                      fallbackSource={buildFallbackPhotoDataUri(selected, 'hero')}
                      alt={selected.name}
                      className="photo-main"
                      variant="hero"
                    />
                    <PhotoFrame
                      sources={selectedPhotos.urls}
                      fallbackSource={buildFallbackPhotoDataUri(selected, 'thumb-a')}
                      alt={`${selected.name} detalhe`}
                      className="photo-thumb"
                      variant="thumb-a"
                    />
                    <PhotoFrame
                      sources={selectedPhotos.urls}
                      fallbackSource={buildFallbackPhotoDataUri(selected, 'thumb-b')}
                      alt={`${selected.name} contexto`}
                      className="photo-thumb"
                      variant="thumb-b"
                    />
                  </div>
                )}
                <div className="photo-credit">Fonte: {selectedPhotos.source} · busca por <strong>{selected.photo_query}</strong></div>
              </div>

              <div className="detail-grid">
                <InfoCard label="Cidade" value={selected.city || 'Sem cidade'} />
                <InfoCard label="Estrelas" value={formatStars(selected.stars)} />
                <InfoCard label="Contato" value={selected.has_contact ? 'Pronto' : 'Parcial'} />
                <InfoCard label="Tags" value={selected.tags_count != null ? formatNumber(Number(selected.tags_count)) : '—'} />
              </div>

              <div className="links-box">
                <a href={mapUrl(selected)} target="_blank" rel="noreferrer" className="link-row">
                  <span>Google Maps</span>
                  <strong>Abrir rota</strong>
                </a>
                <a href={osmUrl(selected)} target="_blank" rel="noreferrer" className="link-row">
                  <span>OpenStreetMap</span>
                  <strong>Ver pin</strong>
                </a>
                {selected.website ? (
                  <a href={selected.website} target="_blank" rel="noreferrer" className="link-row">
                    <span>Website</span>
                    <strong>Visitar site</strong>
                  </a>
                ) : null}
              </div>

              <div className="contact-box">
                <div>
                  <span>Telefone</span>
                  <strong>{selected.phone || '—'}</strong>
                </div>
                <div>
                  <span>E-mail</span>
                  <strong>{selected.email || '—'}</strong>
                </div>
                <div>
                  <span>Endereço</span>
                  <strong>{selected.address || '—'}</strong>
                </div>
                <div>
                  <span>Horário</span>
                  <strong>{selected.opening_hours || '—'}</strong>
                </div>
              </div>

              <div className="amenity-box">
                {AMENITIES.map((amenity) => {
                  const active = getAmenityValue(selected, amenity.key)
                  return (
                    <span key={amenity.key} className={`amenity-pill ${active ? 'on' : 'off'}`}>
                      {amenity.label}
                    </span>
                  )
                })}
              </div>

              <div className="detail-footer">
                <button type="button" className="button button-light" onClick={() => activeRecords[0] && setSelectedId(buildRecordKey(activeRecords[0]))}>
                  Primeiro visível
                </button>
                <button type="button" className="button button-dark" onClick={() => exportCsv([selected])}>
                  Exportar este local
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state large">Selecione um local no ranking ou no mapa.</div>
          )}
        </aside>
      </section>

      <footer className="footer-card">
        <div>
          <p className="eyebrow">Base de dados</p>
          <h2>Alagoas + Bahia em um único sistema</h2>
        </div>
        <p>
          Fonte: OpenStreetMap / Overpass API com enriquecimento público. Layout pensado para vender, explorar e
          filtrar a base como um produto premium interno.
        </p>
      </footer>
    </main>
  )
}

function LoadingState() {
  return (
    <section className="state-card center-card">
      <p className="eyebrow">Carregando</p>
      <h1>Litoral Intelligence</h1>
      <p>Preparando os dados de Alagoas e Bahia, pins, rankings e fotos.</p>
      <div className="skeleton-grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </section>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="state-card center-card">
      <p className="eyebrow">Erro</p>
      <h1>Não foi possível abrir o painel</h1>
      <p>{message}</p>
      <button type="button" className="button button-dark" onClick={onRetry}>
        Tentar novamente
      </button>
    </section>
  )
}

function StatCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </article>
  )
}

function TierBars({ counts, total }: { counts: Record<Tier, number>; total: number }) {
  const rows: Array<{ tier: Tier; label: string }> = [
    { tier: 'A', label: 'Tier A' },
    { tier: 'B', label: 'Tier B' },
    { tier: 'C', label: 'Tier C' },
    { tier: 'D', label: 'Tier D' },
  ]
  return (
    <div className="bars-list">
      {rows.map(({ tier, label }) => {
        const value = counts[tier]
        const width = total ? Math.min(100, (value / total) * 100) : 0
        return (
          <div key={tier} className="bar-row">
            <div className="bar-label">
              <span>{label}</span>
              <strong>{formatNumber(value)}</strong>
            </div>
            <div className="bar-track"><span style={{ width: `${width}%`, background: scoreBandColor(tier) }} /></div>
          </div>
        )
      })}
    </div>
  )
}

function CityBars({ rows, total }: { rows: Array<[string, number]>; total: number }) {
  return (
    <div className="bars-list">
      {rows.length ? rows.map(([city, value]) => {
        const width = total ? Math.min(100, (value / total) * 100 * 4) : 0
        return (
          <div key={city} className="bar-row">
            <div className="bar-label">
              <span>{city}</span>
              <strong>{formatNumber(value)}</strong>
            </div>
            <div className="bar-track subtle"><span style={{ width: `${Math.max(12, width)}%` }} /></div>
          </div>
        )
      }) : <div className="empty-state">Sem cidades para mostrar.</div>}
    </div>
  )
}

function ContactCoverage({ stats, total }: { stats: Stats; total: number }) {
  const rows = [
    ['Telefone', stats.phoneCount],
    ['Website', stats.websiteCount],
    ['E-mail', stats.emailCount],
    ['Contato direto', stats.contactCount],
  ] as const

  return (
    <div className="coverage-grid">
      {rows.map(([label, value]) => {
        const width = total ? (value / total) * 100 : 0
        return (
          <div key={label} className="coverage-row">
            <div className="coverage-head">
              <span>{label}</span>
              <strong>{formatNumber(value)}</strong>
            </div>
            <div className="bar-track soft"><span style={{ width: `${width}%` }} /></div>
          </div>
        )
      })}
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="info-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default App
