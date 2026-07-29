// Copyright 2026 agent-media contributors. Apache-2.0 license.

import { describe, expect, it } from 'vitest';
import { listMarketplacePackages } from '../tooling/repository.js';

class MarketplaceQueryRecorder {
  public selected = '';
  public filters: Array<{ column: string; value: unknown }> = [];
  public orderedBy: { column: string; ascending: boolean } | null = null;
  public readonly rows: Array<Record<string, unknown>>;

  constructor(rows: Array<Record<string, unknown>>) {
    this.rows = rows;
  }

  select(columns: string): this {
    this.selected = columns;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  async order(column: string, args: { ascending: boolean }): Promise<{ data: Array<Record<string, unknown>> }> {
    this.orderedBy = { column, ascending: args.ascending };
    const filtered = this.rows.filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value),
    );
    const selectedColumns = this.selected.split(',').map((column) => column.trim());
    const projected = filtered.map((row) =>
      selectedColumns.reduce<Record<string, unknown>>((acc, columnName) => {
        if (columnName in row) acc[columnName] = row[columnName];
        return acc;
      }, {}),
    );
    return { data: projected };
  }
}

describe('tooling marketplace repository', () => {
  it('lists only approved creator-approved packages and excludes creator_id', async () => {
    const query = new MarketplaceQueryRecorder([
      {
        id: 'pkg-1',
        name: 'creator-kit',
        version: '1.2.3',
        review_state: 'approved',
        approved_creator: true,
        creator_id: 'user-approved',
        created_at: '2026-05-26T10:00:00.000Z',
      },
      {
        id: 'pkg-2',
        name: 'pending-kit',
        version: '1.0.0',
        review_state: 'pending',
        approved_creator: true,
        creator_id: 'user-pending',
        created_at: '2026-05-26T10:05:00.000Z',
      },
      {
        id: 'pkg-3',
        name: 'unapproved-creator-kit',
        version: '2.0.0',
        review_state: 'approved',
        approved_creator: false,
        creator_id: 'user-unapproved',
        created_at: '2026-05-26T10:10:00.000Z',
      },
    ]);
    const supabase = {
      from(table: string) {
        expect(table).toBe('tooling_skill_packages');
        return query;
      },
    };

    const rows = await listMarketplacePackages(supabase as any);

    expect(rows).toEqual([
      {
        id: 'pkg-1',
        name: 'creator-kit',
        version: '1.2.3',
        review_state: 'approved',
        approved_creator: true,
        created_at: '2026-05-26T10:00:00.000Z',
      },
    ]);
    expect(rows[0]).not.toHaveProperty('creator_id');
    expect(query.selected).toBe('id,name,version,review_state,approved_creator,created_at');
    expect(query.filters).toEqual([
      { column: 'review_state', value: 'approved' },
      { column: 'approved_creator', value: true },
    ]);
    expect(query.orderedBy).toEqual({ column: 'created_at', ascending: false });
  });
});
