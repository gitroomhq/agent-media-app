'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, Users, X, Copy, Check, ImageIcon } from 'lucide-react';

type Gender = 'female' | 'male';
type AgeRange = '18-25' | '26-35' | '36-50' | '51+';
type ActorType = 'Young Adult' | 'Professional' | 'Mom' | 'Elder' | 'Casual';

interface Actor {
  id: string;
  name: string;
  slug: string;
  gender: Gender;
  age: number;
  age_range: AgeRange;
  nationality: string;
  style: string;
  actor_type: ActorType;
  portrait_url: string;
  voice_id: string;
  lip_sync_engine: string;
}

type GenderFilter = 'all' | Gender;
type AgeFilter = 'all' | AgeRange;
type TypeFilter = 'all' | ActorType;

const TYPE_COLORS: Record<ActorType, string> = {
  'Young Adult': 'bg-violet-100 text-violet-700',
  'Professional': 'bg-blue-100 text-blue-700',
  'Mom': 'bg-pink-100 text-pink-700',
  'Elder': 'bg-amber-100 text-amber-700',
  'Casual': 'bg-emerald-100 text-emerald-700',
};

function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-text-muted shrink-0">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-[#121212] text-white'
              : 'bg-card border border-border text-text-muted hover:text-text hover:border-[#121212]/30'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ActorsPage() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [age, setAge] = useState<AgeFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [selected, setSelected] = useState<Actor | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch actors from API (via local proxy to avoid CORS)
  useEffect(() => {
    async function fetchActors() {
      try {
        const res = await fetch('/api/actors');
        if (!res.ok) throw new Error(`Failed to fetch actors (${res.status})`);

        const data = await res.json();
        setActors(data.actors ?? []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    fetchActors();
  }, []);

  const filtered = useMemo(() => {
    return actors.filter((a) => {
      if (search.trim() && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (gender !== 'all' && a.gender !== gender) return false;
      if (age !== 'all' && a.age_range !== age) return false;
      if (type !== 'all' && a.actor_type !== type) return false;
      return true;
    });
  }, [actors, search, gender, age, type]);

  const hasFilters = gender !== 'all' || age !== 'all' || type !== 'all' || search.trim();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <span className="ml-3 text-sm">Loading actors...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-text-muted">
        <Users className="h-10 w-10 opacity-40" />
        <p className="text-sm">Failed to load actors: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">Actors</h1>
          <p className="mt-1 text-sm text-text-muted">
            {filtered.length} of {actors.length} actors
          </p>
        </div>
        <Link
          href="/actors/variants"
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted hover:text-text hover:border-[#121212]/30 transition-colors"
        >
          <ImageIcon className="h-4 w-4" />
          View Variants
        </Link>
        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setGender('all'); setAge('all'); setType('all'); }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-text-muted hover:text-text border border-border hover:border-accent/50 transition-colors"
          >
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
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

        <FilterPills<GenderFilter>
          label="Gender"
          value={gender}
          onChange={setGender}
          options={[
            { value: 'all', label: 'All' },
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
          ]}
        />
        <FilterPills<AgeFilter>
          label="Age"
          value={age}
          onChange={setAge}
          options={[
            { value: 'all', label: 'All' },
            { value: '18-25', label: '18-25' },
            { value: '26-35', label: '26-35' },
            { value: '36-50', label: '36-50' },
            { value: '51+', label: '51+' },
          ]}
        />
        <FilterPills<TypeFilter>
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: 'All' },
            { value: 'Young Adult', label: 'Young Adult' },
            { value: 'Mom', label: 'Mom' },
            { value: 'Elder', label: 'Elder' },
            { value: 'Professional', label: 'Professional' },
            { value: 'Casual', label: 'Casual' },
          ]}
        />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-text-muted">
          <Users className="h-10 w-10 opacity-40" />
          <p className="text-sm">No actors found</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {filtered.map((actor) => (
            <button
              key={actor.id}
              onClick={() => setSelected(actor)}
              className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-[#121212]/40 hover:shadow-lg focus:outline-none"
            >
              {/* Portrait image — 9:16 ratio */}
              <div className="relative aspect-[9/16] w-full overflow-hidden">
                <img
                  src={actor.portrait_url}
                  alt={actor.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <span className="rounded-md bg-[#121212] px-2 py-0.5 text-[10px] font-semibold text-white">
                    Select
                  </span>
                </div>
              </div>
              {/* Name + type */}
              <div className="px-2 py-1.5">
                <p className="truncate text-[11px] font-medium text-text">{actor.name}</p>
                <p className="truncate text-[10px] text-text-muted">{actor.nationality}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative flex max-h-[90vh] max-w-lg overflow-hidden rounded-2xl border border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelected(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Image */}
            <div className="w-48 shrink-0">
              <img
                src={selected.portrait_url}
                alt={selected.name}
                className="h-full w-full object-cover"
              />
            </div>

            {/* Props */}
            <div className="flex flex-col justify-center gap-4 p-6">
              <div>
                <h2 className="text-xl font-semibold text-text">{selected.name}</h2>
                <p className="mt-0.5 text-sm text-text-muted">{selected.nationality}</p>
              </div>

              <div className="space-y-2">
                <PropRow label="Age" value={`${selected.age}`} />
                <PropRow label="Gender" value={selected.gender === 'female' ? 'Female' : 'Male'} />
                <PropRow label="Style" value={selected.style} />
                <PropRow label="Voice" value={selected.voice_id} />
              </div>

              <span className={`self-start rounded-full px-3 py-1 text-xs font-medium ${TYPE_COLORS[selected.actor_type]}`}>
                {selected.actor_type}
              </span>

              {/* CLI snippet */}
              <div className="mt-1">
                <p className="mb-1.5 text-[10px] font-medium text-text-muted">Use in CLI</p>
                <button
                  onClick={() => handleCopy(`agent-media ugc "your script..." --actor ${selected.slug} --sync`)}
                  className="group flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-[#121212]/30"
                >
                  <code className="flex-1 text-[11px] text-accent/80">
                    agent-media ugc &quot;...&quot; --actor {selected.slug} --sync
                  </code>
                  {copied ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-text-muted">{label}</span>
      <span className="text-sm text-text">{value}</span>
    </div>
  );
}
