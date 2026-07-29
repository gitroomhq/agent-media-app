// Copyright 2026 agent-media contributors. Apache-2.0 license.

export interface ModelBenchmark {
  slug: string;
  name: string;
  type: 'video' | 'image';
  provider: string;
  resolution: string;
  maxDuration: string;
  genSpeed: string;
  creditRange: string;
  costPerGen: string;
  inputTypes: string[];
  strengths: string[];
  bestFor: string[];
}

export const models: ModelBenchmark[] = [
  {
    slug: 'video-pro',
    name: 'AI Video Pro',
    type: 'video',
    provider: 'agent-media',
    resolution: 'Up to 4K',
    maxDuration: '5-10s',
    genSpeed: '~2 min for 5s',
    creditRange: '200-400',
    costPerGen: '~$0.50',
    inputTypes: ['text-to-video', 'image-to-video'],
    strengths: ['Realistic faces', 'Natural motion', '4K output', 'Image-to-video'],
    bestFor: ['Product demos', 'Talking heads', 'Social media reels'],
  },
  {
    slug: 'video-cinematic',
    name: 'AI Video Cinematic',
    type: 'video',
    provider: 'agent-media',
    resolution: '4K',
    maxDuration: '4-8s',
    genSpeed: '~90s for 8s',
    creditRange: '300-500',
    costPerGen: '~$1.60',
    inputTypes: ['text-to-video'],
    strengths: ['Cinematic quality', 'Audio generation', 'Lip sync', '4K output'],
    bestFor: ['Film production', 'Cinematic trailers', 'Professional content'],
  },
  {
    slug: 'video-realism',
    name: 'AI Video Realism',
    type: 'video',
    provider: 'agent-media',
    resolution: '720p-1080p',
    maxDuration: '4-12s',
    genSpeed: '~3 min for 8s',
    creditRange: '250-600',
    costPerGen: '~$0.65',
    inputTypes: ['text-to-video'],
    strengths: ['Creative interpretation', 'Longest duration', 'Artistic style', 'Scene composition'],
    bestFor: ['Music videos', 'Abstract art', 'Creative projects'],
  },
  {
    slug: 'video-fast',
    name: 'AI Video Fast',
    type: 'video',
    provider: 'agent-media',
    resolution: '720p-1080p',
    maxDuration: '5-10s',
    genSpeed: '~2 min for 5s',
    creditRange: '200-400',
    costPerGen: '~$0.50',
    inputTypes: ['text-to-video', 'image-to-video'],
    strengths: ['Human motion', 'Dance choreography', 'Body dynamics', 'Image-to-video'],
    bestFor: ['Dance content', 'Fitness videos', 'Character animation'],
  },
  {
    slug: 'image-pro',
    name: 'AI Image Pro',
    type: 'image',
    provider: 'agent-media',
    resolution: '1024x1024+',
    maxDuration: 'N/A',
    genSpeed: '~10s',
    creditRange: '50-100',
    costPerGen: '~$0.15',
    inputTypes: ['text-to-image'],
    strengths: ['Text rendering', 'Photorealism', 'Fast generation', 'Brand assets'],
    bestFor: ['Marketing materials', 'Product mockups', 'Social media graphics'],
  },
  {
    slug: 'image-flex',
    name: 'AI Image Flex',
    type: 'image',
    provider: 'agent-media',
    resolution: '1024x1024+',
    maxDuration: 'N/A',
    genSpeed: '~5s',
    creditRange: '25-50',
    costPerGen: '~$0.08',
    inputTypes: ['text-to-image'],
    strengths: ['Fastest image model', 'Lowest cost', 'Good quality', 'Batch-friendly'],
    bestFor: ['Bulk generation', 'Rapid prototyping', 'Concept art drafts'],
  },
  {
    slug: 'image-creative',
    name: 'AI Image Creative',
    type: 'image',
    provider: 'agent-media',
    resolution: '1024x1024',
    maxDuration: 'N/A',
    genSpeed: '~15s',
    creditRange: '50-100',
    costPerGen: '~$0.15',
    inputTypes: ['text-to-image'],
    strengths: ['Artistic style', 'Complex scenes', 'Creative interpretation', 'Unique aesthetic'],
    bestFor: ['Concept art', 'Illustrations', 'Creative exploration'],
  },
];

/** Video models only, sorted by generation speed (fastest first). */
export const videoModelsBySpeed = models
  .filter((m) => m.type === 'video')
  .sort((a, b) => {
    const order: Record<string, number> = { 'video-cinematic': 1, 'video-pro': 2, 'video-fast': 3, 'video-realism': 4 };
    return (order[a.slug] ?? 99) - (order[b.slug] ?? 99);
  });

/** Image models only, sorted by generation speed (fastest first). */
export const imageModelsBySpeed = models
  .filter((m) => m.type === 'image')
  .sort((a, b) => {
    const order: Record<string, number> = { 'image-flex': 1, 'image-pro': 2, 'image-creative': 3 };
    return (order[a.slug] ?? 99) - (order[b.slug] ?? 99);
  });

/** All models sorted by credit cost (cheapest first). */
export const modelsByCost = [...models].sort((a, b) => {
  const costNum = (s: string) => parseFloat(s.replace(/[^0-9.]/g, ''));
  return costNum(a.costPerGen) - costNum(b.costPerGen);
});
