/**
 * Lightweight photo lookup using Wikipedia/Wikimedia Commons.
 *
 * We try a series of search variations for the place; first hit wins.
 * Results are cached in localStorage to avoid hitting the API repeatedly.
 *
 * If nothing useful is found we fall back to a curated scenic photo
 * by city / state — all hosted on Wikimedia Commons (CC-licensed).
 */

import type { Place } from './types'

export interface PhotoResult {
  src: string
  source: string // human label (e.g. "Wikipedia")
  href: string // link back to the source page
  attribution?: string
  fallback?: boolean
}

const CACHE_KEY = 'litoral-photo-cache-v1'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 days
const MAX_CACHE_ENTRIES = 200

interface CacheEntry {
  ts: number
  result: PhotoResult | null
}

type Cache = Record<string, CacheEntry>

function readCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Cache
  } catch {
    return {}
  }
}

function writeCache(cache: Cache) {
  try {
    const entries = Object.entries(cache)
    if (entries.length > MAX_CACHE_ENTRIES) {
      const sorted = entries.sort((a, b) => b[1].ts - a[1].ts).slice(0, MAX_CACHE_ENTRIES)
      cache = Object.fromEntries(sorted) as Cache
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // ignore — quota or privacy mode
  }
}

function cacheKey(place: Place): string {
  return `${place.osm_type}-${place.osm_id}`
}

/** Curated CC-licensed Wikimedia Commons fallbacks per state / city. */
const FALLBACK_BY_CITY: Record<string, PhotoResult> = {
  Maceió: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Praia_Paju%C3%A7ara_Macei%C3%B3.jpg/1280px-Praia_Pajucara_Maceio.jpg',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Praia_Paju%C3%A7ara_Macei%C3%B3.jpg',
    attribution: 'Foto: Wikimedia Commons',
    fallback: true,
  },
  Maragogi: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Maragogi_-_Alagoas.jpg/1280px-Maragogi_-_Alagoas.jpg',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Maragogi_-_Alagoas.jpg',
    attribution: 'Foto: Wikimedia Commons',
    fallback: true,
  },
  'São Miguel dos Milagres': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Praia_de_S%C3%A3o_Miguel_dos_Milagres.jpg/1280px-Praia_de_S%C3%A3o_Miguel_dos_Milagres.jpg',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Praia_de_S%C3%A3o_Miguel_dos_Milagres.jpg',
    attribution: 'Foto: Wikimedia Commons',
    fallback: true,
  },
  Salvador: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Pelourinho_Salvador.jpg/1280px-Pelourinho_Salvador.jpg',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Pelourinho_Salvador.jpg',
    attribution: 'Foto: Wikimedia Commons',
    fallback: true,
  },
  'Porto Seguro': {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Porto_Seguro_BA_-_panoramio.jpg/1280px-Porto_Seguro_BA_-_panoramio.jpg',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Porto_Seguro_BA_-_panoramio.jpg',
    attribution: 'Foto: Wikimedia Commons',
    fallback: true,
  },
  Lençóis: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Len%C3%A7%C3%B3is_-_Bahia.jpg/1280px-Len%C3%A7%C3%B3is_-_Bahia.jpg',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/File:Len%C3%A7%C3%B3is_-_Bahia.jpg',
    attribution: 'Foto: Wikimedia Commons',
    fallback: true,
  },
}

const FALLBACK_BY_STATE: Record<string, PhotoResult> = {
  AL: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Praia_Pajucara_Maceio.jpg/1280px-Praia_Pajucara_Maceio.jpg',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/Category:Alagoas',
    attribution: 'Cena de Alagoas — Wikimedia Commons',
    fallback: true,
  },
  BA: {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Pelourinho_Salvador.jpg/1280px-Pelourinho_Salvador.jpg',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/Category:Bahia',
    attribution: 'Cena da Bahia — Wikimedia Commons',
    fallback: true,
  },
}

function fallbackFor(place: Place): PhotoResult {
  if (place.city && FALLBACK_BY_CITY[place.city]) return FALLBACK_BY_CITY[place.city]
  if (FALLBACK_BY_STATE[place.state_code]) return FALLBACK_BY_STATE[place.state_code]
  return {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Praia_Pajucara_Maceio.jpg/1280px-Praia_Pajucara_Maceio.jpg',
    source: 'Wikimedia Commons',
    href: 'https://commons.wikimedia.org/wiki/Main_Page',
    fallback: true,
  }
}

interface WikiSearchResult {
  query?: {
    pages?: Record<
      string,
      {
        pageid: number
        title: string
        thumbnail?: { source: string; width: number; height: number }
        original?: { source: string }
        fullurl?: string
        canonicalurl?: string
      }
    >
  }
}

async function wikiThumbForQuery(query: string): Promise<PhotoResult | null> {
  const url = new URL('https://pt.wikipedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', query)
  url.searchParams.set('gsrlimit', '3')
  url.searchParams.set('prop', 'pageimages|info')
  url.searchParams.set('inprop', 'url')
  url.searchParams.set('piprop', 'thumbnail|original')
  url.searchParams.set('pithumbsize', '900')
  try {
    const res = await fetch(url.toString())
    if (!res.ok) return null
    const data = (await res.json()) as WikiSearchResult
    const pages = data.query?.pages
    if (!pages) return null
    for (const page of Object.values(pages)) {
      const src = page.original?.source || page.thumbnail?.source
      if (src) {
        return {
          src,
          source: 'Wikipedia',
          href: page.canonicalurl || page.fullurl || `https://pt.wikipedia.org/?curid=${page.pageid}`,
          attribution: `Wikipedia: ${page.title}`,
        }
      }
    }
  } catch {
    // network error
  }
  return null
}

function buildQueries(place: Place): string[] {
  const queries: string[] = []
  if (place.name) {
    if (place.city) {
      queries.push(`${place.name} ${place.city}`)
    }
    queries.push(`${place.name} ${place.state_name}`)
    queries.push(place.name)
  }
  if (place.city) queries.push(`${place.city} ${place.state_name}`)
  return Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean)))
}

/** Public entry. Best-effort photo lookup — never throws. */
export async function lookupPhoto(place: Place, signal?: AbortSignal): Promise<PhotoResult> {
  const cache = readCache()
  const key = cacheKey(place)
  const cached = cache[key]
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    if (cached.result) return cached.result
    return fallbackFor(place)
  }

  const queries = buildQueries(place)
  for (const q of queries) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const r = await wikiThumbForQuery(q)
    if (r) {
      cache[key] = { ts: Date.now(), result: r }
      writeCache(cache)
      return r
    }
  }
  cache[key] = { ts: Date.now(), result: null }
  writeCache(cache)
  return fallbackFor(place)
}
