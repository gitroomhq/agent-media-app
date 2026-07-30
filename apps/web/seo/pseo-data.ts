// Copyright 2026 agent-media contributors. Apache-2.0 license.
//
// pSEO facet data. Every page is composed from these facets — the engine
// (pseo-engine.ts) expands them into page specs. Adding one row here adds
// pages across every template family and locale.

export interface Platform {
  slug: string;
  name: string;
  aspect: string;
  maxDuration: string;
  captionNorm: string;
  adFormat: string;
}

export interface Vertical {
  slug: string;
  name: string;
  pains: [string, string, string];
  exampleScript: string;
  exampleScene: string;
  hook: string;
}

export interface Audience {
  slug: string;
  name: string;
  angle: string;
}

export interface HeadTerm {
  slug: string;
  phrase: string; // e.g. "AI UGC video generator"
  pluralNoun: string; // e.g. "AI UGC video generators"
}

export const PLATFORMS: Platform[] = [
  { slug: 'tiktok', name: 'TikTok', aspect: '9:16', maxDuration: '15s hooks, 60s max for ads', captionNorm: 'burned-in animated captions', adFormat: 'Spark Ads / In-Feed' },
  { slug: 'instagram-reels', name: 'Instagram Reels', aspect: '9:16', maxDuration: '90s max, 7–15s performs best', captionNorm: 'auto-captions expected', adFormat: 'Reels Ads' },
  { slug: 'youtube-shorts', name: 'YouTube Shorts', aspect: '9:16', maxDuration: '60s max', captionNorm: 'styled subtitles', adFormat: 'Shorts ad slots' },
  { slug: 'facebook-ads', name: 'Facebook Ads', aspect: '9:16 or 4:5', maxDuration: '15–30s converts best', captionNorm: '85% watch muted — captions required', adFormat: 'Feed + Reels placements' },
  { slug: 'snapchat', name: 'Snapchat', aspect: '9:16', maxDuration: '3–7s per snap ad', captionNorm: 'large bold captions', adFormat: 'Snap Ads' },
  { slug: 'linkedin', name: 'LinkedIn', aspect: '1:1 or 9:16', maxDuration: '30–90s', captionNorm: 'professional subtitle styling', adFormat: 'Video Ads' },
  { slug: 'x-twitter', name: 'X (Twitter)', aspect: '1:1 or 16:9', maxDuration: '20–45s', captionNorm: 'captions strongly recommended', adFormat: 'Promoted video' },
  { slug: 'pinterest', name: 'Pinterest', aspect: '9:16 or 2:3', maxDuration: '6–15s Idea Pins', captionNorm: 'text overlay native to format', adFormat: 'Idea Ads' },
];

export const VERTICALS: Vertical[] = [
  { slug: 'ecommerce', name: 'E-commerce', pains: ['Product pages without video convert ~80% worse', 'Hiring UGC creators costs $150–500 per video', 'Catalogs need hundreds of videos, not five'], exampleScript: 'I ordered this on Tuesday and it already replaced three things on my desk', exampleScene: 'unboxing a parcel at a bright kitchen table, holding the product to camera', hook: 'turn every SKU into a video ad' },
  { slug: 'shopify', name: 'Shopify stores', pains: ['Stores with video see 30%+ higher add-to-cart', 'Creator marketplaces take weeks per batch', 'Seasonal drops need same-day creative'], exampleScript: 'This is the third time I have reordered and they finally added the bundle', exampleScene: 'showing the product next to its open shipping box, casual bedroom lighting', hook: 'generate product videos straight from your store webhook' },
  { slug: 'saas', name: 'SaaS', pains: ['Demo videos go stale every release', 'Founders have no time on camera', 'Paid social needs fresh creative weekly'], exampleScript: 'I stopped writing status updates because this tool writes them from my commits', exampleScene: 'at a desk with a laptop visible, gesturing at the screen', hook: 'ship product-update videos from your CI pipeline' },
  { slug: 'dropshipping', name: 'Dropshipping', pains: ['Testing 20 creatives per product is the norm', 'Winning products die before creators deliver', 'Margins cannot absorb $300/video'], exampleScript: 'Everyone keeps asking where I got this — third restock this month', exampleScene: 'holding the product close to camera in a car, natural light', hook: 'test 20 ad angles before lunch' },
  { slug: 'real-estate', name: 'Real estate', pains: ['Listings with video get 4x more inquiries', 'Agents cannot film every property', 'Localized videos for every neighborhood'], exampleScript: 'Three bedrooms, two minutes from the marina, and under asking — let me show you', exampleScene: 'standing in a bright living room gesturing toward windows', hook: 'a walkthrough teaser for every listing' },
  { slug: 'fitness', name: 'Fitness & wellness', pains: ['Coaches burn out filming daily content', 'Transformation stories need faces', 'Supplement ads need constant refresh'], exampleScript: 'I trained for years before realizing recovery was the missing piece', exampleScene: 'in workout clothes at a home gym, water bottle in hand', hook: 'daily content without the daily filming' },
  { slug: 'beauty', name: 'Beauty & skincare', pains: ['Routine videos drive this category', 'Creator briefs take weeks to turn around', 'Every shade/variant needs its own clip'], exampleScript: 'I keep getting DMs about my hair oil routine so here it is', exampleScene: 'by a bright vanity, showing a small amber bottle and scrunching one curl', hook: 'routine-style videos for every product variant' },
  { slug: 'mobile-apps', name: 'Mobile apps', pains: ['App-install ads need authentic faces', 'ASO screenshots are not enough anymore', 'Creative fatigue kills CPI in days'], exampleScript: 'I deleted three habit trackers before this one actually stuck', exampleScene: 'on a couch holding a phone toward the camera, screen visible', hook: 'app-install creatives generated from your release notes' },
  { slug: 'courses', name: 'Online courses', pains: ['Testimonial videos sell courses', 'Students rarely film reviews', 'Launch windows need creative volume'], exampleScript: 'I finished module two and already closed my first client', exampleScene: 'at a desk with notebook visible, talking directly to camera', hook: 'student-story videos for every cohort launch' },
  { slug: 'restaurants', name: 'Restaurants & food', pains: ['Food content is the highest-engagement category', 'No staff time for daily filming', 'Menu changes outpace content'], exampleScript: 'They only make forty of these a day and I got the last one', exampleScene: 'holding a dish toward the camera in warm restaurant light', hook: 'a video for every menu item' },
  { slug: 'coaches', name: 'Coaches & consultants', pains: ['Personal brands need daily presence', 'Camera fatigue is real', 'One face cannot scale to every niche'], exampleScript: 'My client doubled her rates after we fixed one sentence in her pitch', exampleScene: 'walking outdoors talking to camera, casual confident energy', hook: 'show up daily without filming daily' },
  { slug: 'agencies', name: 'Marketing agencies', pains: ['Clients expect UGC in every retainer', 'Creator sourcing does not scale', 'Margins improve 10x with generation'], exampleScript: 'We tested this hook across nine accounts and it won in seven', exampleScene: 'office setting, talking head with whiteboard behind', hook: 'white-label UGC production via API' },
  { slug: 'b2b', name: 'B2B', pains: ['B2B buyers watch short video too', 'Case studies are walls of text', 'Sales teams need video snippets at scale'], exampleScript: 'Our close rate moved eleven points after we added video follow-ups', exampleScene: 'professional home office, direct to camera', hook: 'turn case studies into video' },
  { slug: 'crypto-fintech', name: 'Fintech', pains: ['Trust content drives signups', 'Compliance review kills filming spontaneity', 'Explainer demand never stops'], exampleScript: 'I moved my emergency fund here for the rate and stayed for the app', exampleScene: 'casual desk setting, phone in hand showing the app', hook: 'compliant explainer videos from approved scripts' },
  { slug: 'gaming', name: 'Gaming', pains: ['UA creative burns out fastest in gaming', 'Players trust player-style content', 'Soft launches need creative volume'], exampleScript: 'I said one quick run before bed and it is now 2am', exampleScene: 'gaming chair, headset around neck, RGB glow', hook: 'player-style creatives at UA scale' },
  { slug: 'education', name: 'Education', pains: ['Enrollment campaigns need student voices', 'Filming permissions are slow', 'Every program needs its own story'], exampleScript: 'I applied on a Sunday night and got my acceptance two weeks later', exampleScene: 'campus-style outdoor setting, backpack on shoulder', hook: 'student-voice videos for every program' },
  { slug: 'travel', name: 'Travel & hospitality', pains: ['Inspiration content drives bookings', 'Properties cannot fly creators in', 'Seasonal campaigns need fresh faces'], exampleScript: 'The room was nice but this rooftop at sunset is why I am rebooking', exampleScene: 'on a rooftop terrace at golden hour, talking to camera', hook: 'a video for every property and season' },
  { slug: 'pets', name: 'Pet brands', pains: ['Pet content has built-in engagement', 'Product demos need real-feeling homes', 'Subscriptions need monthly creative'], exampleScript: 'My dog heard this bag open from two rooms away', exampleScene: 'living room floor, opening a product bag, dog toys visible', hook: 'pet-parent videos on demand' },
  { slug: 'home-decor', name: 'Home & decor', pains: ['Before/after content converts', 'Staging shoots are expensive', 'Every room style needs its own video'], exampleScript: 'This corner was dead space for a year and now it is my favorite spot', exampleScene: 'styled living room corner, gesturing at the setup', hook: 'room-style videos for every product line' },
  { slug: 'fashion', name: 'Fashion', pains: ['Try-on content rules the category', 'Sample logistics slow everything down', 'Drops need day-one creative'], exampleScript: 'It has pockets. Real ones. That is the review', exampleScene: 'mirror-adjacent fit check, casual bedroom', hook: 'try-on style videos for every drop' },
];

export const AUDIENCES: Audience[] = [
  { slug: 'startups', name: 'startups', angle: 'speed and zero headcount — creative that ships the day you need it' },
  { slug: 'small-business', name: 'small businesses', angle: 'agency results without agency retainers' },
  { slug: 'developers', name: 'developers', angle: 'API, CLI, SDK, and MCP — video generation as infrastructure' },
  { slug: 'marketers', name: 'marketers', angle: 'creative volume for testing without procurement cycles' },
  { slug: 'agencies', name: 'agencies', angle: 'white-label production with software margins' },
  { slug: 'creators', name: 'creators', angle: 'scale your face and voice without filming every day' },
  { slug: 'enterprise', name: 'enterprise teams', angle: 'governed, repeatable video pipelines with audit trails' },
  { slug: 'solopreneurs', name: 'solopreneurs', angle: 'a one-person content team that never sleeps' },
];

export const HEAD_TERMS: HeadTerm[] = [
  { slug: 'ai-ugc-video-generator', phrase: 'AI UGC video generator', pluralNoun: 'AI UGC video generators' },
  { slug: 'ugc-video-maker', phrase: 'UGC video maker', pluralNoun: 'UGC video makers' },
  { slug: 'ai-ugc-ads-tool', phrase: 'AI UGC ads tool', pluralNoun: 'AI UGC ad tools' },
  { slug: 'ugc-video-platform', phrase: 'UGC video platform', pluralNoun: 'UGC video platforms' },
  { slug: 'ai-video-ad-generator', phrase: 'AI video ad generator', pluralNoun: 'AI video ad generators' },
  { slug: 'ugc-automation-software', phrase: 'UGC automation software', pluralNoun: 'UGC automation software' },
];

export interface Competitor {
  name: string;
  api: string;
  cli: string;
  mcp: string;
  autoPublish: string;
  pricingModel: string;
}

// Comparison table data shown on every "best" page. Factual, update quarterly.
export const COMPARISON_ROWS: Competitor[] = [
  { name: 'AgentMedia', api: 'REST + SDKs (TS/Python)', cli: 'Yes', mcp: 'Yes', autoPublish: 'TikTok / IG / YouTube / X', pricingModel: 'Credits, from $39/mo' },
  { name: 'MakeUGC', api: 'No public API', cli: 'No', mcp: 'No', autoPublish: 'No', pricingModel: 'Subscription' },
  { name: 'Arcads', api: 'Waitlist', cli: 'No', mcp: 'No', autoPublish: 'No', pricingModel: 'Subscription' },
  { name: 'Creatify', api: 'Enterprise API', cli: 'No', mcp: 'No', autoPublish: 'Limited', pricingModel: 'Subscription + API tier' },
  { name: 'Topview', api: 'Limited', cli: 'No', mcp: 'No', autoPublish: 'No', pricingModel: 'Subscription' },
];

export interface LocaleStrings {
  code: string; // BCP 47 for hreflang
  name: string;
  best: string; // "Best" in locale
  forWord: string;
  in2026: string;
  whyTitle: (target: string) => string;
  howTitle: (phrase: string) => string;
  compareTitle: (plural: string) => string;
  faqTitle: string;
  ctaTitle: string;
  ctaBody: string;
  ctaButton: string;
  introLead: (phrase: string, target: string) => string;
  introAgent: string;
  metaDescription: (phrase: string, target: string) => string;
  relatedTitle: string;
  step1: string;
  step2: string;
  step3: string;
  tableHeaders: [string, string, string, string, string, string];
  // how-to family
  howToH1: (format: string, target: string) => string;
  howToIntro: (format: string, target: string) => string;
  whatMakesTitle: (format: string) => string;
  exampleTitle: string;
  stepsTitle: string;
  howToMeta: (format: string, target: string) => string;
}

export const LOCALES: Record<string, LocaleStrings> = {
  en: {
    code: 'en', name: 'English', best: 'Best', forWord: 'for', in2026: 'in 2026',
    whyTitle: (t) => `Why ${t} are switching to generated UGC`,
    howTitle: (p) => `How to create UGC videos with an ${p}`,
    compareTitle: (n) => `Comparing the top ${n}`,
    faqTitle: 'Frequently asked questions',
    ctaTitle: 'Generate your first UGC video in 60 seconds',
    ctaBody: 'One CLI command — script, actor, video, captions, and auto-publish to TikTok, Instagram, and YouTube.',
    ctaButton: 'Get started free',
    introLead: (p, t) => `Picking the right ${p} ${'for'} ${t} comes down to three things: video quality, how fast you can go from idea to published post, and whether the tool fits the way you already work.`,
    introAgent: 'AgentMedia generates realistic 9:16 UGC videos — actor, script delivery, captions — from a single command, and auto-publishes to your channels. It runs from a web app, a CLI, a REST API, SDKs, or directly inside AI agents via MCP.',
    metaDescription: (p, t) => `The best ${p} for ${t} in 2026, compared: video quality, pricing, API access, and auto-publishing. See real generated examples.`,
    relatedTitle: 'Related guides',
    step1: 'Install the CLI and log in',
    step2: 'Describe the actor and script',
    step3: 'Generate and auto-publish - captions optional',
    tableHeaders: ['Tool', 'API & SDKs', 'CLI', 'MCP (AI agents)', 'Auto-publish', 'Pricing'],
    howToH1: (f, t) => `How to Make a ${f} for ${t} with AI (2026)`,
    howToIntro: (f, t) => `A good ${f.toLowerCase()} for ${t} used to mean briefing a creator, waiting a week, and hoping the delivery matched the brief. With generated UGC you describe the actor, paste the script, and have a publishable video in about a minute — then iterate on hooks as fast as you can type them.`,
    whatMakesTitle: (f) => `What a high-performing ${f.toLowerCase()} needs`,
    exampleTitle: 'Example script you can copy',
    stepsTitle: 'Step-by-step with AgentMedia',
    howToMeta: (f, t) => `Step-by-step guide to making a ${f.toLowerCase()} for ${t} with AI: example scripts, scene directions, CLI commands, and auto-publishing. Takes about a minute per video.`,
  },
  es: {
    code: 'es', name: 'Español', best: 'Mejor', forWord: 'para', in2026: 'en 2026',
    whyTitle: (t) => `Por qué ${t} están adoptando UGC generado`,
    howTitle: (p) => `Cómo crear videos UGC con un ${p}`,
    compareTitle: (n) => `Comparativa de los mejores ${n}`,
    faqTitle: 'Preguntas frecuentes',
    ctaTitle: 'Genera tu primer video UGC en 60 segundos',
    ctaBody: 'Un solo comando — guion, actor, video, subtítulos y publicación automática en TikTok, Instagram y YouTube.',
    ctaButton: 'Empieza gratis',
    introLead: (p, t) => `Elegir el ${p} adecuado ${'para'} ${t} depende de tres cosas: la calidad del video, la velocidad de idea a publicación, y si la herramienta encaja con tu forma de trabajar.`,
    introAgent: 'AgentMedia genera videos UGC realistas en 9:16 — actor, guion, subtítulos — con un solo comando, y los publica automáticamente en tus canales. Funciona desde la web, CLI, API REST, SDKs o dentro de agentes de IA vía MCP.',
    metaDescription: (p, t) => `Los mejores ${p} para ${t} en 2026, comparados: calidad de video, precios, acceso API y publicación automática. Con ejemplos reales generados.`,
    relatedTitle: 'Guías relacionadas',
    step1: 'Instala el CLI e inicia sesión',
    step2: 'Describe el actor y el guion',
    step3: 'Genera, subtitula y publica automáticamente',
    tableHeaders: ['Herramienta', 'API y SDKs', 'CLI', 'MCP (agentes IA)', 'Auto-publicación', 'Precios'],
    howToH1: (f, t) => `Cómo hacer un ${f} para ${t} con IA (2026)`,
    howToIntro: (f, t) => `Hacer un buen ${f.toLowerCase()} para ${t} solía implicar contratar a un creador, esperar una semana y cruzar los dedos. Con UGC generado, describes el actor, pegas el guion y tienes un video listo para publicar en un minuto — e iteras los ganchos tan rápido como escribes.`,
    whatMakesTitle: (f) => `Qué necesita un ${f.toLowerCase()} de alto rendimiento`,
    exampleTitle: 'Guion de ejemplo para copiar',
    stepsTitle: 'Paso a paso con AgentMedia',
    howToMeta: (f, t) => `Guía paso a paso para crear un ${f.toLowerCase()} para ${t} con IA: guiones de ejemplo, direcciones de escena, comandos CLI y publicación automática.`,
  },
  'pt-br': {
    code: 'pt-BR', name: 'Português (BR)', best: 'Melhor', forWord: 'para', in2026: 'em 2026',
    whyTitle: (t) => `Por que ${t} estão migrando para UGC gerado`,
    howTitle: (p) => `Como criar vídeos UGC com um ${p}`,
    compareTitle: (n) => `Comparando os melhores ${n}`,
    faqTitle: 'Perguntas frequentes',
    ctaTitle: 'Gere seu primeiro vídeo UGC em 60 segundos',
    ctaBody: 'Um único comando — roteiro, ator, vídeo, legendas e publicação automática no TikTok, Instagram e YouTube.',
    ctaButton: 'Comece grátis',
    introLead: (p, t) => `Escolher o ${p} certo ${'para'} ${t} depende de três fatores: qualidade do vídeo, velocidade da ideia à publicação, e se a ferramenta se encaixa no seu fluxo de trabalho.`,
    introAgent: 'O AgentMedia gera vídeos UGC realistas em 9:16 — ator, roteiro, legendas — com um único comando, e publica automaticamente nos seus canais. Funciona via web, CLI, API REST, SDKs ou dentro de agentes de IA via MCP.',
    metaDescription: (p, t) => `Os melhores ${p} para ${t} em 2026, comparados: qualidade de vídeo, preços, acesso à API e publicação automática. Com exemplos reais.`,
    relatedTitle: 'Guias relacionados',
    step1: 'Instale o CLI e faça login',
    step2: 'Descreva o ator e o roteiro',
    step3: 'Gere, legende e publique automaticamente',
    tableHeaders: ['Ferramenta', 'API e SDKs', 'CLI', 'MCP (agentes IA)', 'Auto-publicação', 'Preços'],
    howToH1: (f, t) => `Como fazer um ${f} para ${t} com IA (2026)`,
    howToIntro: (f, t) => `Fazer um bom ${f.toLowerCase()} para ${t} significava contratar um criador, esperar uma semana e torcer. Com UGC gerado, você descreve o ator, cola o roteiro e tem um vídeo pronto para publicar em um minuto — e itera os ganchos na velocidade da digitação.`,
    whatMakesTitle: (f) => `O que um ${f.toLowerCase()} de alta performance precisa`,
    exampleTitle: 'Roteiro de exemplo para copiar',
    stepsTitle: 'Passo a passo com AgentMedia',
    howToMeta: (f, t) => `Guia passo a passo para criar um ${f.toLowerCase()} para ${t} com IA: roteiros de exemplo, direções de cena, comandos CLI e publicação automática.`,
  },
  de: {
    code: 'de', name: 'Deutsch', best: 'Bester', forWord: 'für', in2026: 'im Jahr 2026',
    whyTitle: (t) => `Warum ${t} auf generiertes UGC umsteigen`,
    howTitle: (p) => `So erstellst du UGC-Videos mit einem ${p}`,
    compareTitle: (n) => `Die besten ${n} im Vergleich`,
    faqTitle: 'Häufige Fragen',
    ctaTitle: 'Erstelle dein erstes UGC-Video in 60 Sekunden',
    ctaBody: 'Ein CLI-Befehl — Skript, Darsteller, Video, Untertitel und Auto-Publishing auf TikTok, Instagram und YouTube.',
    ctaButton: 'Kostenlos starten',
    introLead: (p, t) => `Beim richtigen ${p} ${'für'} ${t} zählen drei Dinge: Videoqualität, die Geschwindigkeit von der Idee bis zum veröffentlichten Post, und ob das Tool zu deinem Workflow passt.`,
    introAgent: 'AgentMedia generiert realistische 9:16-UGC-Videos — Darsteller, Skript, Untertitel — mit einem einzigen Befehl und veröffentlicht sie automatisch auf deinen Kanälen. Verfügbar als Web-App, CLI, REST-API, SDKs oder direkt in KI-Agenten via MCP.',
    metaDescription: (p, t) => `Die besten ${p} für ${t} 2026 im Vergleich: Videoqualität, Preise, API-Zugang und Auto-Publishing. Mit echten generierten Beispielen.`,
    relatedTitle: 'Verwandte Guides',
    step1: 'CLI installieren und anmelden',
    step2: 'Darsteller und Skript beschreiben',
    step3: 'Generieren, untertiteln und automatisch veröffentlichen',
    tableHeaders: ['Tool', 'API & SDKs', 'CLI', 'MCP (KI-Agenten)', 'Auto-Publishing', 'Preise'],
    howToH1: (f, t) => `${f} für ${t} mit KI erstellen — so geht's (2026)`,
    howToIntro: (f, t) => `Ein gutes ${f} für ${t} bedeutete früher: Creator briefen, eine Woche warten, hoffen. Mit generiertem UGC beschreibst du den Darsteller, fügst das Skript ein und hast in etwa einer Minute ein veröffentlichungsfertiges Video — und testest neue Hooks so schnell, wie du tippen kannst.`,
    whatMakesTitle: (f) => `Was ein starkes ${f} braucht`,
    exampleTitle: 'Beispielskript zum Kopieren',
    stepsTitle: 'Schritt für Schritt mit AgentMedia',
    howToMeta: (f, t) => `Schritt-für-Schritt-Anleitung: ${f} für ${t} mit KI erstellen — Beispielskripte, Szenenanweisungen, CLI-Befehle und Auto-Publishing.`,
  },
  fr: {
    code: 'fr', name: 'Français', best: 'Meilleur', forWord: 'pour', in2026: 'en 2026',
    whyTitle: (t) => `Pourquoi ${t} passent à l'UGC généré`,
    howTitle: (p) => `Comment créer des vidéos UGC avec un ${p}`,
    compareTitle: (n) => `Comparatif des meilleurs ${n}`,
    faqTitle: 'Questions fréquentes',
    ctaTitle: 'Générez votre première vidéo UGC en 60 secondes',
    ctaBody: 'Une seule commande — script, acteur, vidéo, sous-titres et publication automatique sur TikTok, Instagram et YouTube.',
    ctaButton: 'Commencer gratuitement',
    introLead: (p, t) => `Choisir le bon ${p} ${'pour'} ${t} repose sur trois critères : la qualité vidéo, la rapidité entre l'idée et la publication, et l'intégration à votre façon de travailler.`,
    introAgent: 'AgentMedia génère des vidéos UGC réalistes en 9:16 — acteur, script, sous-titres — en une seule commande, et les publie automatiquement sur vos canaux. Disponible via le web, CLI, API REST, SDKs ou directement dans les agents IA via MCP.',
    metaDescription: (p, t) => `Les meilleurs ${p} pour ${t} en 2026, comparés : qualité vidéo, prix, accès API et publication automatique. Avec de vrais exemples générés.`,
    relatedTitle: 'Guides associés',
    step1: 'Installez le CLI et connectez-vous',
    step2: "Décrivez l'acteur et le script",
    step3: 'Générez, sous-titrez et publiez automatiquement',
    tableHeaders: ['Outil', 'API & SDKs', 'CLI', 'MCP (agents IA)', 'Auto-publication', 'Prix'],
    howToH1: (f, t) => `Comment créer un ${f} pour ${t} avec l'IA (2026)`,
    howToIntro: (f, t) => `Créer un bon ${f.toLowerCase()} pour ${t} signifiait briefer un créateur, attendre une semaine et croiser les doigts. Avec l'UGC généré, vous décrivez l'acteur, collez le script et obtenez une vidéo publiable en une minute — et vous itérez les accroches aussi vite que vous tapez.`,
    whatMakesTitle: (f) => `Ce qu'il faut à un ${f.toLowerCase()} performant`,
    exampleTitle: 'Exemple de script à copier',
    stepsTitle: 'Pas à pas avec AgentMedia',
    howToMeta: (f, t) => `Guide pas à pas pour créer un ${f.toLowerCase()} pour ${t} avec l'IA : scripts d'exemple, directions de scène, commandes CLI et publication automatique.`,
  },
  it: {
    code: 'it', name: 'Italiano', best: 'Miglior', forWord: 'per', in2026: 'nel 2026',
    whyTitle: (t) => `Perché ${t} stanno passando all'UGC generato`,
    howTitle: (p) => `Come creare video UGC con un ${p}`,
    compareTitle: (n) => `Confronto dei migliori ${n}`,
    faqTitle: 'Domande frequenti',
    ctaTitle: 'Genera il tuo primo video UGC in 60 secondi',
    ctaBody: 'Un solo comando — copione, attore, video, sottotitoli e pubblicazione automatica su TikTok, Instagram e YouTube.',
    ctaButton: 'Inizia gratis',
    introLead: (p, t) => `Scegliere il ${p} giusto ${'per'} ${t} dipende da tre fattori: qualità video, velocità dall'idea alla pubblicazione, e integrazione con il tuo modo di lavorare.`,
    introAgent: 'AgentMedia genera video UGC realistici in 9:16 — attore, copione, sottotitoli — con un solo comando, e li pubblica automaticamente sui tuoi canali. Disponibile via web, CLI, API REST, SDK o dentro agenti IA via MCP.',
    metaDescription: (p, t) => `I migliori ${p} per ${t} nel 2026 a confronto: qualità video, prezzi, accesso API e pubblicazione automatica. Con esempi reali generati.`,
    relatedTitle: 'Guide correlate',
    step1: 'Installa la CLI e accedi',
    step2: "Descrivi l'attore e il copione",
    step3: 'Genera, sottotitola e pubblica automaticamente',
    tableHeaders: ['Strumento', 'API e SDK', 'CLI', 'MCP (agenti IA)', 'Auto-pubblicazione', 'Prezzi'],
    howToH1: (f, t) => `Come creare un ${f} per ${t} con l'IA (2026)`,
    howToIntro: (f, t) => `Creare un buon ${f.toLowerCase()} per ${t} significava ingaggiare un creator, aspettare una settimana e sperare. Con l'UGC generato descrivi l'attore, incolli il copione e hai un video pronto da pubblicare in un minuto — e iteri gli hook alla velocità con cui scrivi.`,
    whatMakesTitle: (f) => `Cosa serve a un ${f.toLowerCase()} ad alte prestazioni`,
    exampleTitle: 'Copione di esempio da copiare',
    stepsTitle: 'Passo dopo passo con AgentMedia',
    howToMeta: (f, t) => `Guida passo passo per creare un ${f.toLowerCase()} per ${t} con l'IA: copioni di esempio, indicazioni di scena, comandi CLI e pubblicazione automatica.`,
  },
};

export const LOCALE_SLUGS = Object.keys(LOCALES); // ['en','es','pt-br','de','fr','it']

// ---------------------------------------------------------------------------
// Wave 2: video formats for the /how-to/ family
// ---------------------------------------------------------------------------

export interface VideoFormat {
  slug: string;
  name: string; // e.g. "Product Demo Video"
  tips: [string, string, string];
  script: string;
  scene: string;
}

export const FORMATS: VideoFormat[] = [
  { slug: 'product-demo-video', name: 'Product Demo Video', tips: ['Show the product in use within the first 2 seconds — no logo intros', 'One feature per video; save the rest for the next variant', 'End on the outcome, not the feature list'], script: 'Watch what happens when I press this once — that used to take me twenty minutes', scene: 'holding the product at counter height, demonstrating one action toward the camera' },
  { slug: 'testimonial-video', name: 'Testimonial Video', tips: ['Lead with the before-state, not the praise', 'Specifics beat superlatives — numbers, timeframes, names of features', 'Keep delivery conversational; scripted-sounding praise kills trust'], script: 'I was skeptical because I had tried three of these before. Week two is when it clicked', scene: 'seated casually at home, natural light, talking directly to camera' },
  { slug: 'unboxing-video', name: 'Unboxing Video', tips: ['The first cut of the tape is the hook — start mid-action', 'Narrate texture and weight; viewers cannot touch the product', 'Show scale next to a familiar object'], script: 'Okay the packaging alone is doing a lot — wait until you see the inside', scene: 'opening a parcel on a kitchen table, hands and product in frame' },
  { slug: 'reaction-video', name: 'Reaction Video', tips: ['Genuine surprise reads in micro-expressions — let the pause breathe', 'React to one specific thing, not the product in general', 'Follow the reaction with the reason in one sentence'], script: 'No. No way. It actually did the whole thing while I was on a call', scene: 'close selfie framing, eyebrows up, glancing between camera and off-screen product' },
  { slug: 'problem-solution-ad', name: 'Problem-Solution Ad', tips: ['Name the painful moment precisely — vague pain converts nobody', 'Spend 60% of runtime on the problem; the solution lands harder', 'One solution, one CTA'], script: 'Every Sunday night I lost two hours to this. Two. Hours. Here is what fixed it', scene: 'starts frustrated at a desk, turns to camera with the product visible' },
  { slug: 'before-after-video', name: 'Before & After Video', tips: ['Make the before genuinely bad — contrast is the content', 'Hold both states on screen for at least a second each', 'Time-stamp the transformation to make it credible'], script: 'This was my setup in January. This is it now. Same budget, by the way', scene: 'gesturing between two states of a space or result, steady framing' },
  { slug: 'day-in-the-life-video', name: 'Day-in-the-Life Video', tips: ['Anchor to times of day — morning hooks outperform', 'The product appears naturally in routine, never presented', 'End where you started to close the loop'], script: '7am: coffee. 7:15: this thing has already done my first task of the day', scene: 'morning home scene, casual energy, product integrated in the routine' },
  { slug: 'founder-story-video', name: 'Founder Story Video', tips: ['Start at the failure or frustration, not the founding date', 'One concrete scene beats the whole journey', 'Invite the viewer into what happens next'], script: 'I built this because I got the same complaint email forty times in one month', scene: 'office or workshop background, direct and personal delivery' },
  { slug: 'review-video', name: 'Review Video', tips: ['State one con honestly — it doubles the credibility of pros', 'Score or verdict in the last 2 seconds keeps watch time', 'Compare to the alternative the viewer is actually considering'], script: 'Three weeks in. Two things I love, one thing I would change', scene: 'desk setup with the product in hand, checking off points on fingers' },
  { slug: 'tutorial-video', name: 'Tutorial Video', tips: ['Promise the outcome in the first line with a timeframe', 'Three steps maximum — split longer flows into a series', 'Recap with a single-sentence summary at the end'], script: 'Sixty seconds and you will never do this manually again — step one', scene: 'over-the-shoulder style framing alternating with direct address' },
  { slug: 'comparison-video', name: 'Comparison Video', tips: ['Pick the comparison your buyer is already making', 'Same criteria for both options — visible fairness wins trust', 'Declare a winner for a specific person, not in general'], script: 'I ran both for a month. If you post daily, the answer is obvious', scene: 'holding up two options, alternating attention between them' },
  { slug: 'announcement-video', name: 'Announcement Video', tips: ['Tease the change before naming it', 'Tie the announcement to what the viewer can now do', 'Urgency from specificity: dates, counts, deadlines'], script: 'We heard you. As of today it does the thing everyone kept asking for', scene: 'energetic direct-to-camera, slight lean-in on the reveal' },
];
