'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, ChevronLeft, X, Filter } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Actor {
  id: string;
  name: string;
  portrait_url: string;
  gender: string;
  nationality: string;
}

interface Variant {
  id: string;
  actor_id: string;
  position: string;
  framing: string;
  outfit: string;
  background: string;
  expression: string;
  image_url: string;
  status: string;
}

type PositionFilter = 'all' | 'centered' | 'left' | 'right' | 'lower';
type ExpressionFilter = 'all' | 'neutral' | 'serious' | 'smiling' | 'concerned';

const POSITION_COLORS: Record<string, string> = {
  centered: 'bg-blue-100 text-blue-700',
  left: 'bg-violet-100 text-violet-700',
  right: 'bg-emerald-100 text-emerald-700',
  lower: 'bg-amber-100 text-amber-700',
};

const EXPRESSION_COLORS: Record<string, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  serious: 'bg-red-100 text-red-700',
  smiling: 'bg-green-100 text-green-700',
  concerned: 'bg-orange-100 text-orange-700',
};

export default function ActorVariantsPage() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<PositionFilter>('all');
  const [expFilter, setExpFilter] = useState<ExpressionFilter>('all');

  // Fetch actors that have variants
  useEffect(() => {
    async function load() {
      const supabase = createClient();

      // Get all variant actor_ids with counts (paginate past Supabase 1000-row limit)
      const counts: Record<string, number> = {};
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from('actor_variants')
          .select('actor_id')
          .eq('status', 'active')
          .range(offset, offset + pageSize - 1);
        if (!batch?.length) break;
        batch.forEach((v) => {
          counts[v.actor_id] = (counts[v.actor_id] || 0) + 1;
        });
        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      const actorIds = Object.keys(counts);
      if (actorIds.length === 0) {
        setLoading(false);
        return;
      }

      // Get actor details (batch in groups of 100 for .in() limit)
      const actorData: Array<{ id: string; name: string; portrait_url: string; gender: string; nationality: string }> = [];
      for (let i = 0; i < actorIds.length; i += 100) {
        const chunk = actorIds.slice(i, i + 100);
        const { data } = await supabase
          .from('actors')
          .select('id, name, portrait_url, gender, nationality')
          .in('id', chunk);
        if (data) actorData.push(...data);
      }
      actorData.sort((a, b) => a.name.localeCompare(b.name));

      setActors(
        (actorData ?? []).map((a) => ({
          ...a,
          _variantCount: counts[a.id] || 0,
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  // Fetch variants for selected actor
  useEffect(() => {
    if (!selectedActor) {
      setVariants([]);
      return;
    }
    async function loadVariants() {
      setLoadingVariants(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('actor_variants')
        .select('id, actor_id, position, framing, outfit, background, expression, image_url, status')
        .eq('actor_id', selectedActor!.id)
        .eq('status', 'active')
        .order('position')
        .order('outfit');
      setVariants(data ?? []);
      setLoadingVariants(false);
    }
    loadVariants();
  }, [selectedActor]);

  const filteredVariants = useMemo(() => {
    return variants.filter((v) => {
      if (posFilter !== 'all' && v.position !== posFilter) return false;
      if (expFilter !== 'all' && v.expression !== expFilter) return false;
      return true;
    });
  }, [variants, posFilter, expFilter]);

  const filteredActors = useMemo(() => {
    if (!search.trim()) return actors;
    return actors.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
  }, [actors, search]);

  // Group variants by outfit+position+background+expression
  const groupedVariants = useMemo(() => {
    const groups: Record<string, Variant[]> = {};
    filteredVariants.forEach((v) => {
      const key = `${v.position}|${v.outfit}|${v.background}|${v.expression}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(v);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredVariants]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <span className="ml-3 text-sm">Loading actors...</span>
      </div>
    );
  }

  // ── Actor detail view ──────────────────────────────────────────────
  if (selectedActor) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setSelectedActor(null); setPosFilter('all'); setExpFilter('all'); }}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:text-text hover:border-[#121212]/30 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            <img
              src={selectedActor.portrait_url}
              alt={selectedActor.name}
              className="h-12 w-12 rounded-full object-cover border-2 border-border"
            />
            <div>
              <h1 className="text-xl font-semibold text-text">{selectedActor.name}</h1>
              <p className="text-sm text-text-muted">
                {variants.length} variants {filteredVariants.length !== variants.length && `(${filteredVariants.length} shown)`}
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-text-muted" />
            <span className="text-xs text-text-muted">Position:</span>
            {(['all', 'centered', 'left', 'right', 'lower'] as PositionFilter[]).map((p) => (
              <button
                key={p}
                onClick={() => setPosFilter(p)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  posFilter === p
                    ? 'bg-[#121212] text-white'
                    : 'bg-card border border-border text-text-muted hover:text-text'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Expression:</span>
            {(['all', 'neutral', 'serious', 'smiling', 'concerned'] as ExpressionFilter[]).map((e) => (
              <button
                key={e}
                onClick={() => setExpFilter(e)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  expFilter === e
                    ? 'bg-[#121212] text-white'
                    : 'bg-card border border-border text-text-muted hover:text-text'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Variants grouped by prompt */}
        {loadingVariants ? (
          <div className="flex items-center justify-center py-16 text-text-muted">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <span className="ml-3 text-sm">Loading variants...</span>
          </div>
        ) : groupedVariants.length === 0 ? (
          <p className="py-16 text-center text-sm text-text-muted">No variants match filters</p>
        ) : (
          <div className="space-y-8">
            {groupedVariants.map(([key, vars]) => {
              const sample = vars[0];
              return (
                <div key={key} className="space-y-3">
                  {/* Group header with props */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${POSITION_COLORS[sample.position] || 'bg-gray-100 text-gray-600'}`}>
                      {sample.position}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${EXPRESSION_COLORS[sample.expression] || 'bg-gray-100 text-gray-600'}`}>
                      {sample.expression}
                    </span>
                    <span className="text-xs text-text-muted">{sample.outfit}</span>
                    <span className="text-[10px] text-text-muted/60">|</span>
                    <span className="text-[10px] text-text-muted/80">{sample.background}</span>
                  </div>
                  {/* Image grid */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {vars.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariant(v)}
                        className="group relative shrink-0 overflow-hidden rounded-lg border border-border hover:border-[#121212]/40 transition-all hover:shadow-md"
                      >
                        <img
                          src={v.image_url}
                          alt={`${sample.outfit} - ${sample.position}`}
                          className="h-48 w-auto object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Lightbox */}
        {selectedVariant && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setSelectedVariant(null)}
          >
            <div
              className="relative flex max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl border border-border bg-card"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedVariant(null)}
                className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="max-h-[85vh] overflow-hidden">
                <img
                  src={selectedVariant.image_url}
                  alt="Variant"
                  className="h-full w-auto max-w-[50vw] object-contain"
                />
              </div>
              <div className="flex flex-col justify-center gap-4 p-6 min-w-[250px]">
                <h3 className="text-lg font-semibold text-text">Variant Details</h3>
                <div className="space-y-3">
                  <PropRow label="Position" value={selectedVariant.position} badge={POSITION_COLORS[selectedVariant.position]} />
                  <PropRow label="Framing" value={selectedVariant.framing} />
                  <PropRow label="Outfit" value={selectedVariant.outfit} />
                  <PropRow label="Background" value={selectedVariant.background} />
                  <PropRow label="Expression" value={selectedVariant.expression} badge={EXPRESSION_COLORS[selectedVariant.expression]} />
                </div>
                <div className="mt-2 rounded-lg bg-background border border-border p-3">
                  <p className="text-[10px] font-medium text-text-muted mb-1">Image URL</p>
                  <p className="text-[11px] text-accent/80 break-all select-all">{selectedVariant.image_url}</p>
                </div>
                <div className="rounded-lg bg-background border border-border p-3">
                  <p className="text-[10px] font-medium text-text-muted mb-1">Variant ID</p>
                  <p className="text-[11px] text-text font-mono select-all">{selectedVariant.id}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Actor grid view ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Actor Variants</h1>
        <p className="mt-1 text-sm text-text-muted">
          {actors.length} actors with generated variants
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-4 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {filteredActors.map((actor: any) => (
          <button
            key={actor.id}
            onClick={() => setSelectedActor(actor)}
            className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-[#121212]/40 hover:shadow-lg focus:outline-none"
          >
            <div className="relative aspect-[9/16] w-full overflow-hidden">
              <img
                src={actor.portrait_url}
                alt={actor.name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span className="rounded-md bg-white/90 px-3 py-1 text-xs font-semibold text-[#121212]">
                  View {actor._variantCount} variants
                </span>
              </div>
            </div>
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium text-text">{actor.name}</p>
              <p className="text-xs text-text-muted">{actor._variantCount} variants</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PropRow({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 shrink-0 text-xs text-text-muted pt-0.5">{label}</span>
      {badge ? (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge}`}>{value}</span>
      ) : (
        <span className="text-sm text-text">{value}</span>
      )}
    </div>
  );
}
