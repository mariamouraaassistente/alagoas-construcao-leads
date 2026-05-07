export type Tier = 'A' | 'B' | 'C' | 'D'

export type AmenityKey =
  | 'wifi'
  | 'air_conditioning'
  | 'wheelchair'
  | 'parking'
  | 'restaurant'
  | 'pool'

export interface Place {
  rank: number
  score: number
  tier: Tier
  tourism: string | null
  type_label: string
  name: string
  city: string | null
  state: string
  state_code: string
  state_name: string
  address: string | null
  phone: string | null
  website: string | null
  email: string | null
  stars: number
  opening_hours: string | null
  wheelchair: string | null
  parking: string | null
  wifi: string | null
  air_conditioning: string | null
  restaurant: string | null
  pool: string | null
  lat: number
  lon: number
  google_maps: string
  osm_url: string
  osm_type: string
  osm_id: number
  tags_count: number
  relevant_tags: string | null
  location_label: string | null
  has_phone: boolean
  has_website: boolean
  has_email: boolean
  has_contact: boolean
  photo_query: string | null
  score_band: string | null
}

export interface StateSummary {
  stateCode: 'AL' | 'BA'
  stateName: string
  total: number
  scoreAvg: number
  scoreMedian: number
  scoreMin: number
  scoreMax: number
  tierCounts: Record<Tier, number>
  typeCounts: Record<string, number>
  cityCounts: Record<string, number>
  contactCounts: { phone: number; website: number; email: number; hasContact: number }
  amenityCounts: Record<AmenityKey, number>
  starAvg: number
  starNonZero: number
  areaNote: string
  source: string
}

export interface StateBundle {
  stateCode: 'AL' | 'BA'
  stateName: string
  summary: StateSummary
  records: Place[]
}
